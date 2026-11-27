/* Escritório virtual — movimentação, desenho e o que abre/fecha as conversas.
 *
 * A regra de quem ouve quem está em duas mãos: aqui (para abrir a chamada na
 * hora certa) e em sala.py (para o chat "perto"). Mudou uma, mude a outra.   */

// Zoom da tela. Fica em variável porque a pessoa aproxima e afasta em tempo
// real; `Jogo.escala` acompanha para o editor posicionar os menus certo.
// O escritório passou de 64x40 para 84x48 tiles: com o mínimo em 0,9 não cabia
// mais uma ala inteira na tela, e a pessoa perdia a noção de onde estava.
const ZOOM_MIN = 0.5, ZOOM_MAX = 3.2;
// piso absoluto: abaixo disto o boneco vira um ponto e ninguém se acha
const ZOOM_CHAO = 0.2;
// No celular a tela é estreita: começando em 1.5 cabia meia sala. 1.05 mostra
// o corredor inteiro e ainda dá para ler o nome de quem está por perto.
let ESCALA = Number(localStorage.getItem('escritorio:zoom'))
  || (matchMedia('(max-width: 760px)').matches ? 1.05 : 1.5);
if (!(ESCALA >= ZOOM_CHAO && ESCALA <= ZOOM_MAX)) ESCALA = 1.5;
// 27/11: por SEGUNDO, não mais por quadro. Antes eram 3,2 px a cada quadro
// (~190 px/s a 60 quadros): com o computador ocupado (câmera com desfoque,
// várias câmeras abertas) caía para 30 quadros e o boneco andava pela metade.
const VELOCIDADE = 240;             // pixels por segundo
const INTERVALO_ENVIO = 66;         // ms entre atualizações de posição
const DURACAO_BOLHA = 6000;

const tela = document.getElementById('tela');
const ctx = tela.getContext('2d');

const Jogo = {
  ws: null,
  eu: null,                         // { id, nome, cor, emoji, x, y, direcao }
  mapa: null, zonas: [], tile: 32, raioAvatar: 11,
  bloqueados: new Set(), larguraPx: 0, alturaPx: 0,
  config: { raio_conversa: 150, raio_silencio: 210, cores: [] },
  pessoas: new Map(),               // id -> { ...publico, xr, yr, bolha, reacao }
  teclas: new Set(),
  escala: ESCALA,
  zoomMin: ZOOM_CHAO,
  zoomMax: ZOOM_MAX,
  caminho: null,
  clique: null,
  camera: { x: 0, y: 0 },
  ultimoEnvio: 0,
  zonaAnterior: null,
};

/* ==================== editor do boneco ==================== */

/** Monta os botões de aparência e a prévia andando. Usado duas vezes: na tela
 *  de entrada e no modal de editar dentro da sala. */
// 26/11: só personagem 3D (o boneco de pixel e as abas de roupa saíram)
const ABAS = [
  ['Personagem 3D', ['personagem']],
];

function criarEditor(canvas, container, aparenciaInicial, opcoes = {}) {
  let ap = Boneco.normalizar(aparenciaInicial);
  // na tela de login a escolha do personagem 3D não aparece (a tela de entrada
  // fica como sempre foi); ela mora no "Editar meu boneco", dentro do escritório
  const ABAS_AQUI = opcoes.semPersonagem ? ABAS.filter(([, c]) => !c.includes('personagem')) : ABAS;
  const ctx = canvas.getContext('2d');
  const botoes = {};
  const grupos = {};

  // Sem as abas a lista fica com oito grupos empilhados e ninguém rola até o fim.
  const barra = document.createElement('div');
  barra.className = 'abas';
  container.appendChild(barra);
  ABAS_AQUI.forEach(([titulo, chaves], i) => {
    const aba = document.createElement('button');
    aba.type = 'button';
    aba.textContent = titulo;
    aba.setAttribute('aria-pressed', i === 0);
    aba.onclick = () => {
      [...barra.children].forEach((b) => b.setAttribute('aria-pressed', b === aba));
      for (const [chave, el] of Object.entries(grupos)) el.hidden = !chaves.includes(chave);
    };
    barra.appendChild(aba);
  });

  /** Acrescenta os botões que ainda não existem. Roupa criada no estúdio chega
   *  depois que a tela já montou, então em vez de refazer tudo a gente só
   *  completa a fileira — assim a escolha atual da pessoa não se perde. */
  function completarBotoes() {
    for (const chave of Object.keys(botoes)) {
      const jaTem = new Set(botoes[chave].map(([, v]) => v));
      const fileira = grupos[chave] && grupos[chave].querySelector('.fileira');
      if (!fileira) continue;
      for (const valor of Boneco.CATALOGO[chave]) {
        if (jaTem.has(valor)) continue;
        const b = document.createElement('button');
        b.type = 'button';
        const pintar = botoes[chave][0] ? botoes[chave][0][2] : null;
        if (pintar) pintar(b, valor);
        b.onclick = () => { ap = { ...ap, [chave]: valor }; marcar(); };
        fileira.appendChild(b);
        botoes[chave].push([b, valor, pintar]);
      }
    }
    marcar();
  }

  for (const chave of Object.keys(Boneco.CATALOGO)) {
    if (opcoes.semPersonagem && chave === 'personagem') continue;
    if (!ABAS_AQUI.some(([, c]) => c.includes(chave))) continue;   // sem as do boneco de pixel
    const grupo = document.createElement('div');
    grupo.className = 'grupo';
    grupo.hidden = !ABAS_AQUI[0][1].includes(chave);
    grupos[chave] = grupo;
    const titulo = document.createElement('div');
    titulo.className = 'titulo';
    titulo.textContent = Boneco.ROTULOS[chave] || chave;
    const fileira = document.createElement('div');
    fileira.className = 'fileira';
    botoes[chave] = [];

    const desenharBotao = (b, valor) => {
      const mini = Boneco.miniaturaOpcao && Boneco.miniaturaOpcao(chave, valor);
      if (valor.startsWith('#')) {
        b.className = 'cor';
        b.style.background = valor;
      } else if (mini) {
        // Roupa e calçado precisam do corpo inteiro e GRANDE: a diferença entre
        // gola V e gola redonda são três pixels, e num quadradinho de 40 todas
        // as camisas viravam a mesma camisa.
        const corpoInteiro = ['camisaTipo', 'calcaTipo', 'sapatoTipo'].includes(chave);
        b.className = corpoInteiro ? 'retrato corpo' : 'retrato';
        b.innerHTML = `<img src="${mini}" alt=""><span>${Boneco.ROTULOS[valor] || valor}</span>`;
      } else {
        b.textContent = Boneco.ROTULOS[valor] || valor;
      }
    };
    for (const valor of Boneco.CATALOGO[chave]) {
      const b = document.createElement('button');
      b.type = 'button';
      desenharBotao(b, valor);
      b.onclick = () => { ap = { ...ap, [chave]: valor }; marcar(); };
      fileira.appendChild(b);
      botoes[chave].push([b, valor, desenharBotao]);
    }
    grupo.append(titulo, fileira);
    container.appendChild(grupo);
  }

  function marcar() {
    for (const chave of Object.keys(botoes)) {
      for (const [b, valor] of botoes[chave]) b.setAttribute('aria-pressed', ap[chave] === valor);
    }
  }
  marcar();

  // os retratos só existem depois que a folha de sprites carrega
  Boneco.quandoCarregar(() => {
    for (const chave of Object.keys(botoes)) {
      for (const [b, valor, redesenhar] of botoes[chave]) redesenhar(b, valor);
    }
    marcar();
  });

  const direcoes = ['baixo', 'direita', 'cima', 'esquerda'];
  let quadro = 0;
  setInterval(() => {
    quadro++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    Boneco.desenhar(ctx, ap, canvas.width / 2, canvas.height - 26,
                    direcoes[Math.floor(quadro / 14) % 4], quadro, 4.2);
  }, 120);

  return {
    ver: () => ap,
    definir: (nova) => { ap = Boneco.normalizar(nova); marcar(); },
    sortear: () => { ap = Boneco.aleatoria(); marcar(); },
    remontar: () => {
      completarBotoes();
      for (const chave of Object.keys(botoes)) {
        for (const [b, valor, redesenhar] of botoes[chave]) if (redesenhar) redesenhar(b, valor);
      }
      marcar();
    },
  };
}

function aparenciaSalva() {
  try {
    return Boneco.normalizar(JSON.parse(localStorage.getItem('escritorio:aparencia')));
  } catch (e) {
    return Boneco.aleatoria();
  }
}

/* ==================== tela de entrada: conta e login ==================== */

/* Os dois bonecos do visitante. São fixos: um de corpo largo e um esguio, cada
   um com uma cara própria, para dois visitantes na sala não ficarem idênticos
   ao ponto de ninguém distinguir quem é quem. */
// visitante escolhe entre o homem e a mulher 3D genéricos (personagens.js)
const BONECOS_VISITANTE = {
  homem: { personagem: 'barbudo', corpo: 'm', pele: '#e5b487', cabelo: 'parted', corCabelo: '#4a2f1b',
           barba: '5oclock_shadow', corCamisa: '#4f7fd9', corCalca: '#3d4457' },
  mulher: { personagem: 'mulher', corpo: 'f', pele: '#e5b487', cabelo: 'bob', corCabelo: '#241a12',
            barba: 'nenhuma', corCamisa: '#d94f5c', corCalca: '#2f3a52' },
};
let bonecoVisitante = 'homem';

function montarBonecosVisitante() {
  const caixa = document.getElementById('bonecos-visitante');
  if (!caixa) return;
  for (const b of caixa.querySelectorAll('button')) {
    const qual = b.dataset.boneco;
    const img = b.querySelector('img');
    const pintar = () => { img.src = Boneco.retrato(BONECOS_VISITANTE[qual]) || ''; };
    pintar();                                  // personagem 3D: o retrato já existe
    Boneco.quandoCarregar(pintar);
    pintar();
    b.onclick = () => {
      bonecoVisitante = qual;
      for (const o of caixa.querySelectorAll('button')) {
        o.setAttribute('aria-pressed', o === b);
      }
    };
  }
}

// As roupas criadas no estúdio entram antes de a tela de personagem montar.
fetch('/catalogo').then((r) => r.json()).then((d) => {
  if (d && d.roupas && Boneco.acrescentarRoupas(d.roupas)) {
    Boneco.quandoCarregar(() => {
      if (typeof editorEntrada !== 'undefined' && editorEntrada.remontar) editorEntrada.remontar();
      montarBonecosVisitante();
    });
  }
}).catch(() => {});

const editorEntrada = criarEditor(
  document.getElementById('previa'), document.getElementById('opcoes'),
  localStorage.getItem('escritorio:aparencia') ? aparenciaSalva() : Boneco.aleatoria(),
  { semPersonagem: true });

document.getElementById('btn-sortear').onclick = () => editorEntrada.sortear();
montarBonecosVisitante();

const campoNome = document.getElementById('campo-nome');
const campoEmail = document.getElementById('campo-email');
const campoSenha = document.getElementById('campo-senha');
const aviso = document.getElementById('aviso-entrada');
let modo = 'entrar';                       // 'entrar' | 'criar' | 'visitante'
let sessao = { token: localStorage.getItem('escritorio:token') || '', conta: null };

function usarModo(novoModo) {
  modo = novoModo;
  for (const [aba, valor] of [['aba-entrar', 'entrar'], ['aba-criar', 'criar'],
                              ['aba-visitante', 'visitante']]) {
    document.getElementById(aba).setAttribute('aria-pressed', modo === valor);
  }
  // A chave do lugar vale para criar conta E para entrar de visitante: é ela
  // que separa quem foi convidado de quem só achou o endereço. Quem já tem
  // conta só vê o campo quando o lugar escolhido ainda não é dela (27/11).
  document.getElementById('linha-convite').hidden = !(modo === 'criar' || modo === 'visitante' || chavePedida);
  // Visitante não tem conta, então não tem e-mail. Entrar pede e-mail e senha;
  // criar conta pede os dois mais o nome que vai aparecer em cima do boneco.
  document.getElementById('linha-email').hidden = modo === 'visitante';
  campoNome.parentElement.hidden = modo === 'entrar';
  campoNome.placeholder = modo === 'visitante'
    ? 'Como te chamam' : 'Como aparece em cima do boneco';
  // Membro monta o boneco que quiser; visitante escolhe entre dois prontos.
  document.querySelector('.editor').hidden = modo !== 'criar';
  const dois = document.getElementById('bonecos-visitante');
  if (dois) dois.hidden = modo !== 'visitante';
  campoSenha.parentElement.hidden = modo === 'visitante';
  campoSenha.setAttribute('autocomplete', modo === 'criar' ? 'new-password' : 'current-password');
  aviso.textContent = modo === 'criar'
    ? 'Escolha seu personagem: ele fica salvo na sua conta.'
    : modo === 'visitante'
      ? 'Visitante anda, vê e conversa. Não mexe no escritório nem pega sala.'
      : '';
  atualizarGaleria();
}

/* ---------- os lugares (27/11): o Escritório e o Pingou ----------
 * Cada um tem a sua chave de acesso. Na entrada a pessoa escolhe onde entrar;
 * lá dentro, a porta de saída leva de um para o outro (Saida, mais abaixo). */
let lugarEscolhido = localStorage.getItem('escritorio:lugar') || 'escritorio';
let lugaresDaEntrada = [];
let chavePedida = false;            // o servidor disse que esta conta precisa da chave

function montarLugaresDaEntrada(lista) {
  lugaresDaEntrada = Array.isArray(lista) ? lista : [];
  const linha = document.getElementById('linha-lugar');
  const caixa = document.getElementById('lugares-entrada');
  if (!linha || !caixa) return;
  if (lugaresDaEntrada.length < 2) { linha.hidden = true; return; }
  if (!lugaresDaEntrada.some((l) => l.id === lugarEscolhido)) lugarEscolhido = lugaresDaEntrada[0].id;
  caixa.innerHTML = '';
  for (const l of lugaresDaEntrada) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = l.nome;
    b.dataset.lugar = l.id;
    b.setAttribute('role', 'radio');
    b.onclick = () => escolherLugar(l.id);
    caixa.appendChild(b);
  }
  linha.hidden = false;
  escolherLugar(lugarEscolhido);
}

function escolherLugar(id) {
  lugarEscolhido = id;
  for (const b of document.querySelectorAll('#lugares-entrada button')) {
    const sim = b.dataset.lugar === id;
    b.setAttribute('aria-pressed', String(sim));
    b.setAttribute('aria-checked', String(sim));
  }
  const l = lugaresDaEntrada.find((x) => x.id === id);
  document.getElementById('rotulo-convite').textContent = l ? `Chave de acesso do ${l.nome}` : 'Chave de acesso';
  atualizarGaleria();
}

/* Personagens do lugar (27/11): quem cria a conta no Pingou escolhe o seu na
 * galeria. Cada um é de uma pessoa só: o que já tem dono aparece apagado. */
let personagemEscolhido = null;

function personagensDoLugar(lugar) {
  return (Personagens.dados.personagens || []).filter((p) => p.lugar === lugar);
}

async function atualizarGaleria() {
  const caixa = document.getElementById('galeria-lugar');
  if (!caixa) return;
  const lista = personagensDoLugar(lugarEscolhido);
  const mostra = modo === 'criar' && lista.length > 0;
  caixa.hidden = !mostra;
  document.querySelector('.editor').hidden = modo !== 'criar' || mostra;
  if (!mostra) { personagemEscolhido = null; return; }
  let ocupados = {};
  try { ocupados = (await (await fetch('/personagens/ocupados')).json()).ocupados || {}; } catch (e) { /* segue */ }
  const g = document.getElementById('galeria-personagens');
  g.innerHTML = '';
  for (const p of lista) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.personagem = p.id;
    const dono = ocupados[p.id];
    b.disabled = !!dono;
    b.setAttribute('aria-pressed', String(personagemEscolhido === p.id && !dono));
    b.innerHTML = `<img alt="" src="${Personagens.retrato(p.id)}"><span>${escapar(p.nome)}</span>${
      dono ? `<small>já é de ${escapar(dono)}</small>` : ''}`;
    b.onclick = () => {
      personagemEscolhido = p.id;
      for (const o of g.querySelectorAll('button')) o.setAttribute('aria-pressed', String(o === b));
    };
    g.appendChild(b);
  }
  if (personagemEscolhido && ocupados[personagemEscolhido]) personagemEscolhido = null;
}
document.getElementById('aba-entrar').onclick = () => usarModo('entrar');
document.getElementById('aba-criar').onclick = () => usarModo('criar');
document.getElementById('aba-visitante').onclick = () => usarModo('visitante');

/** Quantas vagas de membro sobraram. Cheio, a aba de criar conta sai de cena. */
async function conferirVagas() {
  try {
    const c = await (await fetch('/config')).json();
    montarLugaresDaEntrada(c.espacos);
    const linha = document.getElementById('vagas');
    if (!linha) return;
    // vagas nulo = sem limite: a linha some, não faz sentido contar o infinito
    if (c.vagas === null || c.vagas === undefined) { linha.textContent = ''; return; }
    if (c.vagas > 0) {
      linha.innerHTML = `<b>${c.vagas}</b> de ${c.total_membros} vagas de membro livres`;
    } else {
      linha.className = 'vagas cheio';
      linha.innerHTML = `As <b>${c.total_membros} vagas de membro</b> acabaram — entre como visitante`;
      document.getElementById('aba-criar').hidden = true;
      if (modo === 'criar') usarModo('visitante');
    }
  } catch (e) { /* offline: a tela continua servindo */ }
}
conferirVagas();

/** Sessão guardada: entra direto, sem digitar nada. */
async function conferirSessao() {
  if (!sessao.token) return usarModo('entrar');
  try {
    const r = await fetch('/conta/eu?token=' + encodeURIComponent(sessao.token));
    const d = await r.json();
    if (d.conta) {
      sessao.conta = d.conta;
      campoNome.value = d.conta.nome;
      if (campoEmail) campoEmail.value = d.conta.email || '';
      editorEntrada.definir(d.conta.aparencia);
      document.querySelector('.abas-conta').hidden = true;
      document.querySelector('.editor').hidden = true;
      campoSenha.parentElement.hidden = true;
      document.getElementById('linha-email').hidden = true;
      campoNome.parentElement.hidden = true;
      document.getElementById('linha-convite').hidden = true;
      document.getElementById('btn-sair-conta').classList.remove('oculto');
      aviso.textContent = `Bem-vindo de volta, ${d.conta.nome.split(' ')[0]}. Entrando…`;
      // Atualizar a página tem de voltar para dentro do escritório, não para a
      // tela de entrada. Antes a sessão era reconhecida mas parava aqui, e dava
      // a impressão de que recarregar deslogava.
      entrar(true);
      return;
    }
  } catch (e) { /* offline: cai no login normal */ }
  localStorage.removeItem('escritorio:token');
  sessao = { token: '', conta: null };
  usarModo('entrar');
}
conferirSessao();

document.getElementById('btn-sair-conta').onclick = () => {
  localStorage.removeItem('escritorio:token');
  location.reload();
};

document.getElementById('btn-entrar').onclick = () => entrar(true);
// O botão "entrar só olhando" saiu da tela: agora todo mundo entra pedindo
// câmera e microfone. Quem recusar a permissão continua entrando — o `entrar`
// avisa e segue sem mídia —, então ninguém fica de fora por causa disso.
campoSenha.addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(true); });

/** Cria a conta ou faz login, e só então abre a sala. */
async function autenticar() {
  if (modo === 'visitante') return true;     // visitante não tem conta para autenticar
  if (sessao.token && sessao.conta) return true;
  const email = (campoEmail.value || '').trim();
  const nome = campoNome.value.trim();
  const senha = campoSenha.value;
  if (!email || !senha) { aviso.textContent = 'Preencha e-mail e senha.'; return false; }
  if (modo === 'criar' && !nome) { aviso.textContent = 'Escolha o nome que vai aparecer.'; return false; }

  const galeria = modo === 'criar' && personagensDoLugar(lugarEscolhido).length > 0;
  if (galeria && !personagemEscolhido) { aviso.textContent = 'Escolha o seu personagem.'; return false; }
  const aparencia = galeria ? { ...editorEntrada.ver(), personagem: personagemEscolhido } : editorEntrada.ver();
  const corpo = modo === 'criar'
    ? { email, nome, senha, convite: document.getElementById('campo-convite').value,
        espaco: lugarEscolhido, aparencia, cor: aparencia.corCamisa }
    : { email, senha };
  aviso.textContent = modo === 'criar' ? 'Criando sua conta…' : 'Entrando…';
  try {
    const r = await fetch(modo === 'criar' ? '/conta/registrar' : '/conta/entrar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    const d = await r.json();
    if (d.erro) { aviso.textContent = d.erro; return false; }
    sessao = { token: d.token, conta: d.conta };
    localStorage.setItem('escritorio:token', d.token);
    localStorage.setItem('escritorio:aparencia', JSON.stringify(d.conta.aparencia));
    return true;
  } catch (e) {
    aviso.textContent = 'Não consegui falar com o servidor.';
    return false;
  }
}

/* 05/11: o botão "Entrar" continuava clicável enquanto a sessão salva entrava
   sozinha depois do F5 ("Bem-vindo de volta… Entrando…"). Um clique nessa hora
   rodava a entrada DUAS vezes na mesma página: câmera e microfone pedidos em
   dobro e a conta entrando duas vezes no servidor, derrubando a própria sessão de
   um segundo antes (as duas "sessão trocada" seguidas no registro). Uma entrada
   por vez; e com a ligação já aberta ou abrindo, o clique não faz nada. */
let entrando = false;
async function entrar(comMidia) {
  const ligacao = Conexao.atual;
  if (entrando || (ligacao && ligacao.readyState <= WebSocket.OPEN)) return;
  entrando = true;
  try {
    if (!await autenticar()) return;
    if (comMidia) {
      aviso.textContent = 'Pedindo acesso à câmera e ao microfone…';
      try {
        await Midia.pedirMidia();
      } catch (e) {
        aviso.textContent = 'Sem câmera/microfone (' + e.name + '). Entrando só olhando.';
      }
    }
    aviso.textContent = 'Conectando…';
    // a chave digitada fica guardada por lugar: o visitante precisa dela de
    // novo se cair a internet, e para voltar depois de ir ao outro lugar
    const chave = document.getElementById('campo-convite').value;
    if (chave) Conexao.chaves[lugarEscolhido] = chave;
    try { localStorage.setItem('escritorio:lugar', lugarEscolhido); } catch (e) { /* aba anônima */ }
    if (modo === 'visitante') {
      const nome = campoNome.value.trim();
      if (!nome) { aviso.textContent = 'Escreva seu nome.'; return; }
      const visual = BONECOS_VISITANTE[bonecoVisitante];
      conectar({ visitante: true, nome, espaco: lugarEscolhido, convite: chave,
                 aparencia: visual, cor: visual.corCamisa });
      return;
    }
    conectar({ token: sessao.token, espaco: lugarEscolhido, convite: chavePedida ? chave : '' });
  } finally {
    entrando = false;
  }
}

/* ==================== conexão ==================== */

// Um WebSocket parado é fechado sozinho pelo proxy (e o serviço no plano
// gratuito hiberna sem tráfego). Sem estes dois números, quem ficava meia hora
// sem se mexer descobria que a sala tinha congelado só ao tentar andar.
const BATIDA_MS = 20000;        // manda um ping de tempos em tempos
const SILENCIO_MS = 55000;      // nada vindo do servidor por tanto tempo = caiu
const ESPERA_MAX_MS = 15000;    // teto da espera entre tentativas de voltar

const Conexao = { perfil: null, tentativas: 0, batida: null, timer: null,
                  ultima: 0, saindo: false, atual: null, ultimoFim: null,
                  chaves: {},          // a chave digitada de cada lugar (27/11)
                  trocando: null };    // indo para outro lugar: { para, depois }

function conectar(perfil) {
  Conexao.perfil = perfil;
  clearTimeout(Conexao.timer);
  // A ligação anterior podia continuar de pé aqui (voltar para a aba com o
  // socket em CLOSING abria outra por cima). Duas ligações da mesma conta no
  // servidor = ele derruba uma delas com "recusado", e esta página, que
  // escutava as DUAS, entendia "sessão expirada" e jogava a pessoa para a tela
  // de login. O aviso de fim da ligação velha também fechava as chamadas da
  // nova: era a câmera de todo mundo piscando sem parar.
  const velho = Conexao.atual;
  if (velho) {
    velho.onopen = velho.onmessage = velho.onclose = velho.onerror = null;
    try { velho.close(); } catch (e) { /* já estava fechada */ }
  }
  const protocolo = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocolo}://${location.host}/ws`);
  Conexao.atual = ws;
  Jogo.ws = ws;

  // Todo aviso vindo de uma ligação que não é mais a atual é descartado: ela
  // fala do passado, e obedecer a ela derruba o presente.
  const atual = () => Conexao.atual === ws;

  ws.onopen = () => {
    if (!atual()) { try { ws.close(); } catch (e) {} return; }
    // voltando de uma queda: pede para nascer onde a pessoa estava (trocando
    // de lugar, não: o lugar novo é outro mapa, e nasce na entrada dele)
    const voltando = Jogo.eu && !Conexao.trocando ? { x: Jogo.eu.x, y: Jogo.eu.y } : null;
    // e conta POR QUE a ligação de antes acabou. No registro do servidor,
    // "entrou de novo" sozinho não diz se foi F5, queda de rede ou troca de
    // sessão — e sem isso não dá para consertar quem vive caindo.
    const fim = Conexao.ultimoFim;
    const porque = fim ? { codigo: fim.codigo, limpo: fim.limpo,
                           ha: Date.now() - fim.quando } : null;
    ws.send(JSON.stringify({ tipo: 'entrar', ...perfil,
                             situacao: minhaSituacaoSalva(),
                             ...(voltando ? { voltando } : {}),
                             ...(porque ? { porque } : {}) }));
    delete perfil.troca;              // a troca de lugar vale para esta ligação só
    Conexao.tentativas = 0;
    Conexao.ultima = Date.now();
    baterCoracao();
  };
  ws.onmessage = (ev) => {
    if (!atual()) return;
    Conexao.ultima = Date.now();
    avisarReconectando(false);
    receber(JSON.parse(ev.data));
  };
  ws.onclose = (ev) => {
    if (!atual()) return;
    Conexao.ultimoFim = { codigo: (ev && ev.code) || 0,
                          limpo: !!(ev && ev.wasClean), quando: Date.now() };
    pararCoracao();
    // só as chamadas caem; câmera e microfone continuam ligados para a pessoa
    // não ter que dar permissão de novo a cada tropeço da rede
    Midia.fecharPares();
    if (!Conexao.saindo) tentarVoltar();
  };
  ws.onerror = () => {
    if (!atual()) return;
    if (!Jogo.eu) {
      document.getElementById('aviso-entrada').textContent = 'Não consegui conectar ao servidor.';
    }
  };
}

