/* Escritório virtual — movimentação, desenho e o que abre/fecha as conversas.
 *
 * A regra de quem ouve quem está em duas mãos: aqui (para abrir a chamada na
 * hora certa) e em sala.py (para o chat "perto"). Mudou uma, mude a outra.   */

const ESCALA = 1.5;                 // zoom do canvas
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
  ['Roupa', ['corCamisa', 'corCalca']],
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
        b.className = 'retrato';
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
  };
}

function aparenciaSalva() {
  try {
    return Boneco.normalizar(JSON.parse(localStorage.getItem('escritorio:aparencia')));
  } catch (e) {
    return Boneco.aleatoria();
  }
}

/* ==================== tela de entrada ==================== */

const editorEntrada = criarEditor(
  document.getElementById('previa'), document.getElementById('opcoes'),
  localStorage.getItem('escritorio:aparencia') ? aparenciaSalva() : Boneco.aleatoria());

document.getElementById('btn-sortear').onclick = () => editorEntrada.sortear();

const campoNome = document.getElementById('campo-nome');
campoNome.value = localStorage.getItem('escritorio:nome') || '';
campoNome.focus();

document.getElementById('btn-entrar').onclick = () => entrar(true);
document.getElementById('btn-entrar-mudo').onclick = () => entrar(false);
campoNome.addEventListener('keydown', (e) => { if (e.key === 'Enter') entrar(true); });

// O servidor diz se a sala está protegida; o campo só aparece nesse caso.
fetch('/config').then((r) => r.json()).then((c) => {
  if (c.protegido) document.getElementById('campo-senha').parentElement.hidden = false;
}).catch(() => {});

async function entrar(comMidia) {
  const nome = campoNome.value.trim() || 'Convidado';
  const aparencia = editorEntrada.ver();
  const aviso = document.getElementById('aviso-entrada');
  localStorage.setItem('escritorio:nome', nome);
  localStorage.setItem('escritorio:aparencia', JSON.stringify(aparencia));

  if (comMidia) {
    aviso.textContent = 'Pedindo acesso à câmera e ao microfone…';
    try {
      await Midia.pedirMidia();
    } catch (e) {
      aviso.textContent = 'Sem câmera/microfone (' + e.name + '). Entrando só olhando.';
    }
  }
  aviso.textContent = 'Conectando…';
  conectar({ nome, cor: aparencia.corCamisa, emoji: '', aparencia,
             senha: document.getElementById('campo-senha').value });
}

/* ==================== conexão ==================== */

function conectar(perfil) {
  const protocolo = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${protocolo}://${location.host}/ws`);
  Jogo.ws = ws;

  ws.onopen = () => ws.send(JSON.stringify({ tipo: 'entrar', ...perfil }));
  ws.onmessage = (ev) => receber(JSON.parse(ev.data));
  ws.onclose = () => {
    escreverChat({ sistema: true, texto: 'Conexão encerrada. Recarregue a página para voltar.' });
    Midia.fecharTudo();
  };
  ws.onerror = () => {
    document.getElementById('aviso-entrada').textContent = 'Não consegui conectar ao servidor.';
  };
}

function enviar(msg) {
  if (Jogo.ws && Jogo.ws.readyState === WebSocket.OPEN) Jogo.ws.send(JSON.stringify(msg));
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
      if (alvo) Object.assign(alvo, msg.participante);
      desenharListaPessoas();
      montarTiles();
      break;
    }

    case 'midia': {
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
      break;

    case 'mapa':
      receberMapa(msg.mapa);
      // a lista de salas do editor mostra o estado do mapa: precisa acompanhar
      if (Editor.ativo && Editor.ferramenta === 'sala') Editor.usarFerramenta('sala');
      if (msg.por && Jogo.eu && msg.por !== Jogo.eu.nome) {
        escreverChat({ sistema: true, texto: `${msg.por} mexeu no escritório.` });
      }
      break;

    case 'recusado':
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
    for (let dy = 0; dy < info.a; dy++) {
      for (let dx = 0; dx < info.l; dx++) bloq.add((o.x + dx) + ',' + (o.y + dy));
    }
  }
  Jogo.bloqueados = bloq;
}

