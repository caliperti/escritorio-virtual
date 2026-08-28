/* Os móveis do escritório — visual moderno, no espírito do Gather.
 *
 * Regras que valem para todas as peças (é o que faz o cenário parecer de um
 * artista só, e não uma colcha de retalhos):
 *
 *   1. vista 3/4: vê-se o tampo E uma faixa da frente, sempre com a mesma
 *      altura de frente (FRENTE px) — é isso que dá volume;
 *   2. luz de cima: linha clara no topo de cada peça, sombra na base;
 *   3. contorno discreto, tingido pela própria cor (nada de preto duro);
 *   4. paleta fixa e clara embaixo — o escritório é bege/branco, e a cor forte
 *      fica para os carpetes das áreas e para as telas.
 *
 * O que ocupa e bloqueia está no servidor (`mapa.py:CATALOGO`).            */

const Objetos = {
  // paleta única do escritório
  TAMPO: '#efece6',
  TAMPO_ESC: '#d8d3c8',
  BORDA: '#bdb6a8',
  PE: '#8f887b',
  MADEIRA: '#caa274',
  MADEIRA_ESC: '#a9835a',
  CADEIRA: '#4f5665',
  CADEIRA_LUZ: '#657081',
  METAL: '#b9bdc6',
  ESCURO: '#2c303a',
  TELA: '#5e93d8',
  VERDE: '#55a06a',
  VERDE_ESC: '#3f7c50',
  VASO: '#c98159',
  TECIDO: '#d9d3c7',
  ESTOFADO: '#b6c4dc',            // estofado azul-acinzentado dos sofás
  ALMOFADA: '#8fa8cf',
  FRENTE: 7,                       // altura da faceta frontal, em pixels

  SEM_SOMBRA: new Set(['tapete', 'tapete_redondo', 'quadro', 'relogio', 'palco', 'divisoria']),

  /* ---------- cor ---------- */
  _rgb(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; },
  mix(a, b, t) {
    const x = this._rgb(a), y = this._rgb(b);
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
  },
  sombra(c, q) { return this.mix(c, '#3a3550', q === undefined ? 0.2 : q); },
  luz(c, q) { return this.mix(c, '#fffdf6', q === undefined ? 0.35 : q); },
  traco(c) { return this.mix(c, '#2a2438', 0.55); },

  /* ---------- pincéis ---------- */
  ret(c, x, y, w, h, r, cor) {
    if (w <= 0 || h <= 0) return;
    c.fillStyle = cor;
    const raio = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + raio, y);
    c.arcTo(x + w, y, x + w, y + h, raio);
    c.arcTo(x + w, y + h, x, y + h, raio);
    c.arcTo(x, y + h, x, y, raio);
    c.arcTo(x, y, x + w, y, raio);
    c.closePath();
    c.fill();
  },
  elipse(c, cx, cy, rx, ry, cor) {
    c.fillStyle = cor;
    c.beginPath();
    c.ellipse(cx, cy, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2);
    c.fill();
  },
  sombraChao(c, x, y, w, h) {
    c.fillStyle = 'rgba(70,60,90,.13)';
    c.beginPath();
    c.ellipse(x + w / 2, y + h - 3, w * 0.42, Math.min(h * 0.15, 6), 0, 0, Math.PI * 2);
    c.fill();
  },

  /** Peça em 3/4: tampo + faceta da frente + contorno. A base de quase tudo. */
  bloco(c, x, y, w, h, cor, r) {
    const raio = r === undefined ? 4 : r;
    const f = this.FRENTE;
    this.ret(c, x, y, w, h, raio, this.traco(cor));                       // contorno
    this.ret(c, x + 1, y + h - f - 1, w - 2, f, raio * 0.7, this.sombra(cor, 0.28));  // frente
    this.ret(c, x + 1, y + 1, w - 2, h - f - 1, raio, cor);               // tampo
    this.ret(c, x + 3, y + 2, w - 6, 2, 1, this.luz(cor, 0.5));           // luz de cima
  },

  /** Coisas que ficam **em pé** na mesa. Girar a arte delas deixaria a tela de
   *  ponta-cabeça; o que gira é a direção para onde o objeto olha, então em vez
   *  de rodar o desenho a gente troca a vista: frente, lado e costas. */
  EM_PE: new Set([
    'monitor', 'monitor_duplo', 'monitor_curvo', 'monitor_gamer', 'monitor_triplo',
    'monitor_vertical', 'imac', 'torre', 'torre_grande', 'notebook', 'tablet',
    'microfone', 'impressora', 'luminaria_mesa', 'fone_mesa', 'teclado', 'mouse',
    'caneca', 'papeis', 'telefone', 'vasinho', 'livros', 'bolo',
  ]),
  VISTAS: ['frente', 'direita', 'tras', 'esquerda'],
  _vista: 'frente',

  /** Fileiras de monitor: as únicas peças de ficar em pé que se enfileiram no
   *  outro eixo quando a mesa está deitada. */
  FILEIRA: new Set(['monitor_duplo', 'monitor_curvo', 'monitor_triplo']),

  /** Espaço que o móvel ocupa no mapa. Deitado (90°/270°), largura e altura
   *  trocam de lugar — a não ser que seja um móvel de ficar em pé. Mesma conta
   *  que `medida()` faz no servidor. */
  medida(tipo, info, giro) {
    const deita = !this.EM_PE.has(tipo) || this.FILEIRA.has(tipo);
    return (deita && ((giro | 0) % 2)) ? { l: info.a, a: info.l }
                                       : { l: info.l, a: info.a };
  },

  /** `x, y, w, h` são a área **já ocupada** no mapa; `giro` é 0..3 (×90°).
   *  A sombra fica sempre no chão, sem girar; só o móvel roda. */
  desenhar(c, tipo, x, y, w, h, giro) {
    const g = (((giro | 0) % 4) + 4) % 4;
    const f = this.DESENHOS[tipo];
    if (!this.SEM_SOMBRA.has(tipo)) this.sombraChao(c, x, y, w, h);
    const pintar = (px, py, pw, ph) => {
      if (f) f.call(this, c, px, py, pw, ph);
      else this.bloco(c, px + 2, py + 2, pw - 4, ph - 4, this.TAMPO);
    };
    if (!g) { pintar(x, y, w, h); return; }
    if (this.EM_PE.has(tipo)) {
      // fica de pé: muda para onde olha, não a inclinação. A caixa já vem
      // girada, então o desenho só precisa se acomodar nela.
      this._vista = this.VISTAS[g];
      if (this._vista === 'esquerda') {          // o perfil do outro lado é o espelho
        c.save(); c.translate(x + w, y); c.scale(-1, 1);
        pintar(0, 0, w, h);
        c.restore();
      } else {
        pintar(x, y, w, h);
      }
      this._vista = 'frente';
      return;
    }
    const lw = (g % 2) ? h : w;                  // tamanho do desenho sem girar
    const lh = (g % 2) ? w : h;
    c.save();
    c.translate(x + w / 2, y + h / 2);
    c.rotate(g * Math.PI / 2);
    c.translate(-lw / 2, -lh / 2);
    pintar(0, 0, lw, lh);
    c.restore();
  },

  DESENHOS: {
    /* ================= mesas ================= */
    mesa(c, x, y, w, h) { this._mesa(c, x, y, w, h); },
    mesa_grande(c, x, y, w, h) { this._mesa(c, x, y, w, h, true); },
    mesa_ampla(c, x, y, w, h) {
      this._mesa(c, x, y, w, h, true);
      // gaveteiro embutido, para a mesa grande não virar uma prancha lisa
      this.ret(c, x + w - 34, y + h - 20, 28, 12, 3, this.sombra(this.TAMPO, 0.2));
      this.ret(c, x + w - 31, y + h - 17, 22, 2, 1, this.METAL);
      this.ret(c, x + w - 31, y + h - 13, 22, 2, 1, this.METAL);
    },
    mesa_canto(c, x, y, w, h) {
      const cor = this.TAMPO;
      this.ret(c, x + 2, y + 2, w - 4, h - 4, 5, this.traco(cor));
      this.ret(c, x + 3, y + h - 12, w - 6, 9, 4, this.sombra(cor, 0.28));
      this.ret(c, x + 3, y + 3, w - 6, h - 13, 5, cor);
      this.ret(c, x + 6, y + 5, w - 12, 2, 1, this.luz(cor, 0.5));
      this.ret(c, x + 6, y + h - 24, 3, 14, 1, this.sombra(cor, 0.14));   // emenda do L
    },
    mesa_reuniao(c, x, y, w, h) {
      const cor = this.MADEIRA;
      this.bloco(c, x + 3, y + 3, w - 6, h - 6, cor, 10);
      this.ret(c, x + 10, y + 9, w - 20, h - 22, 6, this.luz(cor, 0.18));
    },
    mesa_redonda(c, x, y, w, h) {
      const cor = this.TAMPO;
      const cx = x + w / 2, cy = y + h / 2 + 2, rx = w / 2 - 5, ry = h / 2 - 9;
      this.ret(c, cx - 3, cy, 6, h / 2 - 6, 2, this.PE);                  // pé
      this.elipse(c, cx, cy + h / 4, rx * 0.4, 3, this.sombra(cor, 0.3));
      this.elipse(c, cx, cy + 3, rx, ry, this.traco(cor));
      this.elipse(c, cx, cy, rx - 1, ry - 1, cor);
      this.elipse(c, cx - rx * 0.3, cy - ry * 0.35, rx * 0.35, ry * 0.28, this.luz(cor, 0.5));
    },
    balcao(c, x, y, w, h) {
      this.bloco(c, x + 1, y + 2, w - 2, h - 4, this.MADEIRA, 3);
      this.ret(c, x + 3, y + h - 11, w - 6, 4, 2, this.sombra(this.MADEIRA, 0.35));
      this.ret(c, x + 1, y + 2, w - 2, 4, 3, this.TAMPO);                 // tampo claro
    },
    mesa_centro(c, x, y, w, h) {
      this.bloco(c, x + 5, y + 6, w - 10, h - 12, this.TAMPO, 5);
    },

    /* ================= assentos ================= */
    cadeira(c, x, y, w, h) { this._cadeira(c, x, y, w, h, this.CADEIRA); },
    cadeira_gamer(c, x, y, w, h) { this._cadeira(c, x, y, w, h, '#2b2f3a', '#e0453f'); },
    poltrona(c, x, y, w, h) {
      const cor = this.ESTOFADO;
      this.ret(c, x + 3, y + 4, w - 6, h - 8, 8, this.traco(cor));
      this.ret(c, x + 4, y + 5, w - 8, h - 10, 7, cor);
      this.ret(c, x + 8, y + 9, w - 16, h - 17, 5, this.luz(cor, 0.3));
    },
    sofa(c, x, y, w, h) {
      const cor = this.ESTOFADO;
      this.ret(c, x + 2, y + 2, w - 4, h - 4, 9, this.traco(cor));
      this.ret(c, x + 3, y + 3, w - 6, h - 6, 8, this.sombra(cor, 0.16));      // corpo
      this.ret(c, x + 4, y + 4, w - 8, 9, 6, cor);                             // encosto alto
      this.ret(c, x + 7, y + 6, w - 14, 3, 2, this.luz(cor, 0.45));
      this.ret(c, x + 3, y + 8, 9, h - 13, 5, cor);                            // braços
      this.ret(c, x + w - 12, y + 8, 9, h - 13, 5, cor);
      const n = Math.max(2, Math.round((w - 26) / 28));
      const lg = (w - 30 - (n - 1) * 3) / n;
      for (let i = 0; i < n; i++) {                                            // almofadas do assento
        this.ret(c, x + 15 + i * (lg + 3), y + 13, lg, h - 22, 5, this.luz(cor, 0.3));
        this.ret(c, x + 17 + i * (lg + 3), y + 15, lg - 4, 2, 1, this.luz(cor, 0.55));
      }
    },
    banqueta(c, x, y, w, h) {
      const cor = this.CADEIRA;
      this.ret(c, x + w / 2 - 2, y + h - 13, 4, 9, 2, this.PE);
      this.elipse(c, x + w / 2, y + h / 2 - 1, w / 2 - 9, h / 2 - 11, this.traco(cor));
      this.elipse(c, x + w / 2, y + h / 2 - 3, w / 2 - 10, h / 2 - 12, cor);
    },

    /* ================= divisórias e paredes internas ================= */
    divisoria(c, x, y, w, h) {
      // Painel em pé: ocupa o tile inteiro e projeta sombra, senão parece
      // uma pastilha solta no chão.
      const cor = '#c9d2dd';
      c.fillStyle = 'rgba(90,80,110,.16)';
      c.fillRect(x + 2, y + h - 3, w - 4, 5);
      this.ret(c, x + 1, y + 2, w - 2, h - 5, 2, this.traco(cor));
      this.ret(c, x + 2, y + 3, w - 4, h - 7, 2, cor);                    // vidro fosco
      c.save(); c.globalAlpha = 0.5;
      this.ret(c, x + 4, y + 5, w - 8, h - 14, 1, this.luz(cor, 0.7));
      c.restore();
      this.ret(c, x + 1, y + h - 8, w - 2, 5, 2, this.mix(cor, this.PE, 0.55));   // base
      this.ret(c, x + 3, y + 3, w - 6, 2, 1, this.luz(cor, 0.6));
    },

    /* ================= sala ================= */
    planta(c, x, y, w, h) {
      this._vaso(c, x + w / 2, y + h - 7, 8);
      const v = this.VERDE;
      this.elipse(c, x + w / 2, y + h / 2 - 3, 10, 9, this.traco(v));
      this.elipse(c, x + w / 2, y + h / 2 - 4, 9, 8, this.VERDE_ESC);
      this.elipse(c, x + w / 2 - 3, y + h / 2 - 7, 5, 4, v);
      this.elipse(c, x + w / 2 + 4, y + h / 2 - 4, 4, 4, this.luz(v, 0.2));
    },
    planta_alta(c, x, y, w, h) {
      this._vaso(c, x + w / 2, y + h - 9, 11);
      const v = this.VERDE;
      for (const [dx, dy, r] of [[0, 0.42, 13], [-6, 0.3, 8], [6, 0.34, 8], [0, 0.22, 8]]) {
        this.elipse(c, x + w / 2 + dx, y + h * dy, r, r * 0.92, this.traco(v));
        this.elipse(c, x + w / 2 + dx, y + h * dy - 1, r - 1, r * 0.86, dy < 0.3 ? this.luz(v, 0.15) : this.VERDE_ESC);
      }
      this.elipse(c, x + w / 2 - 4, y + h * 0.26, 5, 4, this.luz(v, 0.3));
    },
    estante(c, x, y, w, h) {
      const cor = this.MADEIRA;
      this.ret(c, x + 2, y + 2, w - 4, h - 5, 3, this.traco(cor));
      this.ret(c, x + 3, y + 3, w - 6, h - 7, 2, cor);
      const cores = ['#d9776a', '#6f9fd8', '#e0b563', '#6fb98a', '#a889cc'];
      for (let f = 0; f < 2; f++) {
        const ly = y + 6 + f * ((h - 12) / 2);
        this.ret(c, x + 5, ly + (h - 14) / 2 - 2, w - 10, 3, 1, this.sombra(cor, 0.35));
        for (let i = 0; i < Math.floor((w - 14) / 6); i++) {
          const alt = (h - 16) / 2 - ((i + f) % 3) * 2;
          this.ret(c, x + 6 + i * 6, ly + (h - 14) / 2 - 2 - alt, 4, alt, 1, cores[(i + f) % 5]);
        }
      }
    },
    armario(c, x, y, w, h) {
      const cor = this.TAMPO;
      this.bloco(c, x + 3, y + 3, w - 6, h - 6, cor, 3);
      this.ret(c, x + 6, y + 8, w - 12, 2, 1, this.sombra(cor, 0.25));
      this.ret(c, x + 6, y + h - 16, w - 12, 2, 1, this.sombra(cor, 0.25));
      this.ret(c, x + w / 2 - 4, y + 11, 8, 2, 1, this.METAL);
    },
    quadro(c, x, y, w, h) {
      this.ret(c, x + 2, y + 4, w - 4, h - 12, 3, '#b9b2a5');
      this.ret(c, x + 4, y + 6, w - 8, h - 17, 2, '#fbfaf7');
      c.strokeStyle = '#6f9fd8'; c.lineWidth = 2; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x + 10, y + h - 18); c.lineTo(x + 18, y + 11); c.lineTo(x + 26, y + h - 19);
      c.moveTo(x + w - 30, y + 13); c.lineTo(x + w - 14, y + 13);
      c.stroke();
      this.ret(c, x + 5, y + h - 11, w - 10, 4, 2, '#8f887b');
    },
    tv(c, x, y, w, h) {
      this.ret(c, x + w / 2 - 9, y + h - 9, 18, 4, 2, this.ESCURO);
      this.ret(c, x + 3, y + 3, w - 6, h - 13, 3, this.ESCURO);
      this.ret(c, x + 6, y + 6, w - 12, h - 19, 2, this.mix(this.TELA, this.ESCURO, 0.45));
      c.save(); c.globalAlpha = 0.5;
      this.ret(c, x + 8, y + 8, (w - 16) * 0.45, h - 23, 1, this.luz(this.TELA, 0.4));
      c.restore();
    },
    tapete(c, x, y, w, h) {
      const cor = '#c9bcd8';
      this.ret(c, x + 2, y + 2, w - 4, h - 4, 8, this.sombra(cor, 0.18));
      this.ret(c, x + 4, y + 4, w - 8, h - 8, 6, cor);
      this.ret(c, x + 12, y + 10, w - 24, h - 20, 4, this.luz(cor, 0.35));
    },
    tapete_redondo(c, x, y, w, h) {
      const cor = '#cdbfd6';
      this.elipse(c, x + w / 2, y + h / 2, w / 2 - 3, h / 2 - 3, this.sombra(cor, 0.18));
      this.elipse(c, x + w / 2, y + h / 2, w / 2 - 5, h / 2 - 5, cor);
      this.elipse(c, x + w / 2, y + h / 2, w / 2 - 13, h / 2 - 13, this.luz(cor, 0.3));
    },
    luminaria(c, x, y, w, h) {
      this.elipse(c, x + w / 2, y + h - 7, 9, 3.5, this.PE);
      this.ret(c, x + w / 2 - 2, y + 12, 4, h - 19, 2, this.METAL);
      this.ret(c, x + w / 2 - 10, y + 4, 20, 10, 5, '#f0d9a4');
      this.ret(c, x + w / 2 - 7, y + 5, 14, 3, 2, this.luz('#f0d9a4', 0.6));
      c.save(); c.globalAlpha = 0.22;
      this.elipse(c, x + w / 2, y + 19, 13, 6, '#ffe9b8');
      c.restore();
    },
    relogio(c, x, y, w, h) {
      this.elipse(c, x + w / 2, y + h / 2, 11, 11, this.traco(this.TAMPO));
      this.elipse(c, x + w / 2, y + h / 2, 9.5, 9.5, '#fbfaf7');
      c.strokeStyle = this.ESCURO; c.lineWidth = 1.8; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x + w / 2, y + h / 2); c.lineTo(x + w / 2, y + h / 2 - 5);
      c.moveTo(x + w / 2, y + h / 2); c.lineTo(x + w / 2 + 4, y + h / 2 + 2);
      c.stroke();
    },
    palco(c, x, y, w, h) {
      const cor = this.MADEIRA;
      this.ret(c, x + 2, y + 2, w - 4, h - 4, 4, this.traco(cor));
      this.ret(c, x + 3, y + h - 12, w - 6, 9, 3, this.sombra(cor, 0.3));
      this.ret(c, x + 3, y + 3, w - 6, h - 15, 4, cor);
      for (let i = 1; i < Math.floor(w / 22); i++) {
        this.ret(c, x + 3 + i * 20, y + 5, 1.5, h - 19, 1, this.sombra(cor, 0.14));
      }
    },
    pebolim(c, x, y, w, h) {
      this.ret(c, x + 2, y + 2, w - 4, h - 4, 4, this.traco('#3f7c50'));
      this.ret(c, x + 3, y + h - 12, w - 6, 9, 3, this.MADEIRA_ESC);
      this.ret(c, x + 3, y + 3, w - 6, h - 15, 4, '#4f9b63');
      c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 2;
      c.strokeRect(x + 8, y + 8, w - 16, h - 25);
      for (let i = 1; i <= 3; i++) {
        this.ret(c, x + (w / 4) * i - 1.5, y + 1, 3, h - 8, 1, this.METAL);
        this.ret(c, x + (w / 4) * i - 4, y + h / 3, 8, 5, 2, i % 2 ? '#d9776a' : '#6f9fd8');
      }
    },
    narguile(c, x, y, w, h) {
      // Peça alta: vaso de vidro, haste com losango, prato largo, fornilho de
      // barro, brasas e a mangueira enrolando até a piteira.
      const cx = x + w / 2;
      const ouro = '#d9a441', ouroEsc = '#a97c22', preto = '#26262e';
      const vidro = '#3d4250', barro = '#b06a44';

      // --- mangueira, atrás de tudo ---
      c.strokeStyle = preto;
      c.lineWidth = Math.max(3, w * 0.095);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(cx + w * 0.22, y + h * 0.55);
      c.bezierCurveTo(cx + w * 0.75, y + h * 0.53, cx + w * 0.68, y + h * 0.84,
                      cx + w * 0.12, y + h * 0.9);
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.14)';
      c.lineWidth = Math.max(1, w * 0.03);
      c.stroke();
      this.ret(c, cx - w * 0.02, y + h * 0.885, w * 0.22, h * 0.032, 2, ouro);   // piteira

      // --- vaso de vidro: alto, translúcido, com água e faixa dourada ---
      const vy = y + h * 0.79, vr = w * 0.31;
      this.elipse(c, cx, y + h * 0.955, vr * 0.95, h * 0.022, 'rgba(60,50,80,.22)');
      this.elipse(c, cx, vy, vr, h * 0.155, this.traco(vidro));
      this.elipse(c, cx, vy - h * 0.004, vr - 1.5, h * 0.15, vidro);
      this.elipse(c, cx, vy + h * 0.045, vr - 2.5, h * 0.1, this.sombra(vidro, 0.4));  // água
      this.ret(c, cx - vr + 2.5, vy + h * 0.075, (vr - 2.5) * 2, h * 0.014, 1, ouroEsc);
      this.elipse(c, cx, vy + h * 0.125, vr * 0.75, h * 0.03, ouroEsc);         // pé
      c.save(); c.globalAlpha = 0.3;
      this.ret(c, cx - vr * 0.62, vy - h * 0.09, w * 0.075, h * 0.12, 4, '#ffffff');
      c.restore();
      this.ret(c, cx - w * 0.045, vy - h * 0.2, w * 0.09, h * 0.13, 2,
               'rgba(210,215,230,.45)');                                        // tubo interno
      this.ret(c, cx - w * 0.11, vy - h * 0.185, w * 0.22, h * 0.03, 2, ouro);  // gargalo

      // --- corpo preto entre o vaso e a haste ---
      this.elipse(c, cx, vy - h * 0.235, w * 0.19, h * 0.055, this.traco(preto));
      this.elipse(c, cx, vy - h * 0.24, w * 0.18, h * 0.05, preto);
      this.ret(c, cx - w * 0.035, vy - h * 0.255, w * 0.07, h * 0.022, 1, ouro);   // coroa
      this.ret(c, cx + w * 0.15, vy - h * 0.27, w * 0.18, h * 0.028, 2, ouro);     // bocal da mangueira
      this.ret(c, cx - w * 0.28, vy - h * 0.27, w * 0.1, h * 0.022, 2, ouroEsc);   // válvula

      // --- haste com losango ---
      this.ret(c, cx - w * 0.05, y + h * 0.3, w * 0.1, h * 0.26, 2, ouroEsc);
      this.ret(c, cx - w * 0.032, y + h * 0.3, w * 0.05, h * 0.26, 1, ouro);
      c.fillStyle = preto;                                                      // losango
      c.beginPath();
      c.moveTo(cx, y + h * 0.38); c.lineTo(cx + w * 0.11, y + h * 0.435);
      c.lineTo(cx, y + h * 0.49); c.lineTo(cx - w * 0.11, y + h * 0.435);
      c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,.2)';
      c.beginPath();
      c.moveTo(cx, y + h * 0.39); c.lineTo(cx + w * 0.055, y + h * 0.435);
      c.lineTo(cx, y + h * 0.47); c.closePath(); c.fill();

      // --- prato ---
      const py = y + h * 0.3;
      this.elipse(c, cx, py, w * 0.44, h * 0.055, ouroEsc);
      this.elipse(c, cx, py - h * 0.008, w * 0.42, h * 0.05, preto);
      this.elipse(c, cx, py - h * 0.008, w * 0.3, h * 0.032, this.luz(preto, 0.14));
      this.elipse(c, cx - w * 0.16, py - h * 0.018, w * 0.1, h * 0.012, 'rgba(255,255,255,.2)');

      // --- fornilho de barro ---
      this.ret(c, cx - w * 0.05, py - h * 0.07, w * 0.1, h * 0.07, 2, ouro);       // pescoço
      this.elipse(c, cx, y + h * 0.205, w * 0.17, h * 0.06, this.traco(barro));
      this.elipse(c, cx, y + h * 0.202, w * 0.16, h * 0.055, barro);
      this.elipse(c, cx, y + h * 0.178, w * 0.15, h * 0.03, this.luz(barro, 0.18));
      this.elipse(c, cx - w * 0.06, y + h * 0.19, w * 0.05, h * 0.016, this.luz(barro, 0.4));

      // --- controlador de calor e brasas ---
      this.elipse(c, cx, y + h * 0.165, w * 0.17, h * 0.035, '#9aa0ad');
      this.elipse(c, cx, y + h * 0.158, w * 0.15, h * 0.028, '#c8ccd4');
      for (const [dx, dy, r] of [[-0.06, 0.152, 0.045], [0.055, 0.15, 0.042], [0, 0.138, 0.04]]) {
        this.ret(c, cx + w * dx - w * r, y + h * dy - h * 0.018, w * r * 2, h * 0.036, 2, '#d94a1e');
        this.ret(c, cx + w * dx - w * r * 0.6, y + h * dy - h * 0.012, w * r * 1.2, h * 0.022, 1, '#ffb03a');
      }
      c.save(); c.globalAlpha = 0.3;
      this.elipse(c, cx, y + h * 0.15, w * 0.26, h * 0.05, '#ff8a3c');          // brilho da brasa
      c.restore();

      // --- fumaça ---
      c.save();
      c.globalAlpha = 0.62;
      c.strokeStyle = '#dcdee3';
      c.lineWidth = Math.max(1.8, w * 0.055);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(cx - w * 0.03, y + h * 0.115);
      c.bezierCurveTo(cx - w * 0.16, y + h * 0.08, cx + w * 0.12, y + h * 0.06,
                      cx - w * 0.02, y + h * 0.02);
      c.stroke();
      c.globalAlpha = 0.3;
      c.beginPath();
      c.moveTo(cx + w * 0.06, y + h * 0.12);
      c.bezierCurveTo(cx + w * 0.2, y + h * 0.09, cx - w * 0.02, y + h * 0.055,
                      cx + w * 0.1, y + h * 0.015);
      c.stroke();
      c.restore();
    },

    /* ================= área externa ================= */
    arvore(c, x, y, w, h) {
      const tronco = '#8a6446', v = '#4f9b63';
      this.ret(c, x + w / 2 - 5, y + h - 20, 10, 17, 3, this.traco(tronco));
      this.ret(c, x + w / 2 - 4, y + h - 19, 8, 15, 3, tronco);
      for (const [dx, dy, r] of [[0, 0.32, 20], [-11, 0.42, 13], [11, 0.42, 13], [0, 0.2, 14]]) {
        this.elipse(c, x + w / 2 + dx, y + h * dy, r, r * 0.92, this.traco(v));
        this.elipse(c, x + w / 2 + dx, y + h * dy - 1, r - 1.5, r * 0.86,
                    dy < 0.3 ? this.luz(v, 0.18) : this.VERDE_ESC);
      }
      this.elipse(c, x + w / 2 - 6, y + h * 0.22, 7, 6, this.luz(v, 0.32));
    },
    arbusto(c, x, y, w, h) {
      const v = this.VERDE_ESC;
      this.elipse(c, x + w / 2, y + h * 0.58, w * 0.4, h * 0.3, this.traco(v));
      this.elipse(c, x + w / 2, y + h * 0.55, w * 0.37, h * 0.27, v);
      this.elipse(c, x + w / 2 - 5, y + h * 0.46, 6, 5, this.luz(v, 0.25));
      this.elipse(c, x + w / 2 + 5, y + h * 0.52, 5, 4, this.luz(v, 0.12));
    },
    banco(c, x, y, w, h) {
      const cor = this.MADEIRA;
      this.ret(c, x + 6, y + h - 10, 4, 7, 1, this.PE);
      this.ret(c, x + w - 10, y + h - 10, 4, 7, 1, this.PE);
      this.ret(c, x + 2, y + 4, w - 4, h - 14, 3, this.traco(cor));
      this.ret(c, x + 3, y + 5, w - 6, 5, 2, cor);                    // encosto
      this.ret(c, x + 3, y + 11, w - 6, h - 21, 2, this.luz(cor, 0.18));
    },
    janela(c, x, y, w, h) {
      const cor = '#bcd6e8';
      this.ret(c, x + 2, y + 6, w - 4, h - 14, 2, '#e7e2d8');          // moldura
      this.ret(c, x + 4, y + 8, w - 8, h - 18, 1, cor);
      c.save(); c.globalAlpha = 0.55;
      this.ret(c, x + 5, y + 9, (w - 10) * 0.4, h - 20, 1, this.luz(cor, 0.7));
      c.restore();
      this.ret(c, x + w / 2 - 1, y + 8, 2, h - 18, 1, '#e7e2d8');      // caixilho
    },

    /* ================= café ================= */
    cafeteira(c, x, y, w, h) {
      this.ret(c, x + 6, y + 4, w - 12, h - 10, 3, this.traco(this.ESCURO));
      this.ret(c, x + 7, y + 5, w - 14, h - 12, 3, this.ESCURO);
      this.ret(c, x + 10, y + 9, w - 20, 6, 2, '#8a5468');
      this.ret(c, x + 10, y + h - 13, w - 20, 3, 1, this.METAL);
    },
    geladeira(c, x, y, w, h) {
      const cor = '#e2e5ea';
      this.bloco(c, x + 3, y + 3, w - 6, h - 6, cor, 4);
      this.ret(c, x + 4, y + h * 0.42, w - 8, 2, 1, this.sombra(cor, 0.28));
      this.ret(c, x + w - 11, y + 10, 3, 8, 1, this.METAL);
      this.ret(c, x + w - 11, y + h * 0.5, 3, 9, 1, this.METAL);
    },
    bebedouro(c, x, y, w, h) {
      this.bloco(c, x + 8, y + 12, w - 16, h - 16, '#e2e5ea', 3);
      this.ret(c, x + 9, y + 3, w - 18, 11, 5, this.traco('#9fd0e8'));
      this.ret(c, x + 10, y + 4, w - 20, 9, 4, '#9fd0e8');
      this.ret(c, x + 12, y + 5, 4, 5, 2, this.luz('#9fd0e8', 0.5));
    },
    pia(c, x, y, w, h) {
      this.bloco(c, x + 1, y + 3, w - 2, h - 6, this.TAMPO, 3);
      this.ret(c, x + 6, y + 7, w / 2 - 3, h - 18, 3, this.sombra(this.TAMPO, 0.22));
      c.strokeStyle = this.METAL; c.lineWidth = 2.5; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x + w - 12, y + 12); c.lineTo(x + w - 12, y + 6); c.lineTo(x + w - 18, y + 6);
      c.stroke();
    },

    /* ================= em cima da mesa ================= */
    monitor(c, x, y, w, h) { this._monitor(c, x + 2, y + 3, w - 4, h - 9, 'codigo'); },

    monitor_duplo(c, x, y, w, h) {
      if (h > w) {                               // mesa em pé: um monitor atrás do outro
        const a = (h - 6) / 2;
        this._monitor(c, x + 3, y + 3, w - 6, a - 3, 'planilha');
        this._monitor(c, x + 3, y + h / 2 + 2, w - 6, a - 3, 'grafico');
        return;
      }
      const l = (w - 6) / 2;
      this._monitor(c, x + 2, y + 4, l, h - 11, 'planilha');
      this._monitor(c, x + w / 2 + 1, y + 4, l, h - 11, 'grafico');
    },

    monitor_curvo(c, x, y, w, h) {
      if (this._vista === 'direita' || this._vista === 'esquerda') {
        this._perfil(c, x + 2, y + 3, w - 4, h - 9, this.ESCURO); return;
      }
      const cor = this.ESCURO;
      this.ret(c, x + w / 2 - 9, y + h - 11, 18, 5, 2, this.mix(cor, this.METAL, 0.35));
      this.ret(c, x + w / 2 - 4, y + h - 16, 8, 6, 2, this.mix(cor, this.METAL, 0.2));
      // a curvatura vem de a moldura ser mais alta nas pontas
      this.ret(c, x + 2, y + 5, w - 4, h - 20, 4, this.traco(cor));
      this.ret(c, x + 3, y + 6, w - 6, h - 22, 3, cor);
      this.ret(c, x + 1, y + 7, 4, h - 24, 2, cor);
      this.ret(c, x + w - 5, y + 7, 4, h - 24, 2, cor);
      this._tela(c, x + 5, y + 8, w - 10, h - 26, 'video');
    },

    monitor_gamer(c, x, y, w, h) {
      if (this._vista === 'direita' || this._vista === 'esquerda') {
        this._perfil(c, x + 2, y + 3, w - 4, h - 9, this.ESCURO); return;
      }
      c.save(); c.globalAlpha = 0.28;                       // brilho RGB atrás
      this.ret(c, x + 1, y + 2, w - 2, h - 8, 6, '#9d5cff');
      c.restore();
      this._monitor(c, x + 2, y + 3, w - 4, h - 9, 'jogo');
      this.ret(c, x + 4, y + h - 12, w - 8, 2, 1, '#ff4fd8');   // fita de LED
    },

    imac(c, x, y, w, h) {
      if (this._vista === 'direita' || this._vista === 'esquerda') {
        this._perfil(c, x + 2, y + 3, w - 4, h - 9, '#dfe2e8'); return;
      }
      const cor = '#dfe2e8';
      this.ret(c, x + w / 2 - 7, y + h - 11, 14, 4, 2, cor);
      this.ret(c, x + w / 2 - 3, y + h - 15, 6, 5, 1, cor);
      this.ret(c, x + 3, y + 4, w - 6, h - 18, 3, this.traco(cor));
      this.ret(c, x + 4, y + 5, w - 8, h - 20, 2, cor);
      this._tela(c, x + 6, y + 7, w - 12, h - 26, 'desktop');
    },

    monitor_triplo(c, x, y, w, h) {
      if (h > w) {                               // mesa em pé: os três em fila
        const a = (h - 8) / 3;
        this._monitor(c, x + 4, y + 3, w - 8, a - 3, 'chat');
        this._monitor(c, x + 2, y + h / 2 - a / 2, w - 4, a - 3, 'codigo');
        this._monitor(c, x + 4, y + h - a - 1, w - 8, a - 3, 'grafico');
        return;
      }
      const l = (w - 8) / 3;
      this._monitor(c, x + 2, y + 6, l, h - 13, 'chat');
      this._monitor(c, x + w / 2 - l / 2, y + 3, l, h - 10, 'codigo');
      this._monitor(c, x + w - l - 2, y + 6, l, h - 13, 'grafico');
    },

    monitor_vertical(c, x, y, w, h) {
      if (this._vista === 'direita' || this._vista === 'esquerda') {
        this._perfil(c, x + 2, y + 3, w - 4, h - 9, this.ESCURO); return;
      }
      const cor = this.ESCURO;
      this.ret(c, x + w / 2 - 6, y + h - 6, 12, 4, 2, this.mix(cor, this.METAL, 0.35));
      this.ret(c, x + w / 2 - 2.5, y + h - 10, 5, 5, 1, this.mix(cor, this.METAL, 0.2));
      this.ret(c, x + 8, y + 1, w - 16, h - 11, 2, this.traco(cor));
      this.ret(c, x + 9, y + 2, w - 18, h - 13, 2, cor);
      this._tela(c, x + 11, y + 4, w - 22, h - 17, 'terminal');
    },

    torre_grande(c, x, y, w, h) {
      const cor = '#2b2f38';
      this.sombraChao(c, x, y, w, h);
      this.ret(c, x + 5, y + 6, w - 10, h - 12, 3, this.traco(cor));
      this.ret(c, x + 6, y + 7, w - 12, h - 14, 3, cor);
      c.save(); c.globalAlpha = 0.8;                       // lateral de vidro
      this.ret(c, x + 9, y + 11, w - 18, h - 24, 2, '#1c2a44');
      c.restore();
      for (let i = 0; i < 3; i++) {                        // ventoinhas acesas
        this.elipse(c, x + w / 2, y + 18 + i * 14, 5, 5, ['#4fd8ff', '#9d5cff', '#ff4fd8'][i]);
        this.elipse(c, x + w / 2, y + 18 + i * 14, 2, 2, '#0e1420');
      }
      this.ret(c, x + 8, y + 9, w - 16, 2, 1, this.luz(cor, 0.3));
    },

    microfone(c, x, y, w, h) {
      const cor = '#3a3f49';
      this.ret(c, x + w / 2 - 6, y + h - 8, 12, 4, 2, cor);               // base
      this.ret(c, x + w / 2 - 1.5, y + 12, 3, h - 20, 1, this.METAL);     // haste
      this.ret(c, x + w / 2 - 5, y + 4, 10, 12, 5, this.traco(cor));
      this.ret(c, x + w / 2 - 4, y + 5, 8, 10, 4, cor);
      c.fillStyle = 'rgba(255,255,255,.18)';
      for (let i = 0; i < 4; i++) c.fillRect(x + w / 2 - 3, y + 6 + i * 2, 6, 1);
    },

    impressora(c, x, y, w, h) {
      const cor = '#c9ccd2';
      this.ret(c, x + 4, y + 8, w - 8, h - 16, 3, this.traco(cor));
      this.ret(c, x + 5, y + 9, w - 10, h - 18, 2, cor);
      this.ret(c, x + 7, y + 5, w - 14, 5, 1, '#f4f2ee');                 // folha saindo
      this.ret(c, x + 7, y + h - 13, w - 14, 3, 1, this.sombra(cor, 0.35));
      this.ret(c, x + w - 12, y + 11, 4, 2, 1, '#4fd8ff');
    },

    luminaria_mesa(c, x, y, w, h) {
      const cor = '#4a5060';
      this.elipse(c, x + w / 2 + 4, y + h - 8, 7, 3, cor);
      c.strokeStyle = cor; c.lineWidth = 2.5; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(x + w / 2 + 4, y + h - 9);
      c.quadraticCurveTo(x + w / 2 + 5, y + 10, x + w / 2 - 4, y + 9);
      c.stroke();
      this.ret(c, x + w / 2 - 9, y + 6, 11, 6, 3, cor);
      c.save(); c.globalAlpha = 0.3;
      this.elipse(c, x + w / 2 - 4, y + 18, 10, 7, '#ffe9b8');
      c.restore();
    },

    torre(c, x, y, w, h) {
      const cor = '#2f333d';
      this.ret(c, x + 8, y + 5, w - 16, h - 12, 3, this.traco(cor));
      this.ret(c, x + 9, y + 6, w - 18, h - 14, 2, cor);
      c.save(); c.globalAlpha = 0.75;
      this.ret(c, x + 11, y + 9, w - 22, h - 22, 1, '#4fd8ff');   // painel iluminado
      c.restore();
      this.ret(c, x + 11, y + h - 12, w - 22, 2, 1, '#9d5cff');
    },

    tablet(c, x, y, w, h) {
      c.save();
      c.translate(x + w / 2, y + h / 2); c.rotate(-0.12);
      this.ret(c, -9, -11, 18, 22, 3, this.traco(this.ESCURO));
      this.ret(c, -8, -10, 16, 20, 3, this.ESCURO);
      this.ret(c, -6, -8, 12, 16, 2, this.TELA);
      c.restore();
      this.ret(c, x + w / 2 - 7, y + h - 9, 14, 3, 2, this.METAL);   // suporte
    },

    fone_mesa(c, x, y, w, h) {
      const cor = '#33383f';
      c.strokeStyle = this.traco(cor); c.lineWidth = 5; c.lineCap = 'round';
      c.beginPath(); c.arc(x + w / 2, y + h / 2 + 2, 8, Math.PI, 0); c.stroke();
      c.strokeStyle = cor; c.lineWidth = 3;
      c.beginPath(); c.arc(x + w / 2, y + h / 2 + 2, 8, Math.PI, 0); c.stroke();
      this.ret(c, x + w / 2 - 12, y + h / 2, 5, 9, 2, cor);
      this.ret(c, x + w / 2 + 7, y + h / 2, 5, 9, 2, cor);
      this.ret(c, x + w / 2 - 11, y + h / 2 + 2, 2, 4, 1, '#4fd8ff');
    },

    mouse(c, x, y, w, h) {
      const cor = '#d5d2cb';
      this.ret(c, x + w / 2 - 5, y + h / 2 - 6, 10, 13, 5, this.traco(cor));
      this.ret(c, x + w / 2 - 4, y + h / 2 - 5, 8, 11, 4, cor);
      this.ret(c, x + w / 2 - 1, y + h / 2 - 4, 2, 4, 1, this.sombra(cor, 0.3));
    },
    teclado(c, x, y, w, h) {
      this.ret(c, x + 4, y + h / 2 - 3, w - 8, 10, 2, this.traco('#d5d2cb'));
      this.ret(c, x + 5, y + h / 2 - 2, w - 10, 8, 2, '#d5d2cb');
      c.fillStyle = 'rgba(70,70,80,.35)';
      for (let i = 0; i < 5; i++) c.fillRect(x + 8 + i * 4, y + h / 2, 2.5, 2);
      for (let i = 0; i < 4; i++) c.fillRect(x + 10 + i * 4, y + h / 2 + 3, 2.5, 2);
    },
    notebook(c, x, y, w, h) {
      this.ret(c, x + 4, y + h - 15, w - 8, 8, 2, this.traco(this.METAL));
      this.ret(c, x + 5, y + h - 14, w - 10, 6, 2, this.METAL);
      this.ret(c, x + 5, y + 5, w - 10, h - 19, 2, this.ESCURO);
      if (this._vista === 'tras') {               // de costas se vê a tampa
        this.ret(c, x + 7, y + 7, w - 14, h - 23, 1, this.mix(this.ESCURO, this.METAL, 0.16));
        this.elipse(c, x + w / 2, y + h / 2 - 3, 2.5, 2.5, this.mix(this.ESCURO, this.METAL, 0.34));
        return;
      }
      this.ret(c, x + 7, y + 7, w - 14, h - 23, 1, this.TELA);
    },
    caneca(c, x, y, w, h) {
      c.strokeStyle = '#fbfaf7'; c.lineWidth = 3;
      c.beginPath(); c.arc(x + w - 11, y + h / 2, 4.5, -1.1, 1.1); c.stroke();
      this.ret(c, x + 9, y + 10, w - 20, h - 19, 3, this.traco('#fbfaf7'));
      this.ret(c, x + 10, y + 11, w - 22, h - 21, 3, '#fbfaf7');
      this.elipse(c, x + w / 2 - 1, y + 12, (w - 24) / 2, 2, '#8a5a3c');
    },
    papeis(c, x, y, w, h) {
      c.save(); c.translate(x + w / 2, y + h / 2); c.rotate(-0.12);
      this.ret(c, -10, -8, 19, 15, 1, this.traco('#fbfaf7'));
      this.ret(c, -9, -7, 17, 13, 1, '#fbfaf7');
      c.fillStyle = '#b5b0a5';
      for (let i = 0; i < 3; i++) c.fillRect(-5, -3 + i * 3, i === 2 ? 6 : 10, 1.5);
      c.restore();
    },
    telefone(c, x, y, w, h) {
      this.ret(c, x + 6, y + 11, w - 12, h - 19, 2, this.traco(this.ESCURO));
      this.ret(c, x + 7, y + 12, w - 14, h - 21, 2, this.mix(this.ESCURO, this.METAL, 0.25));
      this.ret(c, x + 5, y + 6, w - 10, 6, 3, this.ESCURO);
    },
    vasinho(c, x, y, w, h) {
      this._vaso(c, x + w / 2, y + h - 11, 6);
      this.elipse(c, x + w / 2, y + h - 19, 7, 6, this.traco(this.VERDE));
      this.elipse(c, x + w / 2, y + h - 20, 6, 5, this.VERDE);
      this.elipse(c, x + w / 2 - 2, y + h - 22, 3, 2.5, this.luz(this.VERDE, 0.3));
    },
    livros(c, x, y, w, h) {
      const cores = ['#6f9fd8', '#d9776a', '#e0b563'];
      cores.forEach((cor, i) => {
        this.ret(c, x + 7, y + h - 12 - i * 4, w - 15 - i * 2, 4, 1, this.traco(cor));
        this.ret(c, x + 8, y + h - 11 - i * 4, w - 17 - i * 2, 2.5, 1, cor);
      });
    },
    bolo(c, x, y, w, h) {
      this.elipse(c, x + w / 2, y + h - 10, w / 2 - 6, 4, '#e8e5df');
      this.ret(c, x + 9, y + 12, w - 18, h - 24, 2, this.traco('#f3e2c7'));
      this.ret(c, x + 10, y + 13, w - 20, h - 26, 2, '#f3e2c7');
      this.ret(c, x + 10, y + 13, w - 20, 4, 2, '#e8a0b4');
      this.ret(c, x + w / 2 - 1, y + 8, 2, 5, 1, '#d9776a');
    },
  },

  /* ---------- peças auxiliares ---------- */

  /** Cadeira de escritório: base de cinco pontas com rodinhas, coluna, assento,
   *  encosto e braços. Com `destaque`, vira cadeira gamer (asas coloridas). */
  _cadeira(c, x, y, w, h, cor, destaque) {
    const cx = x + w / 2;
    const baseY = y + h - 6;
    this.elipse(c, cx, baseY + 2, w * 0.3, 2.5, 'rgba(70,60,90,.16)');
    // base de cinco pontas
    for (const ang of [-2.6, -1.6, -0.55, 0.5, 1.5]) {
      const px = cx + Math.cos(ang) * w * 0.36;
      const py = baseY + Math.sin(ang) * h * 0.07;
      c.strokeStyle = this.traco(cor); c.lineWidth = 3.5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(cx, baseY); c.lineTo(px, py); c.stroke();
      this.elipse(c, px, py, 2, 1.6, this.mix(cor, '#000', 0.25));       // rodinha
    }
    this.ret(c, cx - 2, baseY - 8, 4, 8, 1, this.METAL);                 // coluna
    // encosto
    const encostoL = w * (destaque ? 0.46 : 0.42);
    const encostoA = h * (destaque ? 0.42 : 0.3);
    const ey = y + h * 0.1;
    if (destaque) {                     // asas laterais: sobram do lado de quem senta
      for (const s of [-1, 1]) {
        const ax = cx + s * w * 0.4 - (s > 0 ? w * 0.13 : 0);
        this.ret(c, ax, ey + 1, w * 0.13, encostoA + 2, 4, destaque);
        this.ret(c, ax + 1, ey + 3, w * 0.13 - 2, encostoA - 4, 3, this.luz(destaque, 0.18));
      }
    }
    this.ret(c, cx - encostoL / 2, ey, encostoL, encostoA, 5, this.traco(cor));
    this.ret(c, cx - encostoL / 2 + 1, ey + 1, encostoL - 2, encostoA - 2, 4, cor);
    this.ret(c, cx - encostoL / 2 + 3, ey + 3, encostoL - 6, 3, 2, this.luz(cor, 0.28));
    if (destaque) {
      this.ret(c, cx - encostoL / 2 + 4, ey + 5, encostoL - 8, 2, 1, destaque);
      this.ret(c, cx - 6, ey - 4, 12, 6, 3, this.traco(cor));            // apoio de cabeça
      this.ret(c, cx - 5, ey - 3, 10, 4, 2, destaque);
    }
    // braços — bem abertos, para sobrarem dos lados de quem senta
    for (const s of [-1, 1]) {
      const bx = cx + s * w * 0.36 - (s > 0 ? 5 : 0);
      this.ret(c, bx, y + h * 0.42, 5, h * 0.2, 2, this.traco(cor));
      this.ret(c, bx + 1, y + h * 0.42 + 1, 3, h * 0.2 - 2, 1, this.luz(cor, 0.14));
    }
    // assento
    this.ret(c, cx - w * 0.3, y + h * 0.44, w * 0.6, h * 0.24, 5, this.traco(cor));
    this.ret(c, cx - w * 0.3 + 1, y + h * 0.44 + 1, w * 0.6 - 2, h * 0.24 - 2, 4, cor);
    this.ret(c, cx - w * 0.22, y + h * 0.47, w * 0.44, 2, 1, this.luz(cor, 0.2));
  },

  /** Monitor com pé, moldura e tela — a base de quase todo computador. */
  _monitor(c, x, y, w, h, assunto) {
    if (this._vista === 'direita' || this._vista === 'esquerda') {
      this._perfil(c, x, y, w, h, this.ESCURO);
      return;
    }
    const cor = this.ESCURO;
    this.ret(c, x + w / 2 - 6, y + h - 3, 12, 4, 2, this.mix(cor, this.METAL, 0.35));  // base
    this.ret(c, x + w / 2 - 2.5, y + h - 7, 5, 5, 1, this.mix(cor, this.METAL, 0.2)); // pescoço
    this.ret(c, x, y, w, h - 6, 3, this.traco(cor));
    this.ret(c, x + 1, y + 1, w - 2, h - 8, 2, cor);
    this._tela(c, x + 3, y + 3, w - 6, h - 12, assunto);
  },

  /** Monitor visto de lado: o painel vira um talo fino, com o pé embaixo.
   *  Serve para qualquer tela — é a silhueta que muda, não o conteúdo. */
  _perfil(c, x, y, w, h, cor) {
    const meio = x + w / 2;
    this.ret(c, meio - 7, y + h - 3, 14, 4, 2, this.mix(cor, this.METAL, 0.35));   // base
    this.ret(c, meio - 2, y + h - 8, 4, 6, 1, this.mix(cor, this.METAL, 0.2));     // pescoço
    this.ret(c, meio + 0.5, y + 3, 4, h - 12, 2, this.sombra(cor, 0.3));           // corcova de trás
    this.ret(c, meio - 4, y + 1, 8, h - 8, 2, this.traco(cor));                    // painel de lado
    this.ret(c, meio - 3, y + 2, 6, h - 10, 2, cor);
    // a faixa clara é o lado da tela: é o que diz para onde o monitor olha
    this.ret(c, meio - 3, y + 3, 2, h - 12, 1, this.TELA);
  },

  /** Conteúdo da tela: é o que faz o computador parecer ligado. De costas não
   *  tem conteúdo nenhum — o que se vê é a traseira do monitor. */
  _tela(c, x, y, w, h, assunto) {
    if (this._vista === 'tras') {
      const cor = this.ESCURO;
      this.ret(c, x, y, w, h, 1, this.mix(cor, this.METAL, 0.14));
      this.ret(c, x + w / 2 - 3, y + 1, 6, h - 2, 1, this.mix(cor, this.METAL, 0.26));
      for (let i = 0; i * 4 < h - 6; i++) {                 // respiros
        this.ret(c, x + 2, y + 3 + i * 4, w - 4, 1, 0.5, this.sombra(cor, 0.4));
      }
      return;
    }
    const fundo = { codigo: '#1e2b3d', planilha: '#f2f4f7', grafico: '#22304a',
                    jogo: '#1a1230', video: '#101826', desktop: '#2b4a6f',
                    chat: '#22262e', terminal: '#0f1a14', edicao: '#191b22',
                    mapa: '#1d3a2e' }[assunto] || '#1e2b3d';
    this.ret(c, x, y, w, h, 1, fundo);
    const px = (dx, dy, dw, dh, cor) => this.ret(c, x + dx, y + dy, dw, dh, 0.5, cor);
    if (assunto === 'codigo') {
      px(2, 2, w - 4, 2, '#3d5a80');
      const cores = ['#7ee0a0', '#ffd479', '#7fb8ff', '#ff9ec4'];
      for (let i = 0; i < Math.floor((h - 8) / 3); i++) {
        px(3, 6 + i * 3, (w - 8) * (0.35 + (i % 3) * 0.22), 1.5, cores[i % 4]);
      }
    } else if (assunto === 'planilha') {
      px(0, 0, w, 2.5, '#4f8de0');
      for (let i = 1; i < Math.floor(h / 3); i++) px(1, i * 3, w - 2, 1, '#c9d4e2');
      for (let i = 1; i < Math.floor(w / 4); i++) px(i * 4, 3, 1, h - 4, '#c9d4e2');
    } else if (assunto === 'grafico') {
      const alturas = [0.35, 0.6, 0.45, 0.8, 0.55];
      alturas.forEach((a, i) => px(2 + i * ((w - 4) / 5), h - 2 - (h - 5) * a,
                                   (w - 4) / 5 - 1.5, (h - 5) * a, ['#4fd8ff', '#7ee0a0', '#ffd479'][i % 3]));
    } else if (assunto === 'jogo') {
      px(0, 0, w, h, '#1a1230');
      px(1, h * 0.55, w - 2, h * 0.45, '#3b2a6b');
      px(w * 0.2, h * 0.2, 3, 3, '#ff4fd8');
      px(w * 0.6, h * 0.35, 4, 4, '#4fd8ff');
      px(w * 0.4, h * 0.62, 5, 3, '#ffd479');
    } else if (assunto === 'video') {
      px(1, 1, w - 2, h * 0.62, '#1c3a5e');
      px(w * 0.42, h * 0.22, 4, 4, '#e8f2ff');
      px(1, h - 3, w - 2, 2, '#33455f');
      px(1, h - 3, (w - 2) * 0.4, 2, '#4fd8ff');
    } else if (assunto === 'chat') {
      for (let i = 0; i < Math.floor((h - 4) / 5); i++) {
        const dir = i % 2;
        px(dir ? w * 0.35 : 2, 2 + i * 5, w * 0.6, 3.5, dir ? '#4f8de0' : '#3a4150');
      }
    } else if (assunto === 'terminal') {
      px(2, 2, 3, 1.5, '#7ee0a0');
      for (let i = 1; i < Math.floor((h - 4) / 3); i++) {
        px(2, 2 + i * 3, (w - 5) * (0.3 + ((i * 7) % 5) / 8), 1.5, '#5ec97f');
      }
    } else if (assunto === 'edicao') {
      px(1, 1, w - 2, h * 0.5, '#2b3040');                 // prévia do vídeo
      px(w * 0.4, h * 0.2, 4, 4, '#e8f2ff');
      px(1, h * 0.58, w - 2, 2, '#4fd8ff');                // trilhas
      px(1, h * 0.72, (w - 2) * 0.7, 2, '#ffd479');
      px(1, h * 0.86, (w - 2) * 0.45, 2, '#ff9ec4');
    } else if (assunto === 'mapa') {
      px(1, 1, w - 2, h - 2, '#20402f');
      px(2, h * 0.4, w - 4, 1.5, '#7ee0a0');
      px(w * 0.45, 2, 1.5, h - 4, '#7ee0a0');
      px(w * 0.6, h * 0.6, 3, 3, '#ff9ec4');
    } else {
      px(1, 1, 4, 4, '#e8f2ff'); px(6, 1, 4, 4, '#ffd479');
      px(1, 6, 4, 4, '#7ee0a0'); px(1, h - 3, w - 2, 2, '#1b3350');
    }
    c.save(); c.globalAlpha = 0.16;                       // reflexo do vidro
    this.ret(c, x, y, w * 0.42, h, 1, '#ffffff');
    c.restore();
  },

  _mesa(c, x, y, w, h, dupla) {
    this.bloco(c, x + 1, y + 2, w - 2, h - 4, this.TAMPO, 3);
    if (dupla) {                                   // emenda das mesas geminadas
      this.ret(c, x + w / 2 - 1, y + 4, 2, h - 13, 1, this.sombra(this.TAMPO, 0.14));
    }
  },

  _vaso(c, cx, base, raio) {
    const v = this.VASO;
    this.ret(c, cx - raio, base - raio * 1.2, raio * 2, raio * 1.4, 2, this.traco(v));
    this.ret(c, cx - raio + 1, base - raio * 1.2 + 1, raio * 2 - 2, raio * 1.4 - 2, 2, v);
    this.ret(c, cx - raio - 1, base - raio * 1.35, raio * 2 + 2, 3, 1, this.luz(v, 0.25));
  },

  /* ---------- miniaturas para a paleta do editor ---------- */
  _minis: new Map(),
  /** `l, a` são o tamanho natural do móvel; com `giro` ímpar a miniatura já
   *  sai deitada. */
  miniatura(tipo, l, a, lado, giro) {
    const chave = tipo + l + a + lado + '/' + (giro | 0);
    if (((giro | 0) % 2)) { const t = l; l = a; a = t; }
    if (this._minis.has(chave)) return this._minis.get(chave);
    const c = document.createElement('canvas');
    c.width = c.height = lado;
    const cx = c.getContext('2d');
    const escala = Math.min(lado / (l * 32), lado / (a * 32)) * 0.92;
    cx.translate((lado - l * 32 * escala) / 2, (lado - a * 32 * escala) / 2);
    cx.scale(escala, escala);
    this.desenhar(cx, tipo, 0, 0, l * 32, a * 32, giro);
    const url = c.toDataURL();
    this._minis.set(chave, url);
    return url;
  },
};