function baterCoracao() {
  pararCoracao();
  Conexao.batida = setInterval(() => {
    const ws = Jogo.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (Date.now() - Conexao.ultima > SILENCIO_MS) {
      ws.close();                  // calado demais: derruba para reconectar
      return;
    }
    ws.send(JSON.stringify({ tipo: 'ping' }));
  }, BATIDA_MS);
}

function pararCoracao() {
  clearInterval(Conexao.batida);
  Conexao.batida = null;
}

function tentarVoltar() {
  if (!Conexao.perfil) return;                 // nem chegou a entrar
  avisarReconectando(true);
  const espera = Math.min(1000 * 2 ** Conexao.tentativas, ESPERA_MAX_MS);
  Conexao.tentativas++;
  clearTimeout(Conexao.timer);
  Conexao.timer = setTimeout(() => conectar(Conexao.perfil), espera);
}

function avisarReconectando(ligado) {
  const faixa = document.getElementById('reconectando');
  if (!faixa) return;
  faixa.classList.toggle('oculto', !ligado);
}

// Voltar para a aba (ou o computador acordar) é quando a queda costuma
// aparecer: os timers ficam congelados enquanto a aba está escondida.
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !Conexao.perfil) return;
  const ws = Jogo.ws;
  if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
    Conexao.tentativas = 0;
    tentarVoltar();
  } else if (ws.readyState === WebSocket.OPEN) {
    Conexao.ultima = Date.now();
    ws.send(JSON.stringify({ tipo: 'ping' }));
  }
});

function enviar(msg) {
  if (Jogo.ws && Jogo.ws.readyState === WebSocket.OPEN) Jogo.ws.send(JSON.stringify(msg));
}

/* Cartão flutuante de pedido: bater na porta, aceitar, recusar. É pequeno de
 * propósito — some sozinho e não rouba o teclado de quem está no chat. */
function painelPedido({ texto, botoes, segundos }) {
  const antigo = document.getElementById('pedido-sala');
  if (antigo) antigo.remove();
  const caixa = document.createElement('div');
  caixa.id = 'pedido-sala';
  caixa.className = 'pedido-sala';
  caixa.innerHTML = `<p>${texto}</p><div class="acoes"></div>`;
  for (const b of botoes || []) {
    const bt = document.createElement('button');
    bt.textContent = b.texto;
    if (b.classe) bt.className = b.classe;
    bt.onclick = () => { caixa.remove(); b.fazer && b.fazer(); };
    caixa.querySelector('.acoes').appendChild(bt);
  }
  (document.querySelector('.palco') || document.body).appendChild(caixa);
  if (segundos) setTimeout(() => caixa.remove(), segundos * 1000);
  return caixa;
}

// Bater na porta não pode virar metralhadora: o servidor corrige a posição a
// cada empurrão na parede, e sem esta trava o aviso piscaria sem parar.
const ultimoAvisoTrancada = {};

function avisarSalaTrancada(t) {
  if (Date.now() - (ultimoAvisoTrancada[t.id] || 0) < 6000) return;
  ultimoAvisoTrancada[t.id] = Date.now();
  // Nome de sala e de pessoa entram em HTML: sem escapar, um visitante chamado
  // <svg onload=…> rodava script na tela de quem esbarrasse na porta dele.
  const dono = escapar(t.dono || 'alguém');
  const nome = escapar(t.nome);
  // a diretoria tem o nome do dono: "Gustavo é de Gustavo" não diz nada
  const mesmo = String(t.nome || '').trim().toLowerCase() === String(t.dono || '').trim().toLowerCase();
  const sala = mesmo ? `A sala de <b>${dono}</b> está trancada` : `<b>${nome}</b> é de ${dono}`;
  if (t.online && (t.situacao === 'nao_perturbe' || t.situacao === 'almoco')) {
    const como = t.situacao === 'almoco' ? 'no almoço' : 'em <b>Não perturbe</b>';
    painelPedido({ texto: `${sala}, e ${dono} está ${como}. Mande uma mensagem no chat ou tente mais tarde.`,
                   botoes: [{ texto: 'Entendi' }], segundos: 8 });
    return;
  }
  if (!t.online) {
    painelPedido({ texto: mesmo ? `${sala}, e ${dono} não está no escritório agora.`
                               : `${sala}, que não está no escritório agora.`,
                   botoes: [{ texto: 'Entendi' }], segundos: 6 });
    return;
  }
  painelPedido({
    texto: `${sala}. Quer bater na porta?`,
    botoes: [
      { texto: 'Bater na porta', classe: 'ok', fazer: () => enviar({ tipo: 'sala', acao: 'bater', id: t.id }) },
      { texto: 'Agora não' },
    ],
    segundos: 12,
  });
}

function receber(msg) {
  switch (msg.tipo) {
    case 'bemvindo': iniciarSala(msg); break;

    case 'entrou':
      Jogo.pessoas.set(msg.participante.id, prepararPessoa(msg.participante));
      escreverChat({ sistema: true, texto: `${msg.participante.nome} entrou no ${(Jogo.espaco && Jogo.espaco.nome) || 'Escritório'}.` });
      desenharListaPessoas();
      break;

    case 'saiu': {
      const p = Jogo.pessoas.get(msg.id);
      if (p) escreverChat({ sistema: true, texto: msg.foi_para ? `${p.nome} foi para o ${msg.foi_para}.` : `${p.nome} saiu.` });
      Jogo.pessoas.delete(msg.id);
      Midia.fechar(msg.id);
      desenharListaPessoas();
      break;
    }

    case 'mover': {
      const p = Jogo.pessoas.get(msg.id);
      if (p) { p.x = msg.x; p.y = msg.y; p.direcao = msg.direcao; p.zona = msg.zona; }
      break;
    }

    case 'perfil': {
      const alvo = msg.participante.id === Jogo.eu.id
        ? Jogo.eu : Jogo.pessoas.get(msg.participante.id);
      const eraCalado = !!(alvo && alvo.silenciado);
      if (alvo) Object.assign(alvo, msg.participante);
      // Calou? derruba a chamada que já estava aberta com essa pessoa. O
      // servidor barra chamada NOVA, mas a que já existe é ponto a ponto e
      // continuaria passando som direto entre os dois navegadores.
      if (alvo && alvo.silenciado && !eraCalado && alvo.id !== Jogo.eu.id) {
        Midia.fechar(alvo.id);
      }
      desenharListaPessoas();
      montarTiles();
      break;
    }

    case 'lugares': {
      // quem está em cada lugar (27/11): a lista mostra os dois
      Jogo.lugares = msg.lista || [];
      for (const r of msg.espacos || []) {
        const e = (Jogo.espacos || []).find((x) => x.id === r.id);
        if (e) e.pessoas = r.pessoas;
      }
      desenharListaPessoas();
      Saida.atualizarContagens();
      break;
    }

    case 'pode_ir':                 // a chave, o acesso ou alguém de lá deixou
      trocarDeLugar(msg.espaco, msg.por);
      break;

    case 'sem_acesso':
      if (!Saida.aberta) Saida.abrir(msg.espaco);
      Saida.avisar(msg.texto);
      break;

    case 'pedido_espaco':
      receberPedidoDeLugar(msg);
      break;

    case 'situacao': {
      const alvo = Jogo.eu && msg.id === Jogo.eu.id ? Jogo.eu : Jogo.pessoas.get(msg.id);
      if (alvo && SITUACOES[msg.situacao]) alvo.situacao = msg.situacao;
      if (alvo === Jogo.eu) desenharSituacao();
      desenharListaPessoas();
      break;
    }

    case 'midia': {
      if (msg.proprio) {
        // o servidor recusou o pedido (calado pelo admin): fecha o microfone de
        // verdade, senão a pessoa fala achando que está saindo som
        if (msg.mudo && Midia.ligado('audio')) Midia.alternar('audio').then(() => {
          atualizarBotoesMidia(); montarTiles();
        });
        Jogo.eu.mudo = msg.mudo;
        escreverChat({ sistema: true, texto: 'Seu microfone está fechado pelo administrador.' });
        desenharListaPessoas();
        break;
      }
      const p = Jogo.pessoas.get(msg.id);
      if (p) { p.mudo = msg.mudo; p.sem_camera = msg.sem_camera; p.tela = msg.tela; }
      montarTiles();
      desenharListaPessoas();
      break;
    }

    case 'chat': {
      escreverChat(msg);
      const p = msg.proprio ? Jogo.eu : Jogo.pessoas.get(msg.de);
      const legenda = msg.anexo ? (msg.anexo.imagem ? '📷 Foto' : '📎 ' + msg.anexo.nome) : '';
      if (p) p.bolha = { texto: msg.texto || legenda, ate: Date.now() + DURACAO_BOLHA };
      if (!msg.proprio) {
        // Quem está perto falou comigo, ou alguém me citou no "todos": aviso.
        // O resto do "todos" só conta no título da aba.
        const texto = msg.texto || legenda;
        if (msg.escopo !== 'todos') {
          Chamar.avisar({ titulo: `${msg.nome} falou com você`, texto, chave: 'chat-' + msg.de });
        } else if (citaMeuNome(msg.texto)) {
          Chamar.avisar({ titulo: `${msg.nome} citou você`, texto, chave: 'chat-' + msg.de });
        } else {
          Chamar.contar();
        }
      }
      break;
    }

    case 'reacao': {
      const p = Jogo.pessoas.get(msg.id);
      if (p && EMOJIS_REACAO.includes(msg.emoji)) {
        p.reacao = { emoji: msg.emoji, ate: Date.now() + DURACAO_REACAO };
        // na tela de chamada, só a de quem está na conversa comigo
        if (Midia.pares.has(msg.id) || Midia.pares.has(String(msg.id))) mostrarReacaoNaChamada(p.nome, msg.emoji);
      }
      break;
    }

    case 'corrigir':                 // o servidor recusou a posição: volta para o lugar dele
      Jogo.correcoes = (Jogo.correcoes || 0) + 1;     // os testes contam (cenário x servidor)
      Jogo.eu.x = msg.x; Jogo.eu.y = msg.y;
      Jogo.eu.xr = msg.x; Jogo.eu.yr = msg.y;
      Jogo.caminho = null;           // parar de empurrar a porta trancada
      if (msg.trancada) avisarSalaTrancada(msg.trancada);
      break;

    case 'sistema':
      escreverChat({ sistema: true, texto: msg.texto });
      break;

    case 'moderado':
      if (msg.acao === 'silenciar') {
        if (Midia.ligado('audio')) alternarMic();
        escreverChat({ sistema: true,
          texto: `${msg.por} calou seu microfone. Fale com ${msg.por} para voltar a falar.` });
      } else {
        escreverChat({ sistema: true, texto: `${msg.por} devolveu sua voz. Aperte M para falar.` });
      }
      break;

    case 'sala':
      if (msg.acao === 'bateram') {
        painelPedido({
          texto: `<b>${escapar(msg.quem)}</b> quer entrar na ${escapar(msg.nome_sala)}.`,
          botoes: [
            { texto: 'Deixar entrar', classe: 'ok',
              fazer: () => enviar({ tipo: 'sala', acao: 'responder', id: msg.id, para: msg.de, aceita: true }) },
            { texto: 'Agora não',
              fazer: () => enviar({ tipo: 'sala', acao: 'responder', id: msg.id, para: msg.de, aceita: false }) },
          ],
          segundos: 40,
        });
        // forte: toca o som mesmo com a aba na frente (a pessoa pode estar
        // olhando para o outro monitor)
        Chamar.avisar({ titulo: `${msg.quem} bateu na sua porta`, texto: `Quer entrar na ${msg.nome_sala}.`,
                        chave: 'bater-' + msg.de, forte: true });
      } else if (msg.acao === 'bateu') {
        escreverChat({ sistema: true, texto: `Você bateu na porta. Esperando ${msg.dono} responder…` });
      } else if (msg.acao === 'resposta') {
        escreverChat({ sistema: true, texto: msg.aceita
          ? `${msg.dono} deixou você entrar na ${msg.nome_sala}.`
          : `${msg.dono} não pode receber você agora.` });
        if (msg.aceita) delete ultimoAvisoTrancada[msg.id];
        Chamar.avisar({ titulo: msg.aceita ? `${msg.dono} deixou você entrar` : `${msg.dono} não pode receber você agora`,
                        texto: msg.nome_sala || '', chave: 'resposta-' + msg.id });
      }
      break;

    case 'mapa':
      receberMapa(msg.mapa);
      // O editor guarda referências ao mapa velho (móvel arrastado, na mão,
      // selecionado, o menu aberto, a lista de salas, o arsenal): ele confere
      // o que ainda existe e solta o que sumiu.
      Editor.aoMudarMapa();
      if (msg.por && Jogo.eu && msg.por !== Jogo.eu.nome) {
        escreverChat({ sistema: true, texto: `${msg.por} mexeu no escritório.` });
      }
      break;

    case 'recusado':
      // Recusa é definitiva (sessão expirada, conta sumiu): insistir em
      // reconectar só ficaria batendo na porta para sempre.
      Conexao.perfil = null;
      clearTimeout(Conexao.timer);
      pararCoracao();
      avisarReconectando(false);
      document.getElementById('aviso-entrada').textContent = msg.texto;
      document.getElementById('entrada').classList.remove('oculto');
      document.getElementById('app').classList.add('oculto');
      Conexao.trocando = null;
      if (msg.sem_acesso) {
        // o lugar pede a chave (27/11): a sessão continua, só falta a chave
        chavePedida = true;
        if (msg.espaco) escolherLugar(msg.espaco);
        document.getElementById('linha-convite').hidden = false;
        document.getElementById('campo-convite').focus();
      }
      break;

    case 'erro':
      escreverChat({ sistema: true, texto: msg.texto });
      break;

    case 'sinal':
      Midia.receberSinal(msg.de, msg.dados);
      break;
  }
}

function prepararPessoa(p) {
  return { ...p, xr: p.x, yr: p.y, bolha: null, reacao: null };
}

function receberMapa(mapa) {
  // o desenhador precisa saber quais peças são imagem, e isso vem no catálogo
  Objetos.CATALOGO_EXTRA = mapa && mapa.catalogo ? mapa.catalogo : null;
  Jogo.mapa = mapa;
  Jogo.zonas = mapa.zonas;
  Jogo.tile = mapa.tile;
  Jogo.raioAvatar = mapa.raio_avatar;
  Jogo.larguraPx = mapa.largura * mapa.tile;
  Jogo.alturaPx = mapa.altura * mapa.tile;
  // Cenário (26/11): a arte pronta manda no tamanho do mundo e na colisão
  Cenario.configurar(mapa);
  // "Editar o escritório" perdeu o propósito com a arte pronta (26/11): parede,
  // piso e tamanho são do desenho, e móvel solto no meio dele destoa. O menu da
  // sala (clique na plaquinha: nome, tranca) continua.
  const botaoEditor = document.getElementById('btn-editor');
  if (botaoEditor) botaoEditor.hidden = Cenario.ativo();
  if (Cenario.ativo() && typeof Editor !== 'undefined' && Editor.ativo) Editor.alternar();
  if (Cenario.ativo()) {
    Jogo.larguraPx = mapa.cenario.largura;
    Jogo.alturaPx = mapa.cenario.altura;
  }

  // Colisão: paredes mais a área dos móveis que bloqueiam. O servidor faz a
  // mesma conta; aqui é para o movimento responder na hora, sem esperar ida e
  // volta de rede.
  const bloq = new Set();
  mapa.paredes.forEach((linha, y) => {
    for (let x = 0; x < linha.length; x++) if (linha[x] === '1') bloq.add(x + ',' + y);
  });
  for (const o of mapa.objetos) {
    const info = mapa.catalogo[o.tipo];
    if (!info || !info.bloqueia) continue;
    const m = Objetos.medida(o.tipo, info, o.g);
    for (let dy = 0; dy < m.a; dy++) {
      for (let dx = 0; dx < m.l; dx++) bloq.add((o.x + dx) + ',' + (o.y + dy));
    }
  }
  Jogo.bloqueados = bloq;
}

function iniciarSala(msg) {
  // Isto roda de novo a cada reconexão: o que é de uma vez só fica no `primeira`.
  const primeira = !Jogo.rodando;
  Jogo.eu = { ...msg.voce, xr: msg.voce.x, yr: msg.voce.y, bolha: null, reacao: null };
  // o lugar (27/11): o Escritório ou o Pingou, os dois e quem está em cada um
  const lugarAntes = Jogo.espaco && Jogo.espaco.id;
  Jogo.espaco = msg.espaco || { id: 'escritorio', nome: 'Escritório' };
  Jogo.espacos = msg.espacos || [];
  Jogo.lugares = msg.lugares || [];
  const titulo = document.getElementById('titulo-lugar');
  if (titulo) titulo.textContent = Jogo.espaco.id === 'escritorio' ? 'Escritório virtual' : Jogo.espaco.nome;
  const troca = Conexao.trocando;
  Conexao.trocando = null;
  Saida.fechar(false);
  Jogo.caminho = null;
  Jogo.querSentar = null;
  Jogo.sentadoEm = null;
  receberMapa(msg.mapa);
  Jogo.config = msg.config;
  Jogo.chaveEnvio = msg.chave_envio || '';        // para mandar foto/arquivo no chat
  Jogo.visitante = !!msg.visitante;
  Jogo.admin = !!msg.admin;
  if (Jogo.admin) {
    const chip = document.getElementById('contagem');
    if (chip && !document.getElementById('chip-admin')) {
      const selo = document.createElement('span');
      selo.id = 'chip-admin';
      selo.className = 'chip admin';
      selo.textContent = 'admin';
      selo.title = 'Você manda no escritório inteiro.';
      chip.after(selo);
    }
  }
  if (Jogo.visitante) {
    // Visitante não edita o escritório: o botão sai da barra em vez de ficar
    // ali dando erro a cada clique.
    const b = document.getElementById('btn-editor');
    if (b) b.remove();
    const chip = document.getElementById('contagem');
    if (chip && !document.getElementById('chip-visitante')) {
      const selo = document.createElement('span');
      selo.id = 'chip-visitante';
      selo.className = 'chip visitante';
      selo.textContent = 'visitante';
      selo.title = 'Você anda, vê e conversa. Para mexer no escritório, peça uma conta.';
      chip.after(selo);
    }
  }
  Jogo.pessoas.clear();                        // a lista antiga é de outra sessão
  msg.participantes.forEach((p) => Jogo.pessoas.set(p.id, prepararPessoa(p)));

  Editor.configurar({ enviar, jogo: Jogo,
                      avisar: (texto) => escreverChat({ sistema: true, texto }) });
  // Reconectou com o editor aberto: o mapa é outro objeto, e o que estava na
  // mão ou selecionado pode nem existir mais.
  Editor.aoMudarMapa();
  Midia.configurar({
    meuId: Jogo.eu.id,
    enviarSinal: (para, dados) => enviar({ tipo: 'sinal', para, dados }),
    // O servidor de reserva da voz (03/11) e o registro de cada chamada no servidor.
    iceServers: Jogo.config && Jogo.config.ice,
    aoMudarChamada: (com, estado, via) => enviar({ tipo: 'chamada', com, estado, via }),
    aoMudarTiles: montarTiles,
    // o som de cada pessoa toca num <audio> próprio; se o navegador barrar, o
    // botão "clique para ouvir" aparece
    aoSomBloqueado: somBloqueado,
    // o outro lado quer conversar e quem liga somos nós (26/11)
    aoPedirChamada: (id) => {
      const p = Jogo.pessoas.get(id);
      if (p && Jogo.eu && podemConversar(Jogo.eu, p, true) && Midia.garantirPar(id)) montarTiles();
    },
    aoPararTela: () => { atualizarBotoesMidia(); avisarMidia(); },
    aoNegar: (tipo, e) => escreverChat({ sistema: true, texto:
      (tipo === 'audio' ? 'Microfone' : 'Câmera') + ' bloqueado pelo navegador ('
      + e.name + '). Libere nas permissões do site e tente de novo.' }),
    // o aparelho caiu sozinho: sem este aviso a pessoa fala para o vazio com o
    // botão aceso, e ninguém do outro lado sabe dizer o que houve
    aoPerderAparelho: (tipo) => {
      atualizarBotoesMidia();
      avisarMidia();
      escreverChat({ sistema: true, texto:
        (tipo === 'audio' ? 'O microfone' : 'A câmera')
        + ' foi desligado por fora (outro programa pegou o aparelho, ou o fone saiu). '
        + 'Clique no botão para ligar de novo.' });
    },
  });
  avisarMidia();

  document.getElementById('entrada').classList.add('oculto');
  document.getElementById('app').classList.remove('oculto');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  ajustarTela();
  zoomPadrao();
  desenharListaPessoas();
  atualizarBotoesMidia();
  montarTiles();
  desenharSituacao();
  Chamar.desde = Date.now();
  if (!primeira && lugarAntes && lugarAntes !== Jogo.espaco.id) {
    escreverChat({ sistema: true, texto: `Você está no ${Jogo.espaco.nome}.` });
  }
  // "Ir até" alguém do outro lugar: trocou de lugar, agora anda até a pessoa
  if (troca && troca.depois) setTimeout(() => irAte(troca.depois), 700);
  if (primeira) {
    Chamar.oferecer();
    escreverChat({ sistema: true, texto: 'Você chegou na recepção. Ande até alguém para conversar.' });
    setTimeout(() => document.getElementById('dica').style.opacity = 0, 9000);
    setInterval(cuidarDasChamadas, 250);
    requestAnimationFrame(quadro);
    Jogo.rodando = true;
  }
}

