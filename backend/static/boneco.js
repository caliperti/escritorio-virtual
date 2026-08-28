/* Os personagens.
 *
 * Agora são sprites do **LPC (Universal LPC Spritesheet)**: 64×64 por quadro,
 * 4 direções × 9 quadros de caminhada, em camadas separadas — corpo, calça,
 * sapato, camisa e cabelo. É o que tira o aspecto quadriculado dos 16×16
 * anteriores: são 4× mais pixels no mesmo espaço de tela.
 *
 * Cada camada vem numa cor só, então a personalização é feita **recolorindo**:
 * as cores da camada são ordenadas por luminância e mapeadas numa rampa criada
 * a partir da cor escolhida (do tom escuro ao claro). Assim o sombreado
 * original é preservado — só o matiz muda. O resultado fica em cache.
 *
 * Licença da arte em assets/LICENCA-lpc.txt (CC-BY-SA 3.0 / GPL 3.0).        */

const Boneco = {
  BASE: '/static/assets/lpc/',
  QUADRO: 64,
  QUADROS: 9,
  LINHA: { cima: 0, esquerda: 1, baixo: 2, direita: 3 },
  // A folha de sentado tem 3 poses por direção: 0 e 1 são sentar no chão,
  // 2 é sentar em cadeira (pernas para baixo) — é essa que queremos.
  QUADROS_SENTADO: 3,
  POSE_CADEIRA: 2,

  CATALOGO: {
    corpo: ['m', 'f'],
    pele: ['#f2cfa8', '#e5b487', '#c98d5f', '#a06b40', '#6f4726', '#432c19'],
    cabelo: ['messy1', 'parted', 'high_and_tight', 'spiked', 'buzzcut', 'curtains',
             'bob', 'afro', 'bangslong', 'cornrows'],
    corCabelo: ['#241a12', '#4a2f1b', '#8a5a2b', '#d8b164', '#a8452c',
                '#7c4fa8', '#e2e2e2', '#2f5fa8'],
    corCamisa: ['#d94f5c', '#e8843c', '#e0b93f', '#4fa86a', '#3fa8a0',
                '#4f7fd9', '#7c6fd0', '#b06fc0', '#e8e6e0', '#4a5060'],
    corCalca: ['#3d4457', '#2f3a52', '#6b5340', '#8a8f9c', '#40506b'],
    barba: ['nenhuma', '5oclock_shadow', 'bigode', 'basic', 'medium'],
  },

  ROTULOS: {
    corpo: 'Tipo de corpo', pele: 'Pele', cabelo: 'Cabelo', barba: 'Barba',
    corCabelo: 'Cor do cabelo', corCamisa: 'Cor da camisa', corCalca: 'Cor da calça',
    m: 'Largo', f: 'Esguio',
    messy1: 'Bagunçado', parted: 'Repartido', high_and_tight: 'Militar',
    spiked: 'Espetado', buzzcut: 'Raspado', curtains: 'Franjão',
    bob: 'Chanel', afro: 'Black power', bangslong: 'Longo', cornrows: 'Tranças',
    nenhuma: 'Nenhuma', '5oclock_shadow': 'Por fazer', bigode: 'Bigode',
    basic: 'Curta', medium: 'Cheia',
  },

  /* ---------- carga das camadas ---------- */

  _imgs: {},
  _faltam: 0,
  _pronto: false,
  _aoCarregar: [],

  iniciar() {
    const camadas = ['corpo_m', 'corpo_f', 'camisa_m', 'camisa_f', 'calca_m', 'calca_f',
                     'sapato_m', 'sapato_f', 'cabeca_m', 'cabeca_f', 'olhos', 'sobrancelha',
                     ...this.CATALOGO.cabelo.map((e) => 'cabelo_' + e),
                     ...this.CATALOGO.barba.filter((b) => b !== 'nenhuma').map((b) => 'barba_' + b)];
    // duas folhas por camada: andando e sentado
    const arquivos = [...camadas, ...camadas.map((c) => 'sit_' + c)];
    this._faltam = arquivos.length;
    for (const nome of arquivos) {
      const img = new Image();
      img.onload = () => {
        if (--this._faltam === 0) {
          this._pronto = true;
          this._cache.clear();
          this._retratos.clear();
          this._aoCarregar.forEach((f) => f());
        }
      };
      img.onerror = () => { this._faltam--; };
      img.src = this.BASE + nome + '.png';
      this._imgs[nome] = img;
    }
  },

  quandoCarregar(f) {
    if (this._pronto) f();
    else this._aoCarregar.push(f);
  },

  /* ---------- aparência ---------- */

  aleatoria() {
    const sorteio = (l) => l[Math.floor(Math.random() * l.length)];
    const ap = {};
    for (const c of Object.keys(this.CATALOGO)) ap[c] = sorteio(this.CATALOGO[c]);
    return ap;
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

  _rgb(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; },
  _lum(r, g, b) { return (0.299 * r + 0.587 * g + 0.114 * b) / 255; },
  _mix(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); },

  /** Rampa de tons a partir de uma cor, do escuro ao claro. */
  _rampa(cor, n) {
    const base = this._rgb(cor);
    const escuro = this._mix(base, [26, 18, 34], 0.62);
    const claro = this._mix(base, [255, 250, 235], 0.45);
    const saida = [];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      saida.push(t < 0.5 ? this._mix(escuro, base, t * 2) : this._mix(base, claro, (t - 0.5) * 2));
    }
    return saida;
  },

  /** Troca o matiz de uma camada mantendo o sombreado original. */
  _recolorir(ctx, w, h, cor, preservarEscuros) {
    const dados = ctx.getImageData(0, 0, w, h);
    const d = dados.data;
    const vistos = new Map();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 24) continue;
      const chave = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      if (!vistos.has(chave)) vistos.set(chave, this._lum(d[i], d[i + 1], d[i + 2]));
    }
    // olhos e contorno ficam de fora: recolorir tudo apagava o rosto
    const cores = [...vistos.entries()]
      .filter(([, l]) => !preservarEscuros || l > 0.22)
      .sort((a, b) => a[1] - b[1]);
    if (!cores.length) return;
    const rampa = this._rampa(cor, cores.length);
    const mapa = new Map(cores.map(([k], i) => [k, rampa[i]]));
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 24) continue;
      const nova = mapa.get((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
      if (nova) { d[i] = nova[0]; d[i + 1] = nova[1]; d[i + 2] = nova[2]; }
    }
    ctx.putImageData(dados, 0, 0);
  },

  /* ---------- montagem em cache ---------- */

  _cache: new Map(),

  _folha(ap, sentado) {
    const chave = Object.values(ap).join('|') + (sentado ? '|s' : '');
    if (this._cache.has(chave)) return this._cache.get(chave);

    const prefixo = sentado ? 'sit_' : '';
    const L = this.QUADRO * (sentado ? this.QUADROS_SENTADO : this.QUADROS), A = this.QUADRO * 4;
    const alvo = document.createElement('canvas');
    alvo.width = L; alvo.height = A;
    const cx = alvo.getContext('2d');

    // Ordem de empilhamento. Nesta versão do LPC o corpo vem sem rosto: olhos e
    // sobrancelha são camadas próprias — sem elas o personagem fica sem cara.
    const camadas = [
      ['corpo_' + ap.corpo, ap.pele, true],
      ['cabeca_' + ap.corpo, ap.pele, true],      // no LPC o corpo vem sem cabeça
      ['olhos', null, false],
      ['sobrancelha', ap.corCabelo, false],
      ['calca_' + ap.corpo, ap.corCalca, false],
      ['sapato_' + ap.corpo, '#3a3a42', false],
      ['camisa_' + ap.corpo, ap.corCamisa, false],
      ['cabelo_' + ap.cabelo, ap.corCabelo, false],
    ];
    if (ap.barba !== 'nenhuma') camadas.push(['barba_' + ap.barba, ap.corCabelo, false]);
    for (const [nome, cor, preserva] of camadas) {
      const img = this._imgs[prefixo + nome];
      if (!img || !img.complete || !img.naturalWidth) continue;
      const temp = document.createElement('canvas');
      temp.width = L; temp.height = A;
      const tc = temp.getContext('2d');
      tc.drawImage(img, 0, 0);
      if (cor) this._recolorir(tc, L, A, cor, preserva);   // olhos ficam na cor original
      cx.drawImage(temp, 0, 0);
    }

    if (this._cache.size > 60) this._cache.clear();
    this._cache.set(chave, alvo);
    return alvo;
  },

  /* ---------- desenho ---------- */

  /** Desenha com os pés em (x, y + 13) e o corpo centrado em x.
   *  `sentado` troca para a folha de sentado — é o que faz o boneco se acomodar
   *  na cadeira em vez de ficar plantado em cima dela. */
  desenhar(ctx, aparencia, x, y, direcao, quadro, escala, sentado) {
    const ap = this.normalizar(aparencia);
    const S = (escala || 2) * 0.46;                 // 64px de quadro no tamanho do mundo
    if (!this._pronto) {
      ctx.fillStyle = 'rgba(148,163,184,.55)';
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const folha = this._folha(ap, sentado);
    const Q = this.QUADRO;
    const linha = this.LINHA[direcao] === undefined ? this.LINHA.baixo : this.LINHA[direcao];
    // quadro 0 é a pose parada; 1..8 é a passada. Sentado tem pose única.
    const col = sentado ? this.POSE_CADEIRA : (quadro > 0 ? 1 + (quadro % 8) : 0);
    const lado = Q * S;
    ctx.imageSmoothingEnabled = false;
    // sentado o corpo sobe um pouco, para o quadril encostar no assento
    const base = sentado ? lado * 0.93 : lado * 0.955;
    ctx.drawImage(folha, col * Q, linha * Q, Q, Q,
                  Math.round(x - lado / 2), Math.round(y + 13 - base), lado, lado);
  },

  /* ---------- retrato ---------- */

  _retratos: new Map(),

  retrato(aparencia) {
    const ap = this.normalizar(aparencia);
    const chave = Object.values(ap).join('|');
    if (this._retratos.has(chave)) return this._retratos.get(chave);
    if (!this._pronto) return '';
    const c = document.createElement('canvas');
    c.width = c.height = 48;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    // cabeça e ombros do quadro parado, virado para a frente
    cx.drawImage(this._folha(ap), 2 * this.QUADRO + 18, this.QUADRO * 2 + 8, 28, 28, 0, 0, 48, 48);
    const url = c.toDataURL();
    this._retratos.set(chave, url);
    return url;
  },

  miniaturaOpcao(chave, valor) {
    if (!this._pronto) return null;
    const base = { corpo: 'm', pele: this.CATALOGO.pele[0], cabelo: 'messy1',
                   corCabelo: '#4a2f1b', corCamisa: '#4f7fd9', corCalca: '#3d4457',
                   barba: 'nenhuma' };
    if (chave === 'cabelo') return this.retrato({ ...base, cabelo: valor });
    if (chave === 'corpo') return this.retrato({ ...base, corpo: valor });
    if (chave === 'barba') return this.retrato({ ...base, barba: valor });
    return null;
  },
};

Boneco.iniciar();
