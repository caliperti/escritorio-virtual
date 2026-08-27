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

  desenhar(c, tipo, x, y, w, h) {
    const f = this.DESENHOS[tipo];
    if (!this.SEM_SOMBRA.has(tipo)) this.sombraChao(c, x, y, w, h);
    if (f) f.call(this, c, x, y, w, h);
    else this.bloco(c, x + 2, y + 2, w - 4, h - 4, this.TAMPO);
  },

  DESENHOS: {
    /* ================= mesas ================= */
    mesa(c, x, y, w, h) { this._mesa(c, x, y, w, h); },
    mesa_grande(c, x, y, w, h) { this._mesa(c, x, y, w, h, true); },
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
    cadeira(c, x, y, w, h) {
      // Menor que o tile e centrada: cadeira ocupando o quadrado inteiro vira
      // um bloco escuro e o chão some.
      const cor = this.CADEIRA;
      const l = w * 0.5, a = h * 0.4;
      const cx = x + (w - l) / 2, cy = y + (h - a) / 2 + 3;
      this.elipse(c, x + w / 2, cy + a + 2, l * 0.42, 2.5, 'rgba(70,60,90,.14)');
      this.ret(c, cx, cy - 6, l, 5, 3, this.traco(cor));                      // encosto
      this.ret(c, cx + 1, cy - 5, l - 2, 3, 2, this.CADEIRA_LUZ);
      this.elipse(c, x + w / 2, cy + a / 2, l / 2, a / 2 + 1, this.traco(cor));
      this.elipse(c, x + w / 2, cy + a / 2 - 1, l / 2 - 1, a / 2, cor);       // assento
      this.elipse(c, x + w / 2 - 2, cy + 1, l / 5, a / 5, this.luz(cor, 0.18));
    },
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
      const cx = x + w / 2, base = y + h - 6;
      c.strokeStyle = '#8a5468'; c.lineWidth = Math.max(3, w * 0.1); c.lineCap = 'round';
      c.beginPath();
      c.moveTo(cx + 1, y + h * 0.52);
      c.bezierCurveTo(cx + w * 0.55, y + h * 0.55, cx + w * 0.5, y + h * 0.82, cx + w * 0.2, base - 3);
      c.stroke();
      this.ret(c, cx - w * 0.28, y + h * 0.58, w * 0.56, h * 0.3, w * 0.26, this.traco('#c98159'));
      this.ret(c, cx - w * 0.26, y + h * 0.59, w * 0.52, h * 0.28, w * 0.24, '#d8955f');
      this.ret(c, cx - w * 0.26, y + h * 0.72, w * 0.52, h * 0.15, w * 0.2, '#a8623a');
      this.ret(c, cx - 2, y + h * 0.24, 4, h * 0.34, 2, this.METAL);
      this.ret(c, cx - w * 0.18, y + h * 0.5, w * 0.36, 3, 2, this.luz(this.METAL, 0.4));
      this.ret(c, cx - w * 0.15, y + h * 0.16, w * 0.3, h * 0.1, 3, '#5c5a63');
      this.elipse(c, cx - 2, y + h * 0.16, 2, 1.8, '#e08a4a');
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
    monitor(c, x, y, w, h) {
      this.ret(c, x + w / 2 - 6, y + h - 12, 12, 4, 2, this.mix(this.ESCURO, this.METAL, 0.3));
      this.ret(c, x + 3, y + 4, w - 6, h - 16, 3, this.ESCURO);
      this.ret(c, x + 5, y + 6, w - 10, h - 20, 2, this.TELA);
      c.save(); c.globalAlpha = 0.45;
      this.ret(c, x + 6, y + 7, (w - 12) * 0.4, h - 22, 1, this.luz(this.TELA, 0.6));
      c.restore();
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
  miniatura(tipo, l, a, lado) {
    const chave = tipo + l + a + lado;
    if (this._minis.has(chave)) return this._minis.get(chave);
    const c = document.createElement('canvas');
    c.width = c.height = lado;
    const cx = c.getContext('2d');
    const escala = Math.min(lado / (l * 32), lado / (a * 32)) * 0.92;
    cx.translate((lado - l * 32 * escala) / 2, (lado - a * 32 * escala) / 2);
    cx.scale(escala, escala);
    this.desenhar(cx, tipo, 0, 0, l * 32, a * 32);
    const url = c.toDataURL();
    this._minis.set(chave, url);
    return url;
  },
};