/* ==================== mapa e colisão ==================== */

function tileLivre(x, y) {
  if (x < 0 || y < 0 || x >= Jogo.mapa.largura || y >= Jogo.mapa.altura) return false;
  return !Jogo.bloqueados.has(x + ',' + y);
}

function livre(px, py) {
  const r = Jogo.raioAvatar;
  const t = Jogo.tile;
  return [[-r, -r], [r, -r], [-r, r], [r, r]]
    .every(([dx, dy]) => tileLivre(Math.floor((px + dx) / t), Math.floor((py + dy) / t)))
    && !(Cenario.ativo() && Cenario.bate(px, py, r));
}

function zonaDe(px, py) {
  // Mesma regra do servidor (mapa.py:zona_de): quando as salas se sobrepõem,
  // vence a menor — a salinha fechada dentro do coworking tem que valer.
  const tx = px / Jogo.tile, ty = py / Jogo.tile;
  let melhor = null, menor = Infinity;
  for (const z of Jogo.zonas) {
    if (tx < z.x1 || tx >= z.x2 + 1 || ty < z.y1 || ty >= z.y2 + 1) continue;
    // a mesa de reunião é zona só de quem SENTA nela (mapa.py: zona_de)
    if (z.so_sentado && !Cenario.sentadoNa(z.id, px, py)) continue;
    const area = (z.x2 - z.x1 + 1) * (z.y2 - z.y1 + 1);
    if (area < menor) { menor = area; melhor = z; }
  }
  return melhor;
}

/* ==================== zoom ==================== */

/** O menor zoom permitido. Não é fixo: é o que faz o andar INTEIRO caber na
 *  tela, quando isso pede mais do que o mínimo normal. Com o teto fixo em 0.5,
 *  um mapa largo não cabia de jeito nenhum e as colunas de salas dos dois lados
 *  ficavam cortadas na borda, sem nenhum jeito de ver o andar todo. */
function zoomMinimo() {
  if (!Jogo.mapa) return ZOOM_MIN;
  // um salão só: afastar além dele inteiro não mostra nada novo (26/11)
  if (Cenario.ativo()) return zoomEnquadrar();
  const r = tela.getBoundingClientRect();
  if (!r.width || !r.height) return ZOOM_MIN;
  const cabe = Math.min(r.width / Jogo.larguraPx, r.height / Jogo.alturaPx);
  return Math.max(ZOOM_CHAO, Math.min(ZOOM_MIN, cabe));
}

function definirZoom(valor) {
  ESCALA = Math.max(zoomMinimo(), Math.min(ZOOM_MAX, Number(valor.toFixed(2))));
  Jogo.escala = ESCALA;
  localStorage.setItem('escritorio:zoom', String(ESCALA));
  const marca = document.getElementById('zoom-nivel');
  if (marca) marca.textContent = Math.round(ESCALA / 1.5 * 100) + '%';
}

function ajustarZoom(fator) {
  localStorage.setItem('escritorio:zoom-manual', '1');
  definirZoom(ESCALA * fator);
}

/** O zoom em que o salão PREENCHE a área toda (tela cheia, sem faixa escura em
 *  volta). Numa tela de outro formato sobra uma beirada fora, e a câmera segue
 *  a pessoa até lá; entrada, mesa e as três portas continuam visíveis juntas. */
function zoomEnquadrar() {
  const r = tela.getBoundingClientRect();
  if (!r.width || !r.height) return ESCALA;
  return Math.max(r.width / Jogo.larguraPx, r.height / Jogo.alturaPx);
}

/** Com cenário, o padrão é enquadrar o salão inteiro (até a pessoa mexer no zoom). */
function zoomPadrao() {
  if (Cenario.ativo() && !localStorage.getItem('escritorio:zoom-manual')) definirZoom(zoomEnquadrar());
  else definirZoom(ESCALA);
}

/* ==================== entrada do teclado ==================== */

const MAPA_TECLAS = {
  arrowup: 'cima', w: 'cima', arrowdown: 'baixo', s: 'baixo',
  arrowleft: 'esquerda', a: 'esquerda', arrowright: 'direita', d: 'direita',
};

/** Estamos dentro do escritório? A tela de entrada e a de "sessão recusada"
 *  não têm boneco para mover nem chat para abrir. */
function naSala() {
  return !!Jogo.eu && !document.getElementById('app').classList.contains('oculto');
}

document.addEventListener('keydown', (e) => {
  // Na tela de entrada os atalhos não valem. Antes eles rodavam mesmo ali:
  // apertar E com o foco numa aba deixava `Editor.ativo` ligado sem painel
  // nenhum (e, já dentro da sala, cada clique no mapa colocava uma mesa), R e
  // B estouravam com `Jogo.eu` nulo, e o Enter num botão focado era engolido
  // pelo `preventDefault` do chat — quem entrava pelo teclado não conseguia
  // apertar "Entrar".
  if (!naSala()) return;
  // A janela da porta de saída (27/11) é dela: Esc fecha, o resto é digitar
  // a chave e apertar botão. O boneco não anda por baixo dela.
  if (Saida.aberta) {
    if (e.key === 'Escape') { Saida.fechar(); e.preventDefault(); }
    return;
  }
  // ⌘C, Ctrl+V, ⌘+: são do navegador. Sem esta linha copiar um trecho do
  // chat abria a grade da reunião (C), colar ligava a câmera (V) e o zoom do
  // navegador virava zoom do mapa.
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const campo = document.activeElement;
  // offsetParent nulo = o campo está escondido. Sem isso, quem entrava dando
  // Enter no nome ficava com o foco preso no campo da tela de entrada (já
  // oculta) e o teclado não movia o boneco.
  const digitando = campo && ['INPUT', 'TEXTAREA', 'SELECT'].includes(campo.tagName)
    && campo.offsetParent !== null;
  // Foco num botão (quem navega pelo teclado chegou nele com Tab): Enter e Tab
  // fazem o que fazem em qualquer página — apertar o botão e ir para o
  // próximo. Os atalhos de Enter (chat) e Tab (painel) só valem com o foco
  // solto, senão o teclado nunca alcançava botão nenhum da barra.
  const numControle = !!campo && campo !== document.body && !digitando;

  if (e.key === 'Enter' && !digitando) {
    if (numControle) return;
    // Com o painel escondido o campo do chat está em display:none e não recebe
    // foco: o Enter ficava mudo. Abre o painel antes.
    if (document.getElementById('app').classList.contains('sem-lateral')) alternarLateral(true);
    document.getElementById('campo-chat').focus();
    e.preventDefault();
    return;
  }
  if (e.key === 'Escape' && digitando) { campo.blur(); return; }
  if (e.key === 'Escape') {
    if (Reuniao.ativa) { fecharReuniao(); return; }
    // Com o editor aberto e uma peça na mão, o primeiro Esc só LARGA a peça:
    // é o que devolve o clique de selecionar, para apagar ou girar um móvel.
    if (Editor.ativo && (Editor.tipoSel || Editor.conjunto || Editor.movendo)) {
      Editor.esvaziarMao('esvaziar');
      Editor.fecharMenu();
      return;
    }
    encolherTiles();
    fecharEditor();
    Editor.movendo = null;
    Editor.fecharMenu();          // vale com o editor aberto ou fechado
  }
  if (digitando) return;

  const dir = MAPA_TECLAS[e.key.toLowerCase()];
  if (dir) { Jogo.teclas.add(dir); e.preventDefault(); return; }
  if (e.key === '+' || e.key === '=') { ajustarZoom(1.15); e.preventDefault(); return; }
  if (e.key === '-' || e.key === '_') { ajustarZoom(1 / 1.15); e.preventDefault(); return; }
  if (e.key === 'Tab') {
    if (!numControle && !e.shiftKey) { alternarLateral(); e.preventDefault(); }
    return;
  }
  // Tecla segurada repete o keydown: o microfone piscava ligado/desligado e a
  // reação saía em rajada. Só andar e zoom podem repetir.
  if (e.repeat) return;
  if (e.key.toLowerCase() === 'm') alternarMic();
  if (e.key.toLowerCase() === 'f') acionarReuniao();      // entrar/sair da mesa de reunião
  if (e.key.toLowerCase() === 'v') alternarCam();
  if (e.key.toLowerCase() === 't') alternarTela();
  if (e.key.toLowerCase() === 'b') abrirEditor();
  // com o escritório desenhado (cenário) não há o que editar: a planta é a arte
  if (e.key.toLowerCase() === 'e' && !Jogo.visitante && !Cenario.ativo()) Editor.alternar();
  if (e.key === '0') {
    if (Cenario.ativo()) { localStorage.removeItem('escritorio:zoom-manual'); definirZoom(zoomEnquadrar()); }
    else definirZoom(1.5);
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && Editor.ativo) Editor.removerSelecionado();
  // G gira o móvel: o que está na mão, o selecionado, ou o próximo a ser posto
  if (e.key.toLowerCase() === 'g' && (Editor.ativo || Editor.movendo)) Editor.girar();
  if (e.key.toLowerCase() === 'r') reagir();
  // P liga e desliga a profundidade na hora, para dar para comparar sem recarregar
  if (e.key.toLowerCase() === 'p') {
    profundidade(!PROFUNDIDADE);
    escreverChat({ sistema: true, texto: PROFUNDIDADE
      ? 'Profundidade LIGADA (parede em pé e móvel com corpo). Aperte P para desligar.'
      : 'Profundidade DESLIGADA — é como era antes. Aperte P para ligar.' });
  }
  if (e.key.toLowerCase() === 'c') alternarReuniao();
});

document.addEventListener('keyup', (e) => {
  const dir = MAPA_TECLAS[e.key.toLowerCase()];
  if (dir) Jogo.teclas.delete(dir);
});

// Sair da janela solta TUDO: tecla presa e destino de caminhada. Sem limpar o
// destino, quem apertava o botão no mapa e trocava de janela deixava o boneco
// andando sozinho atrás do cursor, e mexer o mouse na outra janela continuava
// guiando ele.
function soltarControles() {
  Jogo.teclas.clear();
  Jogo.caminho = null;
  Jogo.clique = null;
  delete tela.dataset.alvo;
}
window.addEventListener('blur', soltarControles);
document.addEventListener('visibilitychange', () => { if (document.hidden) soltarControles(); });

/* Dois dedos no mapa: pinça aproxima e afasta, como em qualquer mapa de
   celular. O canvas tem `touch-action: none` (sem isso o navegador cancelava o
   toque no meio do arrasto), então a pinça do sistema não existe mais ali e é
   o jogo que a faz. Registrado ANTES do clique do jogo: o segundo dedo precisa
   estar na conta quando o handler de baixo decidir se é passo ou pinça. */
const dedos = new Map();       // pointerId -> { x, y }, só toques
let pinca = null;              // { dist, escala } de quando a pinça começou

tela.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (dedos.size !== 2) return;
  const [a, b] = [...dedos.values()];
  pinca = { dist: Math.hypot(a.x - b.x, a.y - b.y), escala: ESCALA };
  // o segundo dedo cancela o que o primeiro estava fazendo: passo, arrasto de
  // móvel, pincel — senão a pinça largava o móvel num canto qualquer
  Jogo.clique = null;
  delete tela.dataset.alvo;
  Editor.arrasto = null;
  Editor.colocar = null;
  Editor.pincel = null;
  if (Editor.retangulo && Editor.retangulo.arrastando) Editor.retangulo = null;
});
tela.addEventListener('pointermove', (e) => {
  if (!dedos.has(e.pointerId)) return;
  dedos.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!pinca || dedos.size !== 2) return;
  const [a, b] = [...dedos.values()];
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  if (pinca.dist > 0) definirZoom(pinca.escala * d / pinca.dist);
});
const soltarDedo = (e) => {
  dedos.delete(e.pointerId);
  if (dedos.size < 2) pinca = null;
};
tela.addEventListener('pointerup', soltarDedo);
tela.addEventListener('pointercancel', soltarDedo);

/* Clique no chão: um clique manda caminhar até lá (contornando os móveis);
   segurar o botão anda na direção do cursor. Com o editor aberto, o mesmo
   clique vira pincel/arrasto de móvel. */
tela.addEventListener('pointerdown', (e) => {
  tela.setPointerCapture(e.pointerId);
  if (e.pointerType === 'touch' && dedos.size > 1) return;   // segundo dedo: é pinça, não clique
  if (Editor.ativo) { Editor.aoApontar(e, pontoNoMapa(e)); return; }
  if (Editor.movendo) {                       // móvel “na mão”, editor fechado
    const t = Editor._tile(pontoNoMapa(e));
    const m = Editor.movendo;
    Editor.movendo = null;
    enviar({ tipo: 'editar', acao: { acao: 'mover', id: m.id, x: t.x + m.dx, y: t.y + m.dy } });
    return;
  }
  Jogo.caminho = null;
  Jogo.clique = { ponto: pontoNoMapa(e), tela: { x: e.clientX, y: e.clientY },
                  quando: Date.now(), botao: e.button };
  tela.dataset.alvo = JSON.stringify(Jogo.clique.ponto);
});
tela.addEventListener('pointermove', (e) => {
  if (pinca) return;                                          // os dois dedos são da pinça
  if (Editor.ativo) { Editor.aoMover(pontoNoMapa(e)); return; }
  if (Editor.movendo) Editor.cursor = Editor._tile(pontoNoMapa(e));
  if (tela.dataset.alvo) tela.dataset.alvo = JSON.stringify(pontoNoMapa(e));
});
tela.addEventListener('pointerup', (e) => {
  // Limpa SEMPRE. Antes, abrir o editor com o botão apertado deixava o destino
  // gravado para sempre: o boneco voltava sozinho para aquele ponto e grudava,
  // e só um clique novo no mapa soltava.
  const alvoPendente = tela.dataset.alvo;
  delete tela.dataset.alvo;
  if (Editor.ativo) { Editor.aoSoltar(); return; }
  void alvoPendente;
  // clique curto e sem arrastar = "vá até ali"
  const c = Jogo.clique;
  Jogo.clique = null;
  if (!c) return;
  const arrastou = Math.hypot(e.clientX - c.tela.x, e.clientY - c.tela.y) > 8;
  if (arrastou) return;
  // Segurar parado é o gesto de "abrir o menu"; clique curto é sempre andar.
  const segurou = Date.now() - c.quando > 450 || c.botao === 2;

  // Clique na plaquinha da sala abre o menu dela (nome, cor, área, áudio).
  const etiqueta = (Jogo.etiquetas || []).find((e) =>
    c.ponto.x >= e.x && c.ponto.x <= e.x + e.w && c.ponto.y >= e.y && c.ponto.y <= e.y + e.h);
  if (etiqueta && !Jogo.visitante) { Editor.abrirMenuSala(etiqueta.id); return; }
  if (etiqueta) return;

  // Clique em cima de um móvel abre o menu dele (mover, trocar, remover).
  //
  // Tapete é o caso chato: ele mora na camada do piso e a gente ANDA em cima
  // dele, então clicar num tapete tem de andar. A saída é o modo: com o editor
  // aberto, clique em tapete abre o menu dele; com o editor fechado, clique em
  // tapete é passo, como em qualquer chão.
  const t = Editor._tile(c.ponto);
  const alvo = Editor.objetoEm(t.x, t.y);
  const info = alvo && Jogo.mapa.catalogo[alvo.tipo];
  const soNoEditor = info && info.camada === 'piso';
  // Com o editor ABERTO o clique é de edição: abre o menu na hora.
  // Com o editor FECHADO a pessoa está jogando, e clique é andar — senão, num
  // escritório cheio de móveis, quase todo clique virava menu e dava a sensação
  // de que o jogo tinha travado. Para editar sem abrir o editor, segure o botão
  // (ou clique com o direito) em cima do móvel.
  const abrirMenu = Editor.ativo ? !soNoEditor : segurou;
  if (alvo && info && !Jogo.visitante && abrirMenu) {
    Editor.abrirMenu(alvo.id);
    return;
  }
  Editor.fecharMenu();
  if (Editor.ativo) return;
  // Com cenário, clicar numa cadeira (ou no sofá) é sentar nela: anda até a
  // frente dela e senta ao chegar. Inclusive na mesa de reunião.
  if (Cenario.ativo()) {
    const cadeira = Cenario.assentoPerto(c.ponto.x, c.ponto.y, 46);
    if (cadeira) { irSentar(cadeira); return; }
    Jogo.querSentar = null;
  }
  const o = origemDoCaminho();
  Jogo.caminho = tracarCaminho(o.x, o.y, c.ponto.x, c.ponto.y)
              || caminhoPertoDe(c.ponto);
});

/* ---------- sentar e levantar no cenário ----------
 * O assento é um ponto DENTRO da cadeira (que bloqueia para quem passa). Senta
 * quem parou na frente dela pedindo para sentar (clique na cadeira, botão
 * "Entrar na reunião"), ou quem parou colado numa cadeira de trabalho ou no
 * sofá. Levantar põe a pessoa na `saida` do assento antes do primeiro passo. */
/** Onde a pessoa está sentada AGORA (ela sentou de verdade). Passar por cima
 *  do ponto da cadeira andando não conta: a cadeira de trabalho fica no
 *  caminho de quem anda dentro da diretoria, e contar isso como "sentado"
 *  levantava a pessoa de volta para a frente da cadeira, sem fim. */
function sentadoAgora() {
  const s = Jogo.sentadoEm;
  if (!s) return null;
  if (Math.abs(Jogo.eu.x - s.x) > 2 || Math.abs(Jogo.eu.y - s.y) > 2) { Jogo.sentadoEm = null; return null; }
  return s;
}

function origemDoCaminho() {
  const s = Cenario.ativo() && sentadoAgora();
  return s ? { x: s.saida[0], y: s.saida[1] } : { x: Jogo.eu.x, y: Jogo.eu.y };
}

function irSentar(cadeira) {
  const eu = Jogo.eu;
  Jogo.querSentar = cadeira;
  const o = origemDoCaminho();
  if (Math.hypot(o.x - cadeira.saida[0], o.y - cadeira.saida[1]) < 6) {
    levantar();
    sentarAgora(cadeira);
    return;
  }
  Jogo.caminho = tracarCaminho(o.x, o.y, cadeira.saida[0], cadeira.saida[1])
              || caminhoPertoDe({ x: cadeira.saida[0], y: cadeira.saida[1] });
  if (!Jogo.caminho) Jogo.querSentar = null;
  else if (sentadoAgora()) levantar();
}

function sentarAgora(a) {
  const eu = Jogo.eu;
  if (Cenario.ocupado(a, eu)) {
    escreverChat({ sistema: true, texto: 'Essa cadeira já está ocupada.' });
    return;
  }
  eu.x = a.x; eu.y = a.y; eu.xr = a.x; eu.yr = a.y;
  eu.direcao = a.dir;
  Jogo.querSentar = null;
  Jogo.sentadoEm = a;
  enviar({ tipo: 'mover', x: eu.x, y: eu.y, direcao: eu.direcao });
}

function levantar() {
  const eu = Jogo.eu;
  const s = Cenario.ativo() && sentadoAgora();
  if (!s) return false;
  Jogo.sentadoEm = null;
  eu.x = s.saida[0]; eu.y = s.saida[1]; eu.xr = eu.x; eu.yr = eu.y;
  enviar({ tipo: 'mover', x: eu.x, y: eu.y, direcao: eu.direcao });
  return true;
}

/** O botão "Entrar na reunião" aparece em cima da cadeira livre da mesa mais
 *  perto (até ~1,3 m), e vira "Sair da reunião" para quem está sentado nela.
 *  Quem só passa pela mesa vê o botão, mas continua andando normalmente. */
/** Assento da mesa de reunião (a zona que abre câmera e chamada). As baias
 *  também são zona de quem está sentado, mas não são reunião. */
function ehReuniao(a) {
  if (!a || !a.zona || !Jogo.mapa) return false;
  const z = Jogo.mapa.zonas.find((z) => z.id === a.zona);
  return !!(z && z.abre_midia);
}

function atualizarAcaoReuniao() {
  const botao = document.getElementById('acao-reuniao');
  if (!botao) return;
  const eu = Jogo.eu;
  let alvo = null, sentado = false;
  if (Cenario.ativo() && !Editor.ativo) {
    const s = sentadoAgora();
    if (s && ehReuniao(s)) { alvo = s; sentado = true; }
    else if (!s) {
      // perto da FRENTE da cadeira (de onde se senta), não do meio da mesa
      let melhor = null, dist = 48;     // colado na frente da cadeira (a entrada fica a ~56 px da do meio)
      for (const a of Jogo.mapa.cenario.assentos) {
        if (!ehReuniao(a) || Cenario.ocupado(a)) continue;
        const d = Math.hypot(a.saida[0] - eu.x, a.saida[1] - eu.y);
        if (d < dist) { dist = d; melhor = a; }
      }
      alvo = melhor;
    }
  }
  if (!alvo) { botao.hidden = true; Jogo.acaoReuniao = null; return; }
  Jogo.acaoReuniao = { alvo, sentado };
  botao.hidden = false;
  botao.classList.toggle('sair', sentado);
  botao.querySelector('span').textContent = sentado ? 'Sair da reunião' : 'Entrar na reunião';
  // fica fixo acima da barra de mídia: em cima da cadeira ele cobria o nome
  // de quem estava ali (o próprio ou o vizinho de mesa)
}

function acionarReuniao() {
  const a = Jogo.acaoReuniao;
  if (!a) return;
  if (a.sentado) { levantar(); Jogo.caminho = null; return; }
  irSentar(a.alvo);
}

/** Quando o ponto clicado é ocupado (uma mesa, por exemplo), anda até o tile
 *  livre mais perto dele. Sem isso o clique em cima de um móvel não fazia nada
 *  e o jogo parecia travado. */
function caminhoPertoDe(ponto) {
  if (Cenario.ativo()) {
    const o = origemDoCaminho();
    const perto = Cenario.pertoLivre(ponto, livre);
    return perto ? tracarCaminho(o.x, o.y, perto.x, perto.y) : null;
  }
  const t = Jogo.tile;
  const tx = Math.floor(ponto.x / t), ty = Math.floor(ponto.y / t);
  for (let raio = 1; raio <= 4; raio++) {
    let melhor = null, dist = Infinity;
    for (let dy = -raio; dy <= raio; dy++) {
      for (let dx = -raio; dx <= raio; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== raio) continue;
        const px = (tx + dx + 0.5) * t, py = (ty + dy + 0.5) * t;
        if (!livre(px, py)) continue;
        const d = Math.hypot(px - ponto.x, py - ponto.y);
        if (d < dist) { dist = d; melhor = { x: px, y: py }; }
      }
    }
    if (melhor) {
      const c = tracarCaminho(Jogo.eu.x, Jogo.eu.y, melhor.x, melhor.y);
      if (c) return c;
    }
  }
  return null;
}
/** A sala "de piso" de um ponto: a menor zona que o contém, sem contar as que
 *  só valem sentado (mesa de reunião, baias). Serve para o "ir até" não parar
 *  do outro lado de uma parede. */
