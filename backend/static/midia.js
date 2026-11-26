/* Câmera, microfone e as chamadas P2P.
 *
 * O servidor só encaminha os sinais (offer/answer/ICE): áudio e vídeo vão
 * direto de um navegador para o outro. Cada par de pessoas próximas vira uma
 * RTCPeerConnection; quando alguém se afasta, a conexão é fechada.            */

const Midia = {
  streamLocal: null,
  telaStream: null,        // compartilhamento de tela (substitui a câmera no envio)
  pares: new Map(),        // id -> par (ver _criarPar)
  filas: new Map(),        // id -> promessa: os sinais de cada pessoa, um de cada vez
  pedidos: new Map(),      // id -> quando pedimos por último que ela nos ligue
  meuId: null,
  enviarSinal: null,
  aoMudarTiles: null,
  audioCtx: null,
  niveis: new Map(),       // id -> 0..1 (quanto a pessoa está falando)

  configurar({ meuId, enviarSinal, aoMudarTiles, aoPararTela, aoNegar, aoPerderAparelho, iceServers, aoMudarChamada,
                aoSomBloqueado, aoPedirChamada }) {
    this.meuId = meuId;
    this.enviarSinal = enviarSinal;
    this.aoMudarTiles = aoMudarTiles;
    this.aoPararTela = aoPararTela;
    this.aoNegar = aoNegar;
    this.aoPerderAparelho = aoPerderAparelho;
    // Vêm do servidor a cada entrada (03/11): o STUN e, quando ligado, o servidor
    // de reserva com uma senha que vale 24 horas. Sem eles, só o STUN, como antes.
    if (iceServers && iceServers.length) this.iceServers = iceServers;
    this.aoMudarChamada = aoMudarChamada;
    this.aoSomBloqueado = aoSomBloqueado;
    this.aoPedirChamada = aoPedirChamada;
  },

  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],

  /* ---------- aparelhos e efeito de fundo (26/11, como no Meet) ----------
   * A escolha fica no navegador: microfone, câmera, alto-falante e o efeito de
   * fundo. Trocar no meio da conversa só troca a faixa dentro do canal (nada
   * de reconectar). O efeito de fundo (fundo.js) devolve uma faixa processada,
   * que vai para as chamadas no lugar da câmera crua. */
  pref: {
    mic: localStorage.getItem('escritorio:mic') || '',
    cam: localStorage.getItem('escritorio:cam') || '',
    saida: localStorage.getItem('escritorio:saida') || '',
    fundo: localStorage.getItem('escritorio:fundo') || 'nenhum',
  },

  _guardar(chave, valor) {
    this.pref[chave] = valor || '';
    if (valor) localStorage.setItem('escritorio:' + chave, valor);
    else localStorage.removeItem('escritorio:' + chave);
  },

  async trocarAparelho(tipo, id) {
    this._guardar(tipo === 'audio' ? 'mic' : 'cam', id);
    if (!this.ligado(tipo)) return;
    this.desligar(tipo);
    await this.pedirMidia({ audio: tipo === 'audio', video: tipo === 'video' });
  },

  definirSaida(id) {
    this._guardar('saida', id);
    for (const par of this.pares.values()) {
      if (par.audio && par.audio.setSinkId) par.audio.setSinkId(id || '').catch(() => {});
    }
  },

  async definirFundo(modo) {
    this._guardar('fundo', modo === 'nenhum' ? '' : modo);
    if (!this.pref.fundo) this.pref.fundo = 'nenhum';
    await this._aplicarFundo();
  },

  async _aplicarFundo() {
    const cam = this._faixaViva('video');
    if (typeof Fundo === 'undefined') return;
    if (!cam || this.pref.fundo === 'nenhum') Fundo.parar();
    else await Fundo.aplicar(this.pref.fundo, cam);
    this._exibicao = null;
    this._atualizarEnvioDeTodos();
    this.ajustarBanda();
    this.aoMudarTiles && this.aoMudarTiles();
  },

  /** O que o meu quadrinho mostra: a tela, ou a câmera com o efeito, ou a câmera. */
  streamDeExibicao() {
    if (this.telaStream) return this.telaStream;
    const f = typeof Fundo !== 'undefined' && Fundo.faixa;
    if (f && f.readyState === 'live') {
      if (!this._exibicao || !this._exibicao.getTracks().includes(f)) this._exibicao = new MediaStream([f]);
      return this._exibicao;
    }
    return this.streamLocal;
  },

  /* ---------- mídia local ---------- */

  /** Pede só o que falta. Ligar o microfone não deve acender a câmera junto. */
  pedirMidia(quais) {
    /* 05/11: dois pedidos ao mesmo tempo (a entrada automática da sessão salva e um
       clique em "Entrar" enquanto ela esperava o aparelho) passavam os dois pelo
       "o que falta" antes de o primeiro aparelho chegar: o stream local ficava com
       duas faixas de som e duas de imagem, e voz e câmera iam em dobro para todo
       mundo da roda. Um pedido espera o outro terminar. */
    const fila = (this._fila || Promise.resolve()).catch(() => {}).then(() => this._pedirMidia(quais));
    this._fila = fila;
    return fila;
  },

  async _pedirMidia(quais) {
    const querAudio = !quais || quais.audio !== false;
    const querVideo = !quais || quais.video !== false;
    this._limparMortas();
    const pedido = {};
    if (querAudio && !this.temFaixa('audio')) {
      pedido.audio = { echoCancellation: true, noiseSuppression: true,
                       ...(this.pref.mic ? { deviceId: { exact: this.pref.mic } } : {}) };
    }
    if (querVideo && !this.temFaixa('video')) {
      pedido.video = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 },
                       ...(this.pref.cam ? { deviceId: { exact: this.pref.cam } } : {}) };
    }
    if (!Object.keys(pedido).length) return this.streamLocal;

    let novo;
    try {
      novo = await navigator.mediaDevices.getUserMedia(pedido);
    } catch (e) {
      // o aparelho escolhido sumiu (fone desplugado, câmera emprestada): usa o padrão
      if (!['OverconstrainedError', 'NotFoundError'].includes(e.name)) throw e;
      for (const k of Object.keys(pedido)) delete pedido[k].deviceId;
      novo = await navigator.mediaDevices.getUserMedia(pedido);
    }
    if (!this.streamLocal) this.streamLocal = new MediaStream();
    for (const faixa of novo.getTracks()) {
      this.streamLocal.addTrack(faixa);
      faixa.onended = () => this._faixaMorreu(faixa.kind);
    }
    // Entra nas chamadas já abertas pelos canais que já existem: quem entrou só
    // olhando e ligou depois não precisa reconectar nem renegociar com ninguém.
    this._atualizarEnvioDeTodos();
    if (novo.getVideoTracks().length && this.pref.fundo !== 'nenhum') await this._aplicarFundo();
    if (novo.getAudioTracks().length) this._monitorarNivel('eu', this.streamLocal);
    this.ajustarBanda();
    this.aoMudarTiles && this.aoMudarTiles();
    return this.streamLocal;
  },

  /* 26/11: cada chamada nasce com DOIS canais fixos, um de som e um de imagem, os
     dois de mão dupla. Ligar, desligar, trocar a câmera pela tela: tudo é só
     trocar a faixa dentro do canal (replaceTrack), sem nova negociação. Antes,
     quem chegava sem microfone abria um canal "só receber", e ligar depois
     dependia de uma renegociação que às vezes nunca acontecia: ninguém ouvia. */

  /** O que este navegador manda agora em cada canal: a tela tem a vez sobre a câmera. */
  _faixaParaEnviar(tipo) {
    if (tipo === 'video' && this.telaStream) {
      const tela = this.telaStream.getVideoTracks()[0];
      if (tela && tela.readyState === 'live') return tela;
    }
    // com efeito de fundo, vai a câmera processada no lugar da crua
    if (tipo === 'video' && typeof Fundo !== 'undefined' && Fundo.faixa
        && Fundo.faixa.readyState === 'live' && this._faixaViva('video')) return Fundo.faixa;
    return this._faixaViva(tipo);
  },

  _atualizarEnvio(par) {
    for (const tipo of ['audio', 'video']) {
      const tr = par.canais[tipo];
      if (!tr || tr.stopped || tr.currentDirection === 'stopped') continue;
      const faixa = this._faixaParaEnviar(tipo);
      if (tr.sender.track === faixa) continue;
      tr.sender.replaceTrack(faixa).catch((e) => console.warn('troca de faixa', e));
    }
  },

  _atualizarEnvioDeTodos() {
    for (const par of this.pares.values()) this._atualizarEnvio(par);
  },

  /** Desliga de verdade: a faixa é encerrada e o equipamento liberado (a luz
   *  da câmera apaga). Só desabilitar a faixa mantém o aparelho aberto. */
  desligar(tipo) {
    if (!this.streamLocal) return;
    const faixa = this._faixaViva(tipo);
    this._limparMortas();
    if (!faixa) return;
    faixa.onended = null;
    if (tipo === 'video' && typeof Fundo !== 'undefined') Fundo.parar();
    faixa.stop();
    this.streamLocal.removeTrack(faixa);
    this._atualizarEnvioDeTodos();            // a tela, se houver, continua no ar
    this.aoMudarTiles && this.aoMudarTiles();
  },

  /* Uma faixa que o navegador encerrou POR FORA — outro programa tomou o
   * microfone, o fone de ouvido saiu, o aparelho sumiu, a aba ficou horas
   * escondida — continua dentro do stream e continua com `enabled` true. O
   * botão mostrava o microfone ligado, ninguém ouvia nada, e clicar para ligar
   * não fazia efeito nenhum: "já tem faixa de áudio". Só faixa VIVA conta. */
  _faixaViva(tipo) {
    if (!this.streamLocal) return null;
    const f = tipo === 'audio' ? this.streamLocal.getAudioTracks()
                               : this.streamLocal.getVideoTracks();
    return f.find((x) => x.readyState === 'live') || null;
  },

  _limparMortas() {
    if (!this.streamLocal) return;
    for (const f of this.streamLocal.getTracks()) {
      if (f.readyState !== 'live') this.streamLocal.removeTrack(f);
    }
  },

  /** O aparelho caiu sozinho: tira a faixa morta do envio e conta para a tela,
   *  senão a pessoa fica falando para o vazio achando que está no ar. */
  _faixaMorreu(tipo) {
    if (this.telaStream && tipo === 'video'
        && !this.telaStream.getVideoTracks().some((f) => f.readyState !== 'live')) {
      return;                                   // a tela cuida do fim dela sozinha
    }
    this._limparMortas();
    this._atualizarEnvioDeTodos();
    this.aoPerderAparelho && this.aoPerderAparelho(tipo);
    this.aoMudarTiles && this.aoMudarTiles();
  },

  temFaixa(tipo) {
    return !!this._faixaViva(tipo);
  },

  ligado(tipo) {
    const f = this._faixaViva(tipo);
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
    this._atualizarEnvioDeTodos();
    this.ajustarBanda();
    this.aoMudarTiles && this.aoMudarTiles();
    return true;
  },

  pararTela() {
    if (!this.telaStream) return false;
    this.telaStream.getTracks().forEach((f) => f.stop());
    this.telaStream = null;
    this._atualizarEnvioDeTodos();             // a câmera (ou nada) volta para o canal
    this.ajustarBanda();
    this.aoMudarTiles && this.aoMudarTiles();
    return false;
  },

  /* ---------- banda ----------
   *
   * Aqui não existe servidor de vídeo: cada pessoa manda a PRÓPRIA imagem para
   * CADA uma das outras. Numa roda de quatro são três envios ao mesmo tempo, e
   * a subida da internet de casa não dá conta — a imagem congela, e o som, que
   * viaja pela mesma conexão, congela junto. Quanto mais gente na conversa,
   * menor a imagem que cada um manda. É o que toda sala de reunião faz.
   * O som nunca é apertado: ele entra na frente do vídeo na fila.            */

  degraus: [
    // até tantas chamadas abertas: kbps de vídeo, quanto encolher, quadros/s
    { ate: 1,  kbps: 900, encolher: 1,   fps: 24 },
    { ate: 2,  kbps: 600, encolher: 1.5, fps: 20 },
    { ate: 3,  kbps: 400, encolher: 2,   fps: 18 },
    { ate: 5,  kbps: 250, encolher: 2,   fps: 15 },
    { ate: 99, kbps: 150, encolher: 3,   fps: 12 },
  ],

  degrauAgora() {
    const quantos = this.pares.size;
    return this.degraus.find((d) => quantos <= d.ate) || this.degraus[this.degraus.length - 1];
  },

  /** Reaperta o envio de todo mundo. Barato: só mexe em números já abertos,
   *  sem nova negociação e sem a chamada piscar. */
  ajustarBanda() {
    const d = this.degrauAgora();
    for (const par of this.pares.values()) {
      for (const tr of par.pc.getTransceivers()) {
        const envio = tr.sender;
        if (!envio || !envio.track) continue;
        let p;
        try { p = envio.getParameters(); } catch (e) { continue; }
        if (!p.encodings || !p.encodings.length) continue;   // ainda não negociou
        if (envio.track.kind === 'video') {
          const ehTela = !!(this.telaStream
            && envio.track === this.telaStream.getVideoTracks()[0]);
          // tela: letra legível vale mais que movimento; câmera: o contrário
          p.degradationPreference = ehTela ? 'maintain-resolution' : 'maintain-framerate';
          p.encodings[0].maxBitrate = (ehTela ? Math.max(d.kbps, 500) : d.kbps) * 1000;
          p.encodings[0].scaleResolutionDownBy = ehTela ? 1 : d.encolher;
          p.encodings[0].maxFramerate = ehTela ? 8 : d.fps;
        } else {
          p.encodings[0].priority = 'high';
          p.encodings[0].networkPriority = 'high';
        }
        envio.setParameters(p).catch(() => { /* navegador que não deixa: segue */ });
      }
    }
    return d;
  },

  /* ---------- conexões ----------
   *
   * 26/11, o conserto de "ligou o microfone e ninguém ouve" e de "escuto um e não
   * escuto o outro". Eram três defeitos juntos:
   *   1. os DOIS lados começavam a chamada ao mesmo tempo, e as ofertas se cruzavam;
   *   2. quem chegava sem microfone abria canais "só receber" que não se encaixavam
   *      na oferta do outro, e mandava uma segunda oferta logo atrás;
   *   3. os sinais eram tratados em paralelo, e o lado "não polido" jogava fora a
   *      oferta que chegava colada na resposta. O par ficava preso esperando uma
   *      resposta que nunca vinha, e nada mais renegociava com ele.
   * Agora: só UM lado liga (o de id maior); o outro só atende (e, se quiser
   * conversar antes, pede "me liga"). A chamada nasce com os dois canais fixos.
   * Os sinais de cada pessoa são tratados um de cada vez, na ordem em que
   * chegaram, e cada chamada tem um número (sessão): sinal de chamada velha não
   * mexe na nova. Fechar avisa o outro lado ("tchau"), e chamada que não liga em
   * 15 segundos é desfeita e refeita, em vez de ficar muda para sempre. */

  _souIniciador(id) {
    return String(this.meuId) > String(id);
  },

  _novaSessao() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  },

  _novaConexao() {
    // 03/11: com o servidor de reserva (TURN) na lista, a chamada que não fecha
    // direto passa por ele. Sem ele, quem está atrás de celular, VPN ou rede de
    // empresa fica sem som nenhum ("um para de ouvir o outro").
    try {
      return new RTCPeerConnection({ iceServers: this.iceServers });
    } catch (e) {
      // Endereço da reserva torto: a chamada segue só com o STUN, em vez de ninguém ligar.
      console.warn('servidores da chamada recusados', e);
      return new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }] });
    }
  },

  _criarPar(id, sessao, iniciador) {
    const pc = this._novaConexao();
    const par = {
      id, pc, sessao, iniciador,
      polido: !iniciador,             // quem atende cede quando as ofertas se cruzam
      stream: new MediaStream(),      // o que chega dessa pessoa (estável: não troca)
      canais: {},                     // 'audio' / 'video' -> transceptor
      video: null, audio: null, tile: null,
      fazendoOferta: false, ignorarOferta: false, aplicandoResposta: false,
      pendentes: [], volume: 1, tentativas: 0, criadoEm: Date.now(),
    };
    this.pares.set(id, par);

    if (iniciador) {
      for (const tipo of ['audio', 'video']) {
        par.canais[tipo] = pc.addTransceiver(this._faixaParaEnviar(tipo) || tipo,
                                             { direction: 'sendrecv' });
      }
      this._prenderRecebidos(par);
    }

    pc.onnegotiationneeded = async () => {
      try {
        par.fazendoOferta = true;
        await pc.setLocalDescription();
        this._enviar(par, { descricao: pc.localDescription });
      } catch (e) {
        console.warn('negociação', e);
      } finally {
        par.fazendoOferta = false;
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this._enviar(par, { candidato: candidate });
    };

    pc.ontrack = ({ track }) => {
      if (!par.stream.getTracks().includes(track)) par.stream.addTrack(track);
      this._prenderRecebidos(par);
      this.aoMudarTiles && this.aoMudarTiles();
    };

    pc.onconnectionstatechange = () => {
      if (this.pares.get(id) !== par) return;          // chamada já substituída
      if (pc.connectionState === 'connected') {
        clearTimeout(par.oscilando);
        par.oscilando = null;
        // deu certo: zera o histórico de tentativa e a espera
        par.tentativas = 0;
        this.espera.delete(id);
        // só depois de negociada a conexão tem os números de envio para mexer
        this.ajustarBanda();
        this._contarChamada(id, par, par.jaConectou ? 'voltou' : 'conectou');
        par.jaConectou = true;
        this._tocarSom(par);
        return;
      }
      /* A internet oscilou (03/11). O navegador marca "disconnected" e só chega a
         "failed" dezenas de segundos depois; enquanto isso ninguém se ouvia. Agora,
         3 segundos em "disconnected" bastam para refazer só o caminho (restartIce),
         sem derrubar a chamada; no máximo uma vez a cada 10 segundos. */
      if (pc.connectionState === 'disconnected') {
        if (!par.oscilando) {
          par.oscilando = setTimeout(() => {
            par.oscilando = null;
            if (pc.connectionState !== 'disconnected' || !pc.restartIce) return;
            if (Date.now() - (par.ultimoReinicio || 0) < 10000) return;
            par.ultimoReinicio = Date.now();
            this._contarChamada(id, par, 'oscilou');
            try { pc.restartIce(); } catch (e) { /* navegador antigo: espera o failed */ }
          }, 3000);
        }
        return;
      }
      if (!['failed', 'closed'].includes(pc.connectionState)) return;
      clearTimeout(par.oscilando);
      par.oscilando = null;
      if (pc.connectionState === 'failed') this._contarChamada(id, par, 'falhou');
      // Falhou: tenta refazer só o caminho do ICE, e só depois desiste, com
      // espera crescente (sem isso, numa rede em que o P2P não fecha, a chamada
      // caía e nascia de novo sem parar).
      if (pc.connectionState === 'failed' && par.tentativas < 2 && pc.restartIce) {
        par.tentativas += 1;
        try { pc.restartIce(); return; } catch (e) { /* navegador antigo: desiste */ }
      }
      const espera = Math.min(30000, 2000 * Math.pow(2, par.tentativas));
      this.espera.set(id, Date.now() + espera);
      this.fechar(id);
    };

    return par;
  },

  /** Guarda os canais da chamada e monta, com o que chega por eles, o stream da
   *  pessoa (para o cartão de vídeo) e o elemento que toca o som dela. */
  _prenderRecebidos(par) {
    for (const tr of par.pc.getTransceivers()) {
      const faixa = tr.receiver && tr.receiver.track;
      if (!faixa) continue;
      if (!par.canais[faixa.kind]) par.canais[faixa.kind] = tr;
      if (par.canais[faixa.kind] !== tr) continue;
      if (!par.stream.getTracks().includes(faixa)) {
        par.stream.addTrack(faixa);
        faixa.onunmute = () => {
          this._tocarSom(par);
          this.aoMudarTiles && this.aoMudarTiles();
        };
        faixa.onmute = () => this.aoMudarTiles && this.aoMudarTiles();
      }
    }
    if (!par.analise && par.stream.getAudioTracks().length) this._monitorarNivel(par.id, par.stream);
    this._tocarSom(par);
  },

  /* O som de cada pessoa toca num <audio> só dele, fora do painel de vídeos
     (26/11). Antes saía pelo <video> do cartão: cartão escondido, recolhido ou
     trocado de fonte = som sumindo junto. O vídeo do cartão agora é sempre mudo. */
  _tocarSom(par) {
    if (this.pares.get(par.id) !== par) return;
    const faixa = par.canais.audio && par.canais.audio.receiver.track;
    if (!faixa) return;
    if (!par.audio) {
      let caixa = document.getElementById('sons');
      if (!caixa) {
        caixa = document.createElement('div');
        caixa.id = 'sons';
        caixa.setAttribute('aria-hidden', 'true');
        caixa.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;pointer-events:none';
        document.body.appendChild(caixa);
      }
      const a = document.createElement('audio');
      a.autoplay = true;
      a.dataset.id = par.id;
      if (this.pref.saida && a.setSinkId) a.setSinkId(this.pref.saida).catch(() => {});
      caixa.appendChild(a);
      par.audio = a;
    }
    const a = par.audio;
    if (!a.srcObject || !a.srcObject.getTracks().includes(faixa)) a.srcObject = new MediaStream([faixa]);
    a.volume = Math.max(0, Math.min(1, par.volume));
    if (a.paused) {
      a.play().catch((e) => this.aoSomBloqueado && this.aoSomBloqueado(e));
    }
  },

  /** Os elementos de som de todo mundo (para o botão "clique para ouvir"). */
  elementosDeSom() {
    return [...this.pares.values()].map((p) => p.audio).filter(Boolean);
  },

  _enviar(par, dados) {
    if (this.enviarSinal) this.enviarSinal(par.id, { sessao: par.sessao, ...dados });
  },

  /** Conta ao servidor como a chamada ficou (só para o registro): conectou direto
   *  ou pela reserva, oscilou, voltou, falhou, travou. Sem isso não dava para
   *  saber, pelo registro, por que a voz de alguém tinha sumido. */
  async _contarChamada(id, par, estado) {
    if (!this.aoMudarChamada) return;
    let via = '';
    if (estado === 'conectou' || estado === 'voltou') {
      try {
        const stats = await par.pc.getStats();
        let escolhido = null;
        stats.forEach((s) => {
          if (s.type === 'transport' && s.selectedCandidatePairId) escolhido = stats.get(s.selectedCandidatePairId);
        });
        if (!escolhido) stats.forEach((s) => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') escolhido = s; });
        const local = escolhido && stats.get(escolhido.localCandidateId);
        if (local) via = local.candidateType === 'relay' ? 'reserva' : 'direto';
      } catch (e) { /* sem os números: vai sem a via */ }
    }
    try { this.aoMudarChamada(id, estado, via); } catch (e) {}
  },

  /** Até quando não vale a pena tentar de novo com essa pessoa. */
  espera: new Map(),

  /** Quer conversar com essa pessoa. Quem liga é sempre o lado de id maior; o
   *  outro lado só pede "me liga" (no máximo a cada 2 s) e espera a oferta. O
   *  pedido existe porque o vigia de quem liga pode estar numa aba escondida,
   *  em que o navegador segura os relógios: o sinal pela rede chega na hora. */
  garantirPar(id) {
    const ja = this.pares.get(id);
    if (ja) return ja;
    if (!this._souIniciador(id)) {
      const ultimo = this.pedidos.get(id) || 0;
      if (Date.now() - ultimo > 2000 && this.enviarSinal) {
        this.pedidos.set(id, Date.now());
        this.enviarSinal(id, { pedir: true });
      }
      return null;
    }
    const ate = this.espera.get(id) || 0;
    if (Date.now() < ate) return null;      // ainda de castigo: não insiste
    this.espera.delete(id);
    return this._criarPar(id, this._novaSessao(), true);
  },

  /** Chamada que nunca chegou a ligar em 15 s é desfeita (avisando o outro lado)
   *  e refeita do zero. Antes ela ficava pendurada, contando como "na conversa",
   *  e a pessoa sem som até alguém recarregar a página. */
  vigiar() {
    const agora = Date.now();
    for (const [id, par] of [...this.pares]) {
      if (par.jaConectou || par.pc.connectionState === 'connected') continue;
      if (agora - par.criadoEm < 15000) continue;
      this._contarChamada(id, par, 'travou');
      this.espera.set(id, agora + 1000);
      this.fechar(id);
    }
  },

  fechar(id, { avisar = true } = {}) {
    const par = this.pares.get(id);
    if (!par) return;
    if (avisar) this._enviar(par, { tchau: true });
    clearTimeout(par.oscilando);
    try { par.pc.close(); } catch (e) { /* já fechada */ }
    if (par.analise) try { par.analise.desconectar(); } catch (e) {}
    if (par.audio) {
      try { par.audio.pause(); } catch (e) {}
      par.audio.srcObject = null;
      par.audio.remove();
    }
    this.pares.delete(id);
    this.niveis.delete(id);
    // saiu gente da roda: sobra banda para quem ficou
    this.ajustarBanda();
    this.aoMudarTiles && this.aoMudarTiles();
  },

  /** Derruba só as chamadas. A câmera e o microfone da pessoa continuam
   *  ligados — numa reconexão, pedir permissão de novo seria um susto. */
  fecharPares() {
    for (const id of [...this.pares.keys()]) this.fechar(id, { avisar: false });
    this.filas.clear();
    this.pedidos.clear();
  },

  fecharTudo() {
    this.fecharPares();
    if (this.streamLocal) this.streamLocal.getTracks().forEach((f) => f.stop());
    this.streamLocal = null;
    if (this.telaStream) this.telaStream.getTracks().forEach((f) => f.stop());
    this.telaStream = null;
  },

  /** Os sinais de uma pessoa são tratados UM DE CADA VEZ, na ordem em que
   *  chegaram. Em paralelo, uma resposta e uma oferta coladas se atropelavam. */
  receberSinal(de, dados) {
    if (!dados) return Promise.resolve();
    const anterior = this.filas.get(de) || Promise.resolve();
    const proximo = anterior
      .then(() => this._tratarSinal(de, dados))
      .catch((e) => console.warn('sinal', e));
    this.filas.set(de, proximo);
    return proximo;
  },

  async _tratarSinal(de, dados) {
    let par = this.pares.get(de);

    if (dados.pedir) {
      // O outro lado quer conversar e não tem chamada com a gente. Se temos uma
      // velha (de mais de 3 s), ela ficou órfã do lado de lá: refaz do zero.
      if (!this._souIniciador(de) || !this.aoPedirChamada) return;
      if (par && Date.now() - par.criadoEm > 3000) {
        this.fechar(de, { avisar: false });
        this.espera.delete(de);
        par = null;
      }
      if (!par) this.aoPedirChamada(de);
      return;
    }

    if (dados.tchau) {
      if (par && par.sessao === dados.sessao) {
        this.fechar(de, { avisar: false });
        this.espera.set(de, Date.now() + 1500);
      }
      return;
    }

    const oferta = !!(dados.descricao && dados.descricao.type === 'offer');
    if (par && par.sessao !== dados.sessao) {
      if (!oferta) return;                    // sobra de uma chamada que já acabou
      // o outro lado começou uma chamada nova: a velha daqui não serve mais
      this.fechar(de, { avisar: false });
      par = null;
    }
    if (!par) {
      if (!oferta) return;                    // resposta ou candidato sem chamada: sobra
      this.espera.delete(de);
      par = this._criarPar(de, dados.sessao, false);
    }
    const pc = par.pc;

    if (dados.descricao) {
      const d = dados.descricao;
      // "Perfect negotiation": colisão é uma oferta chegando enquanto a gente
      // também está oferecendo — menos quando o que está em andamento é só a
      // aplicação de uma resposta, que logo volta ao estável.
      const pronto = !par.fazendoOferta
        && (pc.signalingState === 'stable' || par.aplicandoResposta);
      const colisao = oferta && !pronto;
      par.ignorarOferta = !par.polido && colisao;
      if (par.ignorarOferta) return;          // o outro lado (polido) cede
      par.aplicandoResposta = d.type === 'answer';
      try {
        await pc.setRemoteDescription(d);     // o polido desfaz a própria oferta sozinho
      } finally {
        par.aplicandoResposta = false;
      }
      if (oferta) {
        this._prenderRecebidos(par);
        for (const tr of Object.values(par.canais)) {
          if (tr.direction !== 'sendrecv') tr.direction = 'sendrecv';
        }
        this._atualizarEnvio(par);
        await pc.setLocalDescription();
        this._enviar(par, { descricao: pc.localDescription });
      }
      for (const c of par.pendentes.splice(0)) {
        try { await pc.addIceCandidate(c); } catch (e) { /* candidato velho */ }
      }
    } else if (dados.candidato) {
      if (!pc.remoteDescription || !pc.remoteDescription.type) {
        par.pendentes.push(dados.candidato);   // chegou antes da descrição
        return;
      }
      try {
        await pc.addIceCandidate(dados.candidato);
      } catch (e) {
        if (!par.ignorarOferta) console.warn('candidato', e);
      }
    }
  },

  /* ---------- volume por distância ---------- */

  ajustarVolume(id, volume) {
    const par = this.pares.get(id);
    if (!par) return;
    par.volume = volume;
    if (par.audio) par.audio.volume = Math.max(0, Math.min(1, volume));
  },

  /* ---------- medidor de fala ---------- */

  _monitorarNivel(id, stream) {
    if (!stream || stream.getAudioTracks().length === 0) return;
    const doPar = id !== 'eu' && this.pares.get(id);
    if (doPar && doPar.analise) return;       // um medidor por chamada basta
    try {
      this.audioCtx = this.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const fonte = this.audioCtx.createMediaStreamSource(stream);
      const analise = this.audioCtx.createAnalyser();
      analise.fftSize = 512;
      fonte.connect(analise);                 // só análise: não vai para as caixas
      const dados = new Uint8Array(analise.frequencyBinCount);
      const ler = () => {
        if (id !== 'eu' && this.pares.get(id) !== doPar) return;   // chamada acabou ou foi refeita
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