function iniciarSala(msg) {
  Jogo.eu = { ...msg.voce, xr: msg.voce.x, yr: msg.voce.y, bolha: null, reacao: null };
  receberMapa(msg.mapa);
  Jogo.config = msg.config;
  msg.participantes.forEach((p) => Jogo.pessoas.set(p.id, prepararPessoa(p)));

  Editor.configurar({ enviar, jogo: Jogo });
  Midia.configurar({
    meuId: Jogo.eu.id,
    enviarSinal: (para, dados) => enviar({ tipo: 'sinal', para, dados }),
    aoMudarTiles: montarTiles,
    aoPararTela: () => { atualizarBotoesMidia(); avisarMidia(); },
  });
  avisarMidia();

  document.getElementById('entrada').classList.add('oculto');
  document.getElementById('app').classList.remove('oculto');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  ajustarTela();
  desenharListaPessoas();
  atualizarBotoesMidia();
  montarTiles();
  escreverChat({ sistema: true, texto: 'Você chegou na recepção. Ande até alguém para conversar.' });
  setTimeout(() => document.getElementById('dica').style.opacity = 0, 9000);
  setInterval(cuidarDasChamadas, 250);
  requestAnimationFrame(quadro);
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

/* ==================== entrada do teclado ==================== */

const MAPA_TECLAS = {
  arrowup: 'cima', w: 'cima', arrowdown: 'baixo', s: 'baixo',
  arrowleft: 'esquerda', a: 'esquerda', arrowright: 'direita', d: 'direita',
};

document.addEventListener('keydown', (e) => {
  const campo = document.activeElement;
  // offsetParent nulo = o campo está escondido. Sem isso, quem entrava dando
  // Enter no nome ficava com o foco preso no campo da tela de entrada (já
  // oculta) e o teclado não movia o boneco.
  const digitando = campo && ['INPUT', 'TEXTAREA', 'SELECT'].includes(campo.tagName)
    && campo.offsetParent !== null;

  if (e.key === 'Enter' && !digitando) { document.getElementById('campo-chat').focus(); e.preventDefault(); return; }
  if (e.key === 'Escape' && digitando) { campo.blur(); return; }
  if (e.key === 'Escape') { encolherTiles(); fecharEditor(); }
  if (digitando) return;

  const dir = MAPA_TECLAS[e.key.toLowerCase()];
  if (dir) { Jogo.teclas.add(dir); e.preventDefault(); return; }
  if (e.key.toLowerCase() === 'm') alternarMic();
  if (e.key.toLowerCase() === 'v') alternarCam();
  if (e.key.toLowerCase() === 't') alternarTela();
  if (e.key.toLowerCase() === 'b') abrirEditor();
  if (e.key.toLowerCase() === 'e') Editor.alternar();
  if ((e.key === 'Delete' || e.key === 'Backspace') && Editor.ativo) Editor.removerSelecionado();
  if (e.key.toLowerCase() === 'r') reagir();
});

document.addEventListener('keyup', (e) => {
  const dir = MAPA_TECLAS[e.key.toLowerCase()];
  if (dir) Jogo.teclas.delete(dir);
});

window.addEventListener('blur', () => Jogo.teclas.clear());

/* Clique no chão: um clique manda caminhar até lá (contornando os móveis);
   segurar o botão anda na direção do cursor. Com o editor aberto, o mesmo
   clique vira pincel/arrasto de móvel. */
tela.addEventListener('pointerdown', (e) => {
  tela.setPointerCapture(e.pointerId);
  if (Editor.ativo) { Editor.aoApontar(e, pontoNoMapa(e)); return; }
  Jogo.caminho = null;
  Jogo.clique = { ponto: pontoNoMapa(e), tela: { x: e.clientX, y: e.clientY }, quando: Date.now() };
  tela.dataset.alvo = JSON.stringify(Jogo.clique.ponto);
});
tela.addEventListener('pointermove', (e) => {
  if (Editor.ativo) { Editor.aoMover(pontoNoMapa(e)); return; }
  if (tela.dataset.alvo) tela.dataset.alvo = JSON.stringify(pontoNoMapa(e));
});
tela.addEventListener('pointerup', (e) => {
  if (Editor.ativo) { Editor.aoSoltar(); return; }
  delete tela.dataset.alvo;
  // clique curto e sem arrastar = "vá até ali"
  const c = Jogo.clique;
  Jogo.clique = null;
  if (!c) return;
  const arrastou = Math.hypot(e.clientX - c.tela.x, e.clientY - c.tela.y) > 8;
  if (arrastou || Date.now() - c.quando > 450) return;
  Jogo.caminho = tracarCaminho(Jogo.eu.x, Jogo.eu.y, c.ponto.x, c.ponto.y);
});
tela.addEventListener('pointercancel', () => { Editor.aoSoltar(); delete tela.dataset.alvo; });
tela.addEventListener('contextmenu', (e) => { if (Editor.ativo) e.preventDefault(); });
tela.addEventListener('pointerleave', () => { Editor.cursor = null; });

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

function quadro() {
  atualizar();
  desenhar();
  requestAnimationFrame(quadro);
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
  }
}