function salaDoPiso(px, py) {
  const tx = px / Jogo.tile, ty = py / Jogo.tile;
  let melhor = null, menor = Infinity;
  for (const z of Jogo.zonas) {
    if (z.so_sentado) continue;
    if (tx < z.x1 || tx >= z.x2 + 1 || ty < z.y1 || ty >= z.y2 + 1) continue;
    const area = (z.x2 - z.x1 + 1) * (z.y2 - z.y1 + 1);
    if (area < menor) { menor = area; melhor = z; }
  }
  return melhor;
}

/** "Ir até" (26/11), da lista de pessoas: anda até ficar ao lado da pessoa, do
 *  lado de quem chega, sem subir em cima dela nem parar do outro lado da
 *  parede. Sala trancada: o boneco para na porta e o servidor oferece bater,
 *  como quando se anda até lá. */
function irAte(id) {
  const p = Jogo.pessoas.get(id);
  const eu = Jogo.eu;
  if (!p || !eu || Editor.ativo) return;
  const o = origemDoCaminho();
  const salaDela = salaDoPiso(p.x, p.y);
  const mesma = (z) => (z && z.id) === (salaDela && salaDela.id);
  if (Math.hypot(o.x - p.x, o.y - p.y) < 90 && mesma(salaDoPiso(o.x, o.y))) {
    escreverChat({ sistema: true, texto: `Você já está ao lado de ${p.nome}.` });
    return;
  }
  // em volta dela, começando pelo lado de quem chega
  const base = Math.atan2(o.y - p.y, o.x - p.x);
  const pontos = [];
  for (const d of [62, 85, 45]) {
    for (let k = 0; k < 16; k++) {
      const ang = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
      const x = p.x + d * Math.cos(ang), y = p.y + d * Math.sin(ang);
      if (livre(x, y) && mesma(salaDoPiso(x, y))) pontos.push({ x, y });
    }
  }
  let caminho = null;
  for (const c of pontos.slice(0, 5)) {
    caminho = tracarCaminho(o.x, o.y, c.x, c.y);
    if (caminho) break;
  }
  if (!caminho) caminho = caminhoPertoDe({ x: p.x, y: p.y });
  if (!caminho) {
    escreverChat({ sistema: true, texto: `Não achei um caminho até ${p.nome}.` });
    return;
  }
  Jogo.querSentar = null;
  Jogo.caminho = caminho;
  if (sentadoAgora()) levantar();
  // baia e mesa de reunião só juntam quem está SENTADO nelas
  const z = zonaDe(p.x, p.y);
  if (z && z.so_sentado) {
    escreverChat({ sistema: true, texto: z.abre_midia
      ? `${p.nome} está na mesa de reunião. Sente numa cadeira livre para entrar na conversa.`
      : `${p.nome} está na ${z.nome}. Para conversar, sente numa cadeira livre da baia.` });
  }
}

tela.addEventListener('pointercancel', () => {
  Editor.colocar = null;            // toque cancelado pelo sistema não coloca nada
  Editor.aoSoltar();
  delete tela.dataset.alvo;
});
tela.addEventListener('contextmenu', (e) => e.preventDefault());

// roda do mouse / pinça do trackpad aproximam e afastam
tela.addEventListener('wheel', (e) => {
  if (!Jogo.eu) return;
  e.preventDefault();
  ajustarZoom(e.deltaY < 0 ? 1.12 : 1 / 1.12);
}, { passive: false });
tela.addEventListener('pointerleave', () => { Editor.cursor = null; });

// clicar em qualquer outro lugar fecha o menu que estiver aberto
document.addEventListener('pointerdown', (e) => {
  if (Editor.menu && !Editor.menu.contains(e.target) && e.target !== tela) Editor.fecharMenu();
}, true);

function pontoNoMapa(e) {
  const r = tela.getBoundingClientRect();
  return { x: (e.clientX - r.left) / ESCALA + Jogo.camera.x,
           y: (e.clientY - r.top) / ESCALA + Jogo.camera.y };
}

/** Caminho até o ponto clicado, contornando parede e móvel (A* nos tiles).
 *  Devolve uma lista de pontos (centro de cada tile) ou null se não há como
 *  chegar — é o que faz o clique parecer o do Gather em vez de empurrar o
 *  boneco contra a mesa. */
function tracarCaminho(x0, y0, x1, y1) {
  if (Cenario.ativo()) return Cenario.caminho(x0, y0, x1, y1, livre);
  const T = Jogo.tile;
  const ini = { x: Math.floor(x0 / T), y: Math.floor(y0 / T) };
  const fim = { x: Math.floor(x1 / T), y: Math.floor(y1 / T) };
  if (!tileLivre(fim.x, fim.y)) return null;
  if (ini.x === fim.x && ini.y === fim.y) return null;

  const chave = (p) => p.x + ',' + p.y;
  const h = (p) => Math.abs(p.x - fim.x) + Math.abs(p.y - fim.y);
  const abertos = [{ ...ini, g: 0, f: h(ini) }];
  const veio = new Map();
  const custo = new Map([[chave(ini), 0]]);
  let voltas = 0;

  while (abertos.length && voltas++ < 6000) {
    abertos.sort((a, b) => a.f - b.f);
    const atual = abertos.shift();
    if (atual.x === fim.x && atual.y === fim.y) {
      const caminho = [];
      let p = chave(atual);
      while (p) {
        const [px, py] = p.split(',').map(Number);
        caminho.unshift({ x: (px + 0.5) * T, y: (py + 0.5) * T });
        p = veio.get(p);
      }
      caminho.shift();                       // o primeiro é onde já estamos
      return caminho.length ? caminho : null;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const viz = { x: atual.x + dx, y: atual.y + dy };
      if (!tileLivre(viz.x, viz.y)) continue;
      const g = atual.g + 1;
      const k = chave(viz);
      if (custo.has(k) && custo.get(k) <= g) continue;
      custo.set(k, g);
      veio.set(k, chave(atual));
      abertos.push({ ...viz, g, f: g + h(viz) });
    }
  }
  return null;
}

/* ==================== laço principal ==================== */

// Um quadro que estoura não pode parar o escritório. Antes, um erro dentro de
// `desenhar` (o móvel que eu arrastava sumiu porque outra pessoa o apagou)
// pulava o `requestAnimationFrame` e a tela congelava para sempre: boneco
// parado, chat funcionando, só o F5 resolvia. O erro continua aparecendo no
// console (relançado fora do laço), mas o próximo quadro sempre é pedido.
let ultimoErroDeQuadro = 0;

function quadro() {
  try {
    atualizar();
    desenhar();
  } catch (e) {
    if (Date.now() - ultimoErroDeQuadro > 2000) {       // um por vez, não 60 por segundo
      ultimoErroDeQuadro = Date.now();
      setTimeout(() => { throw e; }, 0);
    }
  } finally {
    requestAnimationFrame(quadro);
  }
}

function atualizar() {
  const eu = Jogo.eu;
  // quanto tempo passou desde o quadro anterior (com teto: a aba voltando de
  // escondida não pode dar um salto, e passo grande atravessaria móvel fino)
  const agoraQ = performance.now();
  const dt = Math.min(0.034, Math.max(0, (agoraQ - (Jogo.ultimoQuadro || agoraQ)) / 1000));
  Jogo.ultimoQuadro = agoraQ;
  let limitePasso = Infinity;     // seguindo um ponto: não passar dele
  let dx = 0, dy = 0;
  if (Jogo.teclas.has('esquerda')) dx -= 1;
  if (Jogo.teclas.has('direita')) dx += 1;
  if (Jogo.teclas.has('cima')) dy -= 1;
  if (Jogo.teclas.has('baixo')) dy += 1;

  if (dx || dy) { Jogo.caminho = null; Jogo.querSentar = null; }   // o teclado cancela o trajeto
  // sentado no cenário: o primeiro passo levanta (a pessoa aparece na frente da cadeira)
  if (Cenario.ativo() && (dx || dy || (Jogo.caminho && Jogo.caminho.length) || tela.dataset.alvo)) levantar();

  if (!dx && !dy && Jogo.caminho && Jogo.caminho.length) {
    // Chegou num ponto do trajeto: já mira o próximo no MESMO quadro. Antes esse
    // quadro ficava parado, e parar conta como "parou" (manda a posição, tenta
    // sentar): o pedido de sentar se perdia na primeira curva do caminho.
    while (Jogo.caminho.length && Math.hypot(Jogo.caminho[0].x - eu.x, Jogo.caminho[0].y - eu.y) < 4) {
      Jogo.caminho.shift();
    }
    if (Jogo.caminho.length) {
      const passo = Jogo.caminho[0];
      const vx = passo.x - eu.x, vy = passo.y - eu.y;
      const d = Math.hypot(vx, vy);
      dx = vx / d; dy = vy / d;
      limitePasso = d;            // senão ficava indo e voltando em volta do ponto
    } else {
      Jogo.caminho = null;
    }
  }

  if (!dx && !dy && tela.dataset.alvo) {          // segurando o botão: anda para lá
    const alvo = JSON.parse(tela.dataset.alvo);
    const vx = alvo.x - eu.x, vy = alvo.y - eu.y;
    const d = Math.hypot(vx, vy);
    if (d > 6) { dx = vx / d; dy = vy / d; limitePasso = d; }
  }

  if (dx || dy) {
    const n = Math.hypot(dx, dy) || 1;
    const passo = Math.min(VELOCIDADE * dt, limitePasso);
    const px = eu.x + (dx / n) * passo;
    const py = eu.y + (dy / n) * passo;
    // Testa os eixos separado: deslizar na parede em vez de travar. Se a pessoa
    // já está presa dentro de um móvel (alguém colocou em cima dela), qualquer
    // movimento vale — senão a única saída seria recarregar.
    const preso = !livre(eu.x, eu.y);
    const antesX = eu.x, antesY = eu.y;
    if (preso || livre(px, eu.y)) eu.x = px;
    if (preso || livre(eu.x, py)) eu.y = py;
    if (Jogo.caminho) destravarCaminho(eu, Math.hypot(eu.x - antesX, eu.y - antesY));
    eu.direcao = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'direita' : 'esquerda')
                                             : (dy > 0 ? 'baixo' : 'cima');
    const agora = Date.now();
    if (agora - Jogo.ultimoEnvio > INTERVALO_ENVIO) {
      Jogo.ultimoEnvio = agora;
      enviar({ tipo: 'mover', x: eu.x, y: eu.y, direcao: eu.direcao });
    }
  } else if (Jogo.ultimoEnvio) {
    Jogo.ultimoEnvio = 0;                          // envia a posição final ao parar
    acomodarNoAssento(eu);
    enviar({ tipo: 'mover', x: eu.x, y: eu.y, direcao: eu.direcao });
  }

  eu.passo = (dx || dy) ? (eu.passo || 0) + 13.2 * dt : 0;       // o balanço da caminhada, também por tempo
  eu.xr = eu.x; eu.yr = eu.y;
  for (const p of Jogo.pessoas.values()) {         // suaviza o movimento dos outros
    const andando = Math.hypot(p.x - p.xr, p.y - p.yr) > 0.7;
    p.passo = andando ? (p.passo || 0) + 0.22 : 0;
    p.xr += (p.x - p.xr) * 0.25;
    p.yr += (p.y - p.yr) * 0.25;
  }

  Saida.conferir(eu);
  const zona = zonaDe(eu.x, eu.y);
  const idZona = zona ? zona.id : null;
  if (idZona !== Jogo.zonaAnterior) {
    Jogo.zonaAnterior = idZona;
    const chip = document.getElementById('zona-atual');
    chip.textContent = zona ? (zona.privada ? '🔒 ' : '') + zona.nome : 'Corredor';
    chip.style.borderColor = zona ? zona.cor : '';
    desenharListaPessoas();
    ofereceSala(zona);
    abrirMidiaDaSala(zona);
    atualizarRelogioChamada();
  }
  atualizarBotaoTrancar(zona);
}

/** Seguindo um trajeto, o boneco "chega" a cada ponto a até 4 px dele e já
 *  vira para o próximo: corta a curva. A reta seguinte foi conferida a partir
 *  do ponto, com 1 px de folga, e saindo de 3 px ao lado ela raspava na quina
 *  de um móvel. O boneco ficava empurrando a quina para sempre, sem chegar
 *  (26/11, achado no "ir até" da baia). Parado de verdade por alguns quadros:
 *  traça de novo a partir de onde ele está; na terceira vez, desiste. */
function destravarCaminho(eu, andou) {
  const c = Jogo.caminho;
  if (andou > 0.5) { c.parado = 0; return; }
  c.parado = (c.parado || 0) + 1;
  if (c.parado < 6) return;
  const fim = c[c.length - 1];
  const novo = (c.refeito || 0) < 3 && tracarCaminho(eu.x, eu.y, fim.x, fim.y);
  if (novo && novo.length) {
    novo.refeito = (c.refeito || 0) + 1;
    Jogo.caminho = novo;
  } else {
    Jogo.caminho = null;
  }
}

/** Sala marcada com `abre_midia` (a de reunião) abre câmera e microfone de
 *  quem entra. É regra da casa: reunião é de cara aberta. Quem não quiser
 *  desliga com M ou V depois — e quem negou a permissão do navegador só recebe
 *  o aviso, não fica de fora. */
async function abrirMidiaDaSala(zona) {
  if (!zona || !zona.abre_midia || Jogo.visitante) return;
  const faltando = ['audio', 'video'].filter((t) => !Midia.ligado(t));
  if (!faltando.length) return;
  escreverChat({ sistema: true,
    texto: `Na ${zona.nome} todo mundo entra com câmera e microfone abertos.` });
  for (const tipo of faltando) {
    try {
      await Midia.alternar(tipo);
    } catch (e) { /* permissão negada: o aviso do Midia já aparece */ }
  }
  atualizarBotoesMidia();
  montarTiles();
  avisarMidia();
}

/** Botão de trancar/destrancar a PRÓPRIA sala, fixo na barra enquanto você
 *  está dentro dela. Antes o único lugar de trancar era um cartão que aparece
 *  uma vez por sessão: depois de trancar, não sobrava nenhum jeito de
 *  destrancar. Ele lê a sala AGORA, não uma cópia de quando apareceu. */
function atualizarBotaoTrancar(zona) {
  const b = document.getElementById('btn-trancar');
  if (!b) return;
  const viva = zona ? (Jogo.mapa.zonas.find((z) => z.id === zona.id) || zona) : null;
  const minha = !!(viva && viva.privada && !viva.sem_dono && !Jogo.visitante
                   && viva.dono_nome && Jogo.eu && viva.dono_nome === Jogo.eu.nome);
  b.hidden = !minha;
  if (!minha) return;
  const trancada = !!viva.trancada;
  const texto = trancada ? '🔓 Destrancar' : '🔒 Trancar';
  if (b.textContent !== texto) b.textContent = texto;
  b.title = trancada
    ? 'A porta está trancada: só entra quem você deixar. Clique para abrir.'
    : 'A porta está aberta: qualquer um entra. Clique para trancar.';
  b.dataset.zona = viva.id;
  b.dataset.trancada = trancada ? '1' : '';
}

document.getElementById('btn-trancar').onclick = (e) => {
  const b = e.currentTarget;
  enviar({ tipo: 'sala', acao: b.dataset.trancada ? 'destrancar' : 'trancar', id: b.dataset.zona });
};

// Salas já oferecidas nesta sessão: a pergunta aparece uma vez por sala, não a
// cada vez que a pessoa cruza a porta.
const salasOferecidas = new Set();

/** Entrou numa sala livre? ela se oferece. Antes a única forma de reivindicar
 *  era descobrir que a plaquinha flutuante era clicável, e ninguém descobre. */
function ofereceSala(zona) {
  if (Cenario.ativo()) return;      // diretoria com dono pela conta (26/11): ninguém "pega" sala
  if (!zona || !zona.privada || zona.sem_dono || Jogo.visitante) return;
  if (zona.dono_nome) {                      // já tem dono
    if (zona.dono_nome === Jogo.eu.nome && !salasOferecidas.has('minha:' + zona.id)) {
      salasOferecidas.add('minha:' + zona.id);
      painelPedido({
        texto: `Esta é a <b>sua</b> sala. ${zona.trancada
          ? 'A porta está trancada.' : 'A porta está aberta: qualquer um entra.'}`,
        botoes: [
          { texto: zona.trancada ? 'Destrancar' : 'Trancar por dentro', classe: 'ok',
            fazer: () => enviar({ tipo: 'sala',
                                  acao: zona.trancada ? 'destrancar' : 'trancar', id: zona.id }) },
          { texto: 'Deixar assim' },
        ],
        segundos: 12,
      });
    }
    return;
  }
  if (salasOferecidas.has(zona.id)) return;
  salasOferecidas.add(zona.id);
  painelPedido({
    texto: `<b>${escapar(zona.nome)}</b> está livre. Quer que ela seja sua?`,
    botoes: [
      { texto: 'Reivindicar', classe: 'ok',
        fazer: () => enviar({ tipo: 'sala', acao: 'reivindicar', id: zona.id }) },
      { texto: 'Agora não' },
    ],
    segundos: 14,
  });
}

/** Assentos: pisar em cima de um deles senta a pessoa (como no Gather).
 *  Os de fábrica estão na lista; os do arsenal entram pela categoria — eram
 *  15 cadeiras novas em que ninguém sentava. */
const ASSENTOS = new Set(['cadeira', 'cadeira_gamer', 'poltrona', 'banqueta', 'sofa']);
const GRUPOS_ASSENTO = new Set(['Assentos', 'Cadeiras', 'Cadeiras Gamer', 'Sofás', 'Poltronas']);

function ehAssento(tipo, info) {
  return ASSENTOS.has(tipo) || !!(info && GRUPOS_ASSENTO.has(info.grupo));
}

/** Ao parar em cima de um assento, encaixa a pessoa no meio dele e vira para a
 *  mesa mais próxima — é o que o Gather faz. Sem isso ela ficava meio dentro,
 *  meio fora da cadeira, que era o que dava cara de defeito. */
const GRUPOS_MESA = new Set(['Mesas', 'Escrivaninhas']);

function acomodarNoAssento(eu) {
  if (Cenario.ativo()) {
    if (Jogo.caminho) return;                  // ainda a caminho: o pedido continua de pé
    const pedido = Jogo.querSentar;
    Jogo.querSentar = null;
    let a = pedido && Math.hypot(pedido.saida[0] - eu.x, pedido.saida[1] - eu.y) < 40 ? pedido : null;
    // sem pedido, só a cadeira de trabalho e o sofá sentam por parar colado:
    // a da reunião é pelo botão (ou clique nela), senão quem para perto da
    // mesa para conversar entraria na reunião sem querer
    if (!a) a = Cenario.assentoPerto(eu.x, eu.y, 22, (s) => !ehReuniao(s));
    if (a) sentarAgora(a);
    return;
  }
  const assento = assentoEm(eu.x, eu.y);
  if (!assento || !Jogo.mapa) return;
  const t = Jogo.tile;
  const info = Jogo.mapa.catalogo[assento.tipo];
  const m = Objetos.medida(assento.tipo, info, assento.g);
  // no meio do TILE em que ela parou, não no meio do móvel: num sofá de três
  // lugares cada um senta no seu, em vez de todo mundo ser puxado para o centro
  eu.x = (Math.floor(eu.x / t) + 0.5) * t;
  eu.y = (Math.floor(eu.y / t) + 0.5) * t;
  eu.xr = eu.x; eu.yr = eu.y;
  const lado = ladoDaMesa(assento, m);
  if (lado) eu.direcao = lado;
}

/** Para que lado está a mesa colada no assento, se houver alguma. */
function ladoDaMesa(assento, m) {
  const perto = { cima: 0, baixo: 0, esquerda: 0, direita: 0 };
  for (const o of Jogo.mapa.objetos) {
    const info = Jogo.mapa.catalogo[o.tipo];
    if (!info || !GRUPOS_MESA.has(info.grupo)) continue;
    const mo = Objetos.medida(o.tipo, info, o.g);
    const cruzaX = o.x < assento.x + m.l && o.x + mo.l > assento.x;
    const cruzaY = o.y < assento.y + m.a && o.y + mo.a > assento.y;
    if (cruzaX && o.y + mo.a === assento.y) perto.cima++;
    if (cruzaX && o.y === assento.y + m.a) perto.baixo++;
    if (cruzaY && o.x + mo.l === assento.x) perto.esquerda++;
    if (cruzaY && o.x === assento.x + m.l) perto.direita++;
  }
  let melhor = null;
  for (const [lado, n] of Object.entries(perto)) {
    if (n && (!melhor || n > perto[melhor])) melhor = lado;
  }
  return melhor;
}

function assentoEm(px, py) {
  if (!Jogo.mapa) return null;
  if (Cenario.ativo()) return Cenario.assentoEm(px, py);
  const t = Jogo.tile;
  const tx = Math.floor(px / t), ty = Math.floor(py / t);
  for (const o of Jogo.mapa.objetos) {
    const info = Jogo.mapa.catalogo[o.tipo];
    if (!info || !ehAssento(o.tipo, info)) continue;
    const m = Objetos.medida(o.tipo, info, o.g);
    if (tx >= o.x && tx < o.x + m.l && ty >= o.y && ty < o.y + m.a) return o;
  }
  return null;
}

/* ==================== quem ouve quem ==================== */

function mesmaSala(a, b) {
  const za = zonaDe(a.x, a.y), zb = zonaDe(b.x, b.y);
  return !!(za && zb && za.id === zb.id);
}

function podemConversar(a, b, jaConectados) {
  // Calado pelo administrador não entra em chamada nenhuma. O servidor já não
  // encaminha o sinal dessa pessoa; sem esta linha o vigia ficava tentando
  // abrir a chamada a cada 250 ms, para sempre.
  if (a.silenciado || b.silenciado) return false;
  const za = zonaDe(a.x, a.y), zb = zonaDe(b.x, b.y);
  const privA = !!(za && za.privada), privB = !!(zb && zb.privada);
  // Sala FECHADA é bolha cheia: dentro dela todo mundo se ouve, por mais longe
  // que esteja. Área ABERTA (convivência, corredor, jardim) vale o raio, e de
  // propósito: é o que deixa duas rodas de conversa no mesmo salão sem uma
  // atropelar a outra. Fazer o salão inteiro se ouvir dava um bolo só de vozes,
  // ainda mais porque a circulação cobre o prédio todo.
  if (privA || privB) return privA && privB && za.id === zb.id;
  // Não perturbe (26/11): pelo caminho ninguém puxa conversa. Dentro de sala,
  // baia ou mesa de reunião continua valendo (acima). Mesma regra de sala.py.
  if (a.situacao === 'nao_perturbe' || b.situacao === 'nao_perturbe') return false;
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  return d <= (jaConectados ? Jogo.config.raio_silencio : Jogo.config.raio_conversa);
}

/* 26/11: volume cheio dentro do raio de conversa. Antes ele já caía a partir de
   70 px: a 150 px (a borda de abrir a chamada) a pessoa chegava com 43% do som,
   e a 200 px com 7% — "estou conectado e não escuto ninguém". Agora só cai na
   faixa entre o raio de conversa e o de silêncio, e nunca abaixo da metade
   enquanto a chamada existe. */
function volumeEntre(a, b) {
  const z = zonaDe(a.x, a.y);
  if (z && z.privada && mesmaSala(a, b)) return 1;   // sala fechada: volume cheio
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  const perto = Jogo.config.raio_conversa, longe = Jogo.config.raio_silencio;
  if (d <= perto) return 1;
  return Math.max(0.5, 1 - 0.5 * (d - perto) / Math.max(1, longe - perto));
}

// Quem anda na borda do raio cruzava a linha para um lado e para o outro a
// cada passo: a chamada caía e outra nascia do zero, e a câmera piscava para
// os dois. Sair de perto só vale se a pessoa ficou fora de verdade.
const CARENCIA_FORA_MS = 3000;
const foraDesde = new Map();      // id -> quando saiu do raio

