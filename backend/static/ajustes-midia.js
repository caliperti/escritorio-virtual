/* A janela "Áudio e vídeo" (26/11), como a do Meet: escolher microfone, câmera
 * e alto-falante, ver o medidor do microfone e a prévia da câmera, testar o
 * som e escolher o efeito de fundo (fundo.js). As escolhas ficam no navegador
 * (Midia.pref) e valem já na conversa em andamento. */

const AjustesMidia = {
  aberto: false,
  _medidor: null,

  async abrir(aba) {
    const m = document.getElementById('modal-midia');
    m.classList.remove('oculto');
    this.aberto = true;
    this.mostrarAba(aba || 'audio');
    await this.preencher();
    this._medir();
  },

  fechar() {
    document.getElementById('modal-midia').classList.add('oculto');
    this.aberto = false;
    cancelAnimationFrame(this._medidor);
    const v = document.getElementById('previa-cam');
    v.srcObject = null;
  },

  mostrarAba(aba) {
    for (const b of document.querySelectorAll('.abas-midia button')) {
      b.setAttribute('aria-pressed', String(b.dataset.aba === aba));
    }
    for (const p of document.querySelectorAll('.pagina-midia')) p.hidden = p.dataset.pagina !== aba;
    if (aba === 'video') this.atualizarPrevia();
  },

  async preencher() {
    let aparelhos = [];
    try { aparelhos = await navigator.mediaDevices.enumerateDevices(); } catch (e) { /* sem acesso */ }
    const semNome = aparelhos.length && aparelhos.every((d) => !d.label);
    const atual = (tipo) => {
      const f = Midia._faixaViva(tipo);
      return (f && f.getSettings && f.getSettings().deviceId) || (tipo === 'audio' ? Midia.pref.mic : Midia.pref.cam);
    };
    const encher = (sel, tipo, escolhido, padrao) => {
      const lista = aparelhos.filter((d) => d.kind === tipo);
      sel.innerHTML = lista.length
        ? lista.map((d, i) => `<option value="${escapar(d.deviceId)}">${escapar(d.label || padrao + ' ' + (i + 1))}</option>`).join('')
        : `<option value="">Nenhum encontrado</option>`;
      if (escolhido && lista.some((d) => d.deviceId === escolhido)) sel.value = escolhido;
      sel.disabled = !lista.length;
    };
    encher(document.getElementById('sel-mic'), 'audioinput', atual('audio'), 'Microfone');
    encher(document.getElementById('sel-cam'), 'videoinput', atual('video'), 'Câmera');
    const saida = document.getElementById('sel-saida');
    const daParaEscolherSaida = 'setSinkId' in HTMLMediaElement.prototype;
    encher(saida, 'audiooutput', Midia.pref.saida, 'Alto-falante');
    if (!daParaEscolherSaida) {
      saida.innerHTML = '<option>O padrão do computador</option>';
      saida.disabled = true;
    }
    document.getElementById('nota-audio').textContent = semNome
      ? 'Ligue o microfone ou a câmera uma vez para aparecer o nome de cada aparelho.'
      : (!daParaEscolherSaida ? 'Este navegador não deixa escolher o alto-falante: vale o padrão do computador.' : '');
    this.desenharEfeitos();
  },

  desenharEfeitos() {
    const caixa = document.getElementById('efeitos');
    caixa.innerHTML = '';
    for (const [modo, cfg] of Object.entries(Fundo.MODOS)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'efeito efeito-' + modo;
      b.setAttribute('aria-pressed', String(Midia.pref.fundo === modo));
      b.title = cfg.nome;
      b.innerHTML = `<span class="amostra"></span><span>${cfg.nome}</span>`;
      b.onclick = () => this.escolherFundo(modo);
      caixa.appendChild(b);
    }
  },

  async escolherFundo(modo) {
    const nota = document.getElementById('nota-video');
    Midia.pref.fundo = modo;
    this.desenharEfeitos();
    if (modo !== 'nenhum' && !Fundo._seg) nota.textContent = 'Preparando o efeito (só na primeira vez demora uns segundos)…';
    await Midia.definirFundo(modo);
    nota.textContent = modo !== 'nenhum' && Fundo.modo === 'nenhum' && Midia.ligado('video')
      ? 'Não deu para ligar o efeito neste computador. A câmera segue sem efeito.' : '';
    this.atualizarPrevia();
  },

  atualizarPrevia() {
    const v = document.getElementById('previa-cam');
    const ligada = Midia.ligado('video');
    document.getElementById('sem-camera').hidden = ligada;
    v.hidden = !ligada;
    const s = ligada ? Midia.streamDeExibicao() : null;
    if (v.srcObject !== s) { v.srcObject = s; if (s) v.play().catch(() => {}); }
  },

  _medir() {
    cancelAnimationFrame(this._medidor);
    const barra = document.getElementById('nivel-mic');
    const passo = () => {
      if (!this.aberto) return;
      const n = Midia.ligado('audio') ? Midia.nivel('eu') : 0;
      barra.style.width = Math.round(Math.min(1, n * 1.4) * 100) + '%';
      this._medidor = requestAnimationFrame(passo);
    };
    passo();
  },

  /** Um "plim" curto no alto-falante escolhido. */
  async testarSom() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const destino = ctx.createMediaStreamDestination();
    const osc = ctx.createOscillator(), vol = ctx.createGain();
    osc.frequency.value = 660;
    vol.gain.setValueAtTime(0.0001, ctx.currentTime);
    vol.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.03);
    vol.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
    osc.connect(vol).connect(destino);
    const a = new Audio();
    a.srcObject = destino.stream;
    if (Midia.pref.saida && a.setSinkId) await a.setSinkId(Midia.pref.saida).catch(() => {});
    await a.play().catch(() => {});
    osc.start();
    osc.stop(ctx.currentTime + 0.75);
    setTimeout(() => { a.srcObject = null; ctx.close(); }, 1000);
  },
};

(function () {
  const sel = (id) => document.getElementById(id);
  sel('btn-ajustes-midia').addEventListener('click', () => {
    alternarSuspenso('btn-ajustes', 'ajustes', false);
    AjustesMidia.abrir('audio');
  });
  sel('btn-chamada-ajustes').onclick = () => AjustesMidia.abrir('video');
  sel('btn-fechar-midia').onclick = () => AjustesMidia.fechar();
  sel('modal-midia').addEventListener('click', (e) => { if (e.target.id === 'modal-midia') AjustesMidia.fechar(); });
  for (const b of document.querySelectorAll('.abas-midia button')) b.onclick = () => AjustesMidia.mostrarAba(b.dataset.aba);
  sel('sel-mic').onchange = async (e) => { await Midia.trocarAparelho('audio', e.target.value); atualizarBotoesMidia(); };
  sel('sel-cam').onchange = async (e) => {
    await Midia.trocarAparelho('video', e.target.value);
    atualizarBotoesMidia();
    AjustesMidia.atualizarPrevia();
  };
  sel('sel-saida').onchange = (e) => Midia.definirSaida(e.target.value);
  sel('btn-testar-som').onclick = () => AjustesMidia.testarSom();
  sel('btn-ligar-cam-ajustes').onclick = async () => {
    await alternarCam();
    AjustesMidia.atualizarPrevia();
    AjustesMidia.preencher();
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && AjustesMidia.aberto) { AjustesMidia.fechar(); e.stopPropagation(); }
  }, true);
  // aparelho plugado ou desplugado com a janela aberta: a lista se atualiza
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => { if (AjustesMidia.aberto) AjustesMidia.preencher(); });
  }
})();
