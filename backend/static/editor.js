/* Editor do escritório — o "Mapmaker" caseiro.
 *
 * Toda edição é uma mensagem para o servidor (`{tipo:'editar', acao:{...}}`);
 * quem valida e grava é ele, e todo mundo na sala recebe o mapa novo na hora.
 * Aqui em cima só existe a interface: paleta, pincel, arrasto e a prévia.    */

const Editor = {
  ativo: false,
  ferramenta: 'mobilia',
  redesenhando: null,
  tipoSel: 'mesa',
  pisoSel: 'c',
  selecionado: null,
  arrasto: null,
  menu: null,          // popup aberto em cima de um móvel
  movendo: null,       // móvel “na mão”, esperando o clique que solta
  pincel: null,          // traço em andamento de parede/piso
  retangulo: null,       // retângulo de sala em andamento
  cursor: null,
  giro: 0,                       // 0..3 (×90°) do móvel que vai ser colocado
  enviar: null,
  jogo: null,

  configurar({ enviar, jogo }) {
    this.enviar = enviar;
    this.jogo = jogo;
  },

  acao(acao) { this.enviar({ tipo: 'editar', acao }); },

  /* ==================== abrir e fechar ==================== */

  alternar() {
    this.ativo = !this.ativo;
    this.selecionado = null;
    this.movendo = null;
    this.fecharMenu();
    document.getElementById('btn-editor').classList.toggle('ligado', this.ativo);
    document.body.classList.toggle('editando', this.ativo);
    if (this.ativo) this.montarPainel();
    else {
      const p = document.getElementById('editor');
      if (p) p.remove();
    }
  },

  /* ==================== painel ==================== */

  montarPainel() {
    const antigo = document.getElementById('editor');
    if (antigo) antigo.remove();

    const mapa = this.jogo.mapa;
    const painel = document.createElement('div');
    painel.id = 'editor';
    painel.className = 'editor-painel';
    painel.innerHTML = `
      <div class="cabeca">
        <strong>🏗️ Editar escritório</strong>
        <button class="fechar" title="Fechar (E)">✕</button>
      </div>
      <div class="ferramentas">
        ${[['mobilia', '🪑', 'Móveis'], ['piso', '🎨', 'Piso'], ['parede', '🧱', 'Parede'],
           ['sala', '🚪', 'Salas'], ['inicio', '📍', 'Entrada'], ['apagar', '🗑️', 'Apagar']]
          .map(([id, ic, nome]) => `<button data-fer="${id}" title="${nome}">${ic}<span>${nome}</span></button>`)
          .join('')}
      </div>
      <div class="conteudo" id="editor-conteudo"></div>
      <div class="rodape">
        <button id="editor-desfazer" title="Desfazer a última edição">↩︎ Desfazer</button>
        <button id="editor-ampliar" title="Mais espaço para novas salas">⤢ Ampliar</button>
        <button id="editor-padrao" title="Joga fora as edições e volta à planta original">♻︎</button>
      </div>
      <p class="ajuda" id="editor-ajuda"></p>`;
    document.querySelector('.palco').appendChild(painel);

    painel.querySelector('.fechar').onclick = () => this.alternar();
    painel.querySelectorAll('[data-fer]').forEach((b) => {
      b.onclick = () => this.usarFerramenta(b.dataset.fer);
    });
    document.getElementById('editor-desfazer').onclick = () => this.acao({ acao: 'desfazer' });
    document.getElementById('editor-ampliar').onclick = () => this.ampliar();
    document.getElementById('editor-padrao').onclick = () => {
      if (confirm('Voltar para a planta original? Tudo o que foi editado se perde.')) {
        this.acao({ acao: 'padrao' });
      }
    };
    this.usarFerramenta(this.ferramenta);
  },

  usarFerramenta(fer) {
    this.ferramenta = fer;
    this.selecionado = null;
    this.retangulo = null;
    this.movendo = null;
    this.fecharMenu();
    document.querySelectorAll('#editor [data-fer]').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.fer === fer);
    });
    const alvo = document.getElementById('editor-conteudo');
    const ajuda = document.getElementById('editor-ajuda');
    alvo.innerHTML = '';

    if (fer === 'mobilia') {
      ajuda.textContent = this.AJUDA_MOBILIA;
      const barra = document.createElement('div');
      barra.className = 'barra-giro';
      barra.innerHTML = '<button id="editor-girar" type="button" title="Girar 90° (tecla G)">'
        + '↻ Girar</button><span>fica valendo para o próximo móvel</span>';
      barra.querySelector('button').onclick = () => this.girar();
      barra.querySelector('button').setAttribute('aria-pressed', this.giro !== 0);
      alvo.appendChild(barra);
      const cat = this.jogo.mapa.catalogo;
      const grupos = {};
      for (const [tipo, info] of Object.entries(cat)) {
        (grupos[info.grupo] = grupos[info.grupo] || []).push([tipo, info]);
      }
      for (const [grupo, itens] of Object.entries(grupos)) {
        const bloco = document.createElement('div');
        bloco.className = 'grupo';
        bloco.innerHTML = `<div class="titulo">${grupo}</div>`;
        const grade = document.createElement('div');
        grade.className = 'paleta';
        for (const [tipo, info] of itens) {
          const b = document.createElement('button');
          b.title = `${info.nome} (${info.l}×${info.a})`;
          b.innerHTML = `<img src="${Objetos.miniatura(tipo, info.l, info.a, 44)}" alt="">`;
          b.setAttribute('aria-pressed', tipo === this.tipoSel);
          b.onclick = () => {
            this.tipoSel = tipo;
            grade.parentElement.parentElement.querySelectorAll('.paleta button')
              .forEach((o) => o.setAttribute('aria-pressed', o === b));
          };
          grade.appendChild(b);
        }
        bloco.appendChild(grade);
        alvo.appendChild(bloco);
      }

    } else if (fer === 'piso') {
      ajuda.textContent = 'Arraste para pintar o chão. Segure Shift para preencher um retângulo.';
      const grade = document.createElement('div');
      grade.className = 'paleta pisos';
      for (const [id, nome] of Object.entries(this.jogo.mapa.pisos)) {
        const b = document.createElement('button');
        b.className = 'piso-' + id;
        b.textContent = nome;
        b.setAttribute('aria-pressed', id === this.pisoSel);
        b.onclick = () => {
          this.pisoSel = id;
          grade.querySelectorAll('button').forEach((o) => o.setAttribute('aria-pressed', o === b));
        };
        grade.appendChild(b);
      }
      alvo.appendChild(grade);

    } else if (fer === 'parede') {
      ajuda.textContent = 'Arraste para levantar parede. Alt (ou botão direito) derruba. '
        + 'Segure Shift para preencher um retângulo inteiro.';

    } else if (fer === 'sala') {
      ajuda.textContent = 'Arraste no mapa para desenhar a sala. Ela vem com parede, porta e piso.';
      this.listarSalas(alvo);

    } else if (fer === 'inicio') {
      ajuda.textContent = 'Clique onde quem entra deve aparecer.';

    } else if (fer === 'apagar') {
      ajuda.textContent = 'Clique num móvel para remover.';
    }
  },

  listarSalas(alvo) {
    const lista = document.createElement('div');
    lista.className = 'salas';
    for (const z of this.jogo.mapa.zonas) {
      const li = document.createElement('div');
      li.className = 'sala-item';
      if (this.redesenhando === z.id) li.classList.add('redesenhando');
      li.innerHTML = `<span class="ponto" style="background:${z.cor}"></span>
        <button class="nome" title="Renomear / trocar cor">${z.privada ? '🔒 ' : ''}${z.nome}</button>
        <button title="Aumentar ou diminuir: clique e arraste a área nova no mapa">📐</button>
        <button title="Privada fecha o áudio de quem está dentro">${z.privada ? '🔒' : '🔓'}</button>
        <button title="Remover sala">✕</button>`;
      const [renomear, redesenhar, alternar, remover] = li.querySelectorAll('button');
      renomear.onclick = () => this.formularioSala(z, z);
      redesenhar.onclick = () => {
        this.redesenhando = this.redesenhando === z.id ? null : z.id;
        this.usarFerramenta('sala');
        document.getElementById('editor-ajuda').textContent = this.redesenhando
          ? `Arraste no mapa a área nova de "${z.nome}".`
          : 'Arraste no mapa para marcar uma sala nova.';
      };
      alternar.onclick = () => this.acao({ acao: 'zona', ...z, privada: !z.privada });
      remover.onclick = () => this.acao({ acao: 'zona_remover', id: z.id });
      lista.appendChild(li);
    }
    alvo.appendChild(lista);
  },

  formularioSala(ret, existente) {
    const cores = ['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#f97316',
                   '#a855f7', '#ec4899', '#22c55e', '#64748b'];
    const cor = existente ? existente.cor : cores[Math.floor(Math.random() * cores.length)];
    const caixa = document.createElement('div');
    caixa.className = 'sala-form';
    caixa.innerHTML = `
      <div class="titulo">${existente ? 'Editar sala' : 'Sala nova'} (${ret.x2 - ret.x1 + 1}×${ret.y2 - ret.y1 + 1})</div>
      <input id="sala-nome" placeholder="Nome da sala" maxlength="28" value="${existente ? existente.nome : 'Sala'}">
      <label><input type="checkbox" id="sala-privada" ${!existente || existente.privada ? 'checked' : ''}>
        🔒 Áudio fechado (só quem está dentro)</label>
      ${existente ? '' : `<label><input type="checkbox" id="sala-paredes" checked>
        🧱 Levantar parede em volta, com porta</label>
      <div class="linha-campos">
        <select id="sala-piso">${Object.entries(this.jogo.mapa.pisos)
          .map(([id, nome]) => `<option value="${id}">${nome}</option>`).join('')}</select>
        <select id="sala-porta">
          <option value="baixo">Porta embaixo</option>
          <option value="cima">Porta em cima</option>
          <option value="esquerda">Porta à esquerda</option>
          <option value="direita">Porta à direita</option>
        </select>
      </div>`}
      <div class="cores">${cores.map((c) => `<button data-cor="${c}" style="background:${c}"
        aria-pressed="${c === cor}"></button>`).join('')}</div>
      <div class="botoes"><button id="sala-ok" class="ok">Criar</button>
        <button id="sala-cancelar">Cancelar</button></div>`;
    document.getElementById('editor-conteudo').prepend(caixa);
    let corSel = cor;
    caixa.querySelectorAll('[data-cor]').forEach((b) => {
      b.onclick = () => {
        corSel = b.dataset.cor;
        caixa.querySelectorAll('[data-cor]').forEach((o) => o.setAttribute('aria-pressed', o === b));
      };
    });
    const fechar = () => { caixa.remove(); this.retangulo = null; };
    caixa.querySelector('#sala-cancelar').onclick = fechar;
    caixa.querySelector('#sala-ok').onclick = () => {
      const comum = {
        nome: document.getElementById('sala-nome').value.trim() || 'Sala',
        privada: document.getElementById('sala-privada').checked, cor: corSel,
        x1: ret.x1, y1: ret.y1, x2: ret.x2, y2: ret.y2,
      };
      const paredes = document.getElementById('sala-paredes');
      if (!existente && paredes && paredes.checked) {
        this.acao({ acao: 'montar_sala', ...comum,
                    piso: document.getElementById('sala-piso').value,
                    porta: document.getElementById('sala-porta').value });
      } else {
        this.acao({ acao: 'zona', id: existente ? existente.id : undefined, ...comum });
      }
      fechar();
    };
    document.getElementById('sala-nome').select();
  },

  ampliar() {
    const m = this.jogo.mapa;
    this.acao({ acao: 'tamanho', largura: m.largura + 6, altura: m.altura + 4 });
  },

  /* ==================== mapa: apontar, arrastar, soltar ==================== */

  _tile(ponto) {
    return { x: Math.floor(ponto.x / this.jogo.tile), y: Math.floor(ponto.y / this.jogo.tile) };
  },

  objetoEm(tx, ty) {
    const cat = this.jogo.mapa.catalogo;
    // de trás para frente: pega o que está por cima
    for (let i = this.jogo.mapa.objetos.length - 1; i >= 0; i--) {
      const o = this.jogo.mapa.objetos[i];
      const info = cat[o.tipo];
      if (!info) continue;
      const m = Objetos.medida(o.tipo, info, o.g);
      if (tx >= o.x && tx < o.x + m.l && ty >= o.y && ty < o.y + m.a) return o;
    }
    return null;
  },

  aoApontar(e, ponto) {
    const t = this._tile(ponto);
    this.cursor = t;
    const apagando = e.button === 2 || e.altKey;

    if (this.ferramenta === 'mobilia' && !apagando) {
      if (this.movendo) {                          // segundo clique: solta aqui
        const m = this.movendo;
        this.movendo = null;
        this.acao({ acao: 'mover', id: m.id, x: t.x + m.dx, y: t.y + m.dy });
        return;
      }
      const alvo = this.objetoEm(t.x, t.y);
      if (alvo) {
        // guarda o arrasto, mas só vira movimento se a pessoa arrastar de fato:
        // um clique seco abre o menu do móvel.
        this.fecharMenu();
        this.selecionado = alvo;
        this.arrasto = { id: alvo.id, dx: alvo.x - t.x, dy: alvo.y - t.y,
                         x: alvo.x, y: alvo.y, ox: alvo.x, oy: alvo.y };
      } else {
        this.fecharMenu();
        this.acao({ acao: 'objeto', tipo: this.tipoSel, x: t.x, y: t.y, g: this.giro });
      }
    } else if (this.ferramenta === 'apagar' || (this.ferramenta === 'mobilia' && apagando)) {
      const alvo = this.objetoEm(t.x, t.y);
      if (alvo) this.acao({ acao: 'remover', id: alvo.id });
    } else if (this.ferramenta === 'parede') {
      this.pincel = { tipo: 'parede', valor: !apagando, tiles: [[t.x, t.y]],
                      retangulo: e.shiftKey, inicio: t };
    } else if (this.ferramenta === 'piso') {
      this.pincel = { tipo: 'piso', piso: this.pisoSel, tiles: [[t.x, t.y]],
                      retangulo: e.shiftKey, inicio: t };
    } else if (this.ferramenta === 'sala') {
      this.retangulo = { x1: t.x, y1: t.y, x2: t.x, y2: t.y, arrastando: true };
    } else if (this.ferramenta === 'inicio') {
      this.acao({ acao: 'nascimento', x: t.x, y: t.y });
    }
  },

  aoMover(ponto) {
    const t = this._tile(ponto);
    this.cursor = t;
    if (this.arrasto) {
      this.arrasto.x = t.x + this.arrasto.dx;
      this.arrasto.y = t.y + this.arrasto.dy;
    } else if (this.pincel) {
      if (this.pincel.retangulo) {                 // Shift: preenche o retângulo
        const i = this.pincel.inicio;
        const tiles = [];
        for (let y = Math.min(i.y, t.y); y <= Math.max(i.y, t.y); y++) {
          for (let x = Math.min(i.x, t.x); x <= Math.max(i.x, t.x); x++) tiles.push([x, y]);
        }
        this.pincel.tiles = tiles;
      } else {
        const ja = this.pincel.tiles;
        const ultimo = ja[ja.length - 1];
        if (ultimo[0] !== t.x || ultimo[1] !== t.y) ja.push([t.x, t.y]);
      }
    } else if (this.retangulo && this.retangulo.arrastando) {
      this.retangulo.x2 = t.x;
      this.retangulo.y2 = t.y;
    }
  },

  aoSoltar() {
    if (this.arrasto) {
      const a = this.arrasto;
      this.arrasto = null;
      if (a.x === a.ox && a.y === a.oy) {          // clique seco: abre o menu
        this.abrirMenu(a.id);
      } else {
        const alvo = this.jogo.mapa.objetos.find((o) => o.id === a.id);
        if (alvo && (alvo.x !== a.x || alvo.y !== a.y)) {
          this.acao({ acao: 'mover', id: a.id, x: a.x, y: a.y });
        }
      }
    } else if (this.pincel) {
      const traco = this.pincel;
      this.pincel = null;
      if (traco.tipo === 'parede') this.acao({ acao: 'parede', valor: traco.valor, tiles: traco.tiles });
      else this.acao({ acao: 'piso', piso: traco.piso, tiles: traco.tiles });
    } else if (this.retangulo && this.retangulo.arrastando) {
      const r = this.retangulo;
      this.retangulo = {
        x1: Math.min(r.x1, r.x2), y1: Math.min(r.y1, r.y2),
        x2: Math.max(r.x1, r.x2), y2: Math.max(r.y1, r.y2), arrastando: false,
      };
      if (this.redesenhando) {
        // redesenhar mantém id, nome e cor: é a mesma sala, com outra área
        const z = this.jogo.mapa.zonas.find((x) => x.id === this.redesenhando);
        this.redesenhando = null;
        if (z) {
          this.acao({ acao: 'zona', ...z, x1: this.retangulo.x1, y1: this.retangulo.y1,
                      x2: this.retangulo.x2, y2: this.retangulo.y2 });
          this.retangulo = null;
          return;
        }
      }
      this.formularioSala(this.retangulo);
    }
  },

  removerSelecionado() {
    if (this.selecionado) {
      this.acao({ acao: 'remover', id: this.selecionado.id });
      this.selecionado = null;
    }
  },

  /** Gira 90°. Se tem móvel na mão ou selecionado, gira ele; senão gira o que
   *  ainda vai ser colocado (a prévia embaixo do cursor). */
  girar() {
    // só gira um móvel do mapa quando ele está na mão ou com o menu aberto —
    // senão G viraria o último clicado em vez da prévia
    const alvo = this.movendo || (this.menu && this.selecionado);
    if (alvo) {
      this.acao({ acao: 'girar', id: alvo.id });
      return;
    }
    this.giro = (this.giro + 1) % 4;
    const b = document.getElementById('editor-girar');
    if (b) b.setAttribute('aria-pressed', this.giro !== 0);
    this._avisarGiro();
  },

  _avisarGiro() {
    const ajuda = document.getElementById('editor-ajuda');
    if (!ajuda || this.ferramenta !== 'mobilia') return;
    ajuda.textContent = this.giro
      ? `Girado ${this.giro * 90}° — clique no mapa para colocar assim. G gira mais.`
      : this.AJUDA_MOBILIA;
  },

  AJUDA_MOBILIA: 'Clique no mapa para colocar; G (ou o botão ↻) gira antes. '
    + 'Clique num móvel para abrir o menu (girar, mover, trocar, remover); arrastar também move.',

  /** Prévia do móvel que está sendo carregado, com ou sem o editor aberto. */
  desenharNaMao(ctx) {
    if (!this.movendo || !this.cursor) return;
    const mapa = this.jogo.mapa;
    const t = this.jogo.tile;
    const alvo = mapa.objetos.find((o) => o.id === this.movendo.id);
    if (!alvo) return;
    const m = Objetos.medida(alvo.tipo, mapa.catalogo[alvo.tipo], alvo.g);
    ctx.globalAlpha = 0.6;
    Objetos.desenhar(ctx, alvo.tipo, this.cursor.x * t, this.cursor.y * t,
                     m.l * t, m.a * t, alvo.g);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.cursor.x * t, this.cursor.y * t, m.l * t, m.a * t);
  },

  /* ==================== menu do móvel ==================== */

  fecharMenu() {
    if (this.menu) { this.menu.remove(); this.menu = null; }
  },

  /** Onde, na tela, está o canto do tile (tx, ty). */
  _naTela(tx, ty) {
    const r = document.getElementById('tela').getBoundingClientRect();
    const e = this.jogo.escala || 1.5;
    const palco = document.querySelector('.palco').getBoundingClientRect();
    return {
      x: r.left - palco.left + (tx * this.jogo.tile - this.jogo.camera.x) * e,
      y: r.top - palco.top + (ty * this.jogo.tile - this.jogo.camera.y) * e,
    };
  },

  abrirMenu(id) {
    this.fecharMenu();
    const mapa = this.jogo.mapa;
    const o = mapa.objetos.find((x) => x.id === id);
    if (!o) return;
    const info = mapa.catalogo[o.tipo];
    const m = Objetos.medida(o.tipo, info, o.g);
    const pos = this._naTela(o.x + m.l / 2, o.y);

    const caixa = document.createElement('div');
    caixa.className = 'menu-movel';
    caixa.innerHTML = `
      <div class="cabeca">
        <img src="${Objetos.miniatura(o.tipo, info.l, info.a, 34, o.g)}" alt="">
        <div><strong>${info.nome}</strong><span>${m.l}×${m.a} · ${info.grupo}</span></div>
      </div>
      <div class="acoes">
        <button data-fazer="girar">↻ Girar</button>
        <button data-fazer="mover">✋ Mover</button>
        <button data-fazer="trocar">🔁 Trocar</button>
        <button data-fazer="remover" class="perigo">🗑️ Remover</button>
      </div>
      <div class="troca oculto"></div>`;
    document.querySelector('.palco').appendChild(caixa);
    this.menu = caixa;
    caixa.style.left = Math.max(8, Math.min(pos.x - 96, window.innerWidth - 500)) + 'px';
    caixa.style.top = Math.max(8, pos.y - 12) + 'px';

    caixa.querySelector('[data-fazer="girar"]').onclick = () => {
      this.acao({ acao: 'girar', id: o.id });
      this.fecharMenu();
    };
    caixa.querySelector('[data-fazer="mover"]').onclick = () => {
      this.movendo = { id: o.id, dx: 0, dy: 0 };
      this.fecharMenu();
      const ajuda = document.getElementById('editor-ajuda');
      if (ajuda) ajuda.textContent = 'Clique onde o móvel deve ficar (Esc cancela).';
    };
    caixa.querySelector('[data-fazer="remover"]').onclick = () => {
      this.acao({ acao: 'remover', id: o.id });
      this.fecharMenu();
    };
    caixa.querySelector('[data-fazer="trocar"]').onclick = () => {
      const alvo = caixa.querySelector('.troca');
      alvo.classList.toggle('oculto');
      if (alvo.childElementCount) return;
      // qualquer móvel que caiba no espaço atual, do mais parecido ao menor —
      // trocar por um maior invadiria o vizinho
      const cabem = Object.entries(mapa.catalogo)
        .filter(([tipo, i]) => tipo !== o.tipo && i.l <= info.l && i.a <= info.a)
        .sort((a, b) => (info.l - a[1].l) + (info.a - a[1].a) - ((info.l - b[1].l) + (info.a - b[1].a)));
      for (const [tipo, i] of cabem) {
        const b = document.createElement('button');
        b.title = i.nome;
        b.innerHTML = `<img src="${Objetos.miniatura(tipo, i.l, i.a, 34)}" alt="">`;
        b.onclick = () => { this.acao({ acao: 'trocar', id: o.id, tipo }); this.fecharMenu(); };
        alvo.appendChild(b);
      }
      if (!alvo.childElementCount) {
        alvo.innerHTML = '<p class="vazio">Nenhum outro móvel desse tamanho.</p>';
      }
    };
  },

  /* ==================== menu da sala ==================== */

  abrirMenuSala(id) {
    this.fecharMenu();
    const mapa = this.jogo.mapa;
    const z = mapa.zonas.find((x) => x.id === id);
    if (!z) return;
    const pos = this._naTela((z.x1 + z.x2 + 1) / 2, z.y1);

    const cores = ['#8b7fd0', '#6f9fd8', '#4fae91', '#c99a4a', '#d9776a',
                   '#a889cc', '#d9789e', '#5aa86e', '#8a8f9c'];
    let corSel = z.cor;
    const caixa = document.createElement('div');
    caixa.className = 'menu-movel menu-sala';
    caixa.innerHTML = `
      <div class="cabeca">
        <span class="ponto-sala" style="background:${z.cor}"></span>
        <div><strong>Sala</strong><span>${z.x2 - z.x1 + 1}×${z.y2 - z.y1 + 1} tiles</span></div>
      </div>
      <input id="sala-menu-nome" maxlength="28" value="${z.nome.replace(/"/g, '&quot;')}">
      <label><input type="checkbox" id="sala-menu-privada" ${z.privada ? 'checked' : ''}>
        🔒 Áudio fechado</label>
      <div class="cores">${cores.map((c) => `<button data-cor="${c}" style="background:${c}"
        aria-pressed="${c === z.cor}"></button>`).join('')}</div>
      <div class="acoes">
        <button data-fazer="salvar" class="ok">Salvar</button>
        <button data-fazer="area">📐 Área</button>
        <button data-fazer="remover" class="perigo">🗑️</button>
      </div>
      <p class="dica">📐 redesenha o espaço da sala. Para mudar as <b>paredes</b>,
        use 🧱 no editor (Shift preenche um retângulo).</p>`;
    document.querySelector('.palco').appendChild(caixa);
    this.menu = caixa;
    caixa.style.left = Math.max(8, Math.min(pos.x - 110, window.innerWidth - 520)) + 'px';
    caixa.style.top = Math.max(8, pos.y + 26) + 'px';

    caixa.querySelectorAll('[data-cor]').forEach((b) => {
      b.onclick = () => {
        corSel = b.dataset.cor;
        caixa.querySelectorAll('[data-cor]').forEach((o) => o.setAttribute('aria-pressed', o === b));
      };
    });
    const nome = caixa.querySelector('#sala-menu-nome');
    const salvar = () => {
      this.acao({ acao: 'zona', ...z, nome: nome.value.trim() || z.nome, cor: corSel,
                  privada: caixa.querySelector('#sala-menu-privada').checked });
      this.fecharMenu();
    };
    caixa.querySelector('[data-fazer="salvar"]').onclick = salvar;
    nome.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') salvar(); });
    caixa.querySelector('[data-fazer="remover"]').onclick = () => {
      this.acao({ acao: 'zona_remover', id: z.id });
      this.fecharMenu();
    };
    caixa.querySelector('[data-fazer="area"]').onclick = () => {
      // redesenhar exige as ferramentas: abre o editor já na hora certa
      this.fecharMenu();
      if (!this.ativo) this.alternar();
      this.redesenhando = z.id;
      this.usarFerramenta('sala');
      document.getElementById('editor-ajuda').textContent =
        `Arraste no mapa a área nova de "${z.nome}".`;
    };
    nome.focus();
    nome.select();
  },

  /* ==================== o que aparece por cima do mapa ==================== */

  desenhar(ctx, x0, y0, x1, y1) {
    const t = this.jogo.tile;
    const mapa = this.jogo.mapa;

    ctx.strokeStyle = 'rgba(148,163,184,.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x <= x1; x++) { ctx.moveTo(x * t, y0 * t); ctx.lineTo(x * t, y1 * t); }
    for (let y = y0; y <= y1; y++) { ctx.moveTo(x0 * t, y * t); ctx.lineTo(x1 * t, y * t); }
    ctx.stroke();

    // ponto de entrada
    const [nx, ny] = mapa.nascimento;
    ctx.fillStyle = 'rgba(56,189,248,.35)';
    ctx.fillRect(nx * t, ny * t, t, t);
    ctx.font = '16px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📍', nx * t + t / 2, ny * t + t / 2);

    // traço de parede/piso em andamento
    if (this.pincel) {
      ctx.fillStyle = this.pincel.tipo === 'parede'
        ? (this.pincel.valor ? 'rgba(70,88,120,.75)' : 'rgba(244,63,94,.45)')
        : 'rgba(56,189,248,.45)';
      for (const [x, y] of this.pincel.tiles) ctx.fillRect(x * t, y * t, t, t);
    }

    // móvel sendo arrastado
    if (this.arrasto) {
      const alvo = mapa.objetos.find((o) => o.id === this.arrasto.id);
      const m = Objetos.medida(alvo.tipo, mapa.catalogo[alvo.tipo], alvo.g);
      ctx.globalAlpha = 0.65;
      Objetos.desenhar(ctx, alvo.tipo, this.arrasto.x * t, this.arrasto.y * t,
                       m.l * t, m.a * t, alvo.g);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.strokeRect(this.arrasto.x * t, this.arrasto.y * t, m.l * t, m.a * t);
    } else if (this.movendo && this.cursor) {
      this.desenharNaMao(ctx);
    } else if (this.cursor && this.ferramenta === 'mobilia') {
      const info = mapa.catalogo[this.tipoSel];       // prévia do que vai ser colocado
      if (info) {
        const m = Objetos.medida(this.tipoSel, info, this.giro);
        ctx.globalAlpha = 0.45;
        Objetos.desenhar(ctx, this.tipoSel, this.cursor.x * t, this.cursor.y * t,
                         m.l * t, m.a * t, this.giro);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(56,189,248,.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.cursor.x * t, this.cursor.y * t, m.l * t, m.a * t);
      }
    }

    // retângulo da sala nova
    if (this.retangulo) {
      const r = this.retangulo;
      const x = Math.min(r.x1, r.x2) * t, y = Math.min(r.y1, r.y2) * t;
      const w = (Math.abs(r.x2 - r.x1) + 1) * t, h = (Math.abs(r.y2 - r.y1) + 1) * t;
      ctx.fillStyle = 'rgba(56,189,248,.18)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#38bdf8';
      ctx.setLineDash([8, 5]);
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }

    if (this.selecionado) {
      const o = mapa.objetos.find((x) => x.id === this.selecionado.id);
      if (o) {
        const m = Objetos.medida(o.tipo, mapa.catalogo[o.tipo], o.g);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.strokeRect(o.x * t + 1, o.y * t + 1, m.l * t - 2, m.a * t - 2);
      }
    }
  },
};