function cuidarDasChamadas() {
  const eu = Jogo.eu;
  if (!eu) return;
  const agora = Date.now();
  const naConversa = new Set();
  for (const p of Jogo.pessoas.values()) {
    const conectado = Midia.pares.has(p.id);
    const deve = podemConversar(eu, p, conectado);
    if (deve) naConversa.add(p.id);
    if (deve && !conectado) {
      foraDesde.delete(p.id);
      // O cartão de vídeo nascia só quando chegava uma faixa de mídia. Quem
      // chegava sem microfone e sem câmera não ganhava cartão no outro lado
      // — e sem cartão não entrava na grade da reunião. O cartão é de quem
      // está NA CONVERSA, com ou sem mídia. (Quem só atende ganha o cartão
      // quando a oferta chega.)
      if (Midia.garantirPar(p.id)) montarTiles();
    } else if (!deve && conectado) {
      const desde = foraDesde.get(p.id) || agora;
      foraDesde.set(p.id, desde);
      Midia.ajustarVolume(p.id, volumeEntre(eu, p));   // já vai sumindo o som
      if (agora - desde >= CARENCIA_FORA_MS) {
        foraDesde.delete(p.id);
        Midia.fechar(p.id);
      }
    } else if (deve) {
      foraDesde.delete(p.id);
      Midia.ajustarVolume(p.id, volumeEntre(eu, p));
    }
  }
  // quem sumiu da sala não fica de castigo guardado para sempre
  for (const id of [...foraDesde.keys()]) {
    if (!Jogo.pessoas.has(id)) foraDesde.delete(id);
  }
  Chamar.conferirChegadas(naConversa);
  Midia.vigiar();                 // chamada que não liga em 15 s é refeita
  cuidarDaTelaDeChamada(eu);
  avisarQualidade();
  desenharListaPessoas();
}

// Quando a roda cresce, cada um passa a mandar a própria imagem para mais
// gente e a subida da internet aperta. A imagem cai de tamanho sozinha — e a
// pessoa precisa saber por quê, senão parece defeito.
let qualidadeAvisada = null;

function avisarQualidade() {
  const agora = Midia.pares.size ? Midia.degrauAgora() : null;
  if (agora === qualidadeAvisada) return;
  const antes = qualidadeAvisada;
  qualidadeAvisada = agora;
  if (!agora || !antes) return;                  // acabou de entrar ou de sair da roda
  if (agora.encolher > antes.encolher) {
    Avisos.anotar(`Conversa de ${Midia.pares.size + 1} pessoas: a imagem foi reduzida para o som `
      + 'não falhar. Desligar a câmera de quem não está falando ajuda.');
  } else if (agora.encolher < antes.encolher && agora.encolher === 1) {
    Avisos.anotar('Roda menor: a imagem voltou ao tamanho cheio.');
  }
}

/* ==================== desenho ==================== */

function ajustarTela() {
  const r = tela.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  tela.width = Math.floor(r.width * dpr);
  tela.height = Math.floor(r.height * dpr);
  Jogo.dpr = dpr;
}
window.addEventListener('resize', () => {
  if (!Jogo.eu) return;
  ajustarTela();
  // a janela encolheu: o zoom que cabia antes pode não caber mais
  zoomPadrao();
});

// Paleta clara, tirada da referência: o chão é neutro e quem colore o ambiente
// são os carpetes das áreas de time.
const CORES_PISO = {
  // Os dois tons de cada piso são quase iguais de propósito: o xadrez forte
  // competia com os móveis. A variação existe só para o chão não ficar chapado.
  m: ['#dcc19c', '#d9bd97'],   // madeira clara
  c: ['#e9e3d9', '#e7e0d5'],   // carpete neutro
  a: ['#ebedf0', '#e8eaee'],   // azulejo
  p: ['#e2dfda', '#dfdcd7'],   // concreto
  g: ['#a3cb84', '#9fc880'],   // grama
  l: ['#cdc2e6', '#c9bde3'],   // carpete lilás
  z: ['#c3d5f1', '#bdd0ee'],   // carpete azul
  v: ['#c2e2d3', '#bcded0'],   // carpete menta
  r: ['#eed2da', '#eaccd5'],   // carpete rosa
};

