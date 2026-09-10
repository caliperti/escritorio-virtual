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
                '#4f7fd9', '#7c6fd0', '#b06fc0', '#e8e6e0', '#4a5060',
                '#2c2f38', '#f0a3b8', '#8a5a3a', '#c9d94f'],
    // Tipo de roupa: cada um é uma folha própria do LPC, com as MESMAS medidas
    // (andando 576x256, sentado 192x256). Por isso entra como camada, sem
    // mexer em mais nada — o que muda é o nome do arquivo.
    camisaTipo: ['camisa', 'camisa_golav', 'camisa_polo_c', 'camisa_regata',
                 'camisa_longa', 'camisa_golav_l', 'camisa_polo', 'camisa_social',
                 'camisa_cardiga_c', 'camisa_casaco', 'camisa_colete',
                 'camisa_blazer', 'camisa_sobretudo', 'camisa_casacolongo',
                 'camisa_listrada', 'camisa_regata_listrada'],
    calcaTipo: ['calca', 'calca_jeans', 'calca_social', 'calca_listrada', 'calca_barra',
                'calca_legging', 'calca_bermuda', 'calca_shorts', 'calca_saia'],
    sapatoTipo: ['sapato', 'sapato_social', 'sapato_tenis', 'sapato_bota',
                 'sapato_botalta', 'sapato_sandalia', 'sapato_chinelo'],
    corSapato: ['#3a3a42', '#6b4a2f', '#e8e6e0', '#8a4a3a', '#3f5a8a', '#4f7a52',
                '#d94f5c', '#e8843c', '#c8ccd4', '#1e1e26'],
    // 'nenhum' não tem folha: é a ausência de camada
    chapeuTipo: ['nenhum', 'bone_pintado', 'chapeu_bone', 'chapeu_faixa', 'chapeu_bandana',
                 'chapeu_coco', 'chapeu_cartola', 'chapeu_capuz', 'chapeu_lenco'],
    corCalca: ['#3d4457', '#2f3a52', '#6b5340', '#8a8f9c', '#40506b',
               '#2a2d36', '#e0ddd4', '#7a4a3a', '#3f6b52', '#5a4a70',
               '#b0a48e', '#d9a441'],
    barba: ['nenhuma', '5oclock_shadow', 'bigode', 'basic', 'medium'],
  },

  ROTULOS: {
    corpo: 'Tipo de corpo', pele: 'Pele', cabelo: 'Cabelo', barba: 'Barba',
    corCabelo: 'Cor do cabelo', corCamisa: 'Cor da camisa', corCalca: 'Cor da calça',
    camisaTipo: 'Roupa de cima', calcaTipo: 'Roupa de baixo',
    sapatoTipo: 'Calçado', corSapato: 'Cor do calçado', chapeuTipo: 'Cabeça',
    camisa: 'Camiseta', camisa_golav: 'Gola V', camisa_polo_c: 'Polo',
    camisa_regata: 'Regata', camisa_longa: 'Manga longa',
    camisa_golav_l: 'Gola V longa', camisa_polo: 'Polo manga longa',
    camisa_social: 'Camisa social', camisa_cardiga_c: 'Cardigã curto',
    camisa_casaco: 'Casaco', camisa_colete: 'Colete',
    calca: 'Calça', calca_social: 'Social', calca_jeans: 'Jeans',
    calca_listrada: 'Social listrada', calca_barra: 'Com barra',
    calca_legging: 'Legging', calca_bermuda: 'Bermuda',
    calca_shorts: 'Shorts', calca_saia: 'Saia',
    sapato: 'Sapato', sapato_social: 'Sapato social', sapato_tenis: 'Tênis',
    sapato_bota: 'Bota', sapato_botalta: 'Bota alta',
    sapato_sandalia: 'Sandália', sapato_chinelo: 'Chinelo',
    nenhum: 'Nada', bone_pintado: 'Boné', chapeu_lenco: 'Lenço de cabeça',
    chapeu_bone: 'Gorro',
    chapeu_faixa: 'Faixa', chapeu_bandana: 'Bandana', chapeu_coco: 'Chapéu coco',
    chapeu_cartola: 'Cartola', chapeu_capuz: 'Capuz',
    camisa_blazer: 'Blazer', camisa_sobretudo: 'Sobretudo',
    camisa_casacolongo: 'Casaco longo',
    camisa_listrada: 'Listrada', camisa_regata_listrada: 'Regata listrada',
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
    const roupas = [...this.CATALOGO.camisaTipo, ...this.CATALOGO.calcaTipo,
                    ...this.CATALOGO.sapatoTipo,
                    ...this.CATALOGO.chapeuTipo.filter(
                        (h) => h !== 'nenhum' && h !== 'bone_pintado')];
    const camadas = ['corpo_m', 'corpo_f',
                     'cabeca_m', 'cabeca_f', 'olhos', 'sobrancelha',
                     ...roupas.flatMap((r) => [r + '_m', r + '_f']),
                     ...this.CATALOGO.cabelo.map((e) => 'cabelo_' + e),
                     ...this.CATALOGO.barba.filter((b) => b !== 'nenhuma').map((b) => 'barba_' + b)];
    // Duas folhas por camada: andando e sentado. As da lista SEM_SENTADO só
    // existem andando — pedir a de sentado daria 404 em toda carga da página.
    const arquivos = [...camadas,
                      ...camadas.filter((c) => !this.SEM_SENTADO.has(c.replace(/_[mf]$/, '')))
                                .map((c) => 'sit_' + c)];
    this._carregar(arquivos);
  },

  /** Baixa uma lista de folhas e avisa quem estava esperando quando acabar. */
  _carregar(arquivos) {
    const novos = arquivos.filter((n) => !this._imgs[n]);
    if (!novos.length) {
      if (!this._pronto) { this._pronto = true; this._aoCarregar.forEach((f) => f()); }
      return;
    }
    this._faltam = (this._faltam || 0) + novos.length;
    for (const nome of novos) {
      const img = new Image();
      img.onload = () => {
        if (--this._faltam === 0) {
          this._pronto = true;
          this._cache.clear();
          this._retratos.clear();
          this._caixas.clear();
          this._aoCarregar.forEach((f) => f());
        }
      };
      img.onerror = () => { if (--this._faltam === 0) { this._pronto = true; this._aoCarregar.forEach((f) => f()); } };
      img.src = this.BASE + nome + '.png';
      this._imgs[nome] = img;
    }
  },

  /** Roupas criadas pelo admin no estúdio. Chegam do servidor e entram no
   *  catálogo como as de fábrica — a diferença é só de onde veio o arquivo. */
  acrescentarRoupas(roupas) {
    const novas = [];
    for (const [id, r] of Object.entries(roupas || {})) {
      const lista = this.CATALOGO[r.grupo];
      if (!lista || lista.includes(id)) continue;
      lista.push(id);
      this.ROTULOS[id] = r.nome || id;
      if (r.sem_sentado) this.SEM_SENTADO.add(id);
      novas.push(id + '_m', id + '_f');
      if (!r.sem_sentado) novas.push('sit_' + id + '_m', 'sit_' + id + '_f');
    }
    if (!novas.length) return 0;
    this._pronto = false;
    this._carregar(novas);
    return novas.length;
  },

  quandoCarregar(f) {
    if (this._pronto) f();
    else this._aoCarregar.push(f);
  },

  /* ---------- aparência ---------- */

  // Peça de cabeça só entra em 1 de cada 6 sorteios. Com duas opções, o sorteio
  // simples punha lenço em metade das pessoas, o que não é o normal num
  // escritório — quem quiser usar escolhe na mão.
  RARO: { chapeuTipo: 6 },

  /* ---------- boné desenhado à mão ----------
   *
   * O acervo não tem boné: o que mais chega perto é um gorro medieval com pena.
   * Como o boné era pedido, ele é DESENHADO por cima do boneco, quadro a quadro.
   *
   * O pulo do gato é não chutar onde fica a cabeça: a gente mede a caixa da
   * camada `cabeca_` em cada quadro e desenha em cima dela. Assim o boné
   * acompanha a cabeça subindo e descendo na caminhada, sem tabela de posição
   * escrita na mão — que quebraria na primeira troca de folha.
   */
  _caixas: new Map(),

  /** Caixa da cabeça em cada quadro da folha, medida uma vez por corpo. */
  _caixasDaCabeca(corpo, prefixo, L, A) {
    return this._caixasDaCamada(prefixo + 'cabeca_' + corpo, L, A);
  },

  /** Caixa (x, y, largura, altura) dos pixels de UMA camada em cada quadro da
   *  folha, medida uma vez por folha. É a régua de tudo que precisa saber onde
   *  a pessoa está de fato: o boné pintado e o encaixe das peças que só
   *  existem na folha de andar (ver `_deslocamentoSentado`). */
  _caixasDaCamada(nome, L, A) {
    const chave = nome + '|' + L;
    if (this._caixas.has(chave)) return this._caixas.get(chave);
    const img = this._imgs[nome];
    if (!img || !img.complete || !img.naturalWidth) return null;
    const c = document.createElement('canvas');
    c.width = L; c.height = A;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0);
    const dados = cx.getImageData(0, 0, L, A).data;
    const Q = this.QUADRO, cols = L / Q, caixas = [];
    for (let lin = 0; lin < 4; lin++) {
      caixas[lin] = [];
      for (let col = 0; col < cols; col++) {
        let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (let y = 0; y < Q; y++) {
          for (let x = 0; x < Q; x++) {
            const i = ((lin * Q + y) * L + col * Q + x) * 4 + 3;
            if (dados[i] < 40) continue;
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
        caixas[lin][col] = x1 < 0 ? null : { x: x0, y: y0, l: x1 - x0 + 1, a: y1 - y0 + 1 };
      }
    }
    this._caixas.set(chave, caixas);
    return caixas;
  },

  /** Copa + aba, na cor escolhida, em cima da caixa da cabeça. */
  _pintarBone(cx, caixa, lin, cor) {
    const { x, y, l } = caixa;
    const escuro = this._hex(this._mix(this._rgb(cor), [0, 0, 0], 0.35));
    const claro = this._hex(this._mix(this._rgb(cor), [255, 255, 255], 0.22));
    const topo = y + 1;                       // a testa começa logo abaixo
    const alt = 6;
    // aba: para a frente quando o boneco olha para baixo, para o lado nos perfis
    if (lin === this.LINHA.baixo) {
      cx.fillStyle = escuro;
      cx.fillRect(x - 1, topo + alt - 2, l + 2, 2);
    } else if (lin === this.LINHA.esquerda) {
      cx.fillStyle = escuro;
      cx.fillRect(x - 3, topo + alt - 3, 5, 2);
    } else if (lin === this.LINHA.direita) {
      cx.fillStyle = escuro;
      cx.fillRect(x + l - 2, topo + alt - 3, 5, 2);
    }
    cx.fillStyle = cor;                       // copa
    cx.fillRect(x, topo + 1, l, alt - 1);
    cx.fillRect(x + 1, topo, l - 2, 1);
    cx.fillStyle = claro;                     // luz no alto
    cx.fillRect(x + 2, topo + 1, l - 4, 1);
    cx.fillStyle = escuro;                    // costura da testa
    cx.fillRect(x, topo + alt - 1, l, 1);
    if (lin !== this.LINHA.cima) {            // botãozinho do topo
      cx.fillStyle = claro;
      cx.fillRect(x + Math.floor(l / 2) - 1, topo - 1, 2, 1);
    }
  },

  /** Peças que o acervo só publicou na folha de ANDAR. Sentado, elas usam a
   *  pose parada dessa folha, deslocada para onde o corpo sentado está de fato
   *  (ver `_folha` e `_deslocamentoSentado`). */
  SEM_SENTADO: new Set(['camisa_blazer', 'camisa_sobretudo', 'camisa_casacolongo',
                        'camisa_listrada', 'camisa_regata_listrada',
                        'chapeu_bone', 'chapeu_faixa', 'chapeu_bandana',
                        'chapeu_coco', 'chapeu_cartola', 'chapeu_capuz']),

  aleatoria() {
    const sorteio = (l) => l[Math.floor(Math.random() * l.length)];
    const ap = {};
    for (const c of Object.keys(this.CATALOGO)) {
      const raro = this.RARO[c];
      ap[c] = (raro && Math.random() * raro >= 1)
        ? this.CATALOGO[c][0]
        : sorteio(this.CATALOGO[c]);
    }
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
  _hex(rgb) { return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join(''); },

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

  /** Quanto a pose de cadeira desloca o corpo em relação à pose parada, numa
   *  direção — MEDIDO nas folhas, não chutado. A pose sentada não cai no mesmo
   *  lugar da pose de pé: de perfil a cabeça anda 3px para o lado que a pessoa
   *  olha, e de frente sobe 2px. Sem esta correção o blazer, a cartola e o
   *  capuz (que só existem na folha de andar) ficavam 3px fora da cabeça nos
   *  perfis e 2px baixos de frente — medido antes do conserto.
   *
   *  O que vai na cabeça segue a cabeça (camada `cabeca_`). A roupa de cima
   *  segue a linha do ombro, que é o topo da camiseta (`camisa_`): sentado o
   *  tronco cai 2px e a cabeça não, e medir só a cabeça deixava o casaco 2px
   *  alto. Cada folha é lida uma vez e fica em `_caixas`. */
  _deslocamentoSentado(corpo, lin, naCabeca) {
    const Q = this.QUADRO, A = Q * 4;
    const dePe = (nome) => this._caixasDaCamada(nome, Q * this.QUADROS, A);
    const sent = (nome) => this._caixasDaCamada('sit_' + nome, Q * this.QUADROS_SENTADO, A);
    const nada = { dx: 0, dy: 0 };
    const cabecaDePe = dePe('cabeca_' + corpo), cabecaSentada = sent('cabeca_' + corpo);
    if (!cabecaDePe || !cabecaSentada) return nada;
    const a = cabecaDePe[lin][0], s = cabecaSentada[lin][this.POSE_CADEIRA];
    if (!a || !s) return nada;
    const d = { dx: s.x - a.x, dy: s.y - a.y };
    if (!naCabeca) {
      const ombroDePe = dePe('camisa_' + corpo), ombroSentado = sent('camisa_' + corpo);
      const oa = ombroDePe && ombroDePe[lin][0];
      const os = ombroSentado && ombroSentado[lin][this.POSE_CADEIRA];
      if (oa && os) d.dy = os.y - oa.y;
    }
    return d;
  },

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
    // O quarto campo diz o que a peça acompanha quando falta a folha de
    // sentado: 'cabeca' segue a cabeça, 'tronco' segue o ombro.
    const camadas = [
      ['corpo_' + ap.corpo, ap.pele, true],
      ['cabeca_' + ap.corpo, ap.pele, true],      // no LPC o corpo vem sem cabeça
      ['olhos', null, false],
      ['sobrancelha', ap.corCabelo, false],
      [ap.calcaTipo + '_' + ap.corpo, ap.corCalca, false, 'tronco'],
      [ap.sapatoTipo + '_' + ap.corpo, ap.corSapato, false, 'tronco'],
      [ap.camisaTipo + '_' + ap.corpo, ap.corCamisa, false, 'tronco'],
      ['cabelo_' + ap.cabelo, ap.corCabelo, false, 'cabeca'],
    ];
    if (ap.barba !== 'nenhuma') camadas.push(['barba_' + ap.barba, ap.corCabelo, false, 'cabeca']);
    // o que vai na cabeça entra por último: cobre o cabelo, como na vida
    if (ap.chapeuTipo !== 'nenhum' && ap.chapeuTipo !== 'bone_pintado') {
      camadas.push([ap.chapeuTipo + '_' + ap.corpo, ap.corCamisa, false, 'cabeca']);
    }
    const vale = (i) => !!(i && i.complete && i.naturalWidth);
    for (const [nome, cor, preserva, onde] of camadas) {
      let img = this._imgs[prefixo + nome];
      let dePe = false;
      // Muita roupa boa do acervo (jaqueta, boné, cartola) só existe na folha de
      // ANDAR. Em vez de deixar essas peças de fora, quando falta a folha de
      // sentado a gente usa a pose parada da folha de pé, na coluna da cadeira.
      // Só que o corpo sentado NÃO cai no mesmo lugar do corpo de pé (de perfil
      // ele anda 3px, de frente sobe 2px), então a pose de pé entra deslocada
      // pelo que se mede nas folhas — sem isso a cartola ficava ao lado da
      // cabeça e o blazer com um ombro no ar.
      if (sentado && !vale(img)) { img = this._imgs[nome]; dePe = vale(img); }
      if (!vale(img)) continue;
      const temp = document.createElement('canvas');
      temp.width = L; temp.height = A;
      const tc = temp.getContext('2d');
      if (dePe) {
        const Q = this.QUADRO;
        for (let lin = 0; lin < 4; lin++) {
          const d = this._deslocamentoSentado(ap.corpo, lin, onde === 'cabeca');
          // recorta no quadro: deslocada, a peça não pode vazar na coluna vizinha
          tc.save();
          tc.beginPath();
          tc.rect(this.POSE_CADEIRA * Q, lin * Q, Q, Q);
          tc.clip();
          tc.drawImage(img, 0, lin * Q, Q, Q,
                       this.POSE_CADEIRA * Q + d.dx, lin * Q + d.dy, Q, Q);
          tc.restore();
        }
      } else {
        tc.drawImage(img, 0, 0);
      }
      if (cor) this._recolorir(tc, L, A, cor, preserva);   // olhos ficam na cor original
      cx.drawImage(temp, 0, 0);
    }

    // o boné é desenhado por último, já que não existe folha dele no acervo
    if (ap.chapeuTipo === 'bone_pintado') {
      const caixas = this._caixasDaCabeca(ap.corpo, prefixo, L, A);
      if (caixas) {
        const cols = L / this.QUADRO;
        for (let lin = 0; lin < 4; lin++) {
          for (let col = 0; col < cols; col++) {
            const cx0 = caixas[lin][col];
            if (!cx0) continue;
            cx.save();
            cx.translate(col * this.QUADRO, lin * this.QUADRO);
            this._pintarBone(cx, cx0, lin, ap.corCamisa);
            cx.restore();
          }
        }
      }
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
    // De frente o acervo não tem pose de cadeira: o quadro "sentado" é igual ao
    // de pé, o que fazia a pessoa parecer plantada em cima da cadeira. De costas
    // a pose certa já vem cortada na altura do quadril (acaba na linha 51 do
    // quadro) e o encosto esconde as pernas. Aqui a gente faz o mesmo de frente:
    // corta na mesma linha e deixa a cadeira cobrir o resto.
    const corte = (sentado && this.CORTE_SENTADO[direcao]) || Q;
    ctx.drawImage(folha, col * Q, linha * Q, Q, corte,
                  Math.round(x - lado / 2), Math.round(y + 13 - base),
                  lado, lado * (corte / Q));
  },

  /** Até que linha do quadro de 64px o corpo sentado aparece, por direção.
   *  51 é onde termina a pose de costas — a referência do acervo. */
  CORTE_SENTADO: { baixo: 51 },

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

  /** Corpo inteiro, pequeno. O retrato normal é só cabeça e ombros, e com ele
   *  não daria para escolher calça nenhuma — a peça fica fora do corte.
   *  `opc.direcao` ('baixo', 'cima', 'esquerda', 'direita') e `opc.sentado`
   *  mostram a mesma pessoa de outro ângulo ou na cadeira — é o que o
   *  mostruário usa para conferir toda roupa em toda pose, não só de frente. */
  retratoCorpo(aparencia, opc) {
    const ap = this.normalizar(aparencia);
    const direcao = opc && this.LINHA[opc.direcao] !== undefined ? opc.direcao : 'baixo';
    const sentado = !!(opc && opc.sentado);
    const chave = 'corpo|' + direcao + (sentado ? '|s|' : '|') + Object.values(ap).join('|');
    if (this._retratos.has(chave)) return this._retratos.get(chave);
    if (!this._pronto) return '';
    const Q = this.QUADRO;
    const c = document.createElement('canvas');
    c.width = 32; c.height = 62;
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    // parado, o quadro 2 da passada (postura natural); sentado, a pose de cadeira
    const col = sentado ? this.POSE_CADEIRA : 2;
    // sentado de frente o corpo termina no quadril, igual ao mapa (CORTE_SENTADO)
    const corte = (sentado && this.CORTE_SENTADO[direcao]) || Q;
    const alt = Math.min(62, corte - 2);
    // o QUADRO inteiro, dos cabelos aos pés: cortar na cintura fazia calça,
    // bermuda e saia ficarem idênticas na miniatura
    cx.drawImage(this._folha(ap, sentado), col * Q + 16, this.LINHA[direcao] * Q + 2,
                 32, alt, 0, 0, 32, alt);
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
    // roupa precisa do corpo inteiro: saia e bermuda não aparecem no retrato
    if (chave === 'camisaTipo') return this.retratoCorpo({ ...base, camisaTipo: valor });
    if (chave === 'calcaTipo') return this.retratoCorpo({ ...base, calcaTipo: valor });
    if (chave === 'sapatoTipo') return this.retratoCorpo({ ...base, sapatoTipo: valor });
    if (chave === 'chapeuTipo') return this.retrato({ ...base, chapeuTipo: valor });
    return null;
  },
};

Boneco.iniciar();
