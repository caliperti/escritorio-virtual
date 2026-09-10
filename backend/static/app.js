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
const VELOCIDADE = 3.2;             // pixels por quadro (~190 px/s)
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
const ABAS = [
  ['Corpo', ['corpo', 'pele']],
  ['Cabelo', ['cabelo', 'corCabelo', 'barba']],
  ['Roupa', ['camisaTipo', 'corCamisa', 'calcaTipo', 'corCalca']],
  ['Calçado', ['sapatoTipo', 'corSapato', 'chapeuTipo']],
];

function criarEditor(canvas, container, aparenciaInicial) {
  let ap = Boneco.normalizar(aparenciaInicial);
  const ctx = canvas.getContext('2d');
  const botoes = {};
  const grupos = {};

  // Sem as abas a lista fica com oito grupos empilhados e ninguém rola até o fim.
  const barra = document.createElement('div');
  barra.className = 'abas';
  container.appendChild(barra);
  ABAS.forEach(([titulo, chaves], i) => {
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
    const grupo = document.createElement('div');
    grupo.className = 'grupo';
    grupo.hidden = !ABAS[0][1].includes(chave);
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
const BONECOS_VISITANTE = {
  homem: { corpo: 'm', pele: '#e5b487', cabelo: 'parted', corCabelo: '#4a2f1b',
           barba: '5oclock_shadow', corCamisa: '#4f7fd9', corCalca: '#3d4457' },
  mulher: { corpo: 'f', pele: '#e5b487', cabelo: 'bob', corCabelo: '#241a12',
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
  localStorage.getItem('escritorio:aparencia') ? aparenciaSalva() : Boneco.aleatoria());

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
  // O código da sala vale para criar conta E para entrar de visitante: é ele
  // que separa quem foi convidado de quem só achou o endereço.
  document.getElementById('linha-convite').hidden = !(modo === 'criar' || modo === 'visitante');
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
}
document.getElementById('aba-entrar').onclick = () => usarModo('entrar');
document.getElementById('aba-criar').onclick = () => usarModo('criar');
document.getElementById('aba-visitante').onclick = () => usarModo('visitante');

/** Quantas vagas de membro sobraram. Cheio, a aba de criar conta sai de cena. */
async function conferirVagas() {
  try {
    const c = await (await fetch('/config')).json();
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

  const corpo = modo === 'criar'
    ? { email, nome, senha, convite: document.getElementById('campo-convite').value,
        aparencia: editorEntrada.ver(), cor: editorEntrada.ver().corCamisa }
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

async function entrar(comMidia) {
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
  if (modo === 'visitante') {
    const nome = campoNome.value.trim();
    if (!nome) { aviso.textContent = 'Escreva seu nome.'; return; }
    const visual = BONECOS_VISITANTE[bonecoVisitante];
    conectar({ visitante: true, nome,
               convite: document.getElementById('campo-convite').value,
               aparencia: visual, cor: visual.corCamisa });
    return;
  }
  conectar({ token: sessao.token });
}

/* ==================== conexão ==================== */

// Um WebSocket parado é fechado sozinho pelo proxy (e o serviço no plano
// gratuito hiberna sem tráfego). Sem estes dois números, quem ficava meia hora
// sem se mexer descobria que a sala tinha congelado só ao tentar andar.
const BATIDA_MS = 20000;        // manda um ping de tempos em tempos
const SILENCIO_MS = 55000;      // nada vindo do servidor por tanto tempo = caiu
const ESPERA_MAX_MS = 15000;    // teto da espera entre tentativas de voltar

const Conexao = { perfil: null, tentativas: 0, batida: null, timer: null,
                  ultima: 0, saindo: false };

function conectar(perfil) {
  Conexao.perfil = perfil;
  clearTimeout(Conexao.timer);
  const protocolo = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocolo}://${location.host}/ws`);
  Jogo.ws = ws;

  ws.onopen = () => {
    // voltando de uma queda: pede para nascer onde a pessoa estava
    const voltando = Jogo.eu ? { x: Jogo.eu.x, y: Jogo.eu.y } : null;
    ws.send(JSON.stringify({ tipo: 'entrar', ...perfil, ...(voltando ? { voltando } : {}) }));
    Conexao.tentativas = 0;
    Conexao.ultima = Date.now();
    baterCoracao();
  };
  ws.onmessage = (ev) => {
    Conexao.ultima = Date.now();
    avisarReconectando(false);
    receber(JSON.parse(ev.data));
  };
  ws.onclose = () => {
    pararCoracao();
    // só as chamadas caem; câmera e microfone continuam ligados para a pessoa
    // não ter que dar permissão de novo a cada tropeço da rede
    Midia.fecharPares();
    if (!Conexao.saindo) tentarVoltar();
  };
  ws.onerror = () => {
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
  if (!t.online) {
    painelPedido({ texto: `<b>${nome}</b> é de ${dono}, que não está no escritório agora.`,
                   botoes: [{ texto: 'Entendi' }], segundos: 6 });
    return;
  }
  painelPedido({
    texto: `<b>${nome}</b> é de ${dono}. Quer bater na porta?`,
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
      escreverChat({ sistema: true, texto: `${msg.participante.nome} entrou no escritório.` });
      desenharListaPessoas();
      break;

    case 'saiu': {
      const p = Jogo.pessoas.get(msg.id);
      if (p) escreverChat({ sistema: true, texto: `${p.nome} saiu.` });
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
      if (p) p.bolha = { texto: msg.texto, ate: Date.now() + DURACAO_BOLHA };
      break;
    }

    case 'reacao': {
      const p = Jogo.pessoas.get(msg.id);
      if (p) p.reacao = { emoji: msg.emoji, ate: Date.now() + 2500 };
      break;
    }

    case 'corrigir':                 // o servidor recusou a posição: volta para o lugar dele
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
      } else if (msg.acao === 'bateu') {
        escreverChat({ sistema: true, texto: `Você bateu na porta. Esperando ${msg.dono} responder…` });
      } else if (msg.acao === 'resposta') {
        escreverChat({ sistema: true, texto: msg.aceita
          ? `${msg.dono} deixou você entrar na ${msg.nome_sala}.`
          : `${msg.dono} não pode receber você agora.` });
        if (msg.aceita) delete ultimoAvisoTrancada[msg.id];
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
  receberMapa(msg.mapa);
  Jogo.config = msg.config;
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
    aoMudarTiles: montarTiles,
    aoPararTela: () => { atualizarBotoesMidia(); avisarMidia(); },
    aoNegar: (tipo, e) => escreverChat({ sistema: true, texto:
      (tipo === 'audio' ? 'Microfone' : 'Câmera') + ' bloqueado pelo navegador ('
      + e.name + '). Libere nas permissões do site e tente de novo.' }),
  });
  avisarMidia();

  document.getElementById('entrada').classList.add('oculto');
  document.getElementById('app').classList.remove('oculto');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  ajustarTela();
  definirZoom(ESCALA);
  desenharListaPessoas();
  atualizarBotoesMidia();
  montarTiles();
  if (primeira) {
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
    .every(([dx, dy]) => tileLivre(Math.floor((px + dx) / t), Math.floor((py + dy) / t)));
}

function zonaDe(px, py) {
  // Mesma regra do servidor (mapa.py:zona_de): quando as salas se sobrepõem,
  // vence a menor — a salinha fechada dentro do coworking tem que valer.
  const tx = px / Jogo.tile, ty = py / Jogo.tile;
  let melhor = null, menor = Infinity;
  for (const z of Jogo.zonas) {
    if (tx < z.x1 || tx >= z.x2 + 1 || ty < z.y1 || ty >= z.y2 + 1) continue;
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
  const r = tela.getBoundingClientRect();
  if (!r.width || !r.height) return ZOOM_MIN;
  const cabe = Math.min(r.width / (Jogo.mapa.largura * Jogo.tile),
                        r.height / (Jogo.mapa.altura * Jogo.tile));
  return Math.max(ZOOM_CHAO, Math.min(ZOOM_MIN, cabe));
}

function definirZoom(valor) {
  ESCALA = Math.max(zoomMinimo(), Math.min(ZOOM_MAX, Number(valor.toFixed(2))));
  Jogo.escala = ESCALA;
  localStorage.setItem('escritorio:zoom', String(ESCALA));
  const marca = document.getElementById('zoom-nivel');
  if (marca) marca.textContent = Math.round(ESCALA / 1.5 * 100) + '%';
}

function ajustarZoom(fator) { definirZoom(ESCALA * fator); }

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
  if (e.key.toLowerCase() === 'v') alternarCam();
  if (e.key.toLowerCase() === 't') alternarTela();
  if (e.key.toLowerCase() === 'b') abrirEditor();
  if (e.key.toLowerCase() === 'e' && !Jogo.visitante) Editor.alternar();
  if (e.key === '0') definirZoom(1.5);
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
  Jogo.caminho = tracarCaminho(Jogo.eu.x, Jogo.eu.y, c.ponto.x, c.ponto.y)
              || caminhoPertoDe(c.ponto);
});

/** Quando o ponto clicado é ocupado (uma mesa, por exemplo), anda até o tile
 *  livre mais perto dele. Sem isso o clique em cima de um móvel não fazia nada
 *  e o jogo parecia travado. */
function caminhoPertoDe(ponto) {
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
  let dx = 0, dy = 0;
  if (Jogo.teclas.has('esquerda')) dx -= 1;
  if (Jogo.teclas.has('direita')) dx += 1;
  if (Jogo.teclas.has('cima')) dy -= 1;
  if (Jogo.teclas.has('baixo')) dy += 1;

  if (dx || dy) Jogo.caminho = null;             // o teclado cancela o trajeto

  if (!dx && !dy && Jogo.caminho && Jogo.caminho.length) {
    const passo = Jogo.caminho[0];
    const vx = passo.x - eu.x, vy = passo.y - eu.y;
    const d = Math.hypot(vx, vy);
    if (d < 4) Jogo.caminho.shift();
    else { dx = vx / d; dy = vy / d; }
    if (!Jogo.caminho.length) Jogo.caminho = null;
  }

  if (!dx && !dy && tela.dataset.alvo) {          // segurando o botão: anda para lá
    const alvo = JSON.parse(tela.dataset.alvo);
    const vx = alvo.x - eu.x, vy = alvo.y - eu.y;
    const d = Math.hypot(vx, vy);
    if (d > 6) { dx = vx / d; dy = vy / d; }
  }

  if (dx || dy) {
    const n = Math.hypot(dx, dy) || 1;
    const px = eu.x + (dx / n) * VELOCIDADE;
    const py = eu.y + (dy / n) * VELOCIDADE;
    // Testa os eixos separado: deslizar na parede em vez de travar. Se a pessoa
    // já está presa dentro de um móvel (alguém colocou em cima dela), qualquer
    // movimento vale — senão a única saída seria recarregar.
    const preso = !livre(eu.x, eu.y);
    if (preso || livre(px, eu.y)) eu.x = px;
    if (preso || livre(eu.x, py)) eu.y = py;
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

  eu.passo = (dx || dy) ? (eu.passo || 0) + 0.22 : 0;
  eu.xr = eu.x; eu.yr = eu.y;
  for (const p of Jogo.pessoas.values()) {         // suaviza o movimento dos outros
    const andando = Math.hypot(p.x - p.xr, p.y - p.yr) > 0.7;
    p.passo = andando ? (p.passo || 0) + 0.22 : 0;
    p.xr += (p.x - p.xr) * 0.25;
    p.yr += (p.y - p.yr) * 0.25;
  }

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
  }
  atualizarBotaoTrancar(zona);
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
  const minha = !!(viva && viva.privada && !Jogo.visitante
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
  if (!zona || !zona.privada || Jogo.visitante) return;
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
  if (privA || privB) return privA && privB && za.id === zb.id;
  // Dentro de uma sala todo mundo se ouve, por mais longe que esteja: numa
  // reunião ninguém pode ficar mudo só porque sentou na outra ponta da mesa.
  // O raio só vale em área aberta (corredor, convivência, jardim).
  if (za && zb && za.id === zb.id) return true;
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  return d <= (jaConectados ? Jogo.config.raio_silencio : Jogo.config.raio_conversa);
}

function volumeEntre(a, b) {
  if (mesmaSala(a, b)) return 1;                   // dentro da sala, volume cheio
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  const perto = 70, longe = Jogo.config.raio_silencio;
  return Math.max(0, Math.min(1, (longe - d) / (longe - perto)));
}

function cuidarDasChamadas() {
  const eu = Jogo.eu;
  if (!eu) return;
  for (const p of Jogo.pessoas.values()) {
    const conectado = Midia.pares.has(p.id);
    const deve = podemConversar(eu, p, conectado);
    if (deve && !conectado) {
      Midia.garantirPar(p.id);
      // O cartão de vídeo nascia só quando chegava uma faixa de mídia. Quem
      // chegava sem microfone e sem câmera não ganhava cartão no outro lado
      // — e sem cartão não entrava na grade da reunião. O cartão é de quem
      // está NA CONVERSA, com ou sem mídia.
      montarTiles();
    } else if (!deve && conectado) Midia.fechar(p.id);
    else if (deve) Midia.ajustarVolume(p.id, volumeEntre(eu, p));
  }
  desenharListaPessoas();
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
  definirZoom(ESCALA);
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
  ctx.fillStyle = '#efe7dd';           // fora do mapa: bege da marca, não preto
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
  const ehParede = (x, y) => y >= 0 && y < mapa.altura && x >= 0 && x < mapa.largura
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
    ctx.arc(eu.x, eu.y, Jogo.config.raio_conversa, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(120,140,200,.28)';
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
    const base = cad
      ? (cad.y + Objetos.medida(cad.tipo, mapa.catalogo[cad.tipo], cad.g).a) * t + 0.5
      : pes.yr + 13;
    fila.push({ base, peso: PESO_PESSOA, desenhar: () => desenharAvatar(pes, pes === eu) });
  }
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


  for (const pes of gente) desenharBolha(pes);

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

  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath();
  ctx.ellipse(p.xr, pes, 11, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  const mudo = souEu ? !Midia.ligado('audio') : p.mudo;
  const nivel = Midia.nivel(souEu ? 'eu' : p.id);
  if (souEu) {
    ctx.beginPath();
    ctx.ellipse(p.xr, pes, 12, 5, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  if (nivel > 0.12 && !mudo) {               // anel verde de quem está falando
    ctx.beginPath();
    ctx.ellipse(p.xr, pes, 13 + nivel * 4, 5.5 + nivel * 2, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(34,197,94,.9)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  const assento = assentoEm(p.xr, p.yr);
  Boneco.desenhar(ctx, p.aparencia, p.xr, p.yr, p.direcao, Math.floor(p.passo || 0), 2, !!assento);

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
    const sobe = (p.reacao.ate - Date.now()) / 2500;
    ctx.font = '22px -apple-system, sans-serif';
    ctx.globalAlpha = Math.min(1, sobe * 1.6);
    ctx.fillText(p.reacao.emoji, p.xr, p.yr - 44 - (1 - sobe) * 22);
    ctx.globalAlpha = 1;
  }
}

function desenharBolha(p) {
  if (!p.bolha || p.bolha.ate < Date.now()) return;
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

function reagir() {
  const opcoes = ['👋', '👍', '😂', '🎉', '❤️', '☕', '🔥', '🤔'];
  const emoji = opcoes[Math.floor(Math.random() * opcoes.length)];
  Jogo.eu.reacao = { emoji, ate: Date.now() + 2500 };
  enviar({ tipo: 'reacao', emoji });
}

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

document.getElementById('btn-reacao').onclick = reagir;
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

function montarTiles() {
  const caixa = document.getElementById('videos');
  const vivos = new Set();

  const criar = (id, nome, cor, aparencia) => {
    let tile = caixa.querySelector(`[data-id="${id}"]`);
    if (!tile) {
      tile = document.createElement('div');
      tile.className = 'video-tile';
      tile.dataset.id = id;
      tile.innerHTML = `<video autoplay playsinline${id === 'eu' ? ' muted' : ''}></video>
        <div class="sem-video"></div>
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

  const meuStream = Midia.telaStream || Midia.streamLocal;
  if (meuStream) {
    const nome = (Jogo.eu ? Jogo.eu.nome : 'Você') + (Midia.telaStream ? ' — sua tela' : ' (você)');
    const tile = criar('eu', nome, Jogo.eu ? Jogo.eu.cor : '#333', Jogo.eu && Jogo.eu.aparencia);
    const v = tile.querySelector('video');
    if (v.srcObject !== meuStream) { v.srcObject = meuStream; v.play().catch(() => {}); }
    const temVideo = !!Midia.telaStream || Midia.ligado('video');
    v.style.display = temVideo ? '' : 'none';
    tile.querySelector('.sem-video').style.display = temVideo ? 'none' : 'grid';
    tile.querySelector('.estado').textContent = Midia.ligado('audio') ? '' : '🔇';
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
    if (v.srcObject !== par.stream) { v.srcObject = par.stream; v.play().catch(() => {}); }
    v.volume = par.volume;
    const temVideo = (!p.sem_camera || p.tela) && par.stream.getVideoTracks().length > 0;
    v.style.display = temVideo ? '' : 'none';
    tile.querySelector('.sem-video').style.display = temVideo ? 'none' : 'grid';
    tile.querySelector('.estado').textContent = p.mudo ? '🔇' : '';
    tile.classList.toggle('tela', !!p.tela);
    tile.classList.toggle('compartilhando', !!p.tela);
    vivos.add(id);
  }

  for (const tile of [...caixa.children]) {
    if (!vivos.has(tile.dataset.id)) tile.remove();
  }
  if (Reuniao.ativa) atualizarDestaque();
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
  aplicarReuniao();
}

function alternarReuniao() {
  if (Reuniao.ativa) fecharReuniao(); else abrirReuniao();
}

function aplicarReuniao() {
  const caixa = document.getElementById('videos');
  encolherTiles();
  caixa.classList.toggle('reuniao', Reuniao.ativa);
  document.getElementById('btn-reuniao').classList.toggle('ativo', Reuniao.ativa);
  document.getElementById('btn-fechar-reuniao').hidden = !Reuniao.ativa;
  if (!Reuniao.ativa) {
    caixa.classList.remove('com-destaque');
    for (const t of caixa.children) t.classList.remove('destaque');
    return;
  }
  atualizarDestaque();
}

/** Escolhe quem fica no palco: quem foi fixado > quem apresenta > quem fala.
 *  A troca por voz exige 1s de fala estável, senão o palco piscaria a cada
 *  "uhum" de quem está ouvindo. */
function atualizarDestaque() {
  if (!Reuniao.ativa) return;
  const caixa = document.getElementById('videos');
  const tiles = [...caixa.children];
  let alvo = null;

  // Alguém que ACABOU de abrir a tela leva o palco na hora, mesmo que você
  // tivesse prendido outra pessoa — é o motivo de estar todo mundo ali. Depois
  // disso você pode clicar em quem quiser, que a sua escolha volta a valer.
  const apresentador = (tiles.find((t) => t.classList.contains('tela')) || {}).dataset;
  const idApresentando = apresentador ? apresentador.id : null;
  if (idApresentando && idApresentando !== Reuniao._apresentador) Reuniao.fixado = idApresentando;
  Reuniao._apresentador = idApresentando;

  if (Reuniao.fixado && tiles.some((t) => t.dataset.id === Reuniao.fixado)) {
    alvo = Reuniao.fixado;
  } else {
    Reuniao.fixado = null;
    const apresentando = tiles.find((t) => t.classList.contains('tela'));
    if (apresentando) {
      alvo = apresentando.dataset.id;
    } else {
      let melhor = null, maior = 0.15;
      for (const t of tiles) {
        const n = Midia.nivel(t.dataset.id);
        if (n > maior) { maior = n; melhor = t.dataset.id; }
      }
      const agora = Date.now();
      if (melhor && melhor !== Reuniao._candidato) { Reuniao._candidato = melhor; Reuniao._desde = agora; }
      alvo = (melhor && agora - Reuniao._desde >= 1000) ? melhor : Reuniao.destaque;
      if (alvo && !tiles.some((t) => t.dataset.id === alvo)) alvo = null;   // saiu da conversa
    }
  }

  Reuniao.destaque = alvo;
  for (const t of tiles) t.classList.toggle('destaque', t.dataset.id === alvo);
  caixa.classList.toggle('com-destaque', !!alvo && tiles.length > 1);
  // Quantas fileiras a tira lateral tem: o CSS abre uma linha da grade para
  // cada cartão e o palco ocupa todas. Era um "span 99" fixo — 99 linhas
  // davam um palco de 980px numa janela de 820, e os cartões da tira, com
  // 10px de linha cada, se empilhavam uns por cima dos outros.
  caixa.style.setProperty('--fileiras', Math.max(1, tiles.length - 1));
}

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
    return { p, souEu, perto, zona, tela,
             marca: [p.id, p.nome, p.silenciado ? 1 : 0, perto ? 1 : 0, zona ? zona.nome : '',
                     tela ? 1 : 0, p.cor, JSON.stringify(p.aparencia || null)].join('\x1f') };
  });
  const assinatura = (Jogo.admin ? 'admin|' : '') + linhas.map((l) => l.marca).join('\x1e');
  if (assinatura === assinaturaDaLista) return;
  assinaturaDaLista = assinatura;

  // quem estava com um botão focado continua com ele depois da troca
  const focado = document.activeElement && ul.contains(document.activeElement)
    ? { id: document.activeElement.closest('li').dataset.id,
        indice: [...document.activeElement.closest('li').querySelectorAll('button')].indexOf(document.activeElement) }
    : null;

  ul.innerHTML = '';
  for (const { p, souEu, perto, zona, tela: mostraTela } of linhas) {
    const li = document.createElement('li');
    li.dataset.id = p.id;
    li.innerHTML = `<img class="bolinha" src="${Boneco.retrato(p.aparencia)}" alt="">
      <span>${escapar(p.nome)}${souEu ? ' (você)' : ''}${p.silenciado ? ' <b class="calado">calado</b>' : ''}</span>
      <span class="onde ${perto ? 'perto' : ''}">${mostraTela ? '🖥️ ' : ''}${perto ? '🔊 perto' : (zona ? escapar(zona.nome) : 'corredor')}</span>`;
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
  if (focado) {
    const li = ul.querySelector(`li[data-id="${CSS.escape(focado.id)}"]`);
    const botao = li && li.querySelectorAll('button')[focado.indice];
    if (botao) botao.focus();
  }
  document.getElementById('pessoas-total').textContent = lista.length;
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
    const marca = msg.escopo === 'todos' ? 'todos' : 'perto';
    div.innerHTML = `<span class="quem" style="color:${msg.cor}">${escapar(msg.nome)}</span>
      <span class="marca">${marca}${msg.proprio && msg.escopo === 'perto' ? ' · ' + msg.ouviram + ' ouviram' : ''}</span><br>${escapar(msg.texto)}`;
  }
  caixa.appendChild(div);
  while (caixa.children.length > 200) caixa.removeChild(caixa.firstChild);
  if (noFim || msg.proprio) caixa.scrollTop = caixa.scrollHeight;
}

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