function desenhar() {
  if (!Jogo.mapa) return;
  const dpr = Jogo.dpr || 1;
  const larg = tela.width / dpr / ESCALA, alt = tela.height / dpr / ESCALA;

  Jogo.camera.x = Jogo.larguraPx <= larg ? (Jogo.larguraPx - larg) / 2
    : Math.max(0, Math.min(Jogo.larguraPx - larg, Jogo.eu.x - larg / 2));
  Jogo.camera.y = Jogo.alturaPx <= alt ? (Jogo.alturaPx - alt) / 2
    : Math.max(0, Math.min(Jogo.alturaPx - alt, Jogo.eu.y - alt / 2));

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const comArte = Cenario.ativo();
  ctx.fillStyle = comArte ? (Jogo.mapa.cenario.cor_fora || '#121014')
                          : '#efe7dd';           // fora do mapa: bege da marca, não preto
  ctx.fillRect(0, 0, tela.width / dpr, tela.height / dpr);
  ctx.setTransform(ESCALA * dpr, 0, 0, ESCALA * dpr,
                   -Jogo.camera.x * ESCALA * dpr, -Jogo.camera.y * ESCALA * dpr);

  const mapa = Jogo.mapa;
  const t = Jogo.tile;
  const x0 = Math.max(0, Math.floor(Jogo.camera.x / t) - 1);
  const y0 = Math.max(0, Math.floor(Jogo.camera.y / t) - 1);
  const x1 = Math.min(mapa.largura, Math.ceil((Jogo.camera.x + larg) / t) + 1);
  const y1 = Math.min(mapa.altura, Math.ceil((Jogo.camera.y + alt) / t) + 1);

  // ---------- piso ----------
  // (a face da parede, mais abaixo, também pergunta se tem parede)
  let ehParede = () => false;
  if (comArte) Cenario.desenharFundo(ctx);
  else {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const tipo = mapa.piso[y][x];
      const par = CORES_PISO[tipo] || CORES_PISO.c;
      ctx.fillStyle = par[(x + y) % 2];
      ctx.fillRect(x * t, y * t, t, t);
      if (tipo === 'm') {                              // tábuas
        ctx.fillStyle = 'rgba(120,80,40,.22)';
        ctx.fillRect(x * t, y * t + t - 2, t, 1.5);
      } else if (tipo === 'a') {                       // rejunte
        ctx.fillStyle = 'rgba(148,163,184,.5)';
        ctx.fillRect(x * t, y * t, t, 1);
        ctx.fillRect(x * t, y * t, 1, t);
      }
    }
  }

  // ---------- paredes ----------
  // A parede ocupa um quadradinho inteiro para efeito de passagem, mas é
  // DESENHADA mais fina: o miolo do tile é dela, e sobra uma folga de cada lado
  // que não tem vizinho de parede. Assim o muro fica com a espessura de um muro
  // e não de um corredor, e as quinas continuam fechando sozinhas.
  ehParede = (x, y) => y >= 0 && y < mapa.altura && x >= 0 && x < mapa.largura
    && mapa.paredes[y][x] === '1';
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (!ehParede(x, y)) continue;
      const px = x * t, py = y * t;
      const ce = ehParede(x - 1, y) ? 0 : FOLGA_PAREDE;
      const cd = ehParede(x + 1, y) ? 0 : FOLGA_PAREDE;
      const cc = ehParede(x, y - 1) ? 0 : FOLGA_PAREDE;
      const cb = ehParede(x, y + 1) ? 0 : FOLGA_PAREDE;
      const bx = px + ce, by = py + cc, bw = t - ce - cd, bh = t - cc - cb;
      ctx.fillStyle = '#f7f4ee';                       // topo: pega a luz de cima
      ctx.fillRect(bx, by, bw, bh);
      if (cc) {                                        // quina de cima, iluminada
        ctx.fillStyle = '#fdfbf6';
        ctx.fillRect(bx, by, bw, 3);
        ctx.fillStyle = '#e2dbcc';
        ctx.fillRect(bx, by + 3, bw, 1.5);
      }
      if (ce) { ctx.fillStyle = 'rgba(180,170,150,.45)'; ctx.fillRect(bx, by, 1.5, bh); }
      if (cd) { ctx.fillStyle = 'rgba(150,140,120,.35)'; ctx.fillRect(bx + bw - 1.5, by, 1.5, bh); }
    }
  }

  }   // fim do piso e das paredes de quadradinho (sem cenário)

  // ---------- tapetes (ficam no chão, sob todo o resto) ----------
  const noQuadro = (o) => {
    const info = mapa.catalogo[o.tipo] || { l: 1, a: 1 };
    const m = Objetos.medida(o.tipo, info, o.g);
    return o.x + m.l > x0 && o.x < x1 && o.y + m.a > y0 && o.y < y1;
  };
  const visiveis = mapa.objetos.filter(noQuadro);
  for (const o of visiveis) {
    const info = mapa.catalogo[o.tipo];
    if (info && info.camada === 'piso') {
      const m = Objetos.medida(o.tipo, info, o.g);
      Objetos.desenhar(ctx, o.tipo, o.x * t, o.y * t, m.l * t, m.a * t, o.g);
    }
  }

  // ---------- raio de conversa ----------
  const eu = Jogo.eu;
  const zonaEu = zonaDe(eu.x, eu.y);
  if (!(zonaEu && zonaEu.privada)) {
    ctx.beginPath();
    ctx.arc(eu.x, eu.y + (comArte ? 13 : 0), Jogo.config.raio_conversa, 0, Math.PI * 2);
    ctx.strokeStyle = comArte ? 'rgba(196,181,253,.22)' : 'rgba(120,140,200,.28)';
    ctx.setLineDash([5, 9]);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ---------- móveis e pessoas, de trás para a frente ----------
  // Quando dois móveis terminam na mesma linha, a base empata e só a ordem da
  // lista decidiria quem cobre quem — e essa ordem muda toda vez que se troca
  // um móvel de lugar. Daí uma mesa recém-colocada passar por cima da cadeira
  // que já estava ali. O peso desempata sempre do mesmo jeito: superfície
  // embaixo, o que se apoia nela em cima.
  const fila = [];

  // ---------- a face da parede ----------
  // O tile da parede é o TOPO dela, visto de cima. A parte que a gente vê em pé
  // é a face virada para o sul, e ela desce por cima do piso da frente. Entra na
  // fila com a base no fim do tile: assim tudo que está mais para baixo na tela
  // (móvel, pessoa) passa na frente, e o que está atrás some — que é o que dá a
  // sensação de estar DENTRO da sala, e não olhando um mapa.
  for (let y = y0; y < y1; y++) {
    let inicio = -1;
    for (let x = x0; x <= x1; x++) {
      const face = PROFUNDIDADE && x < x1 && ehParede(x, y) && !ehParede(x, y + 1);
      if (face && inicio < 0) inicio = x;
      if (!face && inicio >= 0) {
        const px = inicio * t, largura = (x - inicio) * t, base = (y + 1) * t - FOLGA_PAREDE;
        fila.push({ base, peso: PESO_PAREDE,
                    desenhar: () => desenharFaceParede(px, base, largura) });
        inicio = -1;
      }
    }
  }

  // ---------- as portas das salas ----------
  for (const z of mapa.zonas) {
    if (comArte && z.porta_px) {
      fila.push({ base: z.porta_px.y + 8, peso: PESO_PAREDE + 0.5,
                  desenhar: () => Cenario.desenharPorta(ctx, z) });
      continue;
    }
    if (!z.porta) continue;
    const p = z.porta;
    if (p.x + 2 < x0 || p.x > x1 || p.y + 2 < y0 || p.y > y1) continue;
    const deitada = p.lado === 'baixo' || p.lado === 'cima';
    fila.push({ base: (p.y + (deitada ? 1 : 2)) * t, peso: PESO_PAREDE + 0.5,
                desenhar: () => desenharPorta(z, p, deitada) });
  }

  for (const o of visiveis) {
    const info = mapa.catalogo[o.tipo];
    if (!info || info.camada !== 'chao') continue;
    const m = Objetos.medida(o.tipo, info, o.g);
    fila.push({ base: (o.y + m.a) * t, peso: pesoDeEmpate(o.tipo, info), desenhar: () =>
      Objetos.desenhar(ctx, o.tipo, o.x * t, o.y * t, m.l * t, m.a * t, o.g) });
  }
  const gente = [...Jogo.pessoas.values(), eu];
  for (const pes of gente) {
    // Sentado, a pessoa tem que sair depois da cadeira na fila — senão a
    // cadeira (cuja base é o fim do tile) é desenhada por cima dela.
    const cad = assentoEm(pes.xr, pes.yr);
    const base = cad && cad.base !== undefined ? cad.base
      : cad ? (cad.y + Objetos.medida(cad.tipo, mapa.catalogo[cad.tipo], cad.g).a) * t + 0.5
      : pes.yr + 13;
    fila.push({ base, peso: PESO_PESSOA, desenhar: () => desenharAvatar(pes, pes === eu) });
  }
  // a arte que fica na frente de quem passa atrás (tampo da mesa, cadeiras, vidro…)
  if (comArte) Cenario.porNaFila(fila, ctx);
  fila.sort((a, b) => a.base - b.base || a.peso - b.peso);
  for (const item of fila) item.desenhar();

  // ---------- o que fica em cima das mesas ----------
  for (const o of visiveis) {
    const info = mapa.catalogo[o.tipo];
    if (info && info.camada === 'mesa') {
      const m = Objetos.medida(o.tipo, info, o.g);
      Objetos.desenhar(ctx, o.tipo, o.x * t, o.y * t, m.l * t, m.a * t, o.g);
    }
  }

  // ---------- plaquinhas das salas ----------
  // Vêm depois de tudo de propósito: agora a parede tem altura e cobriria a
  // plaquinha da sala que fica logo abaixo dela.
  // O que marca a área é o carpete no chão; a sala se anuncia por uma plaquinha
  // flutuante no topo, como no Gather. Retângulo tingido deixava tudo embarrado.
  Jogo.etiquetas = [];
  for (const z of mapa.zonas) {
    if (comArte) {
      if (z.sem_placa) continue;
      const r = Cenario.desenharPlaca(ctx, z);
      if (r) { Jogo.etiquetas.push({ id: z.id, ...r }); continue; }
    }
    const zx = z.x1 * t, zy = z.y1 * t;
    const zw = (z.x2 - z.x1 + 1) * t;
    const texto = (z.privada ? '🔒 ' : '') + z.nome + (z.dono_nome ? ' · ' + z.dono_nome : '');
    ctx.font = '600 12px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const larg = ctx.measureText(texto).width + 20;
    const px = zx + zw / 2 - larg / 2, py = zy + 6;
    ctx.fillStyle = 'rgba(38,34,52,.72)';
    arredondado(px, py, larg, 20, 10);
    ctx.fill();
    ctx.fillStyle = z.cor;
    ctx.beginPath();
    ctx.arc(px + 9, py + 10, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f6f4ef';
    ctx.fillText(texto, px + larg / 2 + 4, py + 10);
    Jogo.etiquetas.push({ id: z.id, x: px, y: py, w: larg, h: 20 });
  }


  if (comArte) desenharSaida(mapa.cenario);
  for (const pes of gente) desenharBolha(pes);
  if (comArte) Cenario.desenharDepuracao(ctx);
  atualizarAcaoReuniao();

  if (typeof Editor !== 'undefined') {
    if (Editor.ativo) Editor.desenhar(ctx, x0, y0, x1, y1);
    else if (Editor.movendo && Editor.cursor) Editor.desenharNaMao(ctx);
    Editor.avisoNaMao();   // vale com o editor aberto ou fechado
    // O menu do móvel/da sala é HTML por cima do canvas: quando a câmera anda
    // (zoom, teclado, janela) o mapa se move embaixo dele e ele ficava parado
    // apontando para o nada. Aqui ele acompanha o alvo a cada quadro.
    Editor.ancorarMenu();
  }
}

// Ordem de empate no chão: superfície primeiro (fica embaixo), depois o que se
// apoia nela, e a pessoa por último. Vale para móveis que terminam na mesma linha.
const PESO_PAREDE = -1;      // a face da parede é o fundo da linha: tudo passa na frente
const PESO_SUPERFICIE = 0;   // mesas, balcões, palco — coisas em que se apoia algo
const PESO_MOVEL = 1;        // cadeiras, plantas, armários…
const PESO_PESSOA = 2;       // gente sempre por cima do móvel que divide a linha

// Superfície é qualquer coisa em que se apoia outra coisa. Antes isto olhava
// só o grupo "Mesas"; com o arsenal os grupos viraram vários (Mesas, Mesas de
// Reunião, Mesas de Centro), então o teste passou a ser pelo NOME do grupo.
const GRUPOS_SUPERFICIE = new Set(['Mesas', 'Mesas de Reunião', 'Mesas de Centro']);

function pesoDeEmpate(tipo, info) {
  if (GRUPOS_SUPERFICIE.has(info.grupo) || tipo === 'palco') return PESO_SUPERFICIE;
  return PESO_MOVEL;
}

/** A face da parede: o pedaço em pé que a gente vê. Claro no alto, mais fundo
 *  embaixo, rodapé escuro no pé e a sombra caindo no chão. É esse degradê que
 *  faz o olho ler altura — parede de cor chapada volta a parecer piso. */
let PROFUNDIDADE = true;             // dá para desligar e comparar: profundidade(false)
function profundidade(v) { PROFUNDIDADE = !!v; Objetos.usarAltura = !!v; }
// Meia altura de tile. Já foi 42 e a face descia sobre a primeira fileira da
// sala inteira — a mesa encostada na parede ficava desenhada EM CIMA do muro.
// A parede tem de dar altura sem roubar chão de quem está dentro.
const ALTURA_PAREDE = 15;
// Quanto a parede encolhe de cada lado que não tem parede vizinha. O tile tem
// 32; com 7 de folga dos dois lados, o muro fica com 18 de espessura.
const FOLGA_PAREDE = 7;

function desenharFaceParede(px, base, largura) {
  // A face é MAIS ESCURA que o topo: a luz vem de cima, então a superfície
  // deitada recebe mais luz que a em pé. Estava ao contrário, e por isso a
  // parede parecia grossa em vez de alta.
  const g = ctx.createLinearGradient(0, base, 0, base + ALTURA_PAREDE);
  g.addColorStop(0, '#e9e2d4');
  g.addColorStop(0.45, '#cfc5b1');
  g.addColorStop(1, '#ada08a');
  ctx.fillStyle = g;
  ctx.fillRect(px, base, largura, ALTURA_PAREDE);
  ctx.fillStyle = '#fdfbf6';                           // quina do teto, batida de luz
  ctx.fillRect(px, base - 2, largura, 2);
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.fillRect(px, base, largura, 1);
  ctx.fillStyle = '#b0a48e';                           // rodapé
  ctx.fillRect(px, base + ALTURA_PAREDE - 5, largura, 5);
  ctx.fillStyle = '#8f8470';
  ctx.fillRect(px, base + ALTURA_PAREDE - 1.5, largura, 1.5);
  // A sombra no chão é o que mais conta altura: quanto mais longa, mais alta a
  // parede parece. Vai longa e some devagar, como sombra de verdade.
  const s = ctx.createLinearGradient(0, base + ALTURA_PAREDE, 0, base + ALTURA_PAREDE + 10);
  s.addColorStop(0, 'rgba(62,52,82,.28)');
  s.addColorStop(1, 'rgba(62,52,82,0)');
  ctx.fillStyle = s;
  ctx.fillRect(px, base + ALTURA_PAREDE, largura, 10);
}

/** A porta da sala. Trancada, ela fecha o vão e mostra o cadeado; destrancada,
 *  a folha fica encostada no batente, como porta aberta de verdade. É por ela
 *  que a pessoa entende de longe se pode entrar ou se precisa bater. */
function desenharPorta(z, p, deitada) {
  const t = Jogo.tile;
  const x = p.x * t, y = p.y * t;
  const comp = 2 * t;                                  // o vão tem 2 tiles
  const trancada = !!z.trancada;
  const madeira = '#b98a5c', escura = '#8d6440';

  ctx.fillStyle = '#cfc7b7';                           // batentes dos dois lados
  if (deitada) {
    ctx.fillRect(x - 3, y + t - 6, 3, 12);
    ctx.fillRect(x + comp, y + t - 6, 3, 12);
  } else {
    ctx.fillRect(x + t - 6, y - 3, 12, 3);
    ctx.fillRect(x + t - 6, y + comp, 12, 3);
  }

  if (!trancada) {                                     // folha encostada, porta aberta
    ctx.fillStyle = escura;
    if (deitada) ctx.fillRect(x + 1, y + t - 5, 9, 4);
    else ctx.fillRect(x + t - 5, y + 1, 4, 9);
    return;
  }

  // trancada: a folha fecha o vão inteiro
  if (deitada) {
    ctx.fillStyle = escura;
    ctx.fillRect(x, y + t - 9, comp, 12);
    ctx.fillStyle = madeira;
    ctx.fillRect(x + 1, y + t - 8, comp - 2, 9);
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.fillRect(x + 1, y + t - 8, comp - 2, 2);
    ctx.fillStyle = '#e8e2d4';                         // maçaneta
    ctx.fillRect(x + comp / 2 - 8, y + t - 4, 5, 3);
  } else {
    ctx.fillStyle = escura;
    ctx.fillRect(x + t - 9, y, 12, comp);
    ctx.fillStyle = madeira;
    ctx.fillRect(x + t - 8, y + 1, 9, comp - 2);
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.fillRect(x + t - 8, y + 1, 2, comp - 2);
    ctx.fillStyle = '#e8e2d4';
    ctx.fillRect(x + t - 4, y + comp / 2 - 8, 3, 5);
  }
  // cadeado, para não depender de o desenho da folha ser óbvio
  const cx = x + (deitada ? comp / 2 : t), cy = y + (deitada ? t : comp / 2);
  ctx.fillStyle = 'rgba(38,34,52,.85)';
  ctx.beginPath();
  ctx.arc(cx, cy - 10, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '10px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd79a';
  ctx.fillText('🔒', cx, cy - 9);
}

function arredondado(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function desenharAvatar(p, souEu) {
  const pes = p.yr + 13;                     // os pés ficam na base da caixa de colisão
  const k = Cenario.ativo() ? Cenario.escalaBoneco() / 2 : 1;
  const assentoAqui = assentoEm(p.xr, p.yr);

  if (!assentoAqui) {
    ctx.fillStyle = k > 1 ? 'rgba(0,0,0,.32)' : 'rgba(0,0,0,.22)';
    ctx.beginPath();
    ctx.ellipse(p.xr, pes, 11 * k, 4 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const mudo = souEu ? !Midia.ligado('audio') : p.mudo;
  const nivel = Midia.nivel(souEu ? 'eu' : p.id);
  if (souEu && !assentoAqui) {
    ctx.beginPath();
    ctx.ellipse(p.xr, pes, 12 * k, 5 * k, 0, 0, Math.PI * 2);
    ctx.strokeStyle = k > 1 ? 'rgba(196,181,253,.75)' : 'rgba(255,255,255,.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  if (nivel > 0.12 && !mudo && !assentoAqui) {   // anel verde de quem está falando
    ctx.beginPath();
    ctx.ellipse(p.xr, pes, (13 + nivel * 4) * k, (5.5 + nivel * 2) * k, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(34,197,94,.9)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  const assento = assentoAqui;
  Boneco.desenhar(ctx, p.aparencia, p.xr, p.yr, p.direcao, Math.floor(p.passo || 0), 2 * k, !!assento);
  if (k > 1) { desenharCracha(p, souEu, mudo, nivel, !!assento, k); return; }

  // placa com o nome, logo abaixo dos pés
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 11px -apple-system, sans-serif';
  const largura = ctx.measureText(p.nome).width + 24;
  ctx.fillStyle = 'rgba(38,34,52,.8)';
  arredondado(p.xr - largura / 2, pes + 4, largura, 17, 8);
  ctx.fill();
  ctx.fillStyle = p.cor;
  ctx.beginPath();
  ctx.arc(p.xr - largura / 2 + 9, pes + 12, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f6f4ef';
  ctx.fillText(p.nome, p.xr + 4, pes + 12);

  ctx.font = '11px -apple-system, sans-serif';
  if (mudo) ctx.fillText('🔇', p.xr + largura / 2 + 6, pes + 12);
  if (souEu ? !!Midia.telaStream : p.tela) ctx.fillText('🖥️', p.xr - largura / 2 - 7, pes + 12);

  if (p.reacao && p.reacao.ate > Date.now()) {
    const sobe = (p.reacao.ate - Date.now()) / DURACAO_REACAO;
    ctx.font = '22px -apple-system, sans-serif';
    ctx.globalAlpha = Math.min(1, sobe * 1.6);
    ctx.fillText(p.reacao.emoji, p.xr, p.yr - 44 - (1 - sobe) * 22);
    ctx.globalAlpha = 1;
  }
}

/** O nome em cima da cabeça, como na referência: pílula escura com o ponto
 *  verde de "está aqui", o microfone fechado quando está mudo, e o anel de fala
 *  acendendo o ponto. As reações sobem a partir dele. */
function alturaDaCabeca(p, sentado, k) {
  const doPersonagem = Personagens.topo(p.aparencia, p.xr, p.yr, 2 * k, sentado, p.direcao);
  if (doPersonagem !== null) return doPersonagem;
  const lado = 64 * 2 * k * 0.46;
  const topo = p.yr + 13 - lado * (sentado ? 0.93 : 0.955);
  return topo + lado * 0.16;                 // o quadro do LPC tem folga em cima
}

function desenharCracha(p, souEu, mudo, nivel, sentado, k) {
  const cabeca = alturaDaCabeca(p, sentado, k);
  const nome = p.nome;
  ctx.font = '600 14px Inter, -apple-system, "Segoe UI", sans-serif';
  const w = ctx.measureText(nome).width + 34 + (mudo ? 18 : 0);
  const h = 26, x = p.xr - w / 2, y = cabeca - h - 12;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.4)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = 'rgba(28,25,31,.9)';
  arredondado(x, y, w, h, 13);
  ctx.fill();
  ctx.beginPath();                            // o biquinho apontando para a cabeça
  ctx.moveTo(p.xr - 6, y + h - 1);
  ctx.lineTo(p.xr + 6, y + h - 1);
  ctx.lineTo(p.xr, y + h + 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (souEu) {
    ctx.strokeStyle = 'rgba(167,139,250,.85)';
    ctx.lineWidth = 1.5;
    arredondado(x + .75, y + .75, w - 1.5, h - 1.5, 12.5);
    ctx.stroke();
  }
  const falando = nivel > 0.12 && !mudo;
  const sit = situacaoDe(p), corSit = SITUACOES[sit].cor;
  ctx.fillStyle = corSit;
  ctx.beginPath();
  ctx.arc(x + 14, y + h / 2, falando ? 5.5 : 4.5, 0, Math.PI * 2);
  ctx.fill();
  if (sit === 'nao_perturbe') {               // o tracinho branco do "não perturbe"
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 11.5, y + h / 2 - 0.9, 5, 1.8);
  }
  if (falando) {
    ctx.strokeStyle = corSit;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + 14, y + h / 2, 8 + nivel * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#f5f3f7';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(nome, x + 25, y + h / 2 + 0.5);
  if (mudo) {                                 // microfone cortado, desenhado
    const mx = x + w - 15, my = y + h / 2;
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(mx - 5, my - 5); ctx.lineTo(mx + 5, my + 5);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(245,243,247,.8)';
    arredondado(mx - 2.5, my - 6, 5, 8, 2.5);
    ctx.stroke();
  }
  let acima = y - 9;
  if (souEu ? !!Midia.telaStream : p.tela) {
    ctx.fillStyle = '#a78bfa';
    ctx.font = '600 11px Inter, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('apresentando', p.xr, acima);
    acima -= 18;
  }
  if (sit !== 'disponivel') {                 // "ocupado", "almoço", "não perturbe"
    const rotulo = SITUACOES[sit].nome.toLowerCase();
    ctx.font = '600 11px Inter, -apple-system, sans-serif';
    const lw = ctx.measureText(rotulo).width + 14;
    ctx.fillStyle = 'rgba(28,25,31,.88)';
    arredondado(p.xr - lw / 2, acima - 8, lw, 16, 8);
    ctx.fill();
    ctx.fillStyle = corSit;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rotulo, p.xr, acima + 0.5);
  }
  if (p.reacao && p.reacao.ate > Date.now()) {
    const sobe = (p.reacao.ate - Date.now()) / DURACAO_REACAO;
    ctx.font = '30px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.globalAlpha = Math.min(1, sobe * 1.6);
    ctx.fillText(p.reacao.emoji, p.xr, y - 22 - (1 - sobe) * 30);
    ctx.globalAlpha = 1;
  }
}

function desenharBolha(p) {
  if (!p.bolha || p.bolha.ate < Date.now()) return;
  if (Cenario.ativo()) return desenharBolhaEscura(p);
  const texto = p.bolha.texto.length > 70 ? p.bolha.texto.slice(0, 70) + '…' : p.bolha.texto;
  ctx.font = '12px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  const w = Math.min(220, ctx.measureText(texto).width + 18);
  const x = p.xr - w / 2, y = p.yr - 68;
  ctx.fillStyle = 'rgba(255,255,255,.96)';
  arredondado(x, y, w, 24, 10);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(p.xr - 5, y + 24);
  ctx.lineTo(p.xr + 5, y + 24);
  ctx.lineTo(p.xr, y + 31);
  ctx.fill();
  ctx.fillStyle = '#efe7dd';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, p.xr, y + 12);
}

/** O balão do chat no cenário: escuro como o resto, em cima do crachá. */
function desenharBolhaEscura(p) {
  const k = Cenario.escalaBoneco() / 2;
  const texto = p.bolha.texto.length > 70 ? p.bolha.texto.slice(0, 70) + '…' : p.bolha.texto;
  ctx.font = '14px Inter, -apple-system, sans-serif';
  const w = Math.min(280, ctx.measureText(texto).width + 24), h = 30;
  const topo = alturaDaCabeca(p, !!assentoEm(p.xr, p.yr), k) - 26 - 12;
  const x = p.xr - w / 2, y = topo - h - 10;
  ctx.fillStyle = 'rgba(245,243,247,.97)';
  arredondado(x, y, w, h, 12);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(p.xr - 6, y + h - 1); ctx.lineTo(p.xr + 6, y + h - 1); ctx.lineTo(p.xr, y + h + 7);
  ctx.fill();
  ctx.fillStyle = '#1c191f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, p.xr, y + h / 2 + 0.5);
}

/* ==================== barra e mídia ==================== */

function avisarMidia() {
  enviar({
    tipo: 'midia',
    mudo: !Midia.ligado('audio'),
    sem_camera: !Midia.ligado('video'),
    tela: !!Midia.telaStream,
  });
}

async function alternarMic() {
  const ligou = await Midia.alternar('audio');
  atualizarBotoesMidia();
  montarTiles();
  avisarMidia();
  escreverChat({ sistema: true, texto: ligou ? 'Microfone ligado.' : 'Microfone desligado.' });
}

async function alternarCam() {
  const ligou = await Midia.alternar('video');
  atualizarBotoesMidia();
  montarTiles();
  avisarMidia();
  escreverChat({ sistema: true, texto: ligou
    ? 'Câmera ligada.' : 'Câmera desligada — o aparelho foi liberado.' });
}

async function alternarTela() {
  try {
    await Midia.compartilharTela();
  } catch (e) {
    if (e.name !== 'NotAllowedError') {   // NotAllowedError = a pessoa cancelou
      escreverChat({ sistema: true, texto: 'Não consegui compartilhar a tela: ' + e.name });
    }
  }
  atualizarBotoesMidia();
  montarTiles();
  avisarMidia();
}

function atualizarBotoesMidia() {
  const mic = document.getElementById('btn-mic');
  const cam = document.getElementById('btn-cam');
  mic.classList.toggle('desligado', !Midia.ligado('audio'));
  cam.classList.toggle('desligado', !Midia.ligado('video'));
  mic.title = Midia.ligado('audio') ? 'Desligar o microfone (M)' : 'Ligar o microfone (M)';
  cam.title = Midia.ligado('video') ? 'Desligar a câmera (V)' : 'Ligar a câmera (V)';
  // o ícone de ligado e o de cortado moram os dois dentro do botão; quem
  // escolhe qual aparece é a classe `desligado`, no CSS
  const btn = document.getElementById('btn-tela');
  btn.classList.toggle('ligado', !!Midia.telaStream);
  btn.title = Midia.telaStream ? 'Parar de compartilhar (T)' : 'Compartilhar tela (T)';
}

/* ---------- reações (26/11, como no Meet) ----------
 * O botão (ou a tecla R) abre a paleta e a pessoa ESCOLHE o emoji — antes ele
 * era sorteado. O escolhido sobe em cima do boneco no mapa e, na tela de
 * chamada, sobe do canto com o nome de quem mandou (antes ia só para o mapa,
 * que fica escondido atrás da chamada: parecia que o botão não fazia nada). */
const EMOJIS_REACAO = ['👍', '❤️', '😂', '😮', '👏', '🎉', '🤔', '👋'];
const DURACAO_REACAO = 3000;

function montarPaleta() {
  const pal = document.getElementById('paleta-reacoes');
  if (!pal.childElementCount) {
    for (const e of EMOJIS_REACAO) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = e;
      b.setAttribute('role', 'menuitem');
      b.setAttribute('aria-label', 'Reagir com ' + e);
      b.onclick = (ev) => { ev.stopPropagation(); fecharPaleta(); reagir(e); };
      pal.appendChild(b);
    }
  }
  return pal;
}

function fecharPaleta() {
  const pal = document.getElementById('paleta-reacoes');
  if (pal) pal.hidden = true;
}

function alternarPaleta() {
  const pal = montarPaleta();
  if (!pal.hidden) { fecharPaleta(); return; }
  pal.hidden = false;
  // em cima do botão de reagir da barra, centralizada nele
  const btn = document.getElementById('btn-reagir-chamada');
  const r = btn.getBoundingClientRect(), pr = pal.offsetParent.getBoundingClientRect();
  const x = r.left + r.width / 2 - pr.left - pal.offsetWidth / 2;
  pal.style.left = Math.max(8, Math.min(pr.width - pal.offsetWidth - 8, x)) + 'px';
  pal.style.top = (r.top - pr.top - pal.offsetHeight - 10) + 'px';
  pal.firstElementChild.focus();
}

/** Sem emoji, abre a paleta; com emoji, manda a reação. */
function reagir(emoji) {
  if (typeof emoji !== 'string' || !EMOJIS_REACAO.includes(emoji)) { alternarPaleta(); return; }
  Jogo.eu.reacao = { emoji, ate: Date.now() + DURACAO_REACAO };
  enviar({ tipo: 'reacao', emoji });
  mostrarReacaoNaChamada('Você', emoji);
}

/** Na tela de chamada, o emoji sobe do canto de baixo com o nome, como no Meet. */
function mostrarReacaoNaChamada(nome, emoji) {
  if (!Reuniao.ativa) return;
  const caixa = document.getElementById('reacoes-voando');
  if (!caixa) return;
  const el = document.createElement('div');
  el.className = 'reacao-voando';
  el.style.left = Math.round(Math.random() * 60) + 'px';
  el.innerHTML = `<span class="emoji">${escapar(emoji)}</span><span class="quem">${escapar(nome)}</span>`;
  caixa.appendChild(el);
  setTimeout(() => el.remove(), DURACAO_REACAO + 300);
}

document.addEventListener('pointerdown', (e) => {
  const pal = document.getElementById('paleta-reacoes');
  if (!pal || pal.hidden || !e.target.closest) return;
  if (e.target.closest('#paleta-reacoes') || e.target.closest('#btn-reagir-chamada')) return;
  fecharPaleta();
});
document.addEventListener('keydown', (e) => {
  const pal = document.getElementById('paleta-reacoes');
  if (e.key === 'Escape' && pal && !pal.hidden) { fecharPaleta(); e.stopPropagation(); }
}, true);

document.getElementById('btn-mic').onclick = alternarMic;
document.getElementById('btn-cam').onclick = alternarCam;
document.getElementById('btn-tela').onclick = alternarTela;
document.getElementById('btn-boneco').onclick = abrirEditor;
document.getElementById('btn-editor').onclick = () => Editor.alternar();
document.getElementById('zoom-mais').onclick = () => ajustarZoom(1.15);
document.getElementById('zoom-menos').onclick = () => ajustarZoom(1 / 1.15);
// No celular a gaveta começa FECHADA: o mapa é o que importa numa tela de mão.
const NO_CELULAR = matchMedia('(max-width: 760px)').matches
  || ('ontouchstart' in window && innerWidth < 900);

// Painel da direita rebatível: o mapa cresce quando ele some. A escolha fica
// guardada no navegador, senão a pessoa reabriria a página e teria de esconder
// tudo de novo.
const CHAVE_LATERAL = 'escritorio:lateral';
function alternarLateral(mostrar) {
  const app = document.getElementById('app');
  const escondido = mostrar === undefined ? !app.classList.contains('sem-lateral') : !mostrar;
  app.classList.toggle('sem-lateral', escondido);
  const b = document.getElementById('btn-lateral');
  if (b) b.title = escondido ? 'Mostrar o painel (Tab)' : 'Esconder o painel (Tab)';
  localStorage.setItem(CHAVE_LATERAL, escondido ? 'fechado' : 'aberto');
  if (typeof ajustarTela === 'function') ajustarTela();
  window.dispatchEvent(new Event('resize'));
}
document.getElementById('btn-lateral').onclick = () => alternarLateral();
const guardado = localStorage.getItem(CHAVE_LATERAL);
if (guardado === 'fechado' || (!guardado && NO_CELULAR)) alternarLateral(false);

// dedo não tem teclado: a dica muda de texto
if (NO_CELULAR) {
  const d = document.getElementById('dica');
  if (d) d.innerHTML = 'Toque no chão para andar · toque numa pessoa para conversar';
}

// Clique de MOUSE num botão da barra devolve o teclado ao jogo. Sem isto o foco
// ficava no botão: o Enter seguinte apertava o botão de novo em vez de abrir o
// chat, e o Tab andava pela barra em vez de rebater o painel. A ativação pelo
// teclado (`detail` = 0) mantém o foco, que é o que quem navega por Tab espera.
document.getElementById('app').addEventListener('click', (e) => {
  const botao = e.target.closest('.barra button, .zoom button, .puxador');
  if (botao && e.detail > 0) botao.blur();
});

document.getElementById('btn-reacao').onclick = () => reagir();
document.getElementById('btn-reuniao').onclick = () => alternarReuniao();
document.getElementById('btn-fechar-reuniao').onclick = fecharReuniao;
document.getElementById('btn-sair').onclick = () => {
  Conexao.saindo = true;
  pararCoracao();
  Midia.fecharTudo();
  if (Jogo.ws) Jogo.ws.close();
  location.reload();
};

/* ==================== editar o boneco dentro da sala ==================== */

let editorSala = null;

function abrirEditor() {
  // B com o modal já aberto fecha, como o E faz com o editor do escritório.
  // Antes B "reabria": a aparência voltava à salva e a escolha em andamento
  // (cabelo, roupa) se perdia sem aviso.
  if (!document.getElementById('modal-boneco').classList.contains('oculto')) {
    fecharEditor();
    return;
  }
  if (!editorSala) {
    // na escolha do personagem 3D só aparecem o seu e os livres
    Boneco.CATALOGO.personagem = Personagens.permitidos(Jogo.eu.nome, Jogo.visitante);
    editorSala = criarEditor(document.getElementById('previa-editar'),
                             document.getElementById('opcoes-editar'), Jogo.eu.aparencia);
    document.getElementById('btn-sortear-editar').onclick = () => editorSala.sortear();
    document.getElementById('btn-fechar-boneco').onclick = fecharEditor;
    document.getElementById('btn-salvar-boneco').onclick = salvarBoneco;
  }
  editorSala.definir(Jogo.eu.aparencia);
  document.getElementById('campo-nome-editar').value = Jogo.eu.nome;
  document.getElementById('modal-boneco').classList.remove('oculto');
}

function fecharEditor() {
  document.getElementById('modal-boneco').classList.add('oculto');
}

function salvarBoneco() {
  const aparencia = editorSala.ver();
  const nome = document.getElementById('campo-nome-editar').value.trim() || Jogo.eu.nome;
  localStorage.setItem('escritorio:aparencia', JSON.stringify(aparencia));
  enviar({ tipo: 'perfil', nome, cor: aparencia.corCamisa, aparencia });
  fecharEditor();
}

/* ==================== vídeos ==================== */

/* O navegador que barra som sem um clique (03/11). O play() recusado era engolido
   calado: a pessoa ficava sem ouvir ninguém, sem aviso, e saía e entrava para ver
   se voltava. Agora aparece um botão "Clique para ouvir": o clique é o gesto que o
   navegador pede, e ele toca de novo todo mundo que estava mudo. */
function somBloqueado(e) {
  if (!e || e.name !== 'NotAllowedError') return;
  let botao = document.getElementById('ouvir');
  if (!botao) {
    botao = document.createElement('button');
    botao.id = 'ouvir';
    botao.type = 'button';
    botao.className = 'reconectando ouvir';
    botao.textContent = 'O navegador pausou o som. Clique para ouvir as pessoas';
    botao.onclick = liberarSom;
    document.querySelector('.palco').appendChild(botao);
  }
  botao.classList.remove('oculto');
}

async function liberarSom() {
  const botao = document.getElementById('ouvir');
  if (Midia.audioCtx && Midia.audioCtx.state === 'suspended') Midia.audioCtx.resume().catch(() => {});
  // Todos de uma vez, no mesmo clique (revisão, 03/11): em fila, o vídeo de quem não
  // manda nada (sem microfone nem câmera) segurava o play() para sempre e os outros
  // nunca tocavam. O cartão sem faixa nenhuma fica de fora, e a troca de fonte no
  // meio do clique (AbortError) não conta como som barrado.
  // Só o que tem mídia chegando de verdade: o canal de quem não manda nada existe
  // (nasce com a chamada, 26/11), mas o play() dele só termina quando chega som.
  const videos = [...document.querySelectorAll('#videos .video-tile:not([data-id="eu"]) video'),
                  ...Midia.elementosDeSom()]
    .filter((v) => v.srcObject && v.srcObject.getTracks().some((f) => f.readyState === 'live' && !f.muted));
  const tentativas = await Promise.allSettled(videos.map((v) => Promise.race([
    v.play(), new Promise((ok) => setTimeout(ok, 3000))])));
  const barrado = tentativas.some((t) => t.status === 'rejected' && t.reason && t.reason.name === 'NotAllowedError');
  if (botao && !barrado) botao.classList.add('oculto');
}

function montarTiles() {
  const caixa = document.getElementById('videos');
  const vivos = new Set();

  const criar = (id, nome, cor, aparencia) => {
    let tile = caixa.querySelector(`[data-id="${id}"]`);
    if (!tile) {
      tile = document.createElement('div');
      tile.className = 'video-tile';
      tile.dataset.id = id;
      tile.innerHTML = `<video autoplay playsinline muted></video>
        <div class="sem-video"></div>
        <span class="mic-tile" title="Microfone desligado"><svg viewBox="0 0 24 24"><path d="M9 9v3a3 3 0 0 0 4.9 2.3"/><path d="M15 11.4V6a3 3 0 0 0-5.7-1.3"/><path d="M5 11a7 7 0 0 0 10.5 6"/><path d="M19 11a7 7 0 0 1-.7 3"/><path d="M12 18v3"/><path d="M3 3l18 18"/></svg></span>
        <div class="rotulo"><span class="nome"></span><span class="estado"></span></div>`;
      tile.onclick = () => {
        // Fora da grade, clicar em alguém abre a reunião com essa pessoa no palco.
        // Dentro dela, o clique prende (ou solta) o palco naquela pessoa.
        if (!Reuniao.ativa) { abrirReuniao(id); return; }
        Reuniao.fixado = Reuniao.fixado === id ? null : id;
        atualizarDestaque();
      };
      caixa.appendChild(tile);
    }
    tile.querySelector('.nome').textContent = nome;
    const vazio = tile.querySelector('.sem-video');
    vazio.style.background = cor;
    vazio.innerHTML = `<img src="${Boneco.retrato(aparencia)}" alt="">`;
    return tile;
  };

  const meuStream = Midia.streamDeExibicao();     // com o efeito de fundo, se tiver
  if (meuStream) {
    const nome = (Jogo.eu ? Jogo.eu.nome : 'Você') + (Midia.telaStream ? ' — sua tela' : ' (você)');
    const tile = criar('eu', nome, Jogo.eu ? Jogo.eu.cor : '#333', Jogo.eu && Jogo.eu.aparencia);
    const v = tile.querySelector('video');
    if (v.srcObject !== meuStream) { v.srcObject = meuStream; v.play().catch(() => {}); }
    const temVideo = !!Midia.telaStream || Midia.ligado('video');
    v.style.display = temVideo ? '' : 'none';
    tile.querySelector('.sem-video').style.display = temVideo ? 'none' : 'grid';
    tile.querySelector('.estado').textContent = Midia.ligado('audio') ? '' : '🔇';
    tile.classList.toggle('mudo', !Midia.ligado('audio'));
    tile.classList.toggle('tela', !!Midia.telaStream);
    tile.classList.toggle('compartilhando', !!Midia.telaStream);
    vivos.add('eu');
  }

  for (const [id, par] of Midia.pares) {
    const p = Jogo.pessoas.get(id);
    if (!p) continue;
    const tile = criar(id, (p.tela ? '🖥️ tela de ' : '') + p.nome, p.cor, p.aparencia);
    const v = tile.querySelector('video');
    par.video = v;
    v.muted = true;                  // o som vem do <audio> da pessoa (Midia._tocarSom)
    if (v.srcObject !== par.stream) { v.srcObject = par.stream; v.play().catch(() => {}); }
    const temVideo = (!p.sem_camera || p.tela) && par.stream.getVideoTracks().length > 0;
    v.style.display = temVideo ? '' : 'none';
    tile.querySelector('.sem-video').style.display = temVideo ? 'none' : 'grid';
    tile.querySelector('.estado').textContent = p.mudo ? '🔇' : '';
    tile.classList.toggle('mudo', !!p.mudo);
    tile.classList.toggle('tela', !!p.tela);
    tile.classList.toggle('compartilhando', !!p.tela);
    vivos.add(id);
  }

  for (const tile of [...caixa.children]) {
    if (!vivos.has(tile.dataset.id)) tile.remove();
  }
  if (Reuniao.ativa) { atualizarDestaque(); arrumarGrade(); }
}

/* ---------- modo reunião ----------
 * A tira de tiles no canto continua sendo o padrão: dá para andar pelo escritório
 * enquanto se conversa. A grade é para quando a conversa vira reunião de fato —
 * aí interessa ver todo mundo, e quem apresenta ganha o palco.                */
const Reuniao = {
  ativa: false,
  fixado: null,      // palco preso por clique
  destaque: null,    // quem está no palco agora
  _candidato: null,  // quem vem falando mais alto
  _desde: 0,
  _apresentador: null,  // quem estava apresentando na última passada
};

function abrirReuniao(idFoco) {
  Reuniao.ativa = true;
  if (idFoco !== undefined) Reuniao.fixado = idFoco;
  aplicarReuniao();
}

function fecharReuniao() {
  Reuniao.ativa = false;
  Reuniao.fixado = null;
  Reuniao.destaque = null;
  // fechou na mão (Esc, "voltar ao escritório") ainda sentado: não reabre
  // sozinha até a pessoa sair da mesa
  if (Jogo.chamadaAuto) Jogo.chamadaDispensada = true;
  Jogo.chamadaAuto = false;
  aplicarReuniao();
}

/** Sentado na mesa de reunião, a tela de chamada abre sozinha quando tem mais
 *  alguém sentado nela (sozinho, abrir uma chamada só com o próprio vídeo
 *  parecia defeito). Saiu da mesa, ela fecha. */
function cuidarDaTelaDeChamada(eu) {
  const z = zonaDe(eu.x, eu.y);
  let naMesaComGente = false;
  if (z && z.so_sentado && z.abre_midia) {      // a mesa de reunião, não as baias
    const outros = [...Jogo.pessoas.values()].some((p) => {
      const zp = zonaDe(p.x, p.y);
      return zp && zp.id === z.id;
    });
    naMesaComGente = outros;
    if (outros && !Reuniao.ativa && !Jogo.chamadaDispensada) { abrirReuniao(); Jogo.chamadaAuto = true; }
  } else {
    if (Jogo.chamadaAuto && Reuniao.ativa) fecharReuniao();
    Jogo.chamadaDispensada = false;
  }
  // minimizou e continua sentado na mesa com gente: o botão de voltar aparece
  const voltar = document.getElementById('btn-voltar-chamada');
  if (voltar) voltar.hidden = !(naMesaComGente && !Reuniao.ativa);
}

/** "Voltar para a chamada": abre de novo a tela, como se tivesse acabado de sentar. */
function voltarParaChamada() {
  Jogo.chamadaDispensada = false;
  abrirReuniao();
  Jogo.chamadaAuto = true;
  const voltar = document.getElementById('btn-voltar-chamada');
  if (voltar) voltar.hidden = true;
}

function alternarReuniao() {
  if (Reuniao.ativa) fecharReuniao();
  else if (!document.getElementById('btn-voltar-chamada').hidden) voltarParaChamada();
  else abrirReuniao();
}

/* ---------- tela de chamada, estilo Google Meet (26/11) ----------
 * O #videos sai do painel e vai para a tela de chamada, por cima do escritório.
 * Fechar (Esc, "voltar ao escritório") traz ele de volta: a chamada continua,
 * só a tela muda. A barra de baixo vira a do Meet: hora e sala à esquerda,
 * controles no meio com o botão vermelho de sair, pessoas e chat à direita. */
function aplicarReuniao() {
  const caixa = document.getElementById('videos');
  encolherTiles();
  const destino = Reuniao.ativa ? document.getElementById('palco-chamada')
                                : document.getElementById('lateral');
  if (caixa.parentElement !== destino) {
    if (Reuniao.ativa) destino.appendChild(caixa);
    else destino.insertBefore(caixa, destino.firstChild);
    // mudar o vídeo de lugar pausa ele (o som não: mora nos <audio> da Midia)
    for (const v of caixa.querySelectorAll('video')) v.play().catch(() => {});
  }
  document.getElementById('chamada').hidden = !Reuniao.ativa;
  document.querySelector('.palco').classList.toggle('em-chamada', Reuniao.ativa);
  caixa.classList.toggle('reuniao', Reuniao.ativa);
  document.getElementById('btn-reuniao').classList.toggle('ativo', Reuniao.ativa);
  document.getElementById('btn-fechar-reuniao').hidden = true;   // a barra da chamada tem o "voltar"
  atualizarRelogioChamada();
  if (!Reuniao.ativa) {
    caixa.classList.remove('com-destaque');
    for (const t of caixa.children) t.classList.remove('destaque');
    caixa.style.removeProperty('--tile-w');
    return;
  }
  atualizarDestaque();
  arrumarGrade();
}

/** Palco grande só quando alguém apresenta a tela ou quando você fixa uma
 *  pessoa (clique no quadro). Quem fala ganha a borda acesa, sem a tela pular
 *  de um para outro a cada "uhum" — como o Meet faz na grade. */
function atualizarDestaque() {
  if (!Reuniao.ativa) return;
  const caixa = document.getElementById('videos');
  const tiles = [...caixa.children];
  const apresentador = tiles.find((t) => t.classList.contains('tela'));
  const idApresentando = apresentador ? apresentador.dataset.id : null;
  // quem ACABOU de abrir a tela leva o palco; depois o clique de cada um vale
  if (idApresentando && idApresentando !== Reuniao._apresentador) Reuniao.fixado = idApresentando;
  Reuniao._apresentador = idApresentando;
  if (Reuniao.fixado && !tiles.some((t) => t.dataset.id === Reuniao.fixado)) Reuniao.fixado = null;
  const alvo = Reuniao.fixado || idApresentando || null;
  const mudou = alvo !== Reuniao.destaque;
  Reuniao.destaque = alvo;
  for (const t of tiles) t.classList.toggle('destaque', t.dataset.id === alvo);
  caixa.classList.toggle('com-destaque', !!alvo && tiles.length > 1);
  // quantas fileiras a tira lateral tem: o palco ocupa todas
  caixa.style.setProperty('--fileiras', Math.max(1, tiles.length - 1));
  if (mudou) arrumarGrade();
}

/** O maior quadro 16:9 que cabe: testa de 1 a N colunas, como a grade do Meet. */
function arrumarGrade() {
  if (!Reuniao.ativa) return;
  const caixa = document.getElementById('videos');
  const area = document.getElementById('palco-chamada').getBoundingClientRect();
  const n = Math.max(1, caixa.children.length), vao = 12;
  if (!area.width || !area.height) return;
  let melhor = 0;
  for (let cols = 1; cols <= n; cols++) {
    const linhas = Math.ceil(n / cols);
    const w = Math.min((area.width - vao * (cols - 1)) / cols,
                       ((area.height - vao * (linhas - 1)) / linhas) * 16 / 9);
    melhor = Math.max(melhor, w);
  }
  caixa.style.setProperty('--tile-w', Math.floor(melhor) + 'px');
}
window.addEventListener('resize', arrumarGrade);

function atualizarRelogioChamada() {
  const relogio = document.getElementById('relogio-chamada');
  if (!relogio) return;
  relogio.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const z = Jogo.eu && zonaDe(Jogo.eu.x, Jogo.eu.y);
  document.getElementById('nome-chamada').textContent = z && z.privada ? z.nome : 'Conversa por perto';
}
setInterval(atualizarRelogioChamada, 15000);

/** O botão vermelho: sai da chamada de verdade. Sentado na mesa, levanta (e a
 *  bolha da reunião acaba para você); em conversa de salão, só fecha a tela. */
function sairDaChamada() {
  const s = Cenario.ativo() && sentadoAgora();
  if (s && s.zona) { levantar(); Jogo.caminho = null; }
  fecharReuniao();
}

function abrirPainelEm(bloco, focar) {
  alternarLateral(true);
  const b = document.getElementById(bloco);
  if (b && b.classList.contains('recolhido')) {
    const t = b.querySelector('.titulo-bloco');
    if (t) t.click();
  }
  if (focar) document.getElementById(focar).focus();
}
document.getElementById('btn-desligar').onclick = sairDaChamada;
document.getElementById('btn-reagir-chamada').onclick = (e) => { e.stopPropagation(); reagir(); };
document.getElementById('btn-chamada-mapa').onclick = fecharReuniao;
document.getElementById('btn-minimizar-chamada').onclick = fecharReuniao;
document.getElementById('btn-voltar-chamada').onclick = voltarParaChamada;
document.getElementById('btn-chamada-pessoas').onclick = () => abrirPainelEm('bloco-pessoas');
document.getElementById('btn-chamada-chat').onclick = () => abrirPainelEm('bloco-chat', 'campo-chat');

function encolherTiles() {
  document.querySelectorAll('.video-tile.expandido').forEach((t) => t.classList.remove('expandido'));
}

// mantém o anel verde nos tiles de quem está falando
setInterval(() => {
  for (const tile of document.getElementById('videos').children) {
    tile.classList.toggle('falando', Midia.nivel(tile.dataset.id) > 0.15);
  }
  atualizarDestaque();
}, 200);

/* ==================== pessoas e chat ==================== */

// A lista é pedida quatro vezes por segundo (o vigia das chamadas). Refazer o
// HTML toda vez engolia o clique lento nos botões de calar e expulsar (o botão
// apertado já não era o botão solto) e derrubava o foco de quem navega pelo
// teclado. Só é refeita quando o que ela mostra mudou.
let assinaturaDaLista = '';

function desenharListaPessoas() {
  if (!Jogo.eu) return;
  const ul = document.getElementById('lista-pessoas');
  const lista = [Jogo.eu, ...Jogo.pessoas.values()];
  const linhas = lista.map((p) => {
    const souEu = p.id === Jogo.eu.id;
    const perto = !souEu && Midia.pares.has(p.id);
    const zona = zonaDe(p.x, p.y);
    const tela = !!(souEu ? Midia.telaStream : p.tela);
    const sit = situacaoDe(p);
    return { p, souEu, perto, zona, tela, sit,
             marca: [p.id, p.nome, p.silenciado ? 1 : 0, perto ? 1 : 0, zona ? zona.nome : '', sit,
                     tela ? 1 : 0, p.cor, JSON.stringify(p.aparencia || null)].join('\x1f') };
  });
  // quem está nos outros lugares (27/11)
  const fora = (Jogo.lugares || []).filter((l) => !Jogo.espaco || l.espaco !== Jogo.espaco.id);
  const assinatura = (Jogo.admin ? 'admin|' : '') + linhas.map((l) => l.marca).join('\x1e')
    + '|' + fora.map((l) => [l.id, l.nome, l.espaco, l.situacao, JSON.stringify(l.aparencia || null)].join(',')).join(';');
  if (assinatura === assinaturaDaLista) return;
  assinaturaDaLista = assinatura;

  // quem estava com um botão focado continua com ele depois da troca
  const focado = document.activeElement && ul.contains(document.activeElement)
    ? { id: document.activeElement.closest('li').dataset.id,
        indice: [...document.activeElement.closest('li').querySelectorAll('button')].indexOf(document.activeElement) }
    : null;

  ul.innerHTML = '';
  for (const { p, souEu, perto, zona, tela: mostraTela, sit } of linhas) {
    const li = document.createElement('li');
    li.dataset.id = p.id;
    const s = SITUACOES[sit];
    li.innerHTML = `<img class="bolinha" src="${Boneco.retrato(p.aparencia)}" alt="">
      <span>${escapar(p.nome)}${souEu ? ' (você)' : ''}${p.silenciado ? ' <b class="calado">calado</b>' : ''}${
        sit !== 'disponivel' ? ` <b class="sit-texto sit-${sit}">${s.nome.toLowerCase()}</b>` : ''}</span>
      <span class="onde ${perto ? 'perto' : ''}">${mostraTela ? '🖥️ ' : ''}${perto ? '🔊 perto' : (zona ? escapar(zona.nome) : 'corredor')}</span>
      <span class="online sit-${sit}" title="${s.nome}"></span>`;
    if (!souEu) {
      // "Ir até" (26/11): o boneco anda até ficar ao lado da pessoa. A linha
      // inteira também leva até ela; o botão é para quem usa o teclado.
      const ir = document.createElement('button');
      ir.type = 'button';
      ir.className = 'ir-ate';
      ir.textContent = 'Ir até';
      ir.title = `Andar até ${p.nome}`;
      ir.onclick = (e) => { e.stopPropagation(); irAte(p.id); };
      li.insertBefore(ir, li.querySelector('.onde'));
      li.classList.add('clicavel');
      li.title = `Clique para ir até ${p.nome}`;
      li.addEventListener('click', (e) => { if (!e.target.closest('button')) irAte(p.id); });
    }
    if (Jogo.admin && !souEu) {
      // as duas ferramentas de dono de sala: calar e tirar de dentro
      const acoes = document.createElement('span');
      acoes.className = 'moderar';
      const bt = (rotulo, titulo, fazer) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = rotulo; b.title = titulo;
        b.onclick = fazer; acoes.appendChild(b);
      };
      bt(p.silenciado ? '🔈' : '🔇', p.silenciado ? 'Devolver a voz' : 'Calar',
         () => enviar({ tipo: 'moderar', acao: p.silenciado ? 'devolver_voz' : 'silenciar', id: p.id }));
      bt('⨯', 'Tirar do escritório', () => {
        if (confirm(`Tirar ${p.nome} do escritório?`)) {
          enviar({ tipo: 'moderar', acao: 'expulsar', id: p.id });
        }
      });
      li.appendChild(acoes);
    }
    ul.appendChild(li);
  }
  for (const e of Jogo.espacos || []) {
    const deles = fora.filter((l) => l.espaco === e.id);
    if (!deles.length) continue;
    const titulo = document.createElement('li');
    titulo.className = 'secao-lugar';
    titulo.textContent = `No ${e.nome} (${deles.length})`;
    ul.appendChild(titulo);
    for (const l of deles) {
      const sit = SITUACOES[l.situacao] ? l.situacao : 'disponivel';
      const li = document.createElement('li');
      li.dataset.id = l.id;
      li.className = 'outro-lugar clicavel';
      li.title = `Clique para ir até ${l.nome}, no ${e.nome}`;
      li.innerHTML = `<img class="bolinha" src="${Boneco.retrato(l.aparencia)}" alt="">
        <span>${escapar(l.nome)}${sit !== 'disponivel' ? ` <b class="sit-texto sit-${sit}">${SITUACOES[sit].nome.toLowerCase()}</b>` : ''}</span>
        <span class="onde">${escapar(e.nome)}</span>
        <span class="online sit-${sit}" title="${SITUACOES[sit].nome}"></span>`;
      const ir = document.createElement('button');
      ir.type = 'button';
      ir.className = 'ir-ate';
      ir.textContent = 'Ir até';
      ir.title = `Ir até ${l.nome}, no ${e.nome}`;
      ir.onclick = (ev) => { ev.stopPropagation(); irAteOutroLugar(l); };
      li.insertBefore(ir, li.querySelector('.onde'));
      li.addEventListener('click', (ev) => { if (!ev.target.closest('button')) irAteOutroLugar(l); });
      ul.appendChild(li);
    }
  }
  if (focado) {
    const li = ul.querySelector(`li[data-id="${CSS.escape(focado.id)}"]`);
    const botao = li && li.querySelectorAll('button')[focado.indice];
    if (botao) botao.focus();
  }
  document.getElementById('pessoas-total').textContent = lista.length + fora.length;
  document.getElementById('contagem').textContent =
    lista.length === 1 ? '1 na sala' : `${lista.length} na sala`;
}

function escapar(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escreverChat(msg) {
  const caixa = document.getElementById('mensagens');
  // Quem rolou para cima para reler uma mensagem era puxado de volta para o
  // fim a cada mensagem nova. A rolagem só acompanha quem já estava no fim
  // (ou quem acabou de mandar a própria mensagem).
  const noFim = caixa.scrollHeight - caixa.scrollTop - caixa.clientHeight < 40;
  const div = document.createElement('div');
  if (msg.sistema) {
    div.className = 'msg sistema';
    div.textContent = msg.texto;
  } else {
    div.className = 'msg';
    const marca = msg.escopo === 'todos' ? 'todos' + (msg.lugar ? ' · ' + escapar(msg.lugar) : '') : 'perto';
    const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const autor = [...Jogo.pessoas.values(), Jogo.eu].find((p) => p && p.nome === msg.nome);
    div.classList.add('com-retrato');
    div.innerHTML = `<img class="retrato" src="${autor ? Boneco.retrato(autor.aparencia) : ''}" alt="">
      <span class="quem">${escapar(msg.nome)}</span>
      <span class="hora">${hora} · ${marca}${msg.proprio && msg.escopo === 'perto' ? ' · ' + msg.ouviram + ' ouviram' : ''}</span><br>${
        msg.anexo ? htmlDoAnexo(msg.anexo) : ''}${msg.texto ? `<span class="texto-msg">${comLinks(msg.texto)}</span>` : ''}`;
    const foto = div.querySelector('.anexo-foto img');
    if (foto) foto.addEventListener('load', () => { if (noFim || msg.proprio) caixa.scrollTop = caixa.scrollHeight; });
  }
  if (msg.sistema) Avisos.anotar(msg.texto);
  caixa.appendChild(div);
  while (caixa.children.length > 200) caixa.removeChild(caixa.firstChild);
  if (noFim || msg.proprio) caixa.scrollTop = caixa.scrollHeight;
}

/* ---------- os lugares (27/11): a porta de saída, a troca e o pedido ----------
 * Pisar na porta de saída abre "Para onde você quer ir?". Quem já pode entrar
 * no outro lugar vai direto; quem não pode digita a chave dele ou pede para
 * entrar: o pedido aparece, com som, na tela de quem já está lá, e o primeiro
 * que responder decide. Trocar de lugar é a página religar no lugar novo
 * (trocarDeLugar): câmera e microfone continuam ligados. */
const Saida = {
  aberta: false, pausaAte: 0, foco: null, irAteDepois: null, esperando: null, timer: null,

  dentro(eu) {
    const c = Jogo.mapa && Jogo.mapa.cenario && Jogo.mapa.cenario.saida;
    return !!c && eu.x >= c[0] && eu.x <= c[2] && eu.y >= c[1] && eu.y <= c[3];
  },

  conferir(eu) {
    if (this.aberta || Editor.ativo || Date.now() < this.pausaAte) return;
    if ((Jogo.espacos || []).length < 2) return;
    if (this.dentro(eu)) this.abrir();
  },

  abrir(foco) {
    this.aberta = true;
    this.foco = foco || null;
    Jogo.caminho = null;
    Jogo.querSentar = null;
    Jogo.teclas.clear();
    document.getElementById('modal-saida').hidden = false;
    this.avisar('');
    this.desenhar();
    const alvo = document.querySelector('#lugares-saida .cartao-lugar.foco input')
      || document.querySelector('#lugares-saida button:not([disabled])')
      || document.getElementById('btn-ficar');
    if (alvo) alvo.focus();
  },

  /** voltar: dá um passo para dentro, senão a janela abria de novo na hora */
  fechar(voltar = true) {
    if (!this.aberta) return;
    this.aberta = false;
    this.esperando = null;
    clearTimeout(this.timer);
    document.getElementById('modal-saida').hidden = true;
    this.pausaAte = Date.now() + 1500;
    if (voltar) {
      this.irAteDepois = null;
      const e = Jogo.mapa && Jogo.mapa.cenario && Jogo.mapa.cenario.entrada;
      if (e && Jogo.eu && this.dentro(Jogo.eu)) {
        const o = origemDoCaminho();
        Jogo.caminho = tracarCaminho(o.x, o.y, e[0], e[1]) || null;
      }
    }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  },

  avisar(texto) {
    const p = document.getElementById('aviso-saida');
    if (p) p.textContent = texto || '';
  },

  contagem(id) {
    const n = (Jogo.lugares || []).filter((l) => l.espaco === id).length;
    return n === 0 ? 'ninguém agora' : n === 1 ? '1 pessoa' : `${n} pessoas`;
  },

  desenhar() {
    const caixa = document.getElementById('lugares-saida');
    caixa.innerHTML = '';
    for (const e of Jogo.espacos || []) {
      const aqui = Jogo.espaco && e.id === Jogo.espaco.id;
      const div = document.createElement('div');
      div.className = 'cartao-lugar' + (aqui ? ' aqui' : '') + (this.foco === e.id ? ' foco' : '');
      div.innerHTML = `<div class="cabeca-lugar"><b>${escapar(e.nome)}</b>
        <span data-contagem="${escapar(e.id)}">${this.contagem(e.id)}</span></div>`;
      const acoes = document.createElement('div');
      acoes.className = 'acoes-lugar';
      if (aqui) {
        acoes.innerHTML = '<span class="voce-aqui">Você está aqui</span>';
      } else if (e.acesso) {
        const ir = document.createElement('button');
        ir.type = 'button';
        ir.className = 'ok';
        ir.textContent = `Ir para o ${e.nome}`;
        ir.onclick = () => { this.avisar('Indo…'); enviar({ tipo: 'ir_para', espaco: e.id }); };
        acoes.appendChild(ir);
      } else {
        const form = document.createElement('form');
        form.className = 'chave-lugar';
        form.innerHTML = `<input type="password" autocomplete="off" placeholder="Chave de acesso do ${escapar(e.nome)}"
            aria-label="Chave de acesso do ${escapar(e.nome)}">
          <button type="submit" class="ok">Entrar com a chave</button>`;
        form.onsubmit = (ev) => {
          ev.preventDefault();
          const chave = form.querySelector('input').value.trim();
          if (!chave) { this.avisar('Digite a chave de acesso.'); return; }
          Conexao.chaves[e.id] = chave;
          this.avisar('Conferindo a chave…');
          enviar({ tipo: 'ir_para', espaco: e.id, chave });
        };
        acoes.appendChild(form);
        const pedir = document.createElement('button');
        pedir.type = 'button';
        pedir.className = 'pedir-lugar';
        pedir.dataset.pedir = e.id;
        pedir.textContent = 'Pedir para entrar';
        pedir.onclick = () => this.pedir(e);
        acoes.appendChild(pedir);
      }
      div.appendChild(acoes);
      caixa.appendChild(div);
    }
    this.atualizarContagens();
  },

  /** A lista de quem está em cada lugar mudou: só os números e o botão de
   *  pedir (redesenhar apagaria a chave que a pessoa está digitando). */
  atualizarContagens() {
    if (!this.aberta) return;
    for (const e of Jogo.espacos || []) {
      const span = document.querySelector(`#lugares-saida [data-contagem="${CSS.escape(e.id)}"]`);
      if (span) span.textContent = this.contagem(e.id);
      const b = document.querySelector(`#lugares-saida [data-pedir="${CSS.escape(e.id)}"]`);
      if (b) {
        const ninguem = !(Jogo.lugares || []).some((l) => l.espaco === e.id);
        b.disabled = ninguem || this.esperando === e.id;
        b.title = ninguem ? `Ninguém no ${e.nome} agora para deixar você entrar` : '';
      }
    }
  },

  pedir(e) {
    this.esperando = e.id;
    this.avisar(`Pedindo para entrar no ${e.nome}…`);
    enviar({ tipo: 'pedir_espaco', espaco: e.id });
    this.atualizarContagens();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.esperando !== e.id) return;
      this.esperando = null;
      this.avisar(`Ninguém do ${e.nome} respondeu. Tente de novo ou use a chave de acesso.`);
      this.atualizarContagens();
    }, 60000);
  },
};

document.getElementById('btn-ficar').onclick = () => Saida.fechar();
// clicar fora da caixa é "ficar aqui"
document.getElementById('modal-saida').addEventListener('pointerdown', (e) => {
  if (e.target.id === 'modal-saida') Saida.fechar();
});

/** Vai para o outro lugar: a página religa lá (o servidor tira a sessão de cá
 *  na hora, pela chave de envio). Câmera e microfone continuam ligados. */
function trocarDeLugar(espaco, por) {
  if (!Conexao.perfil || !Jogo.chaveEnvio) return;
  const e = (Jogo.espacos || []).find((x) => x.id === espaco);
  if (por) escreverChat({ sistema: true, texto: `${por} deixou você entrar no ${e ? e.nome : espaco}.` });
  const depois = Saida.irAteDepois;
  Saida.irAteDepois = null;
  Saida.fechar(false);
  Jogo.caminho = null;
  Jogo.querSentar = null;
  Jogo.sentadoEm = null;
  Jogo.teclas.clear();
  Midia.fecharPares();
  Conexao.trocando = { para: espaco, depois };
  Conexao.perfil = { ...Conexao.perfil, espaco, convite: Conexao.chaves[espaco] || '',
                     troca: Jogo.chaveEnvio };
  try { localStorage.setItem('escritorio:lugar', espaco); } catch (err) { /* aba anônima */ }
  conectar(Conexao.perfil);
}

/** "Ir até" alguém do outro lugar: com acesso, vai e anda até a pessoa; sem,
 *  abre a janela da porta naquele lugar (a chave, ou pedir para entrar). */
function irAteOutroLugar(l) {
  const e = (Jogo.espacos || []).find((x) => x.id === l.espaco);
  if (!e) return;
  Saida.irAteDepois = l.id;
  if (e.acesso) { enviar({ tipo: 'ir_para', espaco: e.id }); return; }
  Saida.abrir(e.id);
  Saida.irAteDepois = l.id;
}

/** Pedidos para entrar no lugar: quem está dentro recebe o cartão (com som); quem
 *  pediu fica sabendo do resultado na janela da porta. */
function receberPedidoDeLugar(msg) {
  if (msg.acao === 'chegou') {
    const caixa = painelPedido({
      texto: `<b>${escapar(msg.quem)}</b> quer entrar no ${escapar(msg.nome_espaco)}${
        msg.de_onde ? ` <span class="de-onde">(está no ${escapar(msg.de_onde)})</span>` : ''}.`,
      botoes: [
        { texto: 'Deixar entrar', classe: 'ok',
          fazer: () => enviar({ tipo: 'responder_espaco', para: msg.de, aceita: true }) },
        { texto: 'Agora não',
          fazer: () => enviar({ tipo: 'responder_espaco', para: msg.de, aceita: false }) },
      ],
      segundos: 60,
    });
    caixa.dataset.pedidoDe = msg.de;
    Chamar.avisar({ titulo: `${msg.quem} quer entrar no ${msg.nome_espaco}`,
                    texto: 'Deixe entrar ou recuse na tela do escritório.',
                    chave: 'lugar-' + msg.de, forte: true });
  } else if (msg.acao === 'resolvido') {
    const c = document.getElementById('pedido-sala');
    if (c && c.dataset.pedidoDe === msg.de) c.remove();
    if (msg.quem) {
      escreverChat({ sistema: true, texto: msg.aceita
        ? `${msg.por} deixou ${msg.quem} entrar.` : `${msg.por} não deixou ${msg.quem} entrar agora.` });
    }
  } else if (msg.acao === 'enviado') {
    if (!Saida.aberta) Saida.abrir(msg.espaco);
    Saida.esperando = msg.espaco;
    const e = (Jogo.espacos || []).find((x) => x.id === msg.espaco);
    Saida.avisar(msg.repetido ? 'Seu pedido ainda está esperando resposta.'
      : `Pedido enviado para ${msg.n === 1 ? '1 pessoa' : msg.n + ' pessoas'} no ${e ? e.nome : ''}. Esperando alguém responder…`);
    Saida.atualizarContagens();
  } else if (msg.acao === 'ninguem') {
    Saida.esperando = null;
    Saida.avisar(msg.texto);
    Saida.atualizarContagens();
  } else if (msg.acao === 'recusado') {
    Saida.esperando = null;
    clearTimeout(Saida.timer);
    const texto = `${msg.por} não deixou você entrar no ${msg.nome_espaco} agora.`;
    if (Saida.aberta) Saida.avisar(texto);
    escreverChat({ sistema: true, texto });
    Chamar.avisar({ titulo: texto, chave: 'recusado-' + msg.espaco });
    Saida.atualizarContagens();
  }
}

/** A placa "Saída" em cima da porta de saída (só quando existe outro lugar). */
function desenharSaida(c) {
  const s = c && c.saida;
  if (!s || (Jogo.espacos || []).length < 2) return;
  const x = (s[0] + s[2]) / 2, y = s[1] + 6;
  ctx.save();
  ctx.font = '600 13px Inter, -apple-system, "Segoe UI", sans-serif';
  const texto = 'Saída ↓';
  const w = ctx.measureText(texto).width + 24;
  ctx.fillStyle = 'rgba(28,25,31,.85)';
  arredondado(x - w / 2, y - 11, w, 22, 11);
  ctx.fill();
  ctx.strokeStyle = 'rgba(167,139,250,.7)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = '#f5f3f7';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, x, y + 0.5);
  ctx.restore();
}

/* ---------- como cada um está (26/11): Disponível, Ocupado, Almoço, Não perturbe ----------
 * Aparece na bolinha do crachá, na lista de pessoas e no botão do cabeçalho.
 * "Não perturbe" tira a pessoa das conversas pelo caminho (podemConversar e
 * sala.py: se_ouvem) e barra quem bate na porta; "Almoço" também barra a
 * batida. Fica guardada na aba: F5 e queda de rede não voltam para Disponível,
 * mas abrir o escritório de novo no dia seguinte volta. */
const SITUACOES = {
  disponivel: { nome: 'Disponível', cor: '#22c55e', dica: 'Pode chegar e conversar' },
  ocupado: { nome: 'Ocupado', cor: '#f59e0b', dica: 'Concentrado, mas pode chamar' },
  almoco: { nome: 'Almoço', cor: '#38bdf8', dica: 'Fora por um tempo' },
  nao_perturbe: { nome: 'Não perturbe', cor: '#ef4444', dica: 'Ninguém puxa conversa nem bate na porta' },
};
const CHAVE_SITUACAO = 'escritorio:situacao';

function situacaoDe(p) {
  return p && SITUACOES[p.situacao] ? p.situacao : 'disponivel';
}

function minhaSituacaoSalva() {
  if (Jogo.eu && SITUACOES[Jogo.eu.situacao]) return Jogo.eu.situacao;
  try {
    const s = sessionStorage.getItem(CHAVE_SITUACAO);
    return SITUACOES[s] ? s : 'disponivel';
  } catch (e) { return 'disponivel'; }
}

function mudarSituacao(valor) {
  if (!SITUACOES[valor] || !Jogo.eu || valor === situacaoDe(Jogo.eu)) return;
  try { sessionStorage.setItem(CHAVE_SITUACAO, valor); } catch (e) { /* aba anônima */ }
  Jogo.eu.situacao = valor;
  enviar({ tipo: 'situacao', valor });
  desenharSituacao();
  desenharListaPessoas();
  if (valor === 'nao_perturbe') {
    escreverChat({ sistema: true, texto: 'Não perturbe: ninguém puxa conversa com você pelo caminho e ninguém bate na sua porta. Salas, baias e a mesa de reunião continuam funcionando.' });
  } else if (valor === 'almoco') {
    escreverChat({ sistema: true, texto: 'Almoço: quem bater na sua porta fica sabendo que você saiu.' });
  }
}

function desenharSituacao() {
  const v = situacaoDe(Jogo.eu), s = SITUACOES[v];
  const bt = document.getElementById('btn-situacao');
  if (!bt) return;
  bt.querySelector('.ponto-situacao').className = 'ponto-situacao sit-' + v;
  bt.querySelector('.nome-situacao').textContent = s.nome;
  bt.title = 'Como você está: ' + s.nome;
  for (const b of document.querySelectorAll('.item-situacao')) {
    const ativo = b.dataset.situacao === v;
    b.classList.toggle('ativo', ativo);
    b.setAttribute('aria-checked', String(ativo));
  }
}

function montarMenuSituacao() {
  const caixa = document.getElementById('lista-situacoes');
  if (!caixa) return;
  caixa.innerHTML = '';
  for (const [valor, s] of Object.entries(SITUACOES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'item-menu item-situacao';
    b.dataset.situacao = valor;
    b.setAttribute('role', 'menuitemradio');
    b.innerHTML = `<span class="ponto-situacao sit-${valor}"></span>
      <span class="textos-situacao"><span>${s.nome}</span><small>${s.dica}</small></span>`;
    b.onclick = () => { mudarSituacao(valor); alternarSuspenso('btn-situacao', 'situacao', false); };
    caixa.appendChild(b);
  }
  desenharSituacao();
}

/** A mensagem do "todos" cita o meu primeiro nome? (sem ligar para acento nem
 *  maiúscula: "gustavo", "Gustavo," e "@Gustavo" contam; "Gustavinho" não) */
function citaMeuNome(texto) {
  if (!texto || !Jogo.eu) return false;
  const limpo = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const primeiro = limpo(Jogo.eu.nome).trim().split(/\s+/)[0] || '';
  if (primeiro.length < 3) return false;
  const nome = primeiro.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^a-z0-9])' + nome + '($|[^a-z0-9])').test(limpo(texto));
}

/* ---------- avisos para quem está em outra aba (26/11) ----------
 * Quem estava no e-mail ou numa planilha não ficava sabendo que bateram na
 * porta, que falaram com ela no chat ou que alguém chegou para conversar.
 * Agora: um "plim" curto, o aviso do computador (se a pessoa deixou) e o
 * título da aba piscando até ela voltar. Em "Não perturbe" fica tudo quieto. */
const Chamar = {
  TITULO: document.title,
  CHAVE: 'escritorio:avisos',
  PERGUNTADO: 'escritorio:avisos-perguntado',
  pendentes: 0, piscar: null, som: null, ultimoSom: 0, desde: 0,
  conversa: null, porPessoa: new Map(),

  ligado() { return localStorage.getItem(this.CHAVE) !== '0'; },
  fora() { return document.hidden || !document.hasFocus(); },
  temAvisoDoComputador() { return 'Notification' in window && Notification.permission === 'granted'; },

  /** forte: o som toca mesmo com a aba na frente (bateram na porta). */
  avisar({ titulo, texto = '', chave = '', forte = false }) {
    if (!this.ligado() || !Jogo.eu) return;
    if (situacaoDe(Jogo.eu) === 'nao_perturbe') return;
    const fora = this.fora();
    if (!fora && !forte) return;
    const tocou = this.tocar();
    if (!fora) return;
    this.pendentes++;
    this.piscarTitulo(titulo);
    if (this.temAvisoDoComputador()) {
      try {
        const n = new Notification(titulo, { body: texto, tag: chave || undefined,
                                             icon: '/static/assets/logo.png', silent: tocou });
        n.onclick = () => { window.focus(); n.close(); };
        setTimeout(() => n.close(), 15000);
      } catch (e) { /* celular: só com service worker; fica o som e o título */ }
    }
  },

  /** Mensagem que não pede aviso: só conta no título da aba. */
  contar() {
    if (!this.fora()) return;
    this.pendentes++;
    if (!this.piscar) document.title = `(${this.pendentes}) ${this.TITULO}`;
  },

  piscarTitulo(texto) {
    clearInterval(this.piscar);
    const curto = texto.length > 42 ? texto.slice(0, 41) + '…' : texto;
    let aceso = true;
    document.title = '🔔 ' + curto;
    this.piscar = setInterval(() => {
      aceso = !aceso;
      document.title = aceso ? '🔔 ' + curto : `(${this.pendentes}) ${this.TITULO}`;
    }, 1200);
  },

  limpar() {
    if (this.fora()) return;
    clearInterval(this.piscar);
    this.piscar = null;
    this.pendentes = 0;
    document.title = this.TITULO;
  },

  /** O "plim": dois tons curtos, feitos na hora (sem arquivo de som). Só toca
   *  depois que a pessoa clicou ou digitou na página (regra dos navegadores). */
  tocar() {
    const c = this.som;
    if (!c || c.state !== 'running') return false;
    const agora = Date.now();
    if (agora - this.ultimoSom < 1500) return true;
    this.ultimoSom = agora;
    const t = c.currentTime;
    [[0, 880], [0.14, 1318.5]].forEach(([atraso, freq]) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t + atraso);
      g.gain.exponentialRampToValueAtTime(0.16, t + atraso + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + atraso + 0.45);
      o.connect(g).connect(c.destination);
      o.start(t + atraso);
      o.stop(t + atraso + 0.5);
    });
    return true;
  },

  prepararSom() {
    try {
      if (!this.som) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.som = new AC();
      }
      if (this.som && this.som.state === 'suspended') this.som.resume().catch(() => {});
    } catch (e) { /* sem som, ficam o aviso e o título */ }
  },

  /** Alguém entrou na conversa comigo enquanto eu estava em outra aba. Uma vez
   *  por pessoa a cada 3 minutos (quem anda na borda do raio não vira sirene),
   *  e nada nos primeiros segundos depois de entrar (é todo mundo "chegando"). */
  conferirChegadas(ids) {
    const antes = this.conversa;
    this.conversa = ids;
    if (!antes || Date.now() - this.desde < 8000 || !this.fora()) return;
    for (const id of ids) {
      if (antes.has(id)) continue;
      const p = Jogo.pessoas.get(id);
      if (!p || Date.now() - (this.porPessoa.get(id) || 0) < 180000) continue;
      this.porPessoa.set(id, Date.now());
      this.avisar({ titulo: `${p.nome} chegou para conversar`,
                    texto: 'Volte para a aba do escritório para falar.', chave: 'perto-' + id });
    }
  },

  /** Uma vez por navegador, depois de entrar: oferece o aviso do computador. */
  oferecer() {
    if (!('Notification' in window) || Notification.permission !== 'default') return;
    if (localStorage.getItem(this.PERGUNTADO)) return;
    setTimeout(() => {
      // não atropela um pedido de verdade (alguém batendo na porta)
      if (document.getElementById('pedido-sala') || Notification.permission !== 'default') return;
      painelPedido({
        texto: 'Quer um <b>aviso no computador</b> quando alguém bater na sua porta ou falar com você enquanto você está em outra aba?',
        botoes: [
          { texto: 'Quero', classe: 'ok', fazer: () => this.pedirPermissao() },
          { texto: 'Agora não', fazer: () => localStorage.setItem(this.PERGUNTADO, '1') },
        ],
        segundos: 30,
      });
    }, 6000);
  },

  pedirPermissao() {
    localStorage.setItem(this.PERGUNTADO, '1');
    if (!('Notification' in window)) {
      escreverChat({ sistema: true, texto: 'Este navegador não mostra aviso do computador. O som e a aba piscando continuam valendo.' });
      return;
    }
    if (Notification.permission === 'denied') {
      escreverChat({ sistema: true, texto: 'O aviso do computador está bloqueado para este site. Libere no cadeado ao lado do endereço. O som e a aba piscando continuam valendo.' });
      return;
    }
    // o Safari antigo responde por função, não por promessa: lê o resultado depois
    Promise.resolve(Notification.requestPermission()).catch(() => {}).then(() => {
      this.atualizarItem();
      if (Notification.permission === 'granted') {
        escreverChat({ sistema: true, texto: 'Pronto: quando bater na sua porta ou falarem com você em outra aba, aparece um aviso no computador.' });
      }
    });
  },

  /** O item do menu de ajustes: ligado, só som (sem permissão do computador) ou desligado. */
  atualizarItem() {
    const b = document.querySelector('#btn-avisos-pc .estado-aviso');
    if (!b) return;
    b.textContent = !this.ligado() ? 'desligado' : (this.temAvisoDoComputador() ? 'ligado' : 'só som');
    b.classList.toggle('desligado', !this.ligado());
  },

  alternarLigado() {
    // ligado mas sem a permissão do computador: o clique pede a permissão
    if (this.ligado() && 'Notification' in window && Notification.permission === 'default') {
      this.pedirPermissao();
      return;
    }
    const vai = !this.ligado();
    localStorage.setItem(this.CHAVE, vai ? '1' : '0');
    if (vai && 'Notification' in window && Notification.permission === 'default') this.pedirPermissao();
    this.atualizarItem();
  },
};

