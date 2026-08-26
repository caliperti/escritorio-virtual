/* Os bonequinhos.
 *
 * O desenho não é mais feito no braço: usamos os sprites do pacote "RPG Urban"
 * do Kenney (domínio público, CC0 — ver assets/LICENCA-kenney-urban.txt). São
 * 6 personagens, cada um com 4 direções e 3 quadros de caminhada, na folha
 * `assets/urbano.png` (tiles de 16px).
 *
 * Para não perder a personalização, a camisa e o cabelo são **recoloridos em
 * tempo de execução**: cada personagem tem as cores originais dessas duas peças
 * mapeadas abaixo, e trocamos pixel a pixel por tons da cor escolhida. O
 * resultado fica em cache por combinação.                                    */

const Boneco = {
  FOLHA: '/static/assets/urbano.png',
  TILE: 16,
  COL_DIRECAO: { esquerda: 23, baixo: 24, cima: 25, direita: 26 },

  // cores originais de cada personagem (do mais claro para o mais escuro)
  PERSONAGENS: [
    { nome: 'Alex', cabelo: ['#dc8652', '#c57652'], camisa: ['#42a379', '#369069'] },
    { nome: 'Bia', cabelo: ['#dc8652', '#c57652'], camisa: ['#c2504d', '#a54240'] },
    { nome: 'Caio', cabelo: ['#a09cca', '#7a77a4', '#5c6278'], camisa: ['#42a379', '#369069'] },
    { nome: 'Duda', cabelo: ['#f5a94c', '#da923e', '#bc7d36'], camisa: ['#918eb9', '#7a77a4'] },
    { nome: 'Edu', cabelo: [], camisa: ['#aaa8bd', '#898ca6'] },
    { nome: 'Fê', cabelo: ['#60605a', '#50504a', '#373733'], camisa: ['#c77b47', '#a9673b'] },
  ],

  CATALOGO: {
    personagem: ['0', '1', '2', '3', '4', '5'],
    corCamisa: ['#e11d48', '#f97316', '#eab308', '#22c55e', '#14b8a6',
                '#3b82f6', '#6366f1', '#a855f7', '#e2e8f0', '#475569'],
    corCabelo: ['#1c1410', '#432a18', '#8a5a2b', '#d9a441', '#b4462f',
                '#8b5cf6', '#e8e8e8', '#2563eb'],
  },

  ROTULOS: {
    personagem: 'Personagem', corCamisa: 'Cor da camisa', corCabelo: 'Cor do cabelo',
  },

  /* ---------- carga da folha ---------- */

  _folha: null,
  _pronto: false,

  quandoCarregar(f) {
    this._aoCarregar = this._aoCarregar || [];
    if (this._pronto) f();
    else this._aoCarregar.push(f);
  },

  iniciar() {
    if (this._img) return;
    this._img = new Image();
    this._img.onload = () => {
      const c = document.createElement('canvas');
      c.width = this._img.width;
      c.height = this._img.height;
      c.getContext('2d').drawImage(this._img, 0, 0);
      this._folha = c;
      this._pronto = true;
      this._cache.clear();
      this._retratos.clear();
      // a folha chega depois da tela montada: quem desenhou botão com retrato
      // precisa refazer, senão fica o texto cru "0, 1, 2…"
      (this._aoCarregar || []).forEach((f) => f());
    };
    this._img.src = this.FOLHA;
  },

  /* ---------- aparência ---------- */

  aleatoria() {
    const sorteio = (l) => l[Math.floor(Math.random() * l.length)];
    return {
      personagem: sorteio(this.CATALOGO.personagem),
      corCamisa: sorteio(this.CATALOGO.corCamisa),
      corCabelo: sorteio(this.CATALOGO.corCabelo),
    };
  },

  normalizar(ap) {
    const saida = {};
    for (const chave of Object.keys(this.CATALOGO)) {
      const valores = this.CATALOGO[chave];
      saida[chave] = ap && valores.includes(ap[chave]) ? ap[chave] : valores[0];
    }
    return saida;
  },

  /* ---------- cor ---------- */

  _rgb(cor) {
    const n = parseInt(cor.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  },
  _hex(r, g, b) {
    return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v)))
      .toString(16).padStart(2, '0')).join('');
  },
  /** Tom mais escuro da mesma cor, para as sombras da peça recolorida. */
  _tom(cor, i) {
    const [r, g, b] = this._rgb(cor);
    const f = 1 - i * 0.22;
    return this._hex(r * f, g * f, b * f);
  },

  /* ---------- sprite recolorido, em cache ---------- */

  _cache: new Map(),

  _bloco(ap) {
    const chave = ap.personagem + '|' + ap.corCamisa + '|' + ap.corCabelo;
    if (this._cache.has(chave)) return this._cache.get(chave);

    const T = this.TILE;
    const p = Number(ap.personagem);
    const info = this.PERSONAGENS[p];
    const c = document.createElement('canvas');
    c.width = 4 * T;                     // 4 direções
    c.height = 3 * T;                    // 3 quadros
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;

    const ordem = ['esquerda', 'baixo', 'cima', 'direita'];
    ordem.forEach((dir, i) => {
      for (let q = 0; q < 3; q++) {
        cx.drawImage(this._folha, this.COL_DIRECAO[dir] * T, (p * 3 + q) * T, T, T,
                     i * T, q * T, T, T);
      }
    });

    // troca de cores: camisa e cabelo viram tons da cor escolhida
    const troca = new Map();
    info.camisa.forEach((orig, i) => troca.set(orig.toLowerCase(), this._tom(ap.corCamisa, i)));
    info.cabelo.forEach((orig, i) => troca.set(orig.toLowerCase(), this._tom(ap.corCabelo, i)));
    if (troca.size) {
      const dados = cx.getImageData(0, 0, c.width, c.height);
      const d = dados.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        const hex = this._hex(d[i], d[i + 1], d[i + 2]);
        const nova = troca.get(hex);
        if (nova) {
          const [r, g, b] = this._rgb(nova);
          d[i] = r; d[i + 1] = g; d[i + 2] = b;
        }
      }
      cx.putImageData(dados, 0, 0);
    }

    if (this._cache.size > 200) this._cache.clear();
    this._cache.set(chave, c);
    return c;
  },

  /* ---------- desenho ---------- */

  /** Desenha com os pés em (x, y + 13) e o corpo centrado em x. */
  desenhar(ctx, aparencia, x, y, direcao, quadro, escala) {
    const ap = this.normalizar(aparencia);
    const S = (escala || 2) * (this.TILE / 16);
    if (!this._pronto) {                                   // enquanto a folha carrega
      ctx.fillStyle = 'rgba(148,163,184,.6)';
      ctx.beginPath();
      ctx.arc(x, y, 12 * (S / 2), 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const bloco = this._bloco(ap);
    const T = this.TILE;
    const dir = ['esquerda', 'baixo', 'cima', 'direita'].indexOf(
      ['esquerda', 'baixo', 'cima', 'direita'].includes(direcao) ? direcao : 'baixo');
    // 0-2-1-2: o passo alterna entre parado e as duas pernas
    const passo = [0, 1, 0, 2][quadro % 4];
    const larg = T * S, alt = T * S;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bloco, dir * T, passo * T, T, T,
                  Math.round(x - larg / 2), Math.round(y + 13 - alt), larg, alt);
  },

  /* ---------- retrato (listas e vídeos sem câmera) ---------- */

  _retratos: new Map(),

  retrato(aparencia) {
    const ap = this.normalizar(aparencia);
    const chave = Object.values(ap).join('|');
    if (this._retratos.has(chave)) return this._retratos.get(chave);
    if (!this._pronto) return '';
    const T = this.TILE;
    const c = document.createElement('canvas');
    c.width = c.height = 48;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    // recorta cabeça e ombros do quadro de frente
    cx.drawImage(this._bloco(ap), T, 1, T, 11, -6, 0, T * 4, 11 * 4);
    const url = c.toDataURL();
    this._retratos.set(chave, url);
    return url;
  },

  /** Miniatura de uma opção do editor (usada para escolher o personagem). */
  miniaturaOpcao(chave, valor) {
    if (chave !== 'personagem' || !this._pronto) return null;
    return this.retrato({ personagem: valor,
                          corCamisa: this.PERSONAGENS[Number(valor)].camisa[0],
                          corCabelo: this.PERSONAGENS[Number(valor)].cabelo[0] || '#1c1410' });
  },
};

Boneco.iniciar();
