/* Os móveis do escritório.
 *
 * Mesma linguagem visual dos bonecos (`boneco.js`): contorno escuro tingido pela
 * cor da própria peça, luz vindo de cima e um naco da frente aparecendo abaixo do
 * tampo — é o que dá volume numa vista de cima. O contorno sai do mesmo truque:
 * o móvel é pintado cinco vezes, quatro delas deslocadas e escuras.
 *
 * O servidor manda só tamanho e se bloqueia (`mapa.py:CATALOGO`); a aparência é
 * decidida aqui. Cada função recebe o retângulo em pixels que a peça ocupa, então
 * o mesmo desenho serve para o mapa e para a miniatura da paleta.            */

const Objetos = {
  /* ---------- folhas de sprite (Kenney, CC0) ----------
   * As peças grandes vêm prontas do pacote "Roguelike Indoors" (tiles de 16px
   * com 1px de margem) e dos móveis urbanos. O que não existe lá (monitor,
   * notebook, quadro branco…) continua desenhado aqui, no mesmo espírito.   */
  FOLHAS: {
    interior: { arquivo: '/static/assets/interior.png', tile: 16, passo: 17 },
    urbano: { arquivo: '/static/assets/urbano.png', tile: 16, passo: 16 },
  },
  _imgs: {},
  _prontas: 0,

  carregarFolhas() {
    for (const [nome, info] of Object.entries(this.FOLHAS)) {
      const img = new Image();
      img.onload = () => { this._prontas++; this._minis.clear(); };
      img.src = info.arquivo;
      this._imgs[nome] = img;
    }
  },

  /** Recorte da folha: (cx, cy) em tiles, (cw, ch) em tiles. */
  _recorte(c, folha, cx, cy, cw, ch, x, y, w, h) {
    const f = this.FOLHAS[folha];
    const img = this._imgs[folha];
    if (!img || !img.complete || !img.naturalWidth) return false;
    c.imageSmoothingEnabled = false;
    c.drawImage(img, cx * f.passo, cy * f.passo, cw * f.tile + (cw - 1) * (f.passo - f.tile),
                ch * f.tile + (ch - 1) * (f.passo - f.tile), x, y, w, h);
    return true;
  },

  /** Desenha um item do mapa de sprites dentro do retângulo do móvel. */
  _daFolha(c, def, x, y, w, h, l, a) {
    const T = 32;                                  // um tile do mundo
    if (def.tile) {
      return this._recorte(c, def.folha, def.tile[0], def.tile[1], 1, 1, x, y, w, h);
    }
    if (def.bloco) {
      const [bx, by, bw, bh] = def.bloco;
      // `tamanho` deixa a arte menor que o móvel, encostada embaixo: é o caso
      // da mesa redonda, que ocupa 2x2 no mapa mas é desenhada em 2x1.
      const [lt, at] = def.tamanho || [l, a];
      const dw = lt * T, dh = at * T;
      return this._recorte(c, def.folha, bx, by, bw, bh,
                           x + (w - dw) / 2, y + h - dh, dw, dh);
    }
    if (def.faixa2) {                              // móvel de duas fileiras
      for (let col = 0; col < l; col++) {
        const i = col === 0 ? 0 : (col === l - 1 ? 2 : 1);
        for (let linha = 0; linha < a; linha++) {
          const fonte = linha === a - 1 ? def.faixa2.baixo : def.faixa2.cima;
          if (!this._recorte(c, def.folha, fonte[i][0], fonte[i][1], 1, 1,
                             x + col * T, y + linha * T, T, T)) return false;
        }
      }
      return true;
    }
    if (def.faixa) {                               // esquerda + meio repetido + direita
      const { esq, meio, dir } = def.faixa;
      for (let linha = 0; linha < a; linha++) {
        for (let col = 0; col < l; col++) {
          const peca = col === 0 ? esq : (col === l - 1 ? dir : meio);
          if (!this._recorte(c, def.folha, peca[0], peca[1], 1, 1,
                             x + col * T, y + linha * T, T, T)) return false;
        }
      }
      return true;
    }
    return false;
  },

  /* Paleta dos tiles do Kenney, para o que ainda é desenhado aqui não destoar */
  MADEIRA: '#b4734a',
  MADEIRA_ESC: '#8d5243',
  METAL: '#aaaeba',
  TECIDO: '#5c6278',
  ESCURO: '#373733',
  VERDE: '#3f9c6a',
  VASO: '#c15b28',
  BEGE: '#e8dcc0',

  SEM_SOMBRA: new Set(['tapete', 'tapete_redondo', 'quadro', 'relogio', 'palco']),

  /* ---------- cor ---------- */

  _rgb(cor) {
    const n = parseInt(cor.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  },
  mix(c1, c2, t) {
    const a = this._rgb(c1), b = this._rgb(c2);
    return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join('');
  },
  sombra(cor, q) { return this.mix(cor, '#2b1f45', q === undefined ? 0.24 : q); },
  luz(cor, q) { return this.mix(cor, '#fff4d8', q === undefined ? 0.22 : q); },
  traco(cor) { return this.mix(cor, '#120e1e', 0.62); },

  /* ---------- pincéis (respeitam a passada de contorno) ---------- */

  _cor(cor) { return this._contornando ? this.traco(cor) : cor; },

  _snap(v) { return Math.round(v / 2) * 2; },

  ret(c, x, y, w, h, r, cor) {
    x = this._snap(x); y = this._snap(y);
    w = Math.max(2, this._snap(w)); h = Math.max(2, this._snap(h));
    c.fillStyle = this._cor(cor);
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
    c.fillStyle = this._cor(cor);
    c.beginPath();
    c.ellipse(cx, cy, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2);
    c.fill();
  },
  linha(c, cor, largura, traçar) {
    c.strokeStyle = this._cor(cor);
    c.lineWidth = largura;
    c.lineCap = 'round';
    c.beginPath();
    traçar();
    c.stroke();
  },

  /* ---------- desenho principal ---------- */

  desenhar(c, tipo, x, y, w, h) {
    const daFolha = this.MAPA[tipo];
    if (daFolha) {
      const l = Math.max(1, Math.round(w / 32)), a = Math.max(1, Math.round(h / 32));
      if (!this.SEM_SOMBRA.has(tipo)) this._chao(c, x, y, w, h);
      if (this._daFolha(c, daFolha, x, y, w, h, l, a)) return;
    }
    const f = this.DESENHOS[tipo];
    if (!this.SEM_SOMBRA.has(tipo)) this._chao(c, x, y, w, h);
    const pintar = () => {
      if (f) f.call(this, c, x, y, w, h);
      else this.ret(c, x + 3, y + 3, w - 6, h - 6, 5, '#94a3b8');
    };
    this._contornando = true;
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
      c.save(); c.translate(dx, dy); pintar(); c.restore();
    }
    this._contornando = false;
    pintar();
  },

  /** Sombra no chão — fica fora do contorno, senão vira uma mancha preta. */
  _chao(c, x, y, w, h) {
    c.fillStyle = 'rgba(15,23,42,.15)';
    c.beginPath();
    c.ellipse(x + w / 2, y + h - 4, w * 0.4, Math.min(h * 0.16, 7), 0, 0, Math.PI * 2);
    c.fill();
  },

  /** Tampo + frente + pés: a base de qualquer mesa ou balcão. */
  _mesa(c, x, y, w, h, cor, pe) {
    const esc = this.sombra(cor, 0.3);
    if (pe !== false) {                                   // pés espiando embaixo
      this.ret(c, x + 5, y + h - 9, 4, 7, 1, this.sombra(cor, 0.5));
      this.ret(c, x + w - 9, y + h - 9, 4, 7, 1, this.sombra(cor, 0.5));
    }
    this.ret(c, x + 2, y + h - 14, w - 4, 8, 3, esc);      // frente do tampo
    this.ret(c, x + 2, y + 3, w - 4, h - 15, 4, cor);      // tampo
    this.ret(c, x + 4, y + 5, w - 8, 3, 2, this.luz(cor)); // luz de cima
    for (let i = 1; i < Math.floor(w / 22); i++) {         // veio da madeira
      this.ret(c, x + 2 + i * 20, y + 8, 1.5, h - 22, 1, this.sombra(cor, 0.12));
    }
  },

  DESENHOS: {
    /* ================= mesas ================= */
    mesa(c, x, y, w, h) { this._mesa(c, x, y, w, h, this.MADEIRA); },
    mesa_grande(c, x, y, w, h) { this._mesa(c, x, y, w, h, this.MADEIRA); },
    mesa_reuniao(c, x, y, w, h) {
      const cor = this.MADEIRA;
      this.ret(c, x + w / 2 - 9, y + h - 12, 18, 9, 3, this.sombra(cor, 0.5));   // pé central
      this.ret(c, x + 4, y + h - 16, w - 8, 10, 8, this.sombra(cor, 0.3));
      this.ret(c, x + 4, y + 4, w - 8, h - 17, 12, cor);           // retângulo com canto vivo
      this.ret(c, x + 12, y + 7, w - 24, 4, 2, this.luz(cor));
      this.ret(c, x + 14, y + 15, w - 28, 2, 1, this.sombra(cor, 0.12));
    },
    mesa_redonda(c, x, y, w, h) {
      const cor = this.MADEIRA;
      this.ret(c, x + w / 2 - 4, y + h - 16, 8, 12, 2, this.sombra(cor, 0.5));   // pedestal
      this.elipse(c, x + w / 2, y + h - 8, w * 0.24, 4, this.sombra(cor, 0.45));
      // tampo achatado: visto de cima, uma mesa é um disco baixo, não uma bola
      this.elipse(c, x + w / 2, y + h / 2 - 1, w / 2 - 5, h / 2 - 16, this.sombra(cor, 0.34));
      this.elipse(c, x + w / 2, y + h / 2 - 7, w / 2 - 5, h / 2 - 16, cor);
      this.elipse(c, x + w / 2, y + h / 2 - 7, w / 2 - 9, h / 2 - 19, this.luz(cor, 0.1));
      this.elipse(c, x + w / 2 - 6, y + h / 2 - 12, w / 7, h / 20, this.luz(cor, 0.35));
    },
    balcao(c, x, y, w, h) {
      this.ret(c, x + 2, y + 10, w - 4, h - 13, 3, this.sombra(this.MADEIRA, 0.42));  // painel
      this.ret(c, x + 4, y + 14, w - 8, 3, 1, this.sombra(this.MADEIRA, 0.55));
      this.ret(c, x + 1, y + 3, w - 2, 11, 4, this.MADEIRA);                          // tampo
      this.ret(c, x + 4, y + 5, w - 8, 3, 2, this.luz(this.MADEIRA));
    },
    mesa_centro(c, x, y, w, h) {
      const cor = '#c89b6d';
      this.ret(c, x + 7, y + h - 11, 4, 8, 1, this.sombra(cor, 0.5));
      this.ret(c, x + w - 11, y + h - 11, 4, 8, 1, this.sombra(cor, 0.5));
      this.ret(c, x + 4, y + h - 15, w - 8, 7, 3, this.sombra(cor, 0.3));
      this.ret(c, x + 4, y + 8, w - 8, h - 18, 4, cor);
      this.ret(c, x + 8, y + 10, w - 16, 3, 2, this.luz(cor));
    },

    /* ================= assentos ================= */
    cadeira(c, x, y, w, h) {
      const cor = this.TECIDO;
      this.ret(c, x + 8, y + h - 10, 3, 6, 1, this.ESCURO);            // pés
      this.ret(c, x + w - 11, y + h - 10, 3, 6, 1, this.ESCURO);
      this.ret(c, x + 6, y + 4, w - 12, 6, 3, this.sombra(cor, 0.35)); // encosto
      this.ret(c, x + 5, y + 9, w - 10, h - 19, 5, cor);               // assento
      this.ret(c, x + 8, y + 11, w - 16, 3, 2, this.luz(cor));
    },
    poltrona(c, x, y, w, h) {
      const cor = this.mix(this.TECIDO, '#7c3aed', 0.18);
      this.ret(c, x + 9, y + h - 9, 3, 5, 1, this.ESCURO);                // pezinhos
      this.ret(c, x + w - 12, y + h - 9, 3, 5, 1, this.ESCURO);
      this.ret(c, x + 3, y + 4, w - 6, h - 11, 7, this.sombra(cor, 0.34));  // costas e braços
      this.ret(c, x + 8, y + 10, w - 16, h - 19, 5, this.luz(cor, 0.12));   // assento claro
      this.ret(c, x + 10, y + 12, w - 20, 3, 2, this.luz(cor, 0.4));
    },
    sofa(c, x, y, w, h) {
      const cor = this.TECIDO;
      this.ret(c, x + 2, y + 3, w - 4, h - 8, 6, this.sombra(cor, 0.28));   // encosto
      this.ret(c, x + 2, y + 8, 8, h - 13, 5, this.sombra(cor, 0.14));      // braços
      this.ret(c, x + w - 10, y + 8, 8, h - 13, 5, this.sombra(cor, 0.14));
      const largura = (w - 24) / 2;
      for (let i = 0; i < 2; i++) {                                        // almofadas
        this.ret(c, x + 11 + i * (largura + 2), y + 10, largura, h - 17, 4, cor);
        this.ret(c, x + 14 + i * (largura + 2), y + 12, largura - 6, 3, 2, this.luz(cor));
      }
    },
    banqueta(c, x, y, w, h) {
      const cor = '#8b93a5';
      this.ret(c, x + w / 2 - 2, y + h - 14, 4, 10, 1, this.sombra(cor, 0.45));
      this.elipse(c, x + w / 2, y + h / 2 - 1, w / 2 - 7, h / 2 - 9, this.sombra(cor, 0.3));
      this.elipse(c, x + w / 2, y + h / 2 - 4, w / 2 - 7, h / 2 - 9, cor);
      this.elipse(c, x + w / 2 - 3, y + h / 2 - 7, 4, 2, this.luz(cor));
    },

    /* ================= sala ================= */
    planta(c, x, y, w, h) {
      this.ret(c, x + w / 2 - 7, y + h - 14, 14, 11, 2, this.VASO);       // vaso
      this.ret(c, x + w / 2 - 8, y + h - 16, 16, 4, 2, this.luz(this.VASO, 0.12));
      const v = this.VERDE;
      this.elipse(c, x + w / 2, y + h / 2 - 3, 10, 9, this.sombra(v, 0.2));
      this.elipse(c, x + w / 2 - 4, y + h / 2 - 6, 6, 5, v);
      this.elipse(c, x + w / 2 + 4, y + h / 2 - 4, 5, 5, v);
      this.elipse(c, x + w / 2 - 2, y + h / 2 - 9, 5, 4, this.luz(v, 0.2));
    },
    planta_alta(c, x, y, w, h) {
      this.ret(c, x + w / 2 - 9, y + h - 18, 18, 15, 3, this.VASO);
      this.ret(c, x + w / 2 - 10, y + h - 20, 20, 5, 2, this.luz(this.VASO, 0.12));
      const v = this.VERDE;
      this.linha(c, this.sombra(v, 0.4), 3, () => {
        c.moveTo(x + w / 2, y + h - 18); c.lineTo(x + w / 2, y + h * 0.42);
      });
      this.elipse(c, x + w / 2, y + h * 0.36, 13, 15, this.sombra(v, 0.2));
      this.elipse(c, x + w / 2 - 6, y + h * 0.3, 7, 7, v);
      this.elipse(c, x + w / 2 + 5, y + h * 0.38, 7, 7, v);
      this.elipse(c, x + w / 2 - 2, y + h * 0.22, 6, 5, this.luz(v, 0.22));
    },
    estante(c, x, y, w, h) {
      const cor = this.MADEIRA_ESC;
      this.ret(c, x + 2, y + 2, w - 4, h - 5, 3, cor);
      this.ret(c, x + 5, y + 5, w - 10, (h - 14) / 2, 1, this.sombra(cor, 0.45));  // vãos
      this.ret(c, x + 5, y + h / 2 + 1, w - 10, (h - 14) / 2, 1, this.sombra(cor, 0.45));
      const cores = ['#e11d48', '#0ea5e9', '#eab308', '#22c55e', '#a855f7', '#f97316'];
      for (let i = 0; i < Math.floor((w - 14) / 6); i++) {
        const alt = (h - 16) / 2 - (i % 3);
        this.ret(c, x + 7 + i * 6, y + 6 + ((h - 14) / 2 - alt), 4, alt, 1, cores[i % 6]);
        this.ret(c, x + 7 + i * 6, y + h / 2 + 2, 4, (h - 16) / 2 - ((i + 1) % 3), 1, cores[(i + 3) % 6]);
      }
      this.ret(c, x + 4, y + 4, w - 8, 2, 1, this.luz(cor, 0.18));
    },
    armario(c, x, y, w, h) {
      const cor = '#8792a5';
      this.ret(c, x + 3, y + 3, w - 6, h - 7, 3, cor);
      this.ret(c, x + 5, y + 6, (w - 13) / 2, h - 13, 2, this.sombra(cor, 0.22));  // portas
      this.ret(c, x + w / 2 + 1, y + 6, (w - 13) / 2, h - 13, 2, this.sombra(cor, 0.22));
      this.ret(c, x + w / 2 - 5, y + h / 2 - 1, 3, 5, 1, '#f1f5f9');               // puxadores
      this.ret(c, x + w / 2 + 2, y + h / 2 - 1, 3, 5, 1, '#f1f5f9');
      this.ret(c, x + 5, y + 4, w - 10, 2, 1, this.luz(cor, 0.2));
    },
    quadro(c, x, y, w, h) {
      this.ret(c, x + 2, y + 3, w - 4, h - 11, 3, '#94a3b8');                      // moldura
      this.ret(c, x + 5, y + 6, w - 10, h - 18, 2, '#f8fafc');
      this.linha(c, '#38bdf8', 2.5, () => {
        c.moveTo(x + 11, y + h - 16); c.lineTo(x + 19, y + 11); c.lineTo(x + 27, y + h - 17);
      });
      this.linha(c, '#ef4444', 2.5, () => {
        c.moveTo(x + w - 30, y + 13); c.lineTo(x + w - 14, y + 13);
      });
      this.ret(c, x + 6, y + h - 11, w - 12, 4, 2, '#64748b');                     // bandeja
      this.ret(c, x + 11, y + h - 10, 7, 2, 1, '#ef4444');
    },
    tv(c, x, y, w, h) {
      this.ret(c, x + w / 2 - 8, y + h - 9, 16, 4, 2, '#334155');                  // pé
      this.ret(c, x + 3, y + 3, w - 6, h - 12, 3, '#171e2e');
      this.ret(c, x + 6, y + 6, w - 12, h - 18, 2, '#1e4f7a');
      c.save();
      c.globalAlpha = 0.5;
      this.ret(c, x + 8, y + 8, (w - 16) * 0.42, h - 22, 1, '#7dd3fc');            // reflexo
      c.restore();
    },
    tapete(c, x, y, w, h) {
      const cor = '#8e8397';
      this.ret(c, x + 2, y + 2, w - 4, h - 4, 5, cor);
      this.ret(c, x + 8, y + 8, w - 16, h - 16, 3, this.luz(cor, 0.16));
      this.ret(c, x + 14, y + 14, w - 28, h - 28, 2, cor);
      for (let i = 0; i < Math.floor(h / 8); i++) {                                // franjas
        this.ret(c, x, y + 6 + i * 8, 3, 3, 1, this.luz(cor, 0.25));
        this.ret(c, x + w - 3, y + 6 + i * 8, 3, 3, 1, this.luz(cor, 0.25));
      }
    },
    tapete_redondo(c, x, y, w, h) {
      const cor = '#b5793f';
      this.elipse(c, x + w / 2, y + h / 2, w / 2 - 3, h / 2 - 3, cor);
      this.elipse(c, x + w / 2, y + h / 2, w / 2 - 9, h / 2 - 9, this.luz(cor, 0.2));
      this.elipse(c, x + w / 2, y + h / 2, w / 2 - 16, h / 2 - 16, cor);
    },
    luminaria(c, x, y, w, h) {
      this.elipse(c, x + w / 2, y + h - 7, 9, 4, '#4b5563');
      this.ret(c, x + w / 2 - 2, y + 12, 4, h - 18, 2, '#64748b');
      this.ret(c, x + w / 2 - 10, y + 3, 20, 11, 5, '#fbbf24');                    // cúpula
      this.ret(c, x + w / 2 - 6, y + 5, 12, 3, 2, this.luz('#fbbf24', 0.4));
      c.save();
      c.globalAlpha = 0.28;
      this.elipse(c, x + w / 2, y + 18, 13, 7, '#fde68a');
      c.restore();
    },
    relogio(c, x, y, w, h) {
      this.elipse(c, x + w / 2, y + h / 2, 11, 11, '#cbd5e1');
      this.elipse(c, x + w / 2, y + h / 2, 8.5, 8.5, '#f8fafc');
      this.linha(c, '#0f172a', 2, () => {
        c.moveTo(x + w / 2, y + h / 2); c.lineTo(x + w / 2, y + h / 2 - 5);
        c.moveTo(x + w / 2, y + h / 2); c.lineTo(x + w / 2 + 4, y + h / 2 + 2);
      });
    },
    palco(c, x, y, w, h) {
      this.ret(c, x + 2, y + h - 12, w - 4, 10, 3, '#5b3a2e');                     // frente
      this.ret(c, x + 2, y + 3, w - 4, h - 13, 4, '#7c5138');                      // tábuas
      for (let i = 1; i < Math.floor(w / 16); i++) {
        this.ret(c, x + 2 + i * 16, y + 5, 1.5, h - 17, 1, this.sombra('#7c5138', 0.2));
      }
      this.ret(c, x + 6, y + 5, w - 12, 3, 2, this.luz('#7c5138', 0.2));
      this.ret(c, x + w / 2 - 14, y + h - 5, 28, 4, 2, '#4a2f25');                 // degrau
    },
    pebolim(c, x, y, w, h) {
      this.ret(c, x + 2, y + h - 12, w - 4, 9, 3, this.sombra('#1f6b3a', 0.5));
      this.ret(c, x + 2, y + 3, w - 4, h - 13, 4, '#1f6b3a');
      this.linha(c, 'rgba(248,250,252,.75)', 2, () => {
        c.rect(x + 8, y + 8, w - 16, h - 24);
        c.moveTo(x + w / 2, y + 8); c.lineTo(x + w / 2, y + h - 16);
      });
      this.elipse(c, x + w / 2, y + (h - 8) / 2, 6, 5, 'rgba(248,250,252,.6)');
      for (let i = 1; i <= 3; i++) {                                               // barras
        this.ret(c, x + (w / 4) * i - 1.5, y, 3, h - 6, 1, '#cbd5e1');
        this.ret(c, x + (w / 4) * i - 4, y + h / 3, 8, 5, 2, i % 2 ? '#e11d48' : '#3b82f6');
      }
    },
    narguile(c, x, y, w, h) {
      const cx = x + w / 2, base = y + h - 6;
      this.linha(c, '#6d162f', Math.max(3.5, w * 0.11), () => {
        c.moveTo(cx + 1, y + h * 0.52);
        c.bezierCurveTo(cx + w * 0.55, y + h * 0.55, cx + w * 0.5, y + h * 0.82, cx + w * 0.2, base - 3);
      });
      this.ret(c, cx + w * 0.08, base - 6, w * 0.16, 6, 2, '#3f3f46');             // piteira
      this.ret(c, cx - w * 0.3, y + h * 0.58, w * 0.6, h * 0.3, w * 0.28, '#c2650b');
      this.ret(c, cx - w * 0.3, y + h * 0.71, w * 0.6, h * 0.17, w * 0.24, '#8a3f08');
      this.ret(c, cx - w * 0.23, y + h * 0.61, w * 0.14, h * 0.2, w * 0.07, this.luz('#c2650b', 0.45));
      this.ret(c, cx - w * 0.1, y + h * 0.53, w * 0.2, h * 0.07, 2, this.METAL);   // gargalo
      this.ret(c, cx - 2, y + h * 0.24, 4, h * 0.32, 2, this.METAL);               // haste
      this.ret(c, cx - w * 0.2, y + h * 0.5, w * 0.4, 3, 2, this.luz(this.METAL, 0.3));
      this.ret(c, cx - w * 0.16, y + h * 0.16, w * 0.32, h * 0.1, 3, '#57534e');   // fornilho
      this.elipse(c, cx, y + h * 0.17, w * 0.13, h * 0.028, '#d6d3d1');
      this.elipse(c, cx - 2, y + h * 0.16, 2, 1.8, '#f97316');
      this.elipse(c, cx + 2, y + h * 0.168, 1.6, 1.4, '#ef4444');
    },

    /* ================= café ================= */
    cafeteira(c, x, y, w, h) {
      this.ret(c, x + 5, y + 4, w - 10, h - 10, 3, '#2b3244');
      this.ret(c, x + 8, y + 7, w - 16, 6, 2, this.luz('#2b3244', 0.25));
      this.ret(c, x + 9, y + h - 16, w - 18, 7, 2, '#7f1d1d');                     // jarra
      this.ret(c, x + 11, y + h - 11, w - 22, 4, 1, '#e2e8f0');                    // bandeja
    },
    geladeira(c, x, y, w, h) {
      const cor = '#c9d3e0';
      this.ret(c, x + 3, y + 3, w - 6, h - 7, 4, cor);
      this.ret(c, x + 5, y + 5, w - 10, 2, 1, this.luz(cor, 0.4));
      this.ret(c, x + 4, y + h * 0.4, w - 8, 2, 1, this.sombra(cor, 0.35));        // divisão
      this.ret(c, x + w - 11, y + 10, 3, 8, 1, '#64748b');                         // puxadores
      this.ret(c, x + w - 11, y + h * 0.5, 3, 10, 1, '#64748b');
    },
    bebedouro(c, x, y, w, h) {
      this.ret(c, x + 8, y + 12, w - 16, h - 16, 3, '#e2e8f0');
      this.ret(c, x + 9, y + 3, w - 18, 11, 4, '#7dd3fc');                         // galão
      this.ret(c, x + 11, y + 5, 4, 6, 2, this.luz('#7dd3fc', 0.5));
      this.ret(c, x + 13, y + h - 11, w - 26, 3, 1, '#64748b');
    },
    pia(c, x, y, w, h) {
      this.ret(c, x + 2, y + 11, w - 4, h - 14, 3, this.sombra('#8792a5', 0.35));  // gabinete
      this.ret(c, x + 1, y + 4, w - 2, 9, 3, '#c1cad6');                           // bancada
      this.ret(c, x + 6, y + 6, w / 2 - 3, 6, 2, this.sombra('#c1cad6', 0.4));     // cuba
      this.linha(c, '#64748b', 2.5, () => {
        c.moveTo(x + w - 12, y + 11); c.lineTo(x + w - 12, y + 6); c.lineTo(x + w - 17, y + 6);
      });
    },

    /* ================= em cima da mesa ================= */
    monitor(c, x, y, w, h) {
      this.ret(c, x + w / 2 - 5, y + h - 12, 10, 4, 1, '#475569');                 // pé
      this.ret(c, x + 4, y + 5, w - 8, h - 17, 2, '#1f2937');
      this.ret(c, x + 6, y + 7, w - 12, h - 21, 1, '#2f7fb8');
      c.save(); c.globalAlpha = 0.55;
      this.ret(c, x + 7, y + 8, (w - 14) * 0.4, h - 23, 1, '#bae6fd');
      c.restore();
    },
    notebook(c, x, y, w, h) {
      this.ret(c, x + 4, y + h - 15, w - 8, 7, 2, '#aab4c4');                      // teclado
      this.ret(c, x + 7, y + h - 13, w - 14, 3, 1, this.sombra('#aab4c4', 0.35));
      this.ret(c, x + 5, y + 5, w - 10, h - 20, 2, '#39415a');                     // tela
      this.ret(c, x + 7, y + 7, w - 14, h - 24, 1, '#7dd3fc');
    },
    caneca(c, x, y, w, h) {
      this.linha(c, '#e2e8f0', 3, () => { c.arc(x + w - 11, y + h / 2, 4.5, -1.1, 1.1); });
      this.ret(c, x + 9, y + 10, w - 20, h - 19, 3, '#f8fafc');
      this.elipse(c, x + w / 2 - 1, y + 11, (w - 22) / 2, 2.2, '#7c3f1d');         // café
      this.ret(c, x + 10, y + 13, 3, h - 24, 1, this.sombra('#f8fafc', 0.12));
    },
    papeis(c, x, y, w, h) {
      c.save();
      c.translate(x + w / 2, y + h / 2);
      c.rotate(-0.13);
      this.ret(c, -10, -8, 19, 15, 1, '#cbd5e1');
      c.rotate(0.26);
      this.ret(c, -9, -7, 18, 14, 1, '#f8fafc');
      for (let i = 0; i < 3; i++) this.ret(c, -5, -3 + i * 3, i === 2 ? 6 : 10, 1.5, 1, '#94a3b8');
      c.restore();
    },
    telefone(c, x, y, w, h) {
      this.ret(c, x + 6, y + 11, w - 12, h - 19, 2, '#374151');                    // base
      this.ret(c, x + 9, y + 14, w - 18, 4, 1, '#4b5563');
      this.ret(c, x + 5, y + 6, w - 10, 6, 3, '#1f2937');                          // monofone
      this.ret(c, x + 7, y + 7, 4, 4, 2, '#4b5563');
      this.ret(c, x + w - 11, y + 7, 4, 4, 2, '#4b5563');
    },
    vasinho(c, x, y, w, h) {
      this.ret(c, x + 12, y + h - 15, 9, 9, 2, this.VASO);
      this.ret(c, x + 11, y + h - 17, 11, 3, 1, this.luz(this.VASO, 0.15));
      this.elipse(c, x + w / 2, y + h - 19, 7, 6, this.VERDE);
      this.elipse(c, x + w / 2 - 3, y + h - 22, 3.5, 3, this.luz(this.VERDE, 0.25));
    },
    livros(c, x, y, w, h) {
      const cores = ['#0ea5e9', '#e11d48', '#eab308'];
      cores.forEach((cor, i) => {
        this.ret(c, x + 7, y + h - 12 - i * 4, w - 15 - i * 2, 4, 1, cor);
        this.ret(c, x + 8, y + h - 11 - i * 4, w - 17 - i * 2, 1, 1, this.luz(cor, 0.35));
      });
    },
    bolo(c, x, y, w, h) {
      this.elipse(c, x + w / 2, y + h - 10, w / 2 - 6, 4, '#e2e8f0');              // prato
      this.ret(c, x + 9, y + 12, w - 18, h - 24, 2, '#fce7c8');
      this.ret(c, x + 9, y + 12, w - 18, 4, 2, '#f472b6');                         // cobertura
      this.ret(c, x + 9, y + h - 16, w - 18, 2, 1, '#d9a066');
      this.ret(c, x + w / 2 - 1, y + 8, 2, 5, 1, '#ef4444');                       // vela
      this.elipse(c, x + w / 2, y + 7, 1.6, 2.2, '#fbbf24');
    },
  },

  /* ---------- de quais tiles vem cada móvel ---------- */

  MAPA: {
    mesa: { folha: 'interior', faixa: { esq: [0, 0], meio: [1, 0], dir: [2, 0] } },
    mesa_grande: { folha: 'interior', faixa2: {
      cima: [[0, 0], [1, 0], [2, 0]], baixo: [[0, 1], [1, 1], [2, 1]] } },
    mesa_reuniao: { folha: 'interior', faixa2: {
      cima: [[0, 0], [1, 0], [2, 0]], baixo: [[0, 1], [1, 1], [2, 1]] } },
    mesa_redonda: { folha: 'interior', bloco: [3, 0, 2, 1], tamanho: [2, 1] },
    mesa_centro: { folha: 'interior', bloco: [7, 0, 1, 1], tamanho: [1, 1] },
    balcao: { folha: 'interior', faixa: { esq: [0, 12], meio: [1, 12], dir: [2, 12] } },
    cadeira: { folha: 'interior', tile: [0, 2] },
    poltrona: { folha: 'interior', tile: [0, 8] },
    sofa: { folha: 'interior', faixa: { esq: [4, 7], meio: [5, 7], dir: [6, 7] } },
    banqueta: { folha: 'interior', tile: [16, 3] },
    planta: { folha: 'interior', tile: [16, 0] },
    planta_alta: { folha: 'interior', bloco: [17, 0, 1, 1], tamanho: [1, 1] },
    estante: { folha: 'interior', bloco: [12, 0, 2, 1] },
    armario: { folha: 'interior', tile: [5, 5] },
    quadro: { folha: 'interior', bloco: [19, 12, 3, 1] },
    tapete: { folha: 'interior', bloco: [16, 8, 3, 1], tamanho: [3, 1] },
    tapete_redondo: { folha: 'interior', bloco: [19, 8, 2, 1], tamanho: [2, 1] },
    luminaria: { folha: 'interior', tile: [19, 0] },
    livros: { folha: 'interior', tile: [18, 0] },
    vasinho: { folha: 'interior', tile: [17, 0] },
    pia: { folha: 'interior', faixa: { esq: [4, 12], meio: [5, 12], dir: [4, 12] } },
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

Objetos.carregarFolhas();