// o navegador só deixa tocar som depois de um clique ou tecla na página
for (const ev of ['pointerdown', 'keydown']) {
  document.addEventListener(ev, () => Chamar.prepararSom(), { capture: true, passive: true });
}
document.addEventListener('visibilitychange', () => Chamar.limpar());
window.addEventListener('focus', () => Chamar.limpar());
montarMenuSituacao();
Chamar.atualizarItem();

/* ---------- cabeçalho Codara (26/11): painel, avisos, ajustes ----------
 * O sino guarda os avisos do escritório (quem entrou, quem bateu na porta,
 * microfone que caiu) — os mesmos que passam no chat, só que num lugar só. */
const Avisos = {
  lista: [], naoLidos: 0,
  anotar(texto) {
    this.lista.unshift({ texto, quando: new Date() });
    this.lista.length = Math.min(this.lista.length, 30);
    const aberto = !document.getElementById('avisos').hidden;
    if (!aberto) this.naoLidos++;
    this.desenhar();
  },
  desenhar() {
    const ul = document.getElementById('lista-avisos');
    const n = document.getElementById('avisos-contagem');
    if (!ul || !n) return;
    n.hidden = !this.naoLidos;
    n.textContent = this.naoLidos > 9 ? '9+' : String(this.naoLidos);
    ul.innerHTML = this.lista.length ? this.lista.map((a) => `<li>${escapar(a.texto)}<span class="quando">${
      a.quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></li>`).join('')
      : '<li class="vazio">Nada por aqui ainda.</li>';
  },
};