/* ==================== quem ouve quem ==================== */

function podemConversar(a, b, jaConectados) {
  const za = zonaDe(a.x, a.y), zb = zonaDe(b.x, b.y);
  const privA = !!(za && za.privada), privB = !!(zb && zb.privada);
  if (privA || privB) return privA && privB && za.id === zb.id;
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  return d <= (jaConectados ? Jogo.config.raio_silencio : Jogo.config.raio_conversa);
}

function volumeEntre(a, b) {
  const za = zonaDe(a.x, a.y);
  if (za && za.privada) return 1;                  // dentro da sala, todos no volume cheio
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
    if (deve && !conectado) Midia.garantirPar(p.id);
    else if (!deve && conectado) Midia.fechar(p.id);
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
window.addEventListener('resize', () => { if (Jogo.eu) ajustarTela(); });

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
  ctx.fillStyle = '#0e1526';
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

  // ---------- salas ----------
  // O que marca a área é o carpete no chão; a sala se anuncia por uma plaquinha
  // flutuante no topo, como no Gather. Retângulo tingido deixava tudo embarrado.
  for (const z of mapa.zonas) {
    const zx = z.x1 * t, zy = z.y1 * t;
    const zw = (z.x2 - z.x1 + 1) * t;
    const texto = (z.privada ? '🔒 ' : '') + z.nome;
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
  }

  // ---------- paredes ----------
  // Parede clara com topo iluminado, rodapé e sombra caindo no chão: é o que
  // dá a sensação de altura sem sair da vista de cima.
  const ehParede = (x, y) => y >= 0 && y < mapa.altura && x >= 0 && x < mapa.largura
    && mapa.paredes[y][x] === '1';
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (!ehParede(x, y)) continue;
      const px = x * t, py = y * t;
      if (!ehParede(x, y + 1)) {                       // sombra projetada no piso
        ctx.fillStyle = 'rgba(90,80,110,.16)';
        ctx.fillRect(px, py + t, t, 6);
      }
      ctx.fillStyle = '#efebe3';
      ctx.fillRect(px, py, t, t);
      if (!ehParede(x, y - 1)) {                       // topo da parede
        ctx.fillStyle = '#fbf9f4';
        ctx.fillRect(px, py, t, 6);
        ctx.fillStyle = '#d9d2c4';
        ctx.fillRect(px, py + 6, t, 2);
      }
      if (!ehParede(x, y + 1)) {                       // rodapé
        ctx.fillStyle = '#cfc7b7';
        ctx.fillRect(px, py + t - 5, t, 5);
        ctx.fillStyle = '#b3a998';
        ctx.fillRect(px, py + t - 2, t, 2);
      }
      if (!ehParede(x - 1, y)) { ctx.fillStyle = 'rgba(180,170,150,.5)'; ctx.fillRect(px, py, 2, t); }
      if (!ehParede(x + 1, y)) { ctx.fillStyle = 'rgba(150,140,120,.35)'; ctx.fillRect(px + t - 2, py, 2, t); }
    }
  }

  // ---------- tapetes (ficam no chão, sob todo o resto) ----------
  const noQuadro = (o) => {
    const info = mapa.catalogo[o.tipo] || { l: 1, a: 1 };
    return o.x + info.l > x0 && o.x < x1 && o.y + info.a > y0 && o.y < y1;
  };
  const visiveis = mapa.objetos.filter(noQuadro);
  for (const o of visiveis) {
    const info = mapa.catalogo[o.tipo];
    if (info && info.camada === 'piso') {
      Objetos.desenhar(ctx, o.tipo, o.x * t, o.y * t, info.l * t, info.a * t);
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
  const fila = [];
  for (const o of visiveis) {
    const info = mapa.catalogo[o.tipo];
    if (!info || info.camada !== 'chao') continue;
    fila.push({ base: (o.y + info.a) * t, desenhar: () =>
      Objetos.desenhar(ctx, o.tipo, o.x * t, o.y * t, info.l * t, info.a * t) });
  }
  const gente = [...Jogo.pessoas.values(), eu];
  for (const pes of gente) {
    fila.push({ base: pes.yr + 13, desenhar: () => desenharAvatar(pes, pes === eu) });
  }
  fila.sort((a, b) => a.base - b.base);
  for (const item of fila) item.desenhar();

  // ---------- o que fica em cima das mesas ----------
  for (const o of visiveis) {
    const info = mapa.catalogo[o.tipo];
    if (info && info.camada === 'mesa') {
      Objetos.desenhar(ctx, o.tipo, o.x * t, o.y * t, info.l * t, info.a * t);
    }
  }

  for (const pes of gente) desenharBolha(pes);

  if (typeof Editor !== 'undefined' && Editor.ativo) Editor.desenhar(ctx, x0, y0, x1, y1);
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

  Boneco.desenhar(ctx, p.aparencia, p.xr, p.yr, p.direcao, Math.floor(p.passo || 0), 2);

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
  ctx.fillStyle = '#0b1120';
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
  await Midia.alternar('audio');
  atualizarBotoesMidia();
  avisarMidia();
}

async function alternarCam() {
  await Midia.alternar('video');
  atualizarBotoesMidia();
  montarTiles();
  avisarMidia();
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
  document.getElementById('btn-mic').classList.toggle('desligado', !Midia.ligado('audio'));
  document.getElementById('btn-cam').classList.toggle('desligado', !Midia.ligado('video'));
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
document.getElementById('btn-reacao').onclick = reagir;
document.getElementById('btn-sair').onclick = () => {
  Midia.fecharTudo();
  if (Jogo.ws) Jogo.ws.close();
  location.reload();
};

/* ==================== editar o boneco dentro da sala ==================== */

let editorSala = null;

function abrirEditor() {
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
  localStorage.setItem('escritorio:nome', nome);
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
        const jaAberto = tile.classList.contains('expandido');
        encolherTiles();
        if (!jaAberto) tile.classList.add('expandido');
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
}

function encolherTiles() {
  document.querySelectorAll('.video-tile.expandido').forEach((t) => t.classList.remove('expandido'));
}

// mantém o anel verde nos tiles de quem está falando
setInterval(() => {
  for (const tile of document.getElementById('videos').children) {
    tile.classList.toggle('falando', Midia.nivel(tile.dataset.id) > 0.15);
  }
}, 200);

/* ==================== pessoas e chat ==================== */

function desenharListaPessoas() {
  if (!Jogo.eu) return;
  const ul = document.getElementById('lista-pessoas');
  const lista = [Jogo.eu, ...Jogo.pessoas.values()];
  ul.innerHTML = '';
  for (const p of lista) {
    const souEu = p.id === Jogo.eu.id;
    const perto = !souEu && Midia.pares.has(p.id);
    const zona = zonaDe(p.x, p.y);
    const li = document.createElement('li');
    li.innerHTML = `<img class="bolinha" src="${Boneco.retrato(p.aparencia)}" alt="">
      <span>${escapar(p.nome)}${souEu ? ' (você)' : ''}</span>
      <span class="onde ${perto ? 'perto' : ''}">${(souEu ? Midia.telaStream : p.tela) ? '🖥️ ' : ''}${perto ? '🔊 perto' : (zona ? escapar(zona.nome) : 'corredor')}</span>`;
    ul.appendChild(li);
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
  caixa.scrollTop = caixa.scrollHeight;
  while (caixa.children.length > 200) caixa.removeChild(caixa.firstChild);
}

document.getElementById('form-chat').addEventListener('submit', (e) => {
  e.preventDefault();
  const campo = document.getElementById('campo-chat');
  const texto = campo.value.trim();
  if (!texto) return;
  enviar({ tipo: 'chat', texto, escopo: document.getElementById('escopo-chat').value });
  campo.value = '';
});
