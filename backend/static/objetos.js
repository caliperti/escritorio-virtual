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

  /** Catálogo das peças criadas no estúdio, entregue pelo app na entrada. */
  CATALOGO_EXTRA: null,

  SEM_SOMBRA: new Set([
    'tapete', 'tapete_redondo', 'quadro', 'relogio', 'palco', 'divisoria',
    // arsenal: o que é raso, mora na parede ou pinta a própria sombra
    'tapete_azul', 'tapete_verde', 'tapete_cinza', 'tapete_grande', 'mousepad',
    'quadro_abstrato', 'mural', 'meia_parede', 'painel_vidro', 'painel_madeira',
    'janela', 'janela_grande', 'porta_madeira', 'porta_branca', 'porta_vidro', 'porta_dupla',
    'pendente', 'luminaria_comprida', 'fita_led',
  ]),

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
    // Sombra maior, mais escura e deslocada para o lado — sombra centrada e
    // fraquinha some no piso claro e a peça fica flutuando.
    c.fillStyle = 'rgba(66,56,88,.2)';
    c.beginPath();
    c.ellipse(x + w / 2 + 3, y + h - 2, w * 0.46, Math.min(h * 0.18, 8), 0, 0, Math.PI * 2);
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
    // arsenal — a mesma lista vive em `mapa.py:EM_PE`, os dois têm de bater
    'monitor_ultra', 'monitor_branco', 'braco_monitor', 'notebook_fechado', 'torre_gamer',
    'dock', 'webcam', 'caixa_som', 'teclado_gamer', 'teclado_branco', 'mouse_gamer',
    'fone_branco', 'bloco_notas', 'canetas', 'copo', 'copos', 'porta_documentos',
    'aromatizador', 'bonsai',
    // linha clara: os mesmos móveis em branco, para contrastar na mesa gamer preta
    'torre_branca', 'setup_branco', 'mouse_branco', 'monitor_ultra_branco',
  ]),
  VISTAS: ['frente', 'direita', 'tras', 'esquerda'],
  _vista: 'frente',

  /** Coisas de mesa que ficam DEITADAS (teclado, mouse, papel): estas giram de
   *  verdade — teclado virado para a esquerda é teclado em pé no desenho.
   *  Continuam em EM_PE para o espaço no mapa (são todas 1x1), só o desenho
   *  roda. Sem isto, girar o teclado no editor não mudava nada na tela. */
  DEITADOS: new Set(['teclado', 'teclado_gamer', 'teclado_branco', 'mouse', 'mouse_gamer',
                     'papeis', 'bloco_notas', 'porta_documentos', 'dock', 'notebook_fechado',
                     'livros', 'telefone', 'caneca']),

  /** Telas de chão: giram como os monitores — de lado viram perfil, de costas
   *  mostram a traseira. Rodar a arte punha a TV de ponta-cabeça no giro 2 e
   *  deitada no chão nos giros 1 e 3. O espaço no mapa continua trocando de
   *  lado (não estão em EM_PE), então de perfil a TV ocupa 1x2. */
  VIRA_VISTA: new Set(['tv', 'tv_grande']),

  /** Peças que ficam EM PÉ no chão: a arte nunca deita. Girada, entra em pé
   *  na caixa que o giro dá (a estante vira uma estante estreita, a geladeira
   *  uma geladeira larga) e de 180° em diante fica espelhada. Rodar a arte
   *  punha a geladeira deitada no chão, o abajur de lado e a planta com o
   *  vaso para cima. */
  NAO_DEITA: new Set(['armario', 'arquivo', 'estante', 'estante_alta', 'aparador', 'geladeira',
                      'frigobar', 'bebedouro', 'cafeteira', 'maquina_cafe', 'luminaria',
                      'planta', 'planta_alta', 'monstera', 'espada', 'palmeira', 'arvore',
                      'arbusto', 'microondas', 'frutas', 'relogio',
                      'mesa_redonda', 'mesa_centro_redonda',
                      'narguile', 'narguile_azul', 'narguile_preto', 'narguile_moderno',
                      'narguile_premium', 'narguile_pequeno']),

  /** Das peças em pé, as altas e finas: numa caixa deitada (1x2 virou 2x1) o
   *  desenho mantém a proporção, centrado, em vez de esticar — o narguilé
   *  esticado para 2x1 virava uma pilha de discos. */
  PROPORCAO_FIXA: new Set(['narguile', 'narguile_azul', 'narguile_preto', 'narguile_moderno',
                           'narguile_premium']),

  /** O que roda INTEIRO em qualquer giro (inclusive 180°): o que é rente ao
   *  chão ou é uma placa — tapete, palco, biombo — e o que está em `DEITADOS`.
   *  O resto espelha no 180°, porque rodar punha a faceta da frente em cima. */
  RODA_INTEIRO: new Set(['tapete', 'tapete_redondo', 'tapete_azul', 'tapete_verde', 'tapete_cinza',
                         'tapete_grande', 'mousepad', 'palco', 'divisoria']),

  /** Assento roda de verdade: nele o encosto é que diz para onde a pessoa
   *  olha, e um sofá de 180° tem de ficar de costas para quem vê. */
  _assento(tipo) { return /^(cadeira|gamer_|sofa|poltrona|banco|banqueta|puff)/.test(tipo); },
  _roda(tipo) {
    return this._assento(tipo) || this.DEITADOS.has(tipo) || this.RODA_INTEIRO.has(tipo);
  },

  /** Fileiras de monitor: as únicas peças de ficar em pé que se enfileiram no
   *  outro eixo quando a mesa está deitada. */
  // `monitor_ultra` estava no servidor e faltava aqui: girado, o cliente desenhava
  // 3x1 e o servidor cobrava 1x3 (testes/permissoes.py confere as duas listas).
  FILEIRA: new Set(['monitor_duplo', 'monitor_curvo', 'monitor_triplo', 'monitor_ultra',
                   'monitor_ultra_branco']),

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
  /** Móveis que são ALTOS de verdade. O número é quanto a arte sobe na tela, e
   *  a cor é a do corpo que aparece embaixo dela — a lateral da peça, que numa
   *  vista de cima é o que conta que aquilo tem altura. Sem isto, a estante e a
   *  geladeira ficam do mesmo tamanho de um tapete. */
  // `e` é o quanto a arte sobe; `c` a cor do corpo; `i` o quanto o corpo é mais
  // estreito que a peça — o vaso da planta é fino, o armário é largo.
  //
  // Os números são PEQUENOS de propósito. Já foram o triplo, e aí a peça saía
  // do próprio quadradinho e ficava desenhada em cima da parede de trás. Numa
  // vista de cima, o que conta altura é a lateral que aparece e a sombra no
  // chão, não a peça andar para cima.
  usarAltura: true,
  ALTOS: {
    estante:      { e: 8, c: '#caa274', i: 3 },
    armario:      { e: 6, c: '#efece6', i: 4 },
    geladeira:    { e: 8, c: '#e2e5ea', i: 4 },
    torre_grande: { e: 6, c: '#2c303a', i: 5 },
    divisoria:    { e: 6, c: '#cfd8e2', i: 3 },
    bebedouro:    { e: 5, c: '#e2e5ea', i: 8 },
    cafeteira:    { e: 4, c: '#2c303a', i: 7 },
    narguile:     { e: 5, c: '#b9bdc6', i: 11 },
    planta_alta:  { e: 5, c: '#c98159', i: 8 },
    pia:          { e: 4, c: '#efece6', i: 4 },
    balcao:       { e: 5, c: '#efece6', i: 3 },
    quadro:       { e: 5, c: '#b9b2a5', i: 4 },
    tv:           { e: 6, c: '#2c303a', i: 4 },
    arvore:       { e: 7, c: '#8a6440', i: 11 },
    luminaria:    { e: 6, c: '#b9bdc6', i: 12 },
    sofa:         { e: 3,  c: '#b6c4dc', i: 3 },
    poltrona:     { e: 3,  c: '#b6c4dc', i: 4 },
    mesa:         { e: 2,  c: '#efece6', i: 3 },
    mesa_grande:  { e: 2,  c: '#efece6', i: 3 },
    mesa_ampla:   { e: 2,  c: '#efece6', i: 3 },
    mesa_reuniao: { e: 2,  c: '#caa274', i: 3 },
    mesa_redonda: { e: 2,  c: '#efece6', i: 5 },
    cadeira:      { e: 2,  c: '#4f5665', i: 7 },
    cadeira_gamer:{ e: 2,  c: '#2c303a', i: 7 },
    // ---- arsenal ----
    // A cor do corpo é a da própria peça — um sofá azul não pode ter lateral
    // cinza. Mesa em L, curva e as redondas ficam de fora: o corpo é um
    // retângulo e ia aparecer embaixo do recorte.
    sofa_2:       { e: 3,  c: '#b6c4dc', i: 3 },
    sofa_bege:    { e: 3,  c: '#d9cfbc', i: 3 },
    sofa_azul:    { e: 3,  c: '#5b7fc4', i: 3 },
    sofa_verde:   { e: 3,  c: '#6fa387', i: 3 },
    sofa_caramelo:{ e: 3,  c: '#c98e5a', i: 3 },
    poltrona_caramelo: { e: 3, c: '#c98e5a', i: 4 },
    poltrona_preta:    { e: 3, c: '#3a3d45', i: 4 },
    poltrona_verde:    { e: 3, c: '#6fa387', i: 4 },
    cadeira_branca:   { e: 2, c: '#e9e7e2', i: 7 },
    cadeira_cinza:    { e: 2, c: '#8d939e', i: 7 },
    cadeira_bege:     { e: 2, c: '#cdbfa6', i: 7 },
    cadeira_azul:     { e: 2, c: '#4a72b8', i: 7 },
    cadeira_verde:    { e: 2, c: '#4f9b78', i: 7 },
    cadeira_laranja:  { e: 2, c: '#e0783f', i: 7 },
    cadeira_executiva:{ e: 2, c: '#2b2e36', i: 7 },
    cadeira_couro:    { e: 2, c: '#7a4a2e', i: 7 },
    cadeira_visita:   { e: 2, c: '#657081', i: 8 },
    banco_espera:     { e: 2, c: '#4f5665', i: 4 },
    gamer_azul:   { e: 2, c: '#2c303a', i: 7 },
    gamer_preta:  { e: 2, c: '#202329', i: 7 },
    gamer_branca: { e: 2, c: '#e6e6ea', i: 7 },
    gamer_rosa:   { e: 2, c: '#f0eef2', i: 7 },
    gamer_verde:  { e: 2, c: '#2c303a', i: 7 },
    mesa_branca:  { e: 2, c: '#f7f6f3', i: 3 },
    mesa_madeira: { e: 2, c: '#caa274', i: 3 },
    mesa_preta:   { e: 2, c: '#3b3e46', i: 3 },
    mesa_gamer:   { e: 2, c: '#2f323b', i: 3 },
    mesa_dupla:   { e: 2, c: '#efece6', i: 3 },
    bancada_trabalho: { e: 2, c: '#caa274', i: 3 },
    mesa_quadrada:    { e: 2, c: '#efece6', i: 3 },
    mesa_reuniao_p:   { e: 2, c: '#caa274', i: 3 },
    tv_grande:    { e: 6, c: '#2c303a', i: 4 },
    arquivo:      { e: 6, c: '#cfd3d9', i: 5 },
    estante_alta: { e: 10, c: '#caa274', i: 3 },
    frigobar:     { e: 6, c: '#e2e5ea', i: 4 },
    armario_aereo:{ e: 6, c: '#efece6', i: 3 },
    maquina_cafe: { e: 5, c: '#2c303a', i: 6 },
    meia_parede:  { e: 6, c: '#e4dfd5', i: 2 },
    painel_vidro: { e: 6, c: '#cfd8e2', i: 3 },
    painel_madeira: { e: 6, c: '#caa274', i: 3 },
    quadro_abstrato:{ e: 5, c: '#a9835a', i: 4 },
    mural:        { e: 5, c: '#a9835a', i: 4 },
    monstera:     { e: 5, c: '#c98159', i: 8 },
    espada:       { e: 4, c: '#c98159', i: 9 },
    palmeira:     { e: 7, c: '#9a7350', i: 11 },
    jardineira:   { e: 4, c: '#efece6', i: 3 },
    narguile_azul:    { e: 5, c: '#b9bdc6', i: 11 },
    narguile_preto:   { e: 5, c: '#b9bdc6', i: 11 },
    narguile_moderno: { e: 5, c: '#b9bdc6', i: 11 },
    narguile_premium: { e: 5, c: '#b9bdc6', i: 11 },
    narguile_pequeno: { e: 3, c: '#b9bdc6', i: 11 },
    // faltavam: o aparador é um armário baixo, o pebolim e o banco têm a
    // altura de uma mesa e de um sofá — sem corpo ficavam rentes ao chão
    aparador:     { e: 5, c: '#caa274', i: 3 },
    pebolim:      { e: 3, c: '#a9835a', i: 3 },
    banco:        { e: 2, c: '#caa274', i: 4 },
  },

  /* ---------- peças de imagem, criadas no estúdio ----------
   * O móvel de fábrica é desenhado por código; o que o admin sobe é uma
   * imagem. As duas convivem: quem tem `imagem` no catálogo desenha a foto
   * dentro da caixa da peça, e o resto continua como sempre. */
  _fotos: new Map(),

  foto(url) {
    let img = this._fotos.get(url);
    if (img) return img;
    img = new Image();
    img.src = url;
    this._fotos.set(url, img);
    return img;
  },

  /** Desenha a imagem inteira dentro da caixa, sem esticar: ela cresce até
   *  encostar no lado mais apertado e fica encostada embaixo, como um móvel
   *  apoiado no chão. */
  desenharFoto(c, url, x, y, w, h) {
    const img = this.foto(url);
    if (!img.complete || !img.naturalWidth) return false;
    const escala = Math.min((w - 2) / img.naturalWidth, (h - 2) / img.naturalHeight);
    const lw = img.naturalWidth * escala, lh = img.naturalHeight * escala;
    c.drawImage(img, x + (w - lw) / 2, y + h - lh - 1, lw, lh);
    return true;
  },

  desenhar(c, tipo, x, y, w, h, giro) {
    const doEstudio = this.CATALOGO_EXTRA && this.CATALOGO_EXTRA[tipo];
    if (doEstudio && doEstudio.imagem) {
      if (!this.SEM_SOMBRA.has(tipo) && doEstudio.camada !== 'piso') {
        this.sombraChao(c, x, y, w, h);
      }
      const g = (((giro | 0) % 4) + 4) % 4;
      if (!g) { this.desenharFoto(c, doEstudio.imagem, x, y, w, h); return; }
      c.save();                                  // peça de imagem gira inteira
      c.translate(x + w / 2, y + h / 2);
      c.rotate(g * Math.PI / 2);
      const lw = (g % 2) ? h : w, lh = (g % 2) ? w : h;
      this.desenharFoto(c, doEstudio.imagem, -lw / 2, -lh / 2, lw, lh);
      c.restore();
      return;
    }
    if (!this.SEM_SOMBRA.has(tipo)) this.sombraChao(c, x, y, w, h);
    const alto = this.usarAltura === false ? null : this.ALTOS[tipo];
    if (alto) {
      // o corpo: a lateral da peça, do chão até onde a arte sobe. Acompanha a
      // largura da ARTE, não da caixa: o narguilé girado é mais fino que ela.
      const arte = this._caixaDaArte(tipo, x, y, w, h, giro);
      const i = alto.i === undefined ? 3 : alto.i;
      this.ret(c, arte.x + i, y + h - alto.e - 5, arte.w - i * 2, alto.e + 3, 3, this.traco(alto.c));
      this.ret(c, arte.x + i + 1, y + h - alto.e - 4, arte.w - i * 2 - 2, alto.e + 1, 2,
               this.sombra(alto.c, .3));
      c.save();
      c.translate(0, -alto.e);
    }
    this._pintar(c, tipo, x, y, w, h, giro);
    if (alto) c.restore();
  },

  /** Onde a arte cai dentro da caixa ocupada. Só muda para as peças de
   *  `PROPORCAO_FIXA` numa caixa deitada: elas ficam altas e finas no meio. */
  _caixaDaArte(tipo, x, y, w, h, giro) {
    const g = (((giro | 0) % 4) + 4) % 4;
    if ((g % 2) && w > h && this.PROPORCAO_FIXA.has(tipo)) {
      const lw = h / 2;
      return { x: x + (w - lw) / 2, y, w: lw, h };
    }
    return { x, y, w, h };
  },

  _pintar(c, tipo, x, y, w, h, giro) {
    const g = (((giro | 0) % 4) + 4) % 4;
    const f = this.DESENHOS[tipo];
    const pintar = (px, py, pw, ph) => {
      if (f) f.call(this, c, px, py, pw, ph);
      else this.bloco(c, px + 2, py + 2, pw - 4, ph - 4, this.TAMPO);
    };
    // espelho horizontal: a peça "virada para o outro lado" sem sair do 3/4
    const espelhar = (px, py, pw, ph) => {
      c.save(); c.translate(px + pw, py); c.scale(-1, 1);
      pintar(0, 0, pw, ph);
      c.restore();
    };
    if (!g) { pintar(x, y, w, h); return; }
    if ((this.EM_PE.has(tipo) && !this.DEITADOS.has(tipo)) || this.VIRA_VISTA.has(tipo)) {
      // fica de pé: muda para onde olha, não a inclinação. A caixa já vem
      // girada, então o desenho só precisa se acomodar nela.
      this._vista = this.VISTAS[g];
      if (this._vista === 'esquerda') espelhar(x, y, w, h);   // o perfil do outro lado é o espelho
      else pintar(x, y, w, h);
      this._vista = 'frente';
      return;
    }
    if (this.NAO_DEITA.has(tipo)) {
      // em pé no chão: entra em pé na caixa do giro; de 180° em diante, espelhada
      const a = this._caixaDaArte(tipo, x, y, w, h, g);
      if (g >= 2) espelhar(a.x, a.y, a.w, a.h); else pintar(a.x, a.y, a.w, a.h);
      return;
    }
    if (g === 2 && !this._roda(tipo)) {
      // 180° é espelho, não cambalhota: rodar a arte punha a faceta da frente
      // em cima e a luz de cima embaixo — a mesa ficava de ponta-cabeça.
      espelhar(x, y, w, h);
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
      // Tampo redondo em 3/4: elipse achatada com a faceta da frente embaixo,
      // como a mesa oval. A versão anterior era quase um círculo com brilho de
      // esfera — parecia uma bola de bilhar em cima de um pé.
      const cor = this.TAMPO, f = this.FRENTE, cx = x + w / 2, cy = y + h * 0.5;
      const rx = w / 2 - 5, ry = h * 0.3;
      this.ret(c, cx - 3, cy, 6, h / 2 - 6, 2, this.PE);                  // pé
      this.elipse(c, cx, y + h - 6, rx * 0.45, 3, this.traco(this.PE));   // base do pé
      this.elipse(c, cx, y + h - 7, rx * 0.45 - 1, 2.5, this.PE);
      this.elipse(c, cx, cy, rx, ry, this.traco(cor));
      this.elipse(c, cx, cy, rx - 1, ry - 1, this.sombra(cor, 0.28));      // faceta da frente
      this.elipse(c, cx, cy - f / 2, rx - 1, ry - 1 - f / 2, cor);        // tampo
      this.elipse(c, cx - rx * 0.35, cy - ry * 0.6, rx * 0.25, 3, this.luz(cor, 0.5));
    },
    balcao(c, x, y, w, h) {
      this.bloco(c, x + 1, y + 2, w - 2, h - 4, this.MADEIRA, 3);
      this.ret(c, x + 3, y + h - 11, w - 6, 4, 2, this.sombra(this.MADEIRA, 0.35));
      this.ret(c, x + 1, y + 2, w - 2, 4, 3, this.TAMPO);                 // tampo claro
    },
    mesa_centro(c, x, y, w, h) {
      this.bloco(c, x + 5, y + 6, w - 10, h - 12, this.TAMPO, 5);
    },

    /* ================= mesas (arsenal) ================= */
    mesa_branca(c, x, y, w, h) {
      // Branca de verdade, sem a emenda da geminada; o passa-cabo é o único enfeite.
      const cor = '#f7f6f3';
      this._mesa(c, x, y, w, h, false, cor);
      this.elipse(c, x + w - 14, y + 9, 3, 2, this.sombra(cor, 0.3));
    },
    mesa_madeira(c, x, y, w, h) {
      const cor = this.MADEIRA;
      this._mesa(c, x, y, w, h, false, cor);
      this._veios(c, x + 8, y + 7, w - 16, h - 18, cor);
    },
    mesa_preta(c, x, y, w, h) { this._mesa(c, x, y, w, h, false, '#3b3e46'); },
    mesa_quadrada(c, x, y, w, h) { this._mesa(c, x, y, w, h, false, this.TAMPO); },
    mesa_l(c, x, y, w, h) {
      // Mesa em L: o braço comprido atrás e o braço curto descendo pela direita.
      this._blocoL(c, x + 1, y + 2, w - 2, h - 4, h * 0.5, w * 0.42, this.TAMPO);
    },
    mesa_gamer(c, x, y, w, h) { this._mesaGamer(c, x, y, w, h, '#2f323b'); },
    // A mesa gamer preta engole qualquer máquina preta em cima dela. Estas duas
    // são a mesma mesa em claro e em madeira, para dar contraste.
    mesa_gamer_branca(c, x, y, w, h) { this._mesaGamer(c, x, y, w, h, '#eceae5'); },
    mesa_gamer_madeira(c, x, y, w, h) { this._mesaGamer(c, x, y, w, h, '#a9764a'); },
    mesa_curva(c, x, y, w, h) {
      // Tampo com a frente côncava, o recorte para quem senta. Três passadas
      // do mesmo caminho: contorno, faceta da frente e tampo — o tampo é o
      // mesmo desenho FRENTE px mais baixo, então a faceta acompanha a curva.
      const cor = this.TAMPO, f = this.FRENTE, prof = h * 0.22;
      this._tampoCurvo(c, x + 1, y + 2, w - 2, h - 4, prof, this.traco(cor));
      this._tampoCurvo(c, x + 2, y + 3, w - 4, h - 6, prof, this.sombra(cor, 0.28));
      this._tampoCurvo(c, x + 2, y + 3, w - 4, h - 6 - f, prof, cor);
      this.ret(c, x + 6, y + 5, w - 12, 2, 1, this.luz(cor, 0.5));
    },
    mesa_dupla(c, x, y, w, h) {
      // Duas mesas de frente uma para a outra com o biombo baixo no meio.
      const cor = this.TAMPO, div = '#c9d2dd';
      this.bloco(c, x + 1, y + 2, w - 2, h / 2 - 2, cor, 3);                      // mesa de trás
      this.ret(c, x + 3, y + h / 2 - 6, w - 6, 9, 2, this.traco(div));            // biombo
      this.ret(c, x + 4, y + h / 2 - 5, w - 8, 7, 2, div);
      this.ret(c, x + 6, y + h / 2 - 4, w - 12, 1.5, 1, this.luz(div, 0.6));
      this.bloco(c, x + 1, y + h / 2 + 3, w - 2, h / 2 - 5, cor, 3);              // mesa da frente
      for (const dx of [w * 0.25, w * 0.75]) {                                    // passa-cabos
        this.elipse(c, x + dx, y + 10, 3, 2, this.sombra(cor, 0.3));
        this.elipse(c, x + dx, y + h / 2 + 11, 3, 2, this.sombra(cor, 0.3));
      }
    },
    bancada_trabalho(c, x, y, w, h) {
      // Bancada comprida de madeira maciça sobre cavaletes de aço.
      const cor = this.MADEIRA, n = Math.max(2, Math.round(w / 64));
      this.bloco(c, x + 1, y + 3, w - 2, h - 5, cor, 2);
      this._veios(c, x + 8, y + 6, w - 16, h - 17, cor);
      for (let i = 0; i < n; i++) {                                               // cavaletes
        const px = x + 10 + i * ((w - 26) / (n - 1));
        this.ret(c, px, y + h - 9, 6, 5, 1, this.ESCURO);
      }
    },

    /* ================= mesas de reunião e de centro (arsenal) ================= */
    mesa_reuniao_p(c, x, y, w, h) {
      const cor = this.MADEIRA;
      this.bloco(c, x + 3, y + 3, w - 6, h - 6, cor, 9);
      this.ret(c, x + 9, y + 9, w - 18, h - 22, 5, this.luz(cor, 0.18));
    },
    mesa_reuniao_oval(c, x, y, w, h) {
      // Tampo oval: a faceta da frente é a lua crescente que sobra embaixo
      // quando a elipse do tampo sobe FRENTE px.
      const cor = this.MADEIRA, f = this.FRENTE, cx = x + w / 2, cy = y + h / 2 + 2;
      const rx = w / 2 - 4, ry = h / 2 - 6;
      this.elipse(c, cx, cy, rx, ry, this.traco(cor));
      this.elipse(c, cx, cy, rx - 1, ry - 1, this.sombra(cor, 0.28));
      this.elipse(c, cx, cy - f / 2, rx - 1, ry - 1 - f / 2, cor);
      this.elipse(c, cx, cy - 3, rx - 12, ry - 12, this.luz(cor, 0.18));
      this.elipse(c, cx - rx * 0.4, cy - ry * 0.6, rx * 0.22, 3, this.luz(cor, 0.45));
    },
    mesa_centro_redonda(c, x, y, w, h) {
      // Mesa de centro redonda e baixa: tampo de madeira num pé de metal.
      // `ry` bem menor que `rx`: com os dois quase iguais o tampo virava uma
      // bola de madeira, e não um tampo visto em 3/4.
      const cor = this.MADEIRA, f = 5, cx = x + w / 2, cy = y + h / 2;
      const rx = w / 2 - 8, ry = h * 0.27;
      this.elipse(c, cx, y + h - 6, rx * 0.5, 3, this.traco(this.METAL));          // base do pé
      this.elipse(c, cx, y + h - 7, rx * 0.5 - 1, 2.5, this.METAL);
      this.elipse(c, cx, cy + 1, rx, ry, this.traco(cor));
      this.elipse(c, cx, cy + 1, rx - 1, ry - 1, this.sombra(cor, 0.28));
      this.elipse(c, cx, cy + 1 - f / 2, rx - 1, ry - 1 - f / 2, cor);
      this.elipse(c, cx, cy - 2, rx - 7, ry - 7, this.luz(cor, 0.15));
      this.elipse(c, cx - rx * 0.35, cy - ry * 0.55 - 1, rx * 0.28, 2.5, this.luz(cor, 0.45));
    },

    /* ================= assentos ================= */
    cadeira(c, x, y, w, h) { this._cadeira(c, x, y, w, h, this.CADEIRA); },
    cadeira_gamer(c, x, y, w, h) { this._cadeira(c, x, y, w, h, '#2b2f3a', '#e0453f'); },
    poltrona(c, x, y, w, h) { this._poltrona(c, x, y, w, h, this.ESTOFADO); },
    sofa(c, x, y, w, h) { this._sofa(c, x, y, w, h, this.ESTOFADO); },
    banqueta(c, x, y, w, h) {
      const cor = this.CADEIRA;
      this.ret(c, x + w / 2 - 2, y + h - 13, 4, 9, 2, this.PE);
      this.elipse(c, x + w / 2, y + h / 2 - 1, w / 2 - 9, h / 2 - 11, this.traco(cor));
      this.elipse(c, x + w / 2, y + h / 2 - 3, w / 2 - 10, h / 2 - 12, cor);
    },

    /* ================= cadeiras (arsenal) ================= */
    // Só muda a cor: é a mesma cadeira giratória de sempre.
    cadeira_branca(c, x, y, w, h) { this._cadeira(c, x, y, w, h, '#e9e7e2'); },
    cadeira_cinza(c, x, y, w, h) { this._cadeira(c, x, y, w, h, '#8d939e'); },
    cadeira_bege(c, x, y, w, h) { this._cadeira(c, x, y, w, h, '#cdbfa6'); },
    cadeira_azul(c, x, y, w, h) { this._cadeira(c, x, y, w, h, '#4a72b8'); },
    cadeira_verde(c, x, y, w, h) { this._cadeira(c, x, y, w, h, '#4f9b78'); },
    cadeira_laranja(c, x, y, w, h) { this._cadeira(c, x, y, w, h, '#e0783f'); },
    // Executiva e de couro: encosto alto, apoio de cabeça e costura no couro.
    cadeira_executiva(c, x, y, w, h) {
      this._cadeira(c, x, y, w, h, '#2b2e36', null, { alto: true, costura: true });
    },
    cadeira_couro(c, x, y, w, h) {
      this._cadeira(c, x, y, w, h, '#7a4a2e', null, { alto: true, costura: true });
    },
    cadeira_visita(c, x, y, w, h) {
      // Cadeira fixa de visitante: pés de trenó em metal, sem rodinha nem
      // coluna — é o que a diferencia da giratória num relance.
      const cor = this.CADEIRA_LUZ, cx = x + w / 2;
      for (const s of [-1, 1]) {
        this.ret(c, cx + s * 11 - 1.5, y + 11, 3, h - 20, 1, this.METAL);   // trenó lateral
        this.ret(c, cx + s * 9 - 1.5, y + h - 9, 3, 5, 1, this.PE);         // pé da frente
      }
      this.ret(c, cx - 10, y + 5, 20, 8, 4, this.traco(cor));               // encosto
      this.ret(c, cx - 9, y + 6, 18, 6, 3, cor);
      this.ret(c, cx - 7, y + 7, 14, 2, 1, this.luz(cor, 0.3));
      this.ret(c, cx - 9, y + 13, 18, 12, 4, this.traco(cor));              // assento
      this.ret(c, cx - 8, y + 14, 16, 10, 3, cor);
      this.ret(c, cx - 6, y + 15, 12, 2, 1, this.luz(cor, 0.25));
      this.ret(c, cx - 8, y + 21, 16, 3, 2, this.sombra(cor, 0.25));        // frente do assento
    },
    banco_espera(c, x, y, w, h) {
      // Banco de sala de espera: três conchas presas numa viga de metal.
      const cor = this.CADEIRA, n = 3, lg = (w - 10) / n;
      this.ret(c, x + 8, y + h - 8, 4, 5, 1, this.PE);                      // pés
      this.ret(c, x + w - 12, y + h - 8, 4, 5, 1, this.PE);
      this.ret(c, x + 3, y + h - 11, w - 6, 4, 2, this.METAL);              // viga
      this.ret(c, x + 3, y + h - 11, w - 6, 1.5, 1, this.luz(this.METAL, 0.5));
      for (let i = 0; i < n; i++) {
        const sx = x + 5 + i * lg;
        this.ret(c, sx + 1, y + 4, lg - 2, 8, 4, this.traco(cor));          // encosto
        this.ret(c, sx + 2, y + 5, lg - 4, 6, 3, cor);
        this.ret(c, sx + 4, y + 6, lg - 8, 2, 1, this.luz(cor, 0.3));
        this.ret(c, sx + 2, y + 12, lg - 4, 11, 3, this.traco(cor));        // assento
        this.ret(c, sx + 3, y + 13, lg - 6, 9, 3, this.luz(cor, 0.12));
        this.ret(c, sx + 5, y + 14, lg - 10, 2, 1, this.luz(cor, 0.3));
        this.ret(c, sx + 3, y + 19, lg - 6, 3, 2, this.sombra(cor, 0.2));   // frente da concha
      }
    },

    /* ================= cadeiras gamer (arsenal) ================= */
    gamer_azul(c, x, y, w, h) { this._cadeira(c, x, y, w, h, '#2b2f3a', '#3f7fe0'); },
    gamer_preta(c, x, y, w, h) { this._cadeira(c, x, y, w, h, '#202329', '#4a4f5a'); },
    gamer_branca(c, x, y, w, h) { this._cadeira(c, x, y, w, h, '#e6e6ea', '#2b2f3a'); },
    gamer_rosa(c, x, y, w, h) { this._cadeira(c, x, y, w, h, '#f0eef2', '#ff6ec0'); },
    gamer_verde(c, x, y, w, h) { this._cadeira(c, x, y, w, h, '#2b2f3a', '#4fd38a'); },

    /* ================= sofás (arsenal) ================= */
    sofa_2(c, x, y, w, h) { this._sofa(c, x, y, w, h, this.ESTOFADO); },
    sofa_bege(c, x, y, w, h) { this._sofa(c, x, y, w, h, '#d9cfbc'); },
    sofa_azul(c, x, y, w, h) { this._sofa(c, x, y, w, h, '#5b7fc4'); },
    sofa_verde(c, x, y, w, h) { this._sofa(c, x, y, w, h, '#6fa387'); },
    sofa_caramelo(c, x, y, w, h) { this._sofa(c, x, y, w, h, '#c98e5a'); },

    /* ================= poltronas (arsenal) ================= */
    poltrona_caramelo(c, x, y, w, h) { this._poltrona(c, x, y, w, h, '#c98e5a'); },
    poltrona_preta(c, x, y, w, h) { this._poltrona(c, x, y, w, h, '#3a3d45'); },
    poltrona_verde(c, x, y, w, h) { this._poltrona(c, x, y, w, h, '#6fa387'); },
    poltrona_redonda(c, x, y, w, h) {
      // Poltrona-ovo num pedestal: o casulo é uma concha grossa atrás que
      // afina nos braços, e a almofada azul afundada na frente é o que diz
      // "aqui se senta" — a primeira versão era uma bola de cristal.
      const cor = this.TECIDO, alm = this.ALMOFADA, cx = x + w / 2, cy = y + h / 2;
      this.ret(c, cx - 3, y + h - 18, 6, 10, 2, this.PE);                       // haste
      this.elipse(c, cx, y + h - 8, 13, 4, this.traco(this.METAL));             // pedestal
      this.elipse(c, cx, y + h - 9, 12, 3.5, this.METAL);
      this.elipse(c, cx, cy - 1, w / 2 - 7, h / 2 - 9, this.traco(cor));
      this.elipse(c, cx, cy - 2, w / 2 - 8, h / 2 - 10, cor);                   // casulo
      this.elipse(c, cx, cy + 17, w / 2 - 17, 4, this.sombra(cor, 0.3));        // beirada da frente
      this.elipse(c, cx, cy + 3, w / 2 - 15, h / 2 - 17, this.sombra(cor, 0.3)); // poço do assento
      this.elipse(c, cx, cy + 6, w / 2 - 17, h / 2 - 21, this.traco(alm));
      this.elipse(c, cx, cy + 5, w / 2 - 18, h / 2 - 22, alm);                   // almofada
      this.elipse(c, cx - 5, cy + 1, 6, 2.5, this.luz(alm, 0.5));
      this.elipse(c, cx, cy - 17, w / 2 - 20, 3, this.luz(cor, 0.5));           // luz no alto do encosto
    },
    puff(c, x, y, w, h) {
      // Puff redondo, capitonê: um tambor baixo e largo, com as pregas em cruz
      // e o botão no meio. Baixo de propósito — alto vira abóbora.
      const cor = '#cfa46a', cx = x + w / 2, cy = y + h / 2 + 1;
      this.elipse(c, cx, cy + 3, 13, 9, this.traco(cor));
      this.ret(c, cx - 12, cy - 2, 24, 8, 1, this.sombra(cor, 0.28));            // lateral
      this.elipse(c, cx, cy + 5, 12, 5, this.sombra(cor, 0.28));
      this.elipse(c, cx, cy - 2, 12, 8, this.traco(cor));
      this.elipse(c, cx, cy - 2, 11, 7, cor);                                    // tampo
      c.strokeStyle = this.sombra(cor, 0.3); c.lineWidth = 1; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(cx - 8, cy - 2); c.lineTo(cx + 8, cy - 2);
      c.moveTo(cx, cy - 7); c.lineTo(cx, cy + 3);
      c.stroke();
      this.elipse(c, cx - 4, cy - 5, 3.5, 1.8, this.luz(cor, 0.5));
      this.elipse(c, cx, cy - 2, 1.6, 1.6, this.sombra(cor, 0.45));              // botão
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
      // Gira como os monitores (VIRA_VISTA): de lado é o perfil, de costas a
      // traseira sai de `_tela`. Antes a arte rodava e a TV ficava de cabeça
      // para baixo no giro 2.
      if (this._vista === 'direita' || this._vista === 'esquerda') {
        this._perfil(c, x + 2, y + 3, w - 4, h - 9, this.ESCURO); return;
      }
      this.ret(c, x + w / 2 - 9, y + h - 9, 18, 4, 2, this.ESCURO);           // pé
      this.ret(c, x + 3, y + 3, w - 6, h - 13, 3, this.ESCURO);
      this._tela(c, x + 6, y + 6, w - 12, h - 19, 'video');
    },
    tapete(c, x, y, w, h) { this._tapete(c, x, y, w, h, '#c9bcd8'); },
    tapete_azul(c, x, y, w, h) { this._tapete(c, x, y, w, h, '#a8c4e8'); },
    tapete_verde(c, x, y, w, h) { this._tapete(c, x, y, w, h, '#a9d0b6'); },
    tapete_cinza(c, x, y, w, h) { this._tapete(c, x, y, w, h, '#c6c4c0'); },
    tapete_grande(c, x, y, w, h) { this._tapete(c, x, y, w, h, '#d8c9b2', true); },
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
    narguile(c, x, y, w, h) { this._narguile(c, x, y, w, h); },
    narguile_azul(c, x, y, w, h) { this._narguile(c, x, y, w, h, { vidro: '#2f5aa8' }); },
    narguile_preto(c, x, y, w, h) { this._narguile(c, x, y, w, h, { vidro: '#1d1d24', corpo: '#15151b' }); },
    narguile_moderno(c, x, y, w, h) {
      this._narguile(c, x, y, w, h, { ouro: '#c8ccd4', ouroEsc: '#8d939e', vidro: '#3a7f77' });
    },
    narguile_pequeno(c, x, y, w, h) {
      // O mesmo desenho numa caixa de UM tile: o grande é 1x2, então aqui ele
      // entra com metade da largura e a altura do tile. A versão anterior
      // desenhava com h*1.5 e o vaso caía inteiro no tile de baixo.
      c.save(); c.translate(x + w * 0.22, y + 1);
      this._narguile(c, 0, 0, w * 0.56, h - 2, { vidro: '#8a4a7a', semFumaca: true });
      c.restore();
    },
    narguile_premium(c, x, y, w, h) {
      this._narguile(c, x, y, w, h, { vidro: '#5b2f6e', barro: '#8d5a3c', corpo: '#1b1b22' });
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
    microondas(c, x, y, w, h) {
      const cor = '#dfe3e8';
      this.bloco(c, x + 2, y + 8, w - 4, h - 12, cor, 3);
      this.ret(c, x + 4, y + 11, w - 12, h - 19, 2, this.ESCURO);       // porta de vidro
      this.ret(c, x + 5, y + 12, w - 15, h - 22, 1, this.mix(this.TELA, this.ESCURO, .35));
      this.ret(c, x + w - 7, y + 12, 3, 6, 1, this.sombra(cor, .3));    // painel
    },
    frutas(c, x, y, w, h) {
      this.elipse(c, x + w / 2, y + h - 9, 9, 5, this.traco('#d9b98a'));
      this.elipse(c, x + w / 2, y + h - 10, 8, 4, '#e8cfa4');
      for (const [dx, dy, r, cor] of [[-4, -13, 4, '#e0574a'], [1, -15, 4, '#e8a33d'],
                                      [5, -12, 3.5, '#6fb356'], [-1, -11, 3.5, '#d9748a']]) {
        this.elipse(c, x + w / 2 + dx, y + h + dy, r, r, this.traco(cor));
        this.elipse(c, x + w / 2 + dx, y + h + dy - 1, r - 1, r - 1, cor);
      }
    },
    aparador(c, x, y, w, h) {
      const cor = this.MADEIRA;
      this.bloco(c, x + 2, y + 4, w - 4, h - 8, cor, 3);
      this.ret(c, x + 5, y + 8, w - 10, 2, 1, this.sombra(cor, .3));     // divisão das portas
      this.ret(c, x + w / 2 - 1, y + 7, 2, h - 15, 1, this.sombra(cor, .35));
      for (const dx of [w * 0.28, w * 0.72]) {
        this.ret(c, x + dx - 3, y + h - 13, 6, 2, 1, this.METAL);        // puxadores
      }
      this.ret(c, x + 4, y + 5, w - 8, 2, 1, this.luz(cor, 0.4));        // tampo
    },
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

    monitor_gamer(c, x, y, w, h) { this._setupGamer(c, x, y, w, h, this.ESCURO); },
    setup_branco(c, x, y, w, h) { this._setupGamer(c, x, y, w, h, '#e9e7e2'); },

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

    /* ================= arsenal: telas, computadores e eletrônicos ================= */

    monitor_ultra(c, x, y, w, h) { this._ultra(c, x, y, w, h, this.ESCURO); },
    monitor_ultra_branco(c, x, y, w, h) { this._ultra(c, x, y, w, h, '#e9e7e2'); },
    monitor_branco(c, x, y, w, h) {
      if (this._vista === 'direita' || this._vista === 'esquerda') {
        this._perfil(c, x, y, w, h, '#e6e4df'); return;
      }
      const cor = '#eceae5';
      this.ret(c, x + w / 2 - 6, y + h - 4, 12, 4, 2, this.sombra(cor, 0.2));   // base rente ao tile
      this.ret(c, x + w / 2 - 2.5, y + h - 7, 5, 5, 1, this.sombra(cor, 0.12));
      this.ret(c, x + 2, y + 1, w - 4, h - 7, 3, this.traco(cor));
      this.ret(c, x + 3, y + 2, w - 6, h - 9, 2, cor);
      this._tela(c, x + 5, y + 4, w - 10, h - 13, 'planilha');
    },
    braco_monitor(c, x, y, w, h) {
      // Braço articulado: garra na borda da mesa, dois segmentos e a tela na ponta.
      const cx = x + w / 2;
      this.ret(c, cx - 4, y + h - 8, 8, 7, 2, this.traco(this.METAL));     // garra
      this.ret(c, cx - 3, y + h - 7, 6, 5, 1, this.METAL);
      c.strokeStyle = this.mix(this.METAL, this.ESCURO, 0.25);
      c.lineWidth = 3; c.lineCap = 'round';
      c.beginPath();
      c.moveTo(cx, y + h - 8);
      c.lineTo(cx - w * 0.18, y + h * 0.45);
      c.lineTo(cx + w * 0.1, y + h * 0.32);
      c.stroke();
      this.elipse(c, cx - w * 0.18, y + h * 0.45, 2.5, 2.5, this.ESCURO);  // cotovelo
      this._tela(c, x + 4, y + 3, w - 8, h * 0.3, 'codigo');
      this.ret(c, x + 3, y + 2, w - 6, h * 0.3 + 2, 2, this.traco(this.ESCURO));
      this._tela(c, x + 5, y + 4, w - 10, h * 0.3 - 2, 'codigo');
    },
    notebook_fechado(c, x, y, w, h) {
      const cor = '#b9bdc6';
      this.bloco(c, x + 3, y + h * 0.3, w - 6, h * 0.42, cor, 3);
      this.ret(c, x + 5, y + h * 0.3 + 3, w - 10, 1.5, 1, this.luz(cor, 0.5));
      this.elipse(c, x + w / 2, y + h * 0.46, 3, 3, this.sombra(cor, 0.3));   // marca
    },
    torre_gamer(c, x, y, w, h) { this._torreGamer(c, x, y, w, h, '#1e1e26', '#2b3350'); },
    // O mesmo gabinete em branco: em cima da mesa gamer preta ele aparece.
    torre_branca(c, x, y, w, h) { this._torreGamer(c, x, y, w, h, '#efedE8', '#cfd6e6'); },
    dock(c, x, y, w, h) {
      const cor = '#3a3f4a';
      this.bloco(c, x + 5, y + h * 0.42, w - 10, h * 0.3, cor, 2);
      for (let i = 0; i < 3; i++) {
        this.ret(c, x + 8 + i * 5, y + h * 0.46, 3, 2, 0.5, this.mix(cor, this.METAL, 0.5));
      }
      this.elipse(c, x + w - 8, y + h * 0.5, 1.6, 1.6, '#4fae91');            // luz de ligado
    },
    tv_grande(c, x, y, w, h) {
      const cor = this.ESCURO;
      if (this._vista === 'direita' || this._vista === 'esquerda') {        // de lado: perfil
        this._perfil(c, x + 2, y + 3, w - 4, h - 9, cor); return;
      }
      this.ret(c, x + 2, y + h * 0.18, w - 4, h * 0.6, 3, this.traco(cor));
      this.ret(c, x + 3, y + h * 0.2, w - 6, h * 0.56, 2, cor);
      this._tela(c, x + 5, y + h * 0.24, w - 10, h * 0.48, 'video');
      this.ret(c, x + w / 2 - 10, y + h * 0.78, 20, 3, 1, this.mix(cor, this.METAL, 0.3));
    },
    webcam(c, x, y, w, h) {
      const cx = x + w / 2, cy = y + h * 0.5;
      this.ret(c, cx - 7, cy + 4, 14, 4, 2, this.ESCURO);                     // clipe
      this.elipse(c, cx, cy, 6, 5, this.traco(this.ESCURO));
      this.elipse(c, cx, cy - 0.5, 5, 4.2, this.ESCURO);
      this.elipse(c, cx, cy - 0.5, 2.4, 2.2, this.TELA);
      this.elipse(c, cx - 1, cy - 1.5, 1, 0.9, 'rgba(255,255,255,.6)');
    },
    caixa_som(c, x, y, w, h) {
      for (const dx of [-w * 0.19, w * 0.19]) {
        this.bloco(c, x + w / 2 + dx - 5, y + h * 0.36, 10, h * 0.4, '#33373f', 2);
        this.elipse(c, x + w / 2 + dx, y + h * 0.52, 3, 3, this.sombra('#33373f', 0.5));
        this.elipse(c, x + w / 2 + dx, y + h * 0.52, 1.4, 1.4, this.mix('#33373f', this.METAL, 0.4));
      }
    },

    /* ================= arsenal: acessórios de mesa ================= */

    teclado_gamer(c, x, y, w, h) {
      const meio = y + h / 2;
      this.ret(c, x + 3, meio - 4, w - 6, 11, 2, this.traco('#2a2d36'));
      this.ret(c, x + 4, meio - 3, w - 8, 9, 2, '#2a2d36');
      const cores = ['#e0453f', '#e08a2f', '#e0c72f', '#4fae91', '#3f8fe0', '#8f6ce8'];
      for (let i = 0; i < 6; i++) {                                          // teclas coloridas
        this.ret(c, x + 6 + i * ((w - 14) / 6), meio - 1.5, (w - 16) / 6, 4, 0.5, cores[i]);
      }
      c.save(); c.globalAlpha = 0.35;
      this.ret(c, x + 4, meio + 6, w - 8, 2, 1, '#8f6ce8');                   // brilho embaixo
      c.restore();
    },
    teclado_branco(c, x, y, w, h) {
      const meio = y + h / 2;
      this.ret(c, x + 4, meio - 3, w - 8, 10, 2, this.traco('#f2efe9'));
      this.ret(c, x + 5, meio - 2, w - 10, 8, 2, '#f2efe9');
      c.fillStyle = 'rgba(120,115,110,.28)';
      for (let f = 0; f < 3; f++) {
        for (let i = 0; i * 4 < w - 16; i++) c.fillRect(x + 7 + i * 4, meio + f * 2.4 - 0.5, 2.4, 1.6);
      }
    },
    mouse_gamer(c, x, y, w, h) { this._mouseGamer(c, x, y, w, h, '#2a2d36'); },
    mouse_branco(c, x, y, w, h) { this._mouseGamer(c, x, y, w, h, '#f0eee9'); },
    mousepad(c, x, y, w, h) {
      const cor = '#2f333c';
      this.ret(c, x + 3, y + h * 0.3, w - 6, h * 0.42, 4, this.mix(cor, '#000', 0.25));
      this.ret(c, x + 4, y + h * 0.32, w - 8, h * 0.38, 3, cor);
      this.ret(c, x + 7, y + h * 0.36, w - 14, 1, 0.5, 'rgba(255,255,255,.1)');
    },
    fone_branco(c, x, y, w, h) {
      const cx = x + w / 2, base = y + h - 7;
      this.elipse(c, cx, base, 7, 2.4, this.traco('#e8e6e0'));
      this.ret(c, cx - 1.2, base - 9, 2.4, 9, 1, this.METAL);
      c.strokeStyle = this.traco('#e8e6e0'); c.lineWidth = 3.4;
      c.beginPath(); c.arc(cx, base - 10, 7, Math.PI, 0); c.stroke();
      c.strokeStyle = '#f2efe9'; c.lineWidth = 2.2;
      c.beginPath(); c.arc(cx, base - 10, 7, Math.PI, 0); c.stroke();
      for (const s of [-1, 1]) this.elipse(c, cx + s * 7, base - 9, 2.6, 3.4, '#f2efe9');
    },
    bloco_notas(c, x, y, w, h) {
      const cor = '#fbfaf6';
      this.ret(c, x + 6, y + h * 0.32, w - 12, h * 0.4, 2, this.traco(cor));
      this.ret(c, x + 7, y + h * 0.34, w - 14, h * 0.36, 2, cor);
      c.fillStyle = 'rgba(120,115,110,.35)';
      for (let i = 0; i < 3; i++) c.fillRect(x + 9, y + h * 0.4 + i * 3.5, w - 18, 1);
      this.ret(c, x + 6, y + h * 0.3, w - 12, 2.5, 1, '#e08a2f');             // espiral
      c.strokeStyle = '#3f8fe0'; c.lineWidth = 2; c.lineCap = 'round';        // caneta
      c.beginPath(); c.moveTo(x + w - 9, y + h * 0.3); c.lineTo(x + w - 6, y + h * 0.66); c.stroke();
    },
    canetas(c, x, y, w, h) {
      const cx = x + w / 2, base = y + h - 8;
      for (const [dx, cor, alt] of [[-3, '#3f8fe0', 10], [0, '#e0453f', 13], [3, '#4fae91', 11]]) {
        this.ret(c, cx + dx - 1, base - alt, 2, alt, 1, cor);
        this.ret(c, cx + dx - 1, base - alt, 2, 2.5, 1, this.sombra(cor, 0.35));
      }
      this.ret(c, cx - 6, base - 6, 12, 9, 2, this.traco(this.METAL));
      this.ret(c, cx - 5, base - 5, 10, 7, 2, this.METAL);
      this.ret(c, cx - 4, base - 4.5, 8, 1.5, 0.5, this.luz(this.METAL, 0.4));
    },
    copo(c, x, y, w, h) {
      const cx = x + w / 2, base = y + h - 8;
      this.ret(c, cx - 4, base - 10, 8, 10, 1.5, this.traco('#cfe0ea'));
      this.ret(c, cx - 3.4, base - 9.4, 6.8, 9, 1.5, 'rgba(205,225,238,.75)');
      this.ret(c, cx - 3.4, base - 5, 6.8, 4.6, 1, '#9fc8de');                // água
      this.ret(c, cx - 2.4, base - 8.6, 1.4, 6, 0.7, 'rgba(255,255,255,.55)');
    },
    copos(c, x, y, w, h) {
      const cx = x + w / 2, base = y + h - 7;
      for (let i = 0; i < 3; i++) {                                          // pilha
        const by = base - i * 3;
        this.elipse(c, cx, by, 6, 2.2, this.traco('#e2ecf2'));
        this.elipse(c, cx, by - 0.6, 5.4, 1.9, '#eaf2f7');
      }
      this.elipse(c, cx, base - 8, 5.4, 2, 'rgba(255,255,255,.7)');
    },

    /* ================= arsenal: decoração ================= */

    quadro_abstrato(c, x, y, w, h) {
      const moldura = '#7d746a';
      this.ret(c, x + 3, y + h * 0.16, w - 6, h * 0.56, 2, this.traco(moldura));
      this.ret(c, x + 4, y + h * 0.18, w - 8, h * 0.52, 2, moldura);
      this.ret(c, x + 6, y + h * 0.22, w - 12, h * 0.44, 1, '#f6f2ea');
      const px = x + 6, py = y + h * 0.22, pw = w - 12, ph = h * 0.44;
      this.elipse(c, px + pw * 0.32, py + ph * 0.55, pw * 0.2, ph * 0.3, '#e08a4a');
      this.ret(c, px + pw * 0.5, py + ph * 0.2, pw * 0.14, ph * 0.66, 1, '#4f7fd9');
      this.elipse(c, px + pw * 0.74, py + ph * 0.38, pw * 0.13, ph * 0.22, '#4fae91');
    },
    mural(c, x, y, w, h) {
      const cortica = '#c9a06a';
      this.ret(c, x + 2, y + h * 0.14, w - 4, h * 0.6, 3, this.traco(cortica));
      this.ret(c, x + 3.5, y + h * 0.16, w - 7, h * 0.56, 2, cortica);
      const notas = ['#f2e07a', '#a8d8f0', '#f2b0c0', '#b8e8b0', '#f2c88a'];
      for (let i = 0; i < 5; i++) {
        const nx = x + 7 + i * ((w - 20) / 5), ny = y + h * (i % 2 ? 0.24 : 0.42);
        this.ret(c, nx, ny, 9, 8, 1, this.sombra(notas[i], 0.25));
        this.ret(c, nx, ny - 1, 9, 8, 1, notas[i]);
        this.elipse(c, nx + 4.5, ny + 0.5, 1.2, 1.2, '#d94a3a');              // alfinete
      }
    },
    porta_documentos(c, x, y, w, h) {
      const cor = '#4a5060';
      for (let i = 0; i < 2; i++) {
        const by = y + h * 0.62 - i * 6;
        this.ret(c, x + 4, by, w - 8, 5, 1, this.traco(cor));
        this.ret(c, x + 5, by + 0.6, w - 10, 3.6, 1, cor);
        this.ret(c, x + 7, by - 2, w - 14, 3, 0.5, '#fbfaf6');                // papel dentro
      }
    },
    aromatizador(c, x, y, w, h) {
      const cx = x + w / 2, base = y + h - 8;
      for (const [dx, alt] of [[-2.5, 12], [0, 15], [2.5, 11], [1, 13]]) {    // varetas
        c.strokeStyle = '#b08a5a'; c.lineWidth = 1.2; c.lineCap = 'round';
        c.beginPath(); c.moveTo(cx, base - 6); c.lineTo(cx + dx * 1.6, base - alt); c.stroke();
      }
      this.ret(c, cx - 3.5, base - 7, 7, 7, 2, this.traco('#c9a89a'));
      this.ret(c, cx - 3, base - 6.4, 6, 6, 2, '#e0c4b4');
      this.ret(c, cx - 2, base - 4, 4, 3.4, 1, '#c98a5a');                    // líquido
    },

    /* ================= arsenal: plantas ================= */

    monstera(c, x, y, w, h) {
      const cx = x + w / 2, base = y + h - 8;
      this._vaso(c, cx, base, 8);
      const v = this.VERDE;
      // folhas laterais em ±6 com raio 9.5: em ±8 com raio 10 saíam 2px do tile
      for (const [dx, dy, r, ang] of [[-6, 0.42, 9.5, -0.5], [6, 0.4, 9.5, 0.5],
                                      [0, 0.24, 11, 0], [-5, 0.6, 8, -0.3], [6, 0.62, 8, 0.3]]) {
        const fx = cx + dx, fy = y + h * dy;
        this.elipse(c, fx, fy, r, r * 0.82, this.traco(v));
        this.elipse(c, fx, fy - 0.8, r - 1.2, r * 0.72, dy < 0.35 ? this.luz(v, 0.12) : this.VERDE_ESC);
        c.save();                                                            // os recortes da folha
        c.fillStyle = this.sombra(v, 0.55); c.globalAlpha = 0.5;
        for (const s of [-1, 1]) {
          c.beginPath();
          c.ellipse(fx + s * r * 0.42, fy, r * 0.16, r * 0.42, ang, 0, Math.PI * 2);
          c.fill();
        }
        c.restore();
      }
    },
    espada(c, x, y, w, h) {
      const cx = x + w / 2, base = y + h - 7;
      this._vaso(c, cx, base, 6.5);
      // as folhas nascem em base-6 = y+19: com 19px de altura a mais alta
      // encosta no topo do tile e não invade o de cima (antes iam a 27px e
      // saíam 8px do tile, cortadas na miniatura)
      for (const [dx, alt, incl] of [[-4, 14, -0.22], [-1.5, 17, -0.08],
                                     [1.5, 19, 0.06], [4, 15, 0.2], [0, 16, 0]]) {
        c.save();
        c.translate(cx + dx, base - 6);
        c.rotate(incl);
        c.fillStyle = this.traco(this.VERDE_ESC);
        c.beginPath(); c.ellipse(0, -alt / 2, 2.6, alt / 2, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = this.VERDE_ESC;
        c.beginPath(); c.ellipse(0, -alt / 2, 1.9, alt / 2 - 1, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = this.luz('#c9c05a', 0.15);                             // borda amarelada
        c.beginPath(); c.ellipse(0.8, -alt / 2, 0.6, alt / 2 - 3, 0, 0, Math.PI * 2); c.fill();
        c.restore();
      }
    },
    bonsai(c, x, y, w, h) {
      const cx = x + w / 2, base = y + h - 8;
      this.ret(c, cx - 7, base - 4, 14, 5, 2, this.traco('#8a6a4a'));         // bandeja rasa
      this.ret(c, cx - 6, base - 3.4, 12, 3.6, 1.5, '#8a6a4a');
      c.strokeStyle = '#7a5a3a'; c.lineWidth = 2.2; c.lineCap = 'round';      // tronco torto
      c.beginPath();
      c.moveTo(cx, base - 4);
      c.bezierCurveTo(cx - 4, base - 9, cx + 4, base - 11, cx + 1, base - 15);
      c.stroke();
      for (const [dx, dy, r] of [[-3, -16, 5], [3, -14, 4.5], [0, -19, 4]]) {
        this.elipse(c, cx + dx, base + dy, r, r * 0.62, this.traco(this.VERDE_ESC));
        this.elipse(c, cx + dx, base + dy - 0.6, r - 1, r * 0.5, this.VERDE);
      }
    },
    palmeira(c, x, y, w, h) {
      const cx = x + w / 2, base = y + h - 10;
      this._vaso(c, cx, base, 11);
      c.strokeStyle = '#8a7050'; c.lineWidth = 3.4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(cx, base - 9); c.lineTo(cx - 1, y + h * 0.42); c.stroke();
      const topo = y + h * 0.42;
      for (const ang of [-2.5, -1.9, -1.2, -0.6, 0.1, 0.7, 1.3]) {           // folhas em leque
        const ex = cx - 1 + Math.cos(ang) * w * 0.34;
        const ey = topo + Math.sin(ang) * h * 0.16;
        c.save();
        c.translate((cx - 1 + ex) / 2, (topo + ey) / 2);
        c.rotate(ang);
        c.fillStyle = this.traco(this.VERDE);
        c.beginPath(); c.ellipse(0, 0, w * 0.19, 3.4, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = ang < -1 ? this.VERDE_ESC : this.VERDE;
        c.beginPath(); c.ellipse(0, -0.4, w * 0.17, 2.5, 0, 0, Math.PI * 2); c.fill();
        c.restore();
      }
    },
    jardineira(c, x, y, w, h) {
      const cor = this.MADEIRA;
      this.bloco(c, x + 2, y + h * 0.42, w - 4, h * 0.44, cor, 2);
      this.ret(c, x + 4, y + h * 0.45, w - 8, 2, 1, this.sombra(cor, 0.3));   // terra
      for (let i = 0; i * 11 < w - 12; i++) {
        const cx = x + 9 + i * 11;
        this.elipse(c, cx, y + h * 0.38, 5.5, 4.5, this.traco(this.VERDE));
        this.elipse(c, cx, y + h * 0.37, 4.6, 3.7, i % 2 ? this.VERDE : this.VERDE_ESC);
        this.elipse(c, cx - 1.6, y + h * 0.34, 1.8, 1.4, this.luz(this.VERDE, 0.3));
      }
    },

    /* ================= arsenal: iluminação ================= */

    pendente(c, x, y, w, h) {
      const cx = x + w / 2;
      c.strokeStyle = '#5a5450'; c.lineWidth = 1.4;                          // fio
      c.beginPath(); c.moveTo(cx, y + 1); c.lineTo(cx, y + h * 0.38); c.stroke();
      c.save(); c.globalAlpha = 0.4;
      this.elipse(c, cx, y + h * 0.72, w * 0.34, h * 0.2, '#f5e3b8');        // luz no chão
      c.restore();
      c.fillStyle = this.traco('#e0b153');                                    // cúpula
      c.beginPath();
      c.moveTo(cx - w * 0.3, y + h * 0.56); c.lineTo(cx - w * 0.08, y + h * 0.36);
      c.lineTo(cx + w * 0.08, y + h * 0.36); c.lineTo(cx + w * 0.3, y + h * 0.56);
      c.closePath(); c.fill();
      c.fillStyle = '#e8bf6a';
      c.beginPath();
      c.moveTo(cx - w * 0.26, y + h * 0.54); c.lineTo(cx - w * 0.07, y + h * 0.38);
      c.lineTo(cx + w * 0.07, y + h * 0.38); c.lineTo(cx + w * 0.26, y + h * 0.54);
      c.closePath(); c.fill();
      this.elipse(c, cx, y + h * 0.56, w * 0.27, h * 0.05, '#fff3d0');
    },
    luminaria_comprida(c, x, y, w, h) {
      this.ret(c, x + 3, y + h * 0.36, w - 6, h * 0.16, 3, this.traco(this.METAL));
      this.ret(c, x + 4, y + h * 0.38, w - 8, h * 0.12, 2, this.METAL);
      this.ret(c, x + 5, y + h * 0.46, w - 10, h * 0.09, 2, '#fff3d0');
      c.save(); c.globalAlpha = 0.35;
      this.ret(c, x + 4, y + h * 0.55, w - 8, h * 0.16, 4, '#f5e3b8');
      c.restore();
    },
    fita_led(c, x, y, w, h) {
      const cores = ['#e0453f', '#e08a2f', '#e0c72f', '#4fae91', '#3f8fe0', '#8f6ce8'];
      this.ret(c, x + 2, y + h * 0.44, w - 4, h * 0.1, 2, '#2f333c');
      for (let i = 0; i < cores.length; i++) {
        const lx = x + 4 + i * ((w - 8) / cores.length);
        this.ret(c, lx, y + h * 0.46, (w - 8) / cores.length - 1, h * 0.06, 1, cores[i]);
        c.save(); c.globalAlpha = 0.3;
        this.elipse(c, lx + (w - 8) / cores.length / 2, y + h * 0.56, 5, 3.5, cores[i]);
        c.restore();
      }
    },

    /* ================= arsenal: escritório ================= */

    arquivo(c, x, y, w, h) {
      const cor = '#c8ccd4';
      this.bloco(c, x + 4, y + 4, w - 8, h - 9, cor, 2);
      for (let i = 0; i < 3; i++) {
        const gy = y + 8 + i * ((h - 20) / 2);
        this.ret(c, x + 6, gy, w - 12, 1.5, 0.5, this.sombra(cor, 0.3));
        this.ret(c, x + w / 2 - 4, gy + 2.5, 8, 1.8, 0.8, this.METAL);
      }
    },
    estante_alta(c, x, y, w, h) {
      const cor = this.MADEIRA_ESC;
      this.ret(c, x + 2, y + 2, w - 4, h - 5, 3, this.traco(cor));
      this.ret(c, x + 3, y + 3, w - 6, h - 7, 2, cor);
      const cores = ['#d9776a', '#6f9fd8', '#e0b563', '#6fb98a', '#a889cc', '#e0857a'];
      for (let f = 0; f < 3; f++) {
        const ly = y + 6 + f * ((h - 14) / 3);
        this.ret(c, x + 5, ly + (h - 14) / 3 - 3, w - 10, 2.5, 1, this.sombra(cor, 0.4));
        for (let i = 0; i < Math.floor((w - 14) / 5); i++) {
          const alt = 6 + ((i + f) % 3) * 2;
          this.ret(c, x + 6 + i * 5, ly + (h - 14) / 3 - 3 - alt, 3.6, alt, 0.8,
                   cores[(i + f * 2) % cores.length]);
        }
      }
    },

    /* ================= arsenal: portas, paredes e divisórias ================= */

    porta_madeira(c, x, y, w, h) { this._porta(c, x, y, w, h, this.MADEIRA); },
    porta_branca(c, x, y, w, h) { this._porta(c, x, y, w, h, '#f0ede6'); },
    porta_vidro(c, x, y, w, h) { this._porta(c, x, y, w, h, '#bcd6e8', { vidro: true }); },
    porta_dupla(c, x, y, w, h) {
      this._porta(c, x, y, w / 2, h, this.MADEIRA, { mao: 1 });
      this._porta(c, x + w / 2, y, w / 2, h, this.MADEIRA, { mao: -1 });
    },
    meia_parede(c, x, y, w, h) {
      const cor = '#e9e3d8';
      this.ret(c, x, y + h * 0.3, w, h * 0.42, 2, this.traco(cor));
      this.ret(c, x + 1, y + h * 0.32, w - 2, h * 0.38, 2, cor);
      this.ret(c, x + 1, y + h * 0.32, w - 2, 3, 1, this.luz(cor, 0.5));
      this.ret(c, x + 1, y + h * 0.64, w - 2, 4, 1, this.sombra(cor, 0.25));
    },
    painel_vidro(c, x, y, w, h) {
      this.ret(c, x, y + h * 0.34, w, 3, 1, this.PE);
      this.ret(c, x + 1, y + h * 0.37, w - 2, h * 0.3, 1, 'rgba(190,215,232,.55)');
      for (let i = 1; i * 14 < w; i++) {
        this.ret(c, x + i * 14, y + h * 0.34, 2, h * 0.33, 0.5, this.BORDA);  // montantes
      }
      c.save(); c.globalAlpha = 0.35;
      this.ret(c, x + 3, y + h * 0.39, w * 0.2, h * 0.22, 1, '#ffffff');      // reflexo
      c.restore();
      this.ret(c, x, y + h * 0.66, w, 3, 1, this.BORDA);
    },
    painel_madeira(c, x, y, w, h) {
      const cor = this.MADEIRA;
      this.ret(c, x, y + h * 0.3, w, h * 0.42, 2, this.traco(cor));
      this.ret(c, x + 1, y + h * 0.32, w - 2, h * 0.38, 2, cor);
      for (let i = 0; i * 9 < w - 4; i++) {
        this.ret(c, x + 3 + i * 9, y + h * 0.34, 1.4, h * 0.34, 0.5, this.sombra(cor, 0.22));
      }
      this.ret(c, x + 1, y + h * 0.32, w - 2, 2, 1, this.luz(cor, 0.35));
    },
    janela_grande(c, x, y, w, h) {
      this.ret(c, x, y + h * 0.26, w, h * 0.5, 2, this.TAMPO_ESC);
      this.ret(c, x + 2, y + h * 0.3, w - 4, h * 0.42, 1, '#cfe6f2');
      c.save(); c.globalAlpha = 0.5;
      this.ret(c, x + 4, y + h * 0.32, w * 0.28, h * 0.36, 1, '#ffffff');
      c.restore();
      for (let i = 1; i < 4; i++) {
        this.ret(c, x + i * (w / 4), y + h * 0.28, 2, h * 0.46, 0.5, this.TAMPO);
      }
      this.ret(c, x, y + h * 0.72, w, 3.5, 1, this.TAMPO);                    // peitoril
    },

    /* ================= arsenal: copa ================= */

    frigobar(c, x, y, w, h) {
      const cor = '#dfe3e8';
      this.bloco(c, x + 4, y + 6, w - 8, h - 12, cor, 3);
      this.ret(c, x + w - 10, y + 10, 2.5, 7, 1, this.METAL);                 // puxador
      this.ret(c, x + 6, y + h * 0.62, w - 12, 1.5, 0.5, this.sombra(cor, 0.25));
    },
    armario_aereo(c, x, y, w, h) {
      const cor = this.TAMPO;
      this.ret(c, x + 1, y + h * 0.2, w - 2, h * 0.42, 2, this.traco(cor));
      this.ret(c, x + 2, y + h * 0.22, w - 4, h * 0.38, 2, cor);
      const n = Math.max(2, Math.round(w / 32));
      for (let i = 1; i < n; i++) {
        this.ret(c, x + i * (w / n), y + h * 0.24, 1.5, h * 0.34, 0.5, this.sombra(cor, 0.22));
      }
      for (let i = 0; i < n; i++) {
        this.ret(c, x + (i + 0.5) * (w / n) - 4, y + h * 0.54, 8, 1.8, 0.8, this.METAL);
      }
      this.ret(c, x + 2, y + h * 0.22, w - 4, 2, 1, this.luz(cor, 0.45));
    },
    maquina_cafe(c, x, y, w, h) {
      const cor = '#2f333c';
      this.bloco(c, x + 4, y + h * 0.3, w - 8, h * 0.44, cor, 2);
      this.ret(c, x + 6, y + h * 0.34, w - 12, h * 0.12, 1, this.mix(cor, this.METAL, 0.35));
      this.ret(c, x + w / 2 - 1.5, y + h * 0.5, 3, h * 0.1, 1, this.METAL);   // bico
      this.ret(c, x + 6, y + h * 0.66, w - 12, 2.5, 1, this.METAL);           // grelha
      this.elipse(c, x + w - 9, y + h * 0.38, 1.5, 1.5, '#4fae91');
      this.ret(c, x + w / 2 - 3, y + h * 0.6, 6, 5, 1, '#8c5a3a');            // xícara
    },
  },

  /* ---------- peças auxiliares ---------- */

  /** O narguilé inteiro, com a paleta trocável: é a mesma peça em seis cores.
   *  `p.vidro` é o vaso, `p.ouro`/`p.ouroEsc` o metal, `p.corpo` o corpo preto,
   *  `p.barro` o fornilho. `p.semFumaca` tira a fumaça, para o modelo pequeno. */
  _narguile(c, x, y, w, h, p) {
      p = p || {};
      const cx = x + w / 2;
      const ouro = p.ouro || '#d9a441', ouroEsc = p.ouroEsc || '#a97c22';
      const preto = p.corpo || '#26262e';
      const vidro = p.vidro || '#3d4250', barro = p.barro || '#b06a44';
      const semFumaca = !!p.semFumaca;
      // --- mangueira, atrás de tudo ---
      c.strokeStyle = preto;
      c.lineWidth = Math.max(3, w * 0.095);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(cx + w * 0.22, y + h * 0.55);
      // pontos de controle em 0.62/0.56 da largura: em 0.75/0.68 a mangueira
      // saía 4px do tile pela direita
      c.bezierCurveTo(cx + w * 0.62, y + h * 0.53, cx + w * 0.56, y + h * 0.84,
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

      if (!semFumaca) {
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
      }
  },

  /** Tapete: três camadas rasas, sem volume — ele mora na camada do piso.
   *  `luxo` acrescenta a borda dupla do tapete grande. */
  _tapete(c, x, y, w, h, cor, luxo) {
    this.ret(c, x + 2, y + 2, w - 4, h - 4, 8, this.sombra(cor, 0.18));
    this.ret(c, x + 4, y + 4, w - 8, h - 8, 6, cor);
    this.ret(c, x + 12, y + 10, w - 24, h - 20, 4, this.luz(cor, 0.35));
    if (luxo) this.ret(c, x + 18, y + 15, w - 36, h - 30, 3, this.sombra(cor, 0.1));
  },

  /** Porta vista de cima: batente, folha e maçaneta. `opc.vidro` deixa a folha
   *  translúcida; `opc.mao` (+1 ou -1) diz de que lado fica a dobradiça, que é o
   *  que faz a porta dupla abrir para os dois lados. */
  _porta(c, x, y, w, h, cor, opc) {
    opc = opc || {};
    const mao = opc.mao || 1;
    const topo = y + h * 0.3, alt = h * 0.42;
    this.ret(c, x, topo - 2, 2.5, alt + 4, 1, this.TAMPO_ESC);              // batentes
    this.ret(c, x + w - 2.5, topo - 2, 2.5, alt + 4, 1, this.TAMPO_ESC);
    this.ret(c, x + 2, topo, w - 4, alt, 2, this.traco(cor));
    this.ret(c, x + 3, topo + 1, w - 6, alt - 2, 2, opc.vidro ? 'rgba(188,214,232,.7)' : cor);
    if (opc.vidro) {
      c.save(); c.globalAlpha = 0.45;
      this.ret(c, x + 5, topo + 3, w * 0.28, alt - 6, 1, '#ffffff');
      c.restore();
    } else {
      this.ret(c, x + 6, topo + 3, w - 12, alt - 6, 1.5, this.sombra(cor, 0.16));  // almofada
      this.ret(c, x + 4, topo + 1, w - 8, 1.5, 0.5, this.luz(cor, 0.35));
    }
    const mx = mao > 0 ? x + w - 8 : x + 5;
    this.ret(c, mx, topo + alt * 0.45, 3.5, 2, 1, this.METAL);              // maçaneta
  },

  /** Sofá: encosto alto atrás, dois braços e as almofadas do assento — quantas
   *  couberem na largura (duas no de 2 lugares, três no de 3). */
  _sofa(c, x, y, w, h, cor) {

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

  /** Poltrona de um lugar: encosto alto, dois braços gordos e a almofada do
   *  assento afundada entre eles. */
  _poltrona(c, x, y, w, h, cor) {
    this.ret(c, x + 3, y + 3, w - 6, h - 6, 7, this.traco(cor));
    this.ret(c, x + 4, y + 4, w - 8, h - 8, 6, this.sombra(cor, 0.16));      // corpo
    this.ret(c, x + 5, y + 5, w - 10, 8, 5, cor);                            // encosto
    this.ret(c, x + 8, y + 6, w - 16, 2, 1, this.luz(cor, 0.45));
    this.ret(c, x + 4, y + 9, 7, h - 15, 4, cor);                            // braços
    this.ret(c, x + w - 11, y + 9, 7, h - 15, 4, cor);
    this.ret(c, x + 11, y + 13, w - 22, h - 22, 4, this.luz(cor, 0.3));      // assento
    this.ret(c, x + 13, y + 15, w - 26, 2, 1, this.luz(cor, 0.55));
  },

  /** Cadeira de escritório: base de cinco pontas com rodinhas, coluna, assento,
   *  encosto e braços. Com `destaque`, vira cadeira gamer (asas coloridas).
   *  `opc.alto` dá encosto alto com apoio de cabeça; `opc.costura` desenha as
   *  pregas do couro. */
  _cadeira(c, x, y, w, h, cor, destaque, opc) {
    opc = opc || {};
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
    const alto = !!(destaque || opc.alto);
    const encostoL = w * (alto ? 0.46 : 0.42);
    const encostoA = h * (alto ? 0.42 : 0.3);
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
    if (opc.costura) {                  // pregas verticais do couro
      for (const dx of [-encostoL * 0.2, encostoL * 0.2]) {
        this.ret(c, cx + dx - 0.5, ey + 7, 1, encostoA - 10, 0.5, this.sombra(cor, 0.4));
      }
    }
    if (destaque) this.ret(c, cx - encostoL / 2 + 4, ey + 5, encostoL - 8, 2, 1, destaque);
    if (alto) {                         // apoio de cabeça
      this.ret(c, cx - 6, ey - 4, 12, 6, 3, this.traco(cor));
      this.ret(c, cx - 5, ey - 3, 10, 4, 2, destaque || this.luz(cor, 0.12));
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
  /* ---------- versões claras: peça preta em cima da mesa gamer preta some ---------- */
  _mesaGamer(c, x, y, w, h, cor) {
    // Tampo fosco com a fita de LED correndo pela borda da frente.
    this._mesa(c, x, y, w, h, false, cor);
    const g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#ff4fd8'); g.addColorStop(0.5, '#9d5cff'); g.addColorStop(1, '#4fd8ff');
    c.fillStyle = g;
    c.fillRect(x + 5, y + h - 8, w - 10, 2);                                  // fita de LED
    c.save(); c.globalAlpha = 0.22;
    c.fillRect(x + 5, y + h - 12, w - 10, 4);                                 // o brilho sobe pelo tampo
    c.restore();
    this.elipse(c, x + w / 2, y + 9, 3, 2, this.sombra(cor, 0.45));          // passa-cabo
  },
  _torreGamer(c, x, y, w, h, cor, vidro) {
    this.bloco(c, x + 5, y + 3, w - 10, h - 8, cor, 3);
    this.ret(c, x + 8, y + 6, w - 20, h - 16, 2, vidro);                    // vidro lateral
    for (let i = 0; i < 3; i++) {                                          // ventoinhas acesas
      const cy = y + 10 + i * ((h - 24) / 2);
      this.elipse(c, x + w / 2 - 2, cy, 4, 4, ['#e0453f', '#8f6ce8', '#3fb0e0'][i]);
      this.elipse(c, x + w / 2 - 2, cy, 2, 2, this.luz(['#e0453f', '#8f6ce8', '#3fb0e0'][i], 0.5));
    }
    this.ret(c, x + w - 9, y + 6, 2, h - 16, 1, '#8f6ce8');                 // fita lateral
  },
  _mouseGamer(c, x, y, w, h, cor) {
    const cx = x + w / 2, cy = y + h / 2 + 1;
    this.elipse(c, cx, cy, 5.5, 8, this.traco(cor));
    this.elipse(c, cx, cy - 0.5, 4.6, 7, cor);
    this.ret(c, cx - 0.6, cy - 6, 1.2, 4, 0.5, this.sombra(cor, 0.5));
    this.elipse(c, cx, cy + 4, 3, 2, '#8f6ce8');                            // luz
  },
  _setupGamer(c, x, y, w, h, cor) {
    if (this._vista === 'direita' || this._vista === 'esquerda') {
      this._perfil(c, x + 2, y + 3, w - 4, h - 9, cor); return;
    }
    c.save(); c.globalAlpha = 0.28;                       // brilho RGB atrás
    this.ret(c, x + 1, y + 2, w - 2, h - 8, 6, '#9d5cff');
    c.restore();
    this._monitor(c, x + 2, y + 3, w - 4, h - 9, 'jogo', cor);
    this.ret(c, x + 4, y + h - 12, w - 8, 2, 1, '#ff4fd8');   // fita de LED
  },
  _ultra(c, x, y, w, h, cor) {
    // Ultrawide de três tiles: um painel só, largo e baixo, com pé central.
    if (this._vista === 'direita' || this._vista === 'esquerda') {
      this._perfil(c, x, y, w, h, cor); return;
    }
    this.ret(c, x + w / 2 - 15, y + h - 4, 30, 4, 2, this.mix(cor, this.METAL, 0.35));
    this.ret(c, x + w / 2 - 3, y + h - 8, 6, 5, 1, this.mix(cor, this.METAL, 0.2));
    this.ret(c, x + 2, y + 1, w - 4, h - 8, 4, this.traco(cor));
    this.ret(c, x + 3, y + 2, w - 6, h - 10, 3, cor);
    this._tela(c, x + 5, y + 4, w - 10, h - 14, 'linha');
  },

  _monitor(c, x, y, w, h, assunto, corDaCaixa) {
    // `corDaCaixa` deixa o mesmo monitor sair em branco: em cima da mesa gamer
    // preta, um monitor preto some.
    const cor = corDaCaixa || this.ESCURO;
    if (this._vista === 'direita' || this._vista === 'esquerda') {
      this._perfil(c, x, y, w, h, cor);
      return;
    }
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
    // base termina em y+h, não 1px abaixo: o ultrawide e o branco chamam sem recuo
    this.ret(c, meio - 7, y + h - 4, 14, 4, 2, this.mix(cor, this.METAL, 0.35));   // base
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

  _mesa(c, x, y, w, h, dupla, cor) {
    cor = cor || this.TAMPO;
    this.bloco(c, x + 1, y + 2, w - 2, h - 4, cor, 3);
    if (dupla) {                                   // emenda das mesas geminadas
      this.ret(c, x + w / 2 - 1, y + 4, 2, h - 13, 1, this.sombra(cor, 0.14));
    }
  },

  /** Veios da madeira: linhas finas e meio apagadas, alternando o recuo. */
  _veios(c, x, y, w, h, cor) {
    const n = Math.max(2, Math.floor(h / 12) + 1);
    c.save(); c.globalAlpha = 0.35;
    for (let i = 0; i < n; i++) {
      const vy = y + i * ((h - 1) / (n - 1));
      this.ret(c, x + (i % 2) * w * 0.12, vy, w * 0.76, 1, 0.5, this.sombra(cor, 0.35));
    }
    c.restore();
  },

  /** Bloco em L: braço comprido em cima (altura `bracoA`) e braço curto
   *  descendo pela direita (largura `bracoL`). Os dois blocos são pintados
   *  por cima do contorno um do outro para a emenda sumir e sobrar um tampo só. */
  _blocoL(c, x, y, w, h, bracoA, bracoL, cor) {
    const f = this.FRENTE, r = 3, bx = x + w - bracoL;
    this.ret(c, x, y, w, bracoA, r, this.traco(cor));
    this.ret(c, bx, y, bracoL, h, r, this.traco(cor));
    this.ret(c, x + 1, y + bracoA - f - 1, w - 2, f, r * 0.7, this.sombra(cor, 0.28));  // frente de trás
    this.ret(c, bx + 1, y + h - f - 1, bracoL - 2, f, r * 0.7, this.sombra(cor, 0.28)); // frente da direita
    this.ret(c, x + 1, y + 1, w - 2, bracoA - f - 1, r, cor);
    this.ret(c, bx + 1, y + 1, bracoL - 2, h - f - 1, r, cor);
    this.ret(c, x + 3, y + 2, w - 6, 2, 1, this.luz(cor, 0.5));
    this.ret(c, bx + 1, y + 5, 1.5, bracoA - f - 8, 1, this.sombra(cor, 0.12));         // vinco da emenda
  },

  /** Caminho de um tampo retangular cuja borda de baixo faz uma curva para
   *  dentro (`prof` px) no meio — o recorte da mesa curva. */
  _tampoCurvo(c, x, y, w, h, prof, cor) {
    const r = 5;
    c.fillStyle = cor;
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + w * 0.78, y + h);
    c.bezierCurveTo(x + w * 0.66, y + h, x + w * 0.62, y + h - prof, x + w * 0.5, y + h - prof);
    c.bezierCurveTo(x + w * 0.38, y + h - prof, x + w * 0.34, y + h, x + w * 0.22, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
    c.fill();
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
    // a mesma conta do mapa: peça de ficar em pé não troca de lado ao girar
    // (trocar sempre esmagava o gabinete grande girado no menu do móvel)
    ({ l, a } = this.medida(tipo, { l, a }, giro));
    if (this._minis.has(chave)) return this._minis.get(chave);
    const c = document.createElement('canvas');
    c.width = c.height = lado;
    const cx = c.getContext('2d');
    // A arte não fica dentro da caixa: peça alta sobe `e` px (ALTOS) e a sombra
    // do chão desce uns 6. Encaixar só a caixa cortava o topo do armário, da
    // estante e da geladeira na paleta — a miniatura mostrava uma peça que
    // não existia no mapa.
    const alto = this.usarAltura === false ? null : this.ALTOS[tipo];
    const sobe = (alto ? alto.e : 0) + 2, desce = 6;
    const L = l * 32, A = a * 32 + sobe + desce;
    const escala = Math.min(lado / L, lado / A) * 0.92;
    cx.translate((lado - L * escala) / 2, (lado - A * escala) / 2 + sobe * escala);
    cx.scale(escala, escala);
    this.desenhar(cx, tipo, 0, 0, l * 32, a * 32, giro);
    const url = c.toDataURL();
    this._minis.set(chave, url);
    return url;
  },
};
