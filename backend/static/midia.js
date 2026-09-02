/* Câmera, microfone e as chamadas P2P.
 *
 * O servidor só encaminha os sinais (offer/answer/ICE): áudio e vídeo vão
 * direto de um navegador para o outro. Cada par de pessoas próximas vira uma
 * RTCPeerConnection; quando alguém se afasta, a conexão é fechada.            */

const Midia = {
  streamLocal: null,
  telaStream: null,        // compartilhamento de tela (substitui a câmera no envio)
  pares: new Map(),        // id -> { pc, stream, video, tile, polido, fazendoOferta, analise }
  meuId: null,
  enviarSinal: null,
  aoMudarTiles: null,
  audioCtx: null,
  niveis: new Map(),       // id -> 0..1 (quanto a pessoa está falando)

  configurar({ meuId, enviarSinal, aoMudarTiles, aoPararTela, aoNegar }) {
    this.meuId = meuId;
    this.enviarSinal = enviarSinal;
    this.aoMudarTiles = aoMudarTiles;
    this.aoPararTela = aoPararTela;
    this.aoNegar = aoNegar;
  },

  /* ---------- mídia local ---------- */

  /** Pede só o que falta. Ligar o microfone não deve acender a câmera junto. */
  async pedirMidia(quais) {
    const querAudio = !quais || quais.audio !== false;
    const querVideo = !quais || quais.video !== false;
    const pedido = {};
    if (querAudio && !this.temFaixa('audio')) {
      pedido.audio = { echoCancellation: true, noiseSuppression: true };
    }
    if (querVideo && !this.temFaixa('video')) {
      pedido.video = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } };
    }
    if (!Object.keys(pedido).length) return this.streamLocal;

    const novo = await navigator.mediaDevices.getUserMedia(pedido);
    if (!this.streamLocal) this.streamLocal = new MediaStream();
    for (const faixa of novo.getTracks()) {
      this.streamLocal.addTrack(faixa);
      // Injeta nas chamadas já abertas: quem entrou só olhando e ligou depois
      // não precisa reconectar com ninguém.
      if (faixa.kind === 'video' && this.telaStream) continue;   // a tela tem a vez
      for (const par of this.pares.values()) this._trocarFaixa(par, faixa);
    }
    if (novo.getAudioTracks().length) this._monitorarNivel('eu', this.streamLocal);
    this.aoMudarTiles && this.aoMudarTiles();
    return this.streamLocal;
  },

  /** Põe uma faixa nova na conexão, reaproveitando o transceptor que existir. */
  _trocarFaixa(par, faixa) {
    const tr = par.pc.getTransceivers().find((t) =>
      (t.sender.track && t.sender.track.kind === faixa.kind)
      || (t.receiver.track && t.receiver.track.kind === faixa.kind));
    if (!tr) {
      par.pc.addTrack(faixa, this.streamLocal);
      return;
    }
    tr.sender.replaceTrack(faixa).catch((e) => console.warn('troca de faixa', e));
    if (tr.direction === 'recvonly') tr.direction = 'sendrecv';
  },

  /** Desliga de verdade: a faixa é encerrada e o equipamento liberado (a luz
   *  da câmera apaga). Só desabilitar a faixa mantém o aparelho aberto. */
  desligar(tipo) {
    if (!this.streamLocal) return;
    const faixa = tipo === 'audio' ? this.streamLocal.getAudioTracks()[0]
                                   : this.streamLocal.getVideoTracks()[0];
    if (!faixa) return;
    faixa.stop();
    this.streamLocal.removeTrack(faixa);
    if (tipo === 'video' && this.telaStream) return;      // a tela continua no ar
    for (const par of this.pares.values()) {
      const tr = par.pc.getTransceivers().find((t) =>
        t.sender.track && t.sender.track.kind === tipo);
      if (tr) tr.sender.replaceTrack(null).catch(() => {});
    }
    this.aoMudarTiles && this.aoMudarTiles();
  },

  temFaixa(tipo) {
    if (!this.streamLocal) return false;
    const f = tipo === 'audio' ? this.streamLocal.getAudioTracks() : this.streamLocal.getVideoTracks();
    return f.length > 0;
  },

  ligado(tipo) {
    if (!this.streamLocal) return false;
    const f = tipo === 'audio' ? this.streamLocal.getAudioTracks()[0] : this.streamLocal.getVideoTracks()[0];
    return !!f && f.enabled;
  },

  /** Liga/desliga microfone ou câmera a qualquer momento, sem sair da sala. */
  async alternar(tipo) {
    if (this.ligado(tipo)) {
      this.desligar(tipo);
      return false;
    }
    try {
      await this.pedirMidia({ audio: tipo === 'audio', video: tipo === 'video' });
      return this.ligado(tipo);
    } catch (e) {
      this.aoNegar && this.aoNegar(tipo, e);
      return false;
    }
  },

  /* ---------- compartilhamento de tela ---------- */

  /* A tela entra no lugar da câmera com replaceTrack: as chamadas já abertas
     continuam de pé, sem nova negociação e sem ninguém "reconectar".         */
  async compartilharTela() {
    if (this.telaStream) return this.pararTela();
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 15 }, width: { ideal: 1600 } },
      audio: false,
    });
    this.telaStream = stream;
    const faixa = stream.getVideoTracks()[0];
    faixa.onended = () => {              // parou pelo botão do próprio navegador
      this.pararTela();
      this.aoPararTela && this.aoPararTela();
    };
    for (const par of this.pares.values()) this._trocarVideo(par, faixa, stream);
    this.aoMudarTiles && this.aoMudarTiles();
    return true;
  },

  pararTela() {
    if (!this.telaStream) return false;
    this.telaStream.getTracks().forEach((f) => f.stop());
    this.telaStream = null;
    const camera = this.streamLocal ? this.streamLocal.getVideoTracks()[0] || null : null;
    for (const par of this.pares.values()) this._trocarVideo(par, camera, this.streamLocal);
    this.aoMudarTiles && this.aoMudarTiles();
    return false;
  },

  _trocarVideo(par, faixa, origem) {
    const tr = par.pc.getTransceivers().find((t) =>
      (t.sender.track && t.sender.track.kind === 'video')
      || (t.receiver.track && t.receiver.track.kind === 'video'));
    if (!tr) {
      if (faixa) par.pc.addTrack(faixa, origem);
      return;
    }
    tr.sender.replaceTrack(faixa).catch((e) => console.warn('troca de vídeo', e));
    // Quem só recebia precisa passar a enviar — mudar a direção já dispara a
    // renegociação pelo onnegotiationneeded.
    if (faixa && tr.direction === 'recvonly') tr.direction = 'sendrecv';
  },

  /* ---------- conexões ---------- */

  _criarPar(id) {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
    });
    // "Polido" cede em caso de colisão de ofertas (perfect negotiation).
    const par = { pc, stream: new MediaStream(), video: null, tile: null,
                  polido: this.meuId < id, fazendoOferta: false, pendentes: [], volume: 1 };
    this.pares.set(id, par);

    const enviar = [];
    if (this.streamLocal) {
      for (const faixa of this.streamLocal.getTracks()) {
        if (faixa.kind === 'video' && this.telaStream) continue;   // a tela substitui a câmera
        enviar.push([faixa, this.streamLocal]);
      }
    }
    if (this.telaStream) enviar.push([this.telaStream.getVideoTracks()[0], this.telaStream]);
    for (const [faixa, origem] of enviar) pc.addTrack(faixa, origem);
    // O que não temos para mandar, abrimos só para receber.
    for (const tipo of ['audio', 'video']) {
      if (!enviar.some(([faixa]) => faixa.kind === tipo)) {
        pc.addTransceiver(tipo, { direction: 'recvonly' });
      }
    }

    pc.onnegotiationneeded = async () => {
      try {
        par.fazendoOferta = true;
        await pc.setLocalDescription();
        this.enviarSinal(id, { descricao: pc.localDescription });
      } catch (e) {
        console.warn('negociação', e);
      } finally {
        par.fazendoOferta = false;
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.enviarSinal(id, { candidato: candidate });
    };

    pc.ontrack = ({ track, streams }) => {
      const stream = streams[0] || par.stream;
      par.stream = stream;
      if (par.video) par.video.srcObject = stream;
      track.onunmute = () => this.aoMudarTiles && this.aoMudarTiles();
      this._monitorarNivel(id, stream);
      this.aoMudarTiles && this.aoMudarTiles();
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) this.fechar(id);
    };

    return par;
  },

  garantirPar(id) {
    return this.pares.get(id) || this._criarPar(id);
  },

  fechar(id) {
    const par = this.pares.get(id);
    if (!par) return;
    try { par.pc.close(); } catch (e) { /* já fechada */ }
    if (par.analise) try { par.analise.desconectar(); } catch (e) {}
    this.pares.delete(id);
    this.niveis.delete(id);
    this.aoMudarTiles && this.aoMudarTiles();
  },

  /** Derruba só as chamadas. A câmera e o microfone da pessoa continuam
   *  ligados — numa reconexão, pedir permissão de novo seria um susto. */
  fecharPares() {
    for (const id of [...this.pares.keys()]) this.fechar(id);
  },

  fecharTudo() {
    for (const id of [...this.pares.keys()]) this.fechar(id);
    if (this.streamLocal) this.streamLocal.getTracks().forEach((f) => f.stop());
    this.streamLocal = null;
    if (this.telaStream) this.telaStream.getTracks().forEach((f) => f.stop());
    this.telaStream = null;
  },

  async receberSinal(de, dados) {
    const par = this.garantirPar(de);
    const pc = par.pc;
    try {
      if (dados.descricao) {
        const colisao = dados.descricao.type === 'offer'
          && (par.fazendoOferta || pc.signalingState !== 'stable');
        if (colisao && !par.polido) return;           // o outro lado resolve
        await pc.setRemoteDescription(dados.descricao);
        for (const c of par.pendentes.splice(0)) {
          try { await pc.addIceCandidate(c); } catch (e) {}
        }
        if (dados.descricao.type === 'offer') {
          await pc.setLocalDescription();
          this.enviarSinal(de, { descricao: pc.localDescription });
        }
      } else if (dados.candidato) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(dados.candidato);
        } else {
          par.pendentes.push(dados.candidato);        // chegou antes da SDP
        }
      }
    } catch (e) {
      console.warn('sinal', e);
    }
  },

  /* ---------- volume por distância ---------- */

  ajustarVolume(id, volume) {
    const par = this.pares.get(id);
    if (!par) return;
    par.volume = volume;
    if (par.video) par.video.volume = Math.max(0, Math.min(1, volume));
  },

  /* ---------- medidor de fala ---------- */

  _monitorarNivel(id, stream) {
    if (!stream || stream.getAudioTracks().length === 0) return;
    try {
      this.audioCtx = this.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const fonte = this.audioCtx.createMediaStreamSource(stream);
      const analise = this.audioCtx.createAnalyser();
      analise.fftSize = 512;
      fonte.connect(analise);                 // só análise: não vai para as caixas
      const dados = new Uint8Array(analise.frequencyBinCount);
      const ler = () => {
        if (id !== 'eu' && !this.pares.has(id)) return;
        analise.getByteFrequencyData(dados);
        let soma = 0;
        for (const v of dados) soma += v;
        this.niveis.set(id, Math.min(1, (soma / dados.length) / 42));
        requestAnimationFrame(ler);
      };
      ler();
      const par = this.pares.get(id);
      if (par) par.analise = { desconectar: () => fonte.disconnect() };
    } catch (e) {
      /* Safari às vezes recusa analisar stream remoto — seguimos sem o anel. */
    }
  },

  nivel(id) {
    return this.niveis.get(id) || 0;
  },
};
