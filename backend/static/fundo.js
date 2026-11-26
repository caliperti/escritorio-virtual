/* Efeitos de fundo da câmera (26/11), como no Meet: desfocar de leve, desfocar
 * forte, ou trocar o fundo pela imagem do escritório.
 *
 * A pessoa é recortada pelo MediaPipe (selfie segmenter, do Google), que mora em
 * static/vendor/mediapipe — nada vem de site de fora. Cada quadro da câmera vira
 * um quadro num <canvas>: o fundo (a própria câmera borrada, ou a arte do
 * escritório) e, por cima, a pessoa recortada pela máscara. O que vai para as
 * chamadas é a faixa desse canvas (captureStream), no lugar da câmera crua.
 * O desenho é pesado: roda a 20 quadros por segundo, num tamanho de 640.      */

const Fundo = {
  BASE: '/static/vendor/mediapipe/',
  MODOS: {
    nenhum: { nome: 'Sem efeito' },
    leve: { nome: 'Desfoque leve', borrar: 6 },
    forte: { nome: 'Desfoque forte', borrar: 16 },
    escritorio: { nome: 'Escritório', imagem: '/static/assets/codara/fundo.png' },
  },
  QPS: 20,
  // O Safari (até a versão 17) não tem `filter` no canvas: o desfoque não
  // acontecia e o fundo saía nítido. Sem ele, borra encolhendo e esticando.
  TEM_FILTRO: typeof CanvasRenderingContext2D !== 'undefined'
    && 'filter' in CanvasRenderingContext2D.prototype,
  modo: 'nenhum',
  faixa: null,               // a faixa processada (o que vai para as chamadas)
  _seg: null, _carregando: null, _laco: null, _cam: null, _video: null,
  _tela: null, _mascara: null, _pessoa: null, _imagem: null, _dadosMascara: null,

  async _segmentador() {
    if (this._seg) return this._seg;
    if (!this._carregando) {
      this._carregando = (async () => {
        const v = await import(this.BASE + 'vision_bundle.mjs');
        const arquivos = await v.FilesetResolver.forVisionTasks(this.BASE + 'wasm');
        const criar = (delegate) => v.ImageSegmenter.createFromOptions(arquivos, {
          baseOptions: { modelAssetPath: this.BASE + 'selfie_segmenter.tflite', delegate },
          runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true,
        });
        // placa de vídeo quando der; senão, o processador
        try { return await criar('GPU'); } catch (e) { return await criar('CPU'); }
      })();
    }
    this._seg = await this._carregando;
    return this._seg;
  },

  /** Liga o efeito sobre a faixa da câmera e devolve a faixa processada
   *  (ou a própria câmera, se o modo é "nenhum" ou se o efeito falhou). */
  async aplicar(modo, faixaCamera) {
    this.parar();
    this.modo = this.MODOS[modo] ? modo : 'nenhum';
    if (this.modo === 'nenhum' || !faixaCamera) return faixaCamera;
    try {
      const seg = await this._segmentador();
      const cfg = faixaCamera.getSettings ? faixaCamera.getSettings() : {};
      const L = Math.min(640, cfg.width || 640), A = Math.round(L * ((cfg.height || 480) / (cfg.width || 640)));
      const video = document.createElement('video');
      video.muted = true; video.playsInline = true;
      video.setAttribute('playsinline', '');
      // fora da página, o Safari às vezes não entrega quadro nenhum: fica na
      // página, invisível
      video.style.cssText = 'position:fixed;left:-10px;top:-10px;width:2px;height:2px;opacity:0;pointer-events:none';
      document.body.appendChild(video);
      video.srcObject = new MediaStream([faixaCamera]);
      await video.play().catch(() => {});
      const tela = Object.assign(document.createElement('canvas'), { width: L, height: A });
      const pessoa = Object.assign(document.createElement('canvas'), { width: L, height: A });
      const mascara = document.createElement('canvas');
      const cfgModo = this.MODOS[this.modo];
      if (cfgModo.imagem && !this._imagem) {
        this._imagem = new Image();
        this._imagem.src = cfgModo.imagem;
      }
      Object.assign(this, { _cam: faixaCamera, _video: video, _tela: tela, _pessoa: pessoa, _mascara: mascara });
      this.faixa = tela.captureStream(this.QPS).getVideoTracks()[0];
      let ultimo = 0;
      this._laco = setInterval(() => {
        if (video.readyState < 2 || faixaCamera.readyState !== 'live') return;
        const agora = performance.now();
        if (agora <= ultimo) return;
        ultimo = agora;
        try {
          seg.segmentForVideo(video, agora, (r) => this._compor(r.confidenceMasks && r.confidenceMasks[0], cfgModo));
        } catch (e) { /* um quadro perdido não para o efeito */ }
      }, 1000 / this.QPS);
      return this.faixa;
    } catch (e) {
      console.warn('efeito de fundo indisponível', e);
      this.parar();
      this.modo = 'nenhum';
      return faixaCamera;
    }
  },

  _compor(m, cfg) {
    const tela = this._tela, ctx = tela.getContext('2d');
    const L = tela.width, A = tela.height, video = this._video;
    // 1. a máscara (quanto cada ponto é "pessoa"), suavizada nas bordas
    if (m) {
      const w = m.width, h = m.height, conf = m.getAsFloat32Array();
      if (this._mascara.width !== w || this._mascara.height !== h) {
        this._mascara.width = w; this._mascara.height = h;
        this._dadosMascara = new ImageData(w, h);
      }
      const d = this._dadosMascara.data;
      for (let i = 0, j = 3; i < conf.length; i++, j += 4) {
        const c = conf[i];
        d[j] = c <= 0.35 ? 0 : c >= 0.65 ? 255 : ((c - 0.35) / 0.3) * 255;
      }
      this._mascara.getContext('2d').putImageData(this._dadosMascara, 0, 0);
    }
    // 2. a pessoa recortada
    const p = this._pessoa.getContext('2d');
    p.globalCompositeOperation = 'copy';
    p.drawImage(video, 0, 0, L, A);
    p.globalCompositeOperation = 'destination-in';
    p.imageSmoothingEnabled = true;
    if (this.TEM_FILTRO) p.filter = 'blur(2px)';  // borda macia, sem serrilhado
    p.drawImage(this._mascara, 0, 0, L, A);
    if (this.TEM_FILTRO) p.filter = 'none';
    // 3. o fundo e a pessoa por cima
    ctx.globalCompositeOperation = 'copy';
    if (cfg.imagem && this._imagem && this._imagem.complete && this._imagem.naturalWidth) {
      const im = this._imagem, k = Math.max(L / im.naturalWidth, A / im.naturalHeight);
      const w = im.naturalWidth * k, h = im.naturalHeight * k;
      ctx.drawImage(im, (L - w) / 2, (A - h) / 2, w, h);
    } else if (this.TEM_FILTRO) {
      ctx.filter = 'blur(' + (cfg.borrar || 10) + 'px)';
      ctx.drawImage(video, -20, -20, L + 40, A + 40);
      ctx.filter = 'none';
    } else {
      this._borrarSemFiltro(ctx, video, L, A, cfg.borrar || 10);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this._pessoa, 0, 0);
  },

  /** Desfoque para navegador sem `filter`: encolhe a imagem em dois passos e
   *  estica de volta com suavização (quanto mais encolhe, mais borra). */
  _borrarSemFiltro(ctx, fonte, L, A, raio) {
    if (!this._miuda) this._miuda = [document.createElement('canvas'), document.createElement('canvas')];
    const [m1, m2] = this._miuda;
    const k = Math.max(3, raio * 0.75);               // 6 -> 4,5x menor; 16 -> 12x menor
    m1.width = Math.max(8, Math.round(L / 3)); m1.height = Math.max(6, Math.round(A / 3));
    m2.width = Math.max(4, Math.round(L / k)); m2.height = Math.max(3, Math.round(A / k));
    const g1 = m1.getContext('2d'), g2 = m2.getContext('2d');
    for (const g of [g1, g2, ctx]) { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; }
    g1.drawImage(fonte, 0, 0, m1.width, m1.height);
    g2.drawImage(m1, 0, 0, m2.width, m2.height);
    ctx.drawImage(m2, 0, 0, L, A);
  },

  parar() {
    clearInterval(this._laco);
    this._laco = null;
    if (this.faixa) this.faixa.stop();
    this.faixa = null;
    if (this._video) { this._video.srcObject = null; this._video.remove(); this._video = null; }
    this._cam = null;
    this.modo = 'nenhum';
  },
};