const MENUS_DA_BARRA = [['btn-situacao', 'situacao'], ['btn-avisos', 'avisos'], ['btn-ajustes', 'ajustes']];

function alternarSuspenso(botaoId, caixaId, abrir) {
  const botao = document.getElementById(botaoId), caixa = document.getElementById(caixaId);
  const vai = abrir === undefined ? caixa.hidden : abrir;
  for (const [b, c] of MENUS_DA_BARRA) {
    if (c === caixaId) continue;
    document.getElementById(c).hidden = true;
    document.getElementById(b).setAttribute('aria-expanded', 'false');
  }
  caixa.hidden = !vai;
  botao.setAttribute('aria-expanded', String(vai));
  if (vai && caixaId === 'avisos') { Avisos.naoLidos = 0; Avisos.desenhar(); }
}
document.getElementById('btn-pessoas').onclick = () => alternarLateral();
// Tela cheia de verdade (some a barra do navegador). O 'resize' que vem junto
// reenquadra o salão sozinho.
document.getElementById('btn-tela-cheia').onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
};
document.addEventListener('fullscreenchange', () => {
  document.getElementById('btn-tela-cheia').classList.toggle('ativo', !!document.fullscreenElement);
});
document.getElementById('btn-avisos').onclick = (e) => { e.stopPropagation(); alternarSuspenso('btn-avisos', 'avisos'); };
document.getElementById('btn-ajustes').onclick = (e) => { e.stopPropagation(); alternarSuspenso('btn-ajustes', 'ajustes'); };
document.getElementById('btn-situacao').onclick = (e) => { e.stopPropagation(); alternarSuspenso('btn-situacao', 'situacao'); };
document.getElementById('btn-avisos-pc').onclick = () => Chamar.alternarLigado();
// os itens do menu de ajustes fazem o que faziam na barra antiga e fecham o menu
for (const id of ['btn-boneco', 'btn-editor', 'btn-reuniao', 'btn-reacao']) {
  document.getElementById(id).addEventListener('click', () => alternarSuspenso('btn-ajustes', 'ajustes', false));
}
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest || e.target.closest('.menu-barra')) return;
  for (const [b, c] of MENUS_DA_BARRA) alternarSuspenso(b, c, false);
});
document.getElementById('acao-reuniao').onclick = () => acionarReuniao();
// Pessoas e Chat recolhem pelo título; o que fica aberto é lembrado
for (const botao of document.querySelectorAll('.titulo-bloco')) {
  const bloco = document.getElementById(botao.dataset.bloco);
  const chave = 'escritorio:recolhido:' + botao.dataset.bloco;
  const aplicar = (recolher) => {
    bloco.classList.toggle('recolhido', recolher);
    botao.setAttribute('aria-expanded', String(!recolher));
  };
  aplicar(localStorage.getItem(chave) === '1');
  botao.onclick = () => {
    const recolher = !bloco.classList.contains('recolhido');
    localStorage.setItem(chave, recolher ? '1' : '0');
    aplicar(recolher);
  };
}

/* ---------- foto, arquivo e link no chat (26/11, como no Meet e no WhatsApp) ---------- */
function comLinks(texto) {
  // escapa primeiro; só então vira link o que for http(s)
  return escapar(texto).replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g,
    (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
}

function tamanhoLegivel(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
}

function htmlDoAnexo(a) {
  const url = escapar(a.url), nome = escapar(a.nome);
  if (a.imagem) {
    return `<button type="button" class="anexo-foto" data-url="${url}" title="Abrir a foto"><img src="${url}" alt="${nome}" loading="lazy"></button>`;
  }
  const ext = (a.nome.split('.').pop() || '').slice(0, 4).toUpperCase();
  return `<a class="anexo-arquivo" href="${url}" download="${nome}">
    <span class="anexo-ext">${escapar(ext || 'ARQ')}</span>
    <span class="anexo-info"><b>${nome}</b><small>${tamanhoLegivel(a.tamanho)} · baixar</small></span></a>`;
}

// foto em tela cheia ao clicar (clique ou Esc fecha)
document.getElementById('mensagens').addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('.anexo-foto');
  if (!b) return;
  const fundo = document.createElement('div');
  fundo.className = 'foto-cheia';
  fundo.innerHTML = `<img src="${b.dataset.url}" alt=""><a href="${b.dataset.url}" download class="baixar-foto">Baixar</a>`;
  fundo.onclick = (ev) => { if (ev.target.tagName !== 'A') fundo.remove(); };
  document.body.appendChild(fundo);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.foto-cheia').forEach((x) => x.remove());
}, true);

async function enviarArquivos(lista) {
  const campo = document.getElementById('campo-chat');
  for (const arq of [...lista]) {
    if (arq.size > 15 * 1024 * 1024) {
      escreverChat({ sistema: true, texto: `"${arq.name}" passa de 15 MB e não foi enviado.` });
      continue;
    }
    escreverChat({ sistema: true, texto: `Enviando "${arq.name || 'foto'}"…` });
    try {
      const r = await fetch('/chat/anexo', { method: 'POST', body: arq, headers: {
        'X-Chave': Jogo.chaveEnvio || '', 'X-Nome': encodeURIComponent(arq.name || 'foto.png'),
        'Content-Type': 'application/octet-stream' } });
      const d = await r.json();
      if (!r.ok || d.erro) throw new Error(d.erro || 'falhou');
      // o texto que estava escrito vai junto, como legenda (igual no WhatsApp)
      enviar({ tipo: 'chat', texto: campo.value.trim(), escopo: document.getElementById('escopo-chat').value,
               anexo: d.id });
      campo.value = '';
    } catch (err) {
      escreverChat({ sistema: true, texto: `Não consegui enviar "${arq.name}": ${err.message}` });
    }
  }
}
document.getElementById('btn-anexo').onclick = () => document.getElementById('arquivo-chat').click();
document.getElementById('arquivo-chat').onchange = (e) => {
  enviarArquivos(e.target.files);
  e.target.value = '';
};
// colar foto (Ctrl+V / Cmd+V) no campo do chat
document.getElementById('campo-chat').addEventListener('paste', (e) => {
  const arquivos = [...(e.clipboardData ? e.clipboardData.files : [])];
  if (arquivos.length) { e.preventDefault(); enviarArquivos(arquivos); }
});
// arrastar para dentro do chat
const blocoChat = document.getElementById('bloco-chat');
blocoChat.addEventListener('dragover', (e) => {
  if (![...e.dataTransfer.types].includes('Files')) return;
  e.preventDefault();
  blocoChat.classList.add('soltando');
});
blocoChat.addEventListener('dragleave', (e) => { if (!blocoChat.contains(e.relatedTarget)) blocoChat.classList.remove('soltando'); });
blocoChat.addEventListener('drop', (e) => {
  blocoChat.classList.remove('soltando');
  if (!e.dataTransfer.files.length) return;
  e.preventDefault();
  enviarArquivos(e.dataTransfer.files);
});

document.getElementById('form-chat').addEventListener('submit', (e) => {
  e.preventDefault();
  const campo = document.getElementById('campo-chat');
  const texto = campo.value.trim();
  if (!texto) return;
  enviar({ tipo: 'chat', texto, escopo: document.getElementById('escopo-chat').value });
  campo.value = '';
  // Devolve o teclado ao jogo, como no Gather. Antes o foco ficava no campo e
  // W A S D só escreviam letras: parecia que o boneco tinha travado, e nada na
  // tela dizia que era preciso apertar Esc.
  campo.blur();
});
