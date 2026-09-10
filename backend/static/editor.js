/* Editor do escritório — o "Mapmaker" caseiro.
 *
 * Toda edição é uma mensagem para o servidor (`{tipo:'editar', acao:{...}}`);
 * quem valida e grava é ele, e todo mundo na sala recebe o mapa novo na hora.
 * Aqui em cima só existe a interface: paleta, pincel, arrasto e a prévia.
 *
 * A paleta de móveis é o ARSENAL (seção lá embaixo): busca, categorias,
 * favoritos, recentes e conjuntos prontos. Favorito e recente são gosto da
 * pessoa, não são o mapa — por isso ficam no localStorage e nunca no servidor. */

const Editor = {
  ativo: false,
  ferramenta: 'mobilia',
  redesenhando: null,
  tipoSel: 'mesa',
  pisoSel: 'c',
  selecionado: null,
  arrasto: null,
  menu: null,          // popup aberto em cima de um móvel
  movendo: null,       // móvel “na mão”, esperando o clique que solta
  colocar: null,       // peça apontada no clique, colocada quando o botão solta
  conjunto: null,      // conjunto “na mão”: a prévia mostra a pegada inteira
  pincel: null,          // traço em andamento de parede/piso
  retangulo: null,       // retângulo de sala em andamento
  cursor: null,
  giro: 0,                       // 0..3 (×90°) do móvel que vai ser colocado
  enviar: null,
  jogo: null,

  configurar({ enviar, jogo, avisar }) {
    this.enviar = enviar;
    this.jogo = jogo;
    this.avisar = avisar || null;      // escreve um aviso no chat de quem edita
  },

  /** O mapa novo chegou (alguém editou, ou reconectamos). Tudo que o editor
   *  guardava do mapa velho é conferido aqui: móvel na mão, arrastado ou
   *  selecionado que sumiu é solto; o menu de um alvo apagado fecha; a lista
   *  de salas e o arsenal acompanham. Antes nada disso acontecia: o menu de um
   *  móvel apagado continuava aberto, "Mover" nele punha um fantasma na mão, e
   *  o arrasto de um móvel que outra pessoa apagou estourava o desenho. */
  aoMudarMapa() {
    const mapa = this.jogo && this.jogo.mapa;
    if (!mapa) return;
    const ids = new Set(mapa.objetos.map((o) => o.id));
    if (this.arrasto && !ids.has(this.arrasto.id)) this.arrasto = null;
    if (this.movendo && !ids.has(this.movendo.id)) {
      this.movendo = null;
      this.avisoNaMao();
      if (this.avisar) this.avisar('O móvel que estava na sua mão foi removido por outra pessoa.');
    }
    if (this.selecionado) {
      // a referência era do mapa velho: troca pela do mapa novo (ou solta)
      this.selecionado = mapa.objetos.find((o) => o.id === this.selecionado.id) || null;
    }
    this.ancorarMenu();
    const chaves = Object.keys(mapa.catalogo).join('\n');
    if (chaves !== this._chavesCatalogo) {
      this._chavesCatalogo = chaves;
      this._catalogoMudou();
    }
    if (this.ativo && this.ferramenta === 'sala') this._renderizarSalas();
  },

  /** Peça criada ou apagada no estúdio. O arsenal aberto mostrava a lista
   *  velha: a peça apagada continuava clicável e colocar ela no mapa voltava
   *  "Edição recusada"; a peça nova só aparecia depois de uma busca. */
  _catalogoMudou() {
    const cat = this.jogo.mapa.catalogo;
    this._indiceCache = null;
    this._conjuntosCache = null;
    if (!cat[this.tipoSel]) this.tipoSel = Object.keys(cat)[0] || this.tipoSel;
    if (this.conjunto && this.conjunto.pecas.some((p) => !cat[p.tipo])) this.cancelarMao();
    const est = this.arsenal;
    if (est.categoria.startsWith('g:') && !Object.values(cat).some((i) => 'g:' + i.grupo === est.categoria)) {
      est.categoria = 'todos';
    }
    if (document.getElementById('arsenal-corpo')) {
      this._renderizarCategorias();
      this._renderizarGrade();
    }
  },


  /* ==================== ícones ====================
   * Desenhados em SVG, não emoji: emoji muda de cara em cada sistema, não dá
   * para pintar de laranja quando o botão está escolhido, e no Windows metade
   * deles vira quadradinho. O traço usa `currentColor`, então segue a cor do
   * botão sozinho. */
  ICONES: {
    mobilia: '<path d="M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4"/><path d="M4 11h16v5H4z"/><path d="M6 16v3"/><path d="M18 16v3"/>',
    piso: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
    parede: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 9.7h18"/><path d="M3 14.3h18"/><path d="M9 5v4.7"/><path d="M15 9.7v4.6"/><path d="M9 14.3V19"/>',
    sala: '<path d="M5 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17"/><path d="M3 21h18"/><circle cx="13" cy="12.5" r="1"/>',
    inicio: '<path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    apagar: '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6.5 7l1 12a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1l1-12"/>',
    estudio: '<path d="M12 4v7"/><path d="M8.5 7.5L12 4l3.5 3.5"/><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    girar: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>',
    mover: '<path d="M12 3v18"/><path d="M3 12h18"/><path d="M9 6l3-3 3 3"/><path d="M9 18l3 3 3-3"/><path d="M6 9l-3 3 3 3"/><path d="M18 9l3 3-3 3"/>',
    trocar: '<path d="M4 8h13l-3-3"/><path d="M20 16H7l3 3"/>',
    duplicar: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5H6a2 2 0 0 0-2 2v9"/>',
    desfazer: '<path d="M4 11h11a4.5 4.5 0 1 1 0 9H9"/><path d="M8 7l-4 4 4 4"/>',
    ampliar: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-8 8"/><path d="M3 21l8-8"/>',
    encolher: '<path d="M9 3v6H3"/><path d="M15 21v-6h6"/><path d="M3 9l7 7"/><path d="M21 15l-7-7"/>',
    soltar: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.7-1.5"/>',
    trancado: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    padrao: '<path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M20 4v5h-5"/>',
    area: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M9 4v16"/><path d="M4 9h16"/>',
  },

  /** Devolve o SVG do ícone. Tamanho vai pelo CSS. */
  icone(nome) {
    const d = this.ICONES[nome];
    return d ? `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>` : '';
  },

  acao(acao) { this.enviar({ tipo: 'editar', acao }); },

  /** Quem manda no escritório. Quem decide de verdade é o servidor; aqui é só
   *  para não mostrar botão que vai levar recusa na cara da pessoa. */
  souAdmin() { return !!(this.jogo && this.jogo.admin); },

  /** Nome de sala e de pessoa entram em innerHTML: escapa, senão um nome com
   *  <svg onload=…> rodava script em quem abrisse o menu. */
  _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  encolher() {
    const m = this.jogo.mapa;
    this.acao({ acao: 'tamanho',
                largura: Math.max(20, m.largura - 6), altura: Math.max(16, m.altura - 4) });
  },

  /* ==================== abrir e fechar ==================== */

  alternar() {
    this.ativo = !this.ativo;
    this.selecionado = null;
    this.movendo = null;
    this.colocar = null;
    this.conjunto = null;
    this.fecharMenu();
    const botao = document.getElementById('btn-editor');   // visitante não tem o botão
    if (botao) botao.classList.toggle('ligado', this.ativo);
    document.body.classList.toggle('editando', this.ativo);
    if (this.ativo) this.montarPainel();
    else {
      this._pararObservador();
      const p = document.getElementById('editor');
      if (p) p.remove();
    }
  },

  /* ==================== painel ==================== */

  montarPainel() {
    const antigo = document.getElementById('editor');
    if (antigo) antigo.remove();

    const mapa = this.jogo.mapa;
    const painel = document.createElement('div');
    painel.id = 'editor';
    painel.className = 'editor-painel';
    painel.innerHTML = `
      <div class="cabeca">
        <strong>🏗️ Editar escritório</strong>
        <button class="fechar" title="Fechar (E)">✕</button>
      </div>
      <div class="ferramentas">
        ${[['mobilia', 'Móveis', 0], ['piso', 'Piso', 0], ['parede', 'Parede', 1],
           ['sala', 'Salas', 1], ['inicio', 'Entrada', 1], ['apagar', 'Apagar', 0],
           ['estudio', 'Estúdio', 1]]
          .filter(([, , soAdmin]) => !soAdmin || this.souAdmin())
          .map(([id, nome]) => `<button data-fer="${id}" title="${nome}">${this.icone(id)}<span>${nome}</span></button>`)
          .join('')}
      </div>
      <div class="conteudo" id="editor-conteudo"></div>
      <div class="rodape">
        ${this.souAdmin() ? `
        <button id="editor-desfazer" title="Desfazer a última edição">${this.icone('desfazer')} Desfazer</button>
        <button id="editor-ampliar" title="Mais espaço para novas salas">${this.icone('ampliar')} Ampliar</button>
        <button id="editor-encolher" title="Menos espaço">${this.icone('encolher')} Encolher</button>
        <button id="editor-soltar-tudo" title="Tira o dono de todas as salas">${this.icone('soltar')} Soltar salas</button>
        <button id="editor-padrao" title="Joga fora as edições e volta à planta original">${this.icone('padrao')}</button>`
        : '<span class="dica-membro">Você decora a <b>sua</b> sala. Parede e planta são do administrador.</span>'}
      </div>
      <p class="ajuda" id="editor-ajuda"></p>`;
    document.querySelector('.palco').appendChild(painel);

    painel.querySelector('.fechar').onclick = () => this.alternar();
    painel.querySelectorAll('[data-fer]').forEach((b) => {
      b.onclick = () => this.usarFerramenta(b.dataset.fer);
    });
    const seTiver = (id, f) => { const b = document.getElementById(id); if (b) b.onclick = f; };
    seTiver('editor-desfazer', () => this.acao({ acao: 'desfazer' }));
    seTiver('editor-ampliar', () => this.ampliar());
    seTiver('editor-encolher', () => this.encolher());
    seTiver('editor-soltar-tudo', () => {
      if (!confirm('Tirar o dono de TODAS as salas? Elas voltam a ficar livres.')) return;
      this.enviar({ tipo: 'sala', acao: 'liberar_tudo', id: '' });
    });
    seTiver('editor-padrao', () => {
      if (confirm('Voltar para a planta original? Tudo o que foi editado se perde.')) {
        this.acao({ acao: 'padrao' });
      }
    });
    this.usarFerramenta(this.ferramenta);
  },

  usarFerramenta(fer) {
    this.ferramenta = fer;
    this.selecionado = null;
    this.retangulo = null;
    // Sem isto o "redesenhar área" continuava ligado depois de sair de Salas, e
    // o próximo retângulo desenhado TELEPORTAVA a sala escolhida antes, calado.
    // Quem liga o redesenhar marca DEPOIS de chamar esta função.
    this.redesenhando = null;
    this.movendo = null;
    this.colocar = null;
    this.conjunto = null;
    this.fecharMenu();
    this._pararObservador();
    document.querySelectorAll('#editor [data-fer]').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.fer === fer);
    });
    const alvo = document.getElementById('editor-conteudo');
    const ajuda = document.getElementById('editor-ajuda');
    alvo.innerHTML = '';
    // o arsenal cuida do próprio espaçamento (a busca fica grudada no topo)
    alvo.classList.toggle('arsenal', fer === 'mobilia');

    if (fer === 'estudio') {
      ajuda.textContent = 'Suba uma imagem e ela vira peça do arsenal. Só o administrador vê isto.';
      this.painelEstudio();

    } else if (fer === 'mobilia') {
      ajuda.textContent = this.AJUDA_MOBILIA;
      this.montarArsenal(alvo);

    } else if (fer === 'piso') {
      ajuda.textContent = 'Arraste para pintar o chão. Segure Shift para preencher um retângulo.';
      const grade = document.createElement('div');
      grade.className = 'paleta pisos';
      for (const [id, nome] of Object.entries(this.jogo.mapa.pisos)) {
        const b = document.createElement('button');
        b.className = 'piso-' + id;
        b.textContent = nome;
        b.setAttribute('aria-pressed', id === this.pisoSel);
        b.onclick = () => {
          this.pisoSel = id;
          grade.querySelectorAll('button').forEach((o) => o.setAttribute('aria-pressed', o === b));
        };
        grade.appendChild(b);
      }
      alvo.appendChild(grade);

    } else if (fer === 'parede') {
      ajuda.textContent = 'Arraste para levantar parede. Alt (ou botão direito) derruba. '
        + 'Segure Shift para preencher um retângulo inteiro.';

    } else if (fer === 'sala') {
      ajuda.textContent = 'Arraste no mapa para desenhar a sala. Ela vem com parede, porta e piso.';
      this.listarSalas(alvo);

    } else if (fer === 'inicio') {
      ajuda.textContent = 'Clique onde quem entra deve aparecer.';

    } else if (fer === 'apagar') {
      ajuda.textContent = 'Clique num móvel para remover.';
    }
  },

  listarSalas(alvo) {
    alvo.appendChild(this._montarListaSalas());
  },

  /** A lista de salas segue o mapa: quando ele muda, só ELA é refeita. Antes
   *  a ferramenta inteira era remontada a cada mapa novo, e isso apagava o
   *  formulário que a pessoa estava preenchendo (com o nome já digitado) e
   *  desligava o "redesenhar área" sem aviso — bastava outra pessoa mover uma
   *  cadeira em qualquer canto do escritório. */
  _renderizarSalas() {
    const velha = document.querySelector('#editor-conteudo .salas');
    if (velha) velha.replaceWith(this._montarListaSalas());
  },

  _montarListaSalas() {
    const lista = document.createElement('div');
    lista.className = 'salas';
    for (const z of this.jogo.mapa.zonas) {
      const li = document.createElement('div');
      li.className = 'sala-item';
      if (this.redesenhando === z.id) li.classList.add('redesenhando');
      li.innerHTML = `<span class="ponto" style="background:${z.cor}"></span>
        <button class="nome" title="Renomear / trocar cor">${z.privada ? '🔒 ' : ''}${this._esc(z.nome)}</button>
        <button title="Aumentar ou diminuir: clique e arraste a área nova no mapa">${this.icone('area')}</button>
        <button title="Privada fecha o áudio de quem está dentro">${this.icone(z.privada ? 'trancado' : 'soltar')}</button>
        <button title="Remover sala">✕</button>`;
      const [renomear, redesenhar, alternar, remover] = li.querySelectorAll('button');
      renomear.onclick = () => this.formularioSala(z, z);
      redesenhar.onclick = () => {
        const ligar = this.redesenhando !== z.id;
        this.usarFerramenta('sala');           // limpa o estado, inclusive este
        this.redesenhando = ligar ? z.id : null;
        document.getElementById('editor-ajuda').textContent = this.redesenhando
          ? `Arraste no mapa a área nova de "${z.nome}".`
          : 'Arraste no mapa para marcar uma sala nova.';
      };
      alternar.onclick = () => this.acao({ acao: 'zona', ...z, privada: !z.privada });
      remover.onclick = () => this.acao({ acao: 'zona_remover', id: z.id });
      lista.appendChild(li);
    }
    return lista;
  },

  formularioSala(ret, existente) {
    const cores = ['#6366f1', '#0ea5e9', '#14b8a6', '#f59e0b', '#f97316',
                   '#a855f7', '#ec4899', '#22c55e', '#64748b'];
    const cor = existente ? existente.cor : cores[Math.floor(Math.random() * cores.length)];
    const caixa = document.createElement('div');
    caixa.className = 'sala-form';
    caixa.innerHTML = `
      <div class="titulo">${existente ? 'Editar sala' : 'Sala nova'} (${ret.x2 - ret.x1 + 1}×${ret.y2 - ret.y1 + 1})</div>
      <input id="sala-nome" placeholder="Nome da sala" maxlength="28" value="${this._esc(existente ? existente.nome : 'Sala')}">
      <label><input type="checkbox" id="sala-privada" ${!existente || existente.privada ? 'checked' : ''}>
        🔒 Áudio fechado (só quem está dentro)</label>
      ${existente ? '' : `<label><input type="checkbox" id="sala-paredes" checked>
        🧱 Levantar parede em volta, com porta</label>
      <div class="linha-campos">
        <select id="sala-piso">${Object.entries(this.jogo.mapa.pisos)
          .map(([id, nome]) => `<option value="${id}">${nome}</option>`).join('')}</select>
        <select id="sala-porta">
          <option value="baixo">Porta embaixo</option>
          <option value="cima">Porta em cima</option>
          <option value="esquerda">Porta à esquerda</option>
          <option value="direita">Porta à direita</option>
        </select>
      </div>`}
      <div class="cores">${cores.map((c) => `<button data-cor="${c}" style="background:${c}"
        aria-pressed="${c === cor}"></button>`).join('')}</div>
      <div class="botoes"><button id="sala-ok" class="ok">Criar</button>
        <button id="sala-cancelar">Cancelar</button></div>`;
    document.getElementById('editor-conteudo').prepend(caixa);
    let corSel = cor;
    caixa.querySelectorAll('[data-cor]').forEach((b) => {
      b.onclick = () => {
        corSel = b.dataset.cor;
        caixa.querySelectorAll('[data-cor]').forEach((o) => o.setAttribute('aria-pressed', o === b));
      };
    });
    const fechar = () => { caixa.remove(); this.retangulo = null; };
    caixa.querySelector('#sala-cancelar').onclick = fechar;
    caixa.querySelector('#sala-ok').onclick = () => {
      // A sala pode ter mudado de área enquanto o formulário estava aberto
      // (outra pessoa redesenhou): manda as medidas de AGORA, não as de quando
      // o formulário abriu — senão salvar o nome desfazia a área da outra.
      const atual = existente ? this.jogo.mapa.zonas.find((z) => z.id === existente.id) : null;
      if (existente && !atual) { fechar(); return; }     // a sala foi removida nesse meio-tempo
      const area = atual || ret;
      const comum = {
        nome: document.getElementById('sala-nome').value.trim() || 'Sala',
        privada: document.getElementById('sala-privada').checked, cor: corSel,
        x1: area.x1, y1: area.y1, x2: area.x2, y2: area.y2,
      };
      const paredes = document.getElementById('sala-paredes');
      if (!existente && paredes && paredes.checked) {
        this.acao({ acao: 'montar_sala', ...comum,
                    piso: document.getElementById('sala-piso').value,
                    porta: document.getElementById('sala-porta').value });
      } else {
        this.acao({ acao: 'zona', id: existente ? existente.id : undefined, ...comum });
      }
      fechar();
    };
    document.getElementById('sala-nome').select();
  },

  ampliar() {
    const m = this.jogo.mapa;
    this.acao({ acao: 'tamanho', largura: m.largura + 6, altura: m.altura + 4 });
  },

  /* ==================== mapa: apontar, arrastar, soltar ==================== */

  _tile(ponto) {
    return { x: Math.floor(ponto.x / this.jogo.tile), y: Math.floor(ponto.y / this.jogo.tile) };
  },

  objetoEm(tx, ty, camada) {
    const cat = this.jogo.mapa.catalogo;
    // de trás para frente: pega o que está por cima
    for (let i = this.jogo.mapa.objetos.length - 1; i >= 0; i--) {
      const o = this.jogo.mapa.objetos[i];
      const info = cat[o.tipo];
      if (!info) continue;
      if (camada && (info.camada || 'chao') !== camada) continue;
      const m = Objetos.medida(o.tipo, info, o.g);
      if (tx >= o.x && tx < o.x + m.l && ty >= o.y && ty < o.y + m.a) return o;
    }
    return null;
  },

  /** Em que camada mora a peça escolhida na paleta. */
  camadaDe(tipo) {
    const info = this.jogo.mapa.catalogo[tipo];
    return (info && info.camada) || 'chao';
  },

  ALTURA_CAMADA: { piso: 0, chao: 1, mesa: 2 },

  /** O que o clique pega, com a peça `tipoSel` na mão — ou null para COLOCAR.
   *
   *  Regra: pega o móvel de cima quando ele está na mesma altura da peça na
   *  mão, ou acima dela; senão coloca a peça em cima do que já está lá.
   *  Assim o monitor sobe na mesa (mesa é mais alta que o chão), clicar no
   *  monitor com a mesa na mão alcança o MONITOR (era impossível: abria o menu
   *  da mesa de baixo), e o tapete — que mora no piso, embaixo de tudo — só
   *  disputa com outro tapete e por isso entra por baixo da mobília. */
  alvoDoClique(tx, ty) {
    const camada = this.camadaDe(this.tipoSel);
    if (camada === 'piso') return this.objetoEm(tx, ty, 'piso');
    const alt = this.ALTURA_CAMADA;
    const minha = alt[camada] || 0;
    const cat = this.jogo.mapa.catalogo;
    // O mais ALTO que estiver ali, e entre os empatados o mais recente. Não dá
    // para usar só a ordem da lista: um tapete colocado depois da mesa aparece
    // por último nela e mora EMBAIXO de tudo.
    let melhor = null, melhorAlt = -1;
    for (const o of this.jogo.mapa.objetos) {
      const info = cat[o.tipo];
      if (!info) continue;
      const m = Objetos.medida(o.tipo, info, o.g);
      if (!(tx >= o.x && tx < o.x + m.l && ty >= o.y && ty < o.y + m.a)) continue;
      const h = alt[(info.camada || 'chao')] || 0;
      if (h >= melhorAlt) { melhor = o; melhorAlt = h; }
    }
    return melhor && melhorAlt >= minha ? melhor : null;
  },

  aoApontar(e, ponto) {
    const t = this._tile(ponto);
    this.cursor = t;
    const apagando = e.button === 2 || e.altKey;

    if (this.ferramenta === 'mobilia' && !apagando) {
      if (this.movendo) {                          // segundo clique: solta aqui
        const m = this.movendo;
        this.movendo = null;
        this.acao({ acao: 'mover', id: m.id, x: t.x + m.dx, y: t.y + m.dy });
        return;
      }
      if (this.conjunto) {                         // conjunto na mão: solta tudo aqui
        this.soltarConjunto(t);
        return;
      }
      const alvo = this.alvoDoClique(t.x, t.y);
      if (alvo) {
        // guarda o arrasto, mas só vira movimento se a pessoa arrastar de fato:
        // um clique seco abre o menu do móvel.
        this.fecharMenu();
        this.selecionado = alvo;
        this.arrasto = { id: alvo.id, dx: alvo.x - t.x, dy: alvo.y - t.y,
                         x: alvo.x, y: alvo.y, ox: alvo.x, oy: alvo.y };
      } else {
        this.fecharMenu();
        // Coloca só ao SOLTAR (ver aoSoltar). No celular a pinça de zoom começa
        // com um dedo e o segundo chega milissegundos depois: colocar já no
        // toque plantava um móvel embaixo do primeiro dedo a cada pinça.
        this.colocar = { tipo: this.tipoSel, g: this.giro };
      }
    } else if (this.ferramenta === 'apagar' || (this.ferramenta === 'mobilia' && apagando)) {
      const alvo = this.objetoEm(t.x, t.y);
      if (alvo) this.acao({ acao: 'remover', id: alvo.id });
    } else if (this.ferramenta === 'parede') {
      this.pincel = { tipo: 'parede', valor: !apagando, tiles: [[t.x, t.y]],
                      retangulo: e.shiftKey, inicio: t };
    } else if (this.ferramenta === 'piso') {
      this.pincel = { tipo: 'piso', piso: this.pisoSel, tiles: [[t.x, t.y]],
                      retangulo: e.shiftKey, inicio: t };
    } else if (this.ferramenta === 'sala') {
      this.retangulo = { x1: t.x, y1: t.y, x2: t.x, y2: t.y, arrastando: true };
    } else if (this.ferramenta === 'inicio') {
      this.acao({ acao: 'nascimento', x: t.x, y: t.y });
    }
  },

  aoMover(ponto) {
    const t = this._tile(ponto);
    this.cursor = t;
    if (this.arrasto) {
      this.arrasto.x = t.x + this.arrasto.dx;
      this.arrasto.y = t.y + this.arrasto.dy;
    } else if (this.pincel) {
      if (this.pincel.retangulo) {                 // Shift: preenche o retângulo
        const i = this.pincel.inicio;
        const tiles = [];
        for (let y = Math.min(i.y, t.y); y <= Math.max(i.y, t.y); y++) {
          for (let x = Math.min(i.x, t.x); x <= Math.max(i.x, t.x); x++) tiles.push([x, y]);
        }
        this.pincel.tiles = tiles;
      } else {
        const ja = this.pincel.tiles;
        const ultimo = ja[ja.length - 1];
        if (ultimo[0] !== t.x || ultimo[1] !== t.y) ja.push([t.x, t.y]);
      }
    } else if (this.retangulo && this.retangulo.arrastando) {
      this.retangulo.x2 = t.x;
      this.retangulo.y2 = t.y;
    }
  },

  aoSoltar() {
    if (this.colocar) {
      const c = this.colocar;
      this.colocar = null;
      if (this.cursor) {                         // onde o botão soltou, que é onde a prévia estava
        this.acao({ acao: 'objeto', tipo: c.tipo, x: this.cursor.x, y: this.cursor.y, g: c.g });
        this._registrarRecente(c.tipo);          // colocar também conta como “usado”
        this._atualizarContagens();
      }
      return;
    }
    if (this.arrasto) {
      const a = this.arrasto;
      this.arrasto = null;
      if (a.x === a.ox && a.y === a.oy) {          // clique seco: abre o menu
        this.abrirMenu(a.id);
      } else {
        const alvo = this.jogo.mapa.objetos.find((o) => o.id === a.id);
        if (alvo && (alvo.x !== a.x || alvo.y !== a.y)) {
          this.acao({ acao: 'mover', id: a.id, x: a.x, y: a.y });
        }
      }
    } else if (this.pincel) {
      const traco = this.pincel;
      this.pincel = null;
      if (traco.tipo === 'parede') this.acao({ acao: 'parede', valor: traco.valor, tiles: traco.tiles });
      else this.acao({ acao: 'piso', piso: traco.piso, tiles: traco.tiles });
    } else if (this.retangulo && this.retangulo.arrastando) {
      const r = this.retangulo;
      this.retangulo = {
        x1: Math.min(r.x1, r.x2), y1: Math.min(r.y1, r.y2),
        x2: Math.max(r.x1, r.x2), y2: Math.max(r.y1, r.y2), arrastando: false,
      };
      if (this.redesenhando) {
        // redesenhar mantém id, nome e cor: é a mesma sala, com outra área
        const z = this.jogo.mapa.zonas.find((x) => x.id === this.redesenhando);
        this.redesenhando = null;
        if (z) {
          this.acao({ acao: 'zona', ...z, x1: this.retangulo.x1, y1: this.retangulo.y1,
                      x2: this.retangulo.x2, y2: this.retangulo.y2 });
          this.retangulo = null;
          return;
        }
      }
      this.formularioSala(this.retangulo);
    }
  },

  removerSelecionado() {
    // sem isto o cartão do móvel apagado continuava na tela, e "Mover" nele
    // punha um fantasma na mão que nenhum clique conseguia largar
    this.fecharMenu();
    if (this.selecionado) {
      this.acao({ acao: 'remover', id: this.selecionado.id });
      this.selecionado = null;
    }
  },

  /** Gira 90°. Se tem móvel na mão ou selecionado, gira ele; senão gira o que
   *  ainda vai ser colocado (a prévia embaixo do cursor). */
  girar() {
    if (this.conjunto) {                          // conjunto na mão gira inteiro
      this.girarConjunto();
      return;
    }
    // só gira um móvel do mapa quando ele está na mão ou com o menu aberto —
    // senão G viraria o último clicado em vez da prévia
    const alvo = this.movendo || (this.menu && this.selecionado);
    if (alvo) {
      this.acao({ acao: 'girar', id: alvo.id });
      return;
    }
    this.giro = (this.giro + 1) % 4;
    const b = document.getElementById('editor-girar');
    if (b) b.setAttribute('aria-pressed', this.giro !== 0);
    this._avisarGiro();
  },

  _avisarGiro() {
    const ajuda = document.getElementById('editor-ajuda');
    if (!ajuda || this.ferramenta !== 'mobilia') return;
    ajuda.textContent = this.giro
      ? `Girado ${this.giro * 90}° — clique no mapa para colocar assim. G gira mais.`
      : this.AJUDA_MOBILIA;
  },

  AJUDA_MOBILIA: 'Clique no mapa para colocar; G (ou o botão de girar) gira antes. '
    + 'Clique num móvel para abrir o menu (girar, mover, trocar, duplicar, remover); arrastar também move. '
    + '⌘/Ctrl+D duplica o selecionado, Delete apaga, Esc solta o que está na mão.',

  /** Prévia do móvel que está sendo carregado, com ou sem o editor aberto. */
  desenharNaMao(ctx) {
    if (!this.movendo || !this.cursor) return;
    const mapa = this.jogo.mapa;
    const t = this.jogo.tile;
    const alvo = mapa.objetos.find((o) => o.id === this.movendo.id);
    if (!alvo) return;
    const m = Objetos.medida(alvo.tipo, mapa.catalogo[alvo.tipo], alvo.g);
    ctx.globalAlpha = 0.6;
    Objetos.desenhar(ctx, alvo.tipo, this.cursor.x * t, this.cursor.y * t,
                     m.l * t, m.a * t, alvo.g);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.cursor.x * t, this.cursor.y * t, m.l * t, m.a * t);
  },

  /* ==================== menu do móvel ==================== */

  fecharMenu() {
    if (this.menu) { this.menu.remove(); this.menu = null; }
  },

  /** Enquanto a pessoa está com um móvel (ou um conjunto) "na mão", mostra uma
   *  faixa com o botão de largar. Antes o único jeito de soltar era Esc, e o
   *  aviso morava dentro do editor — com o editor fechado ninguém via, e o móvel
   *  ficava grudado no cursor. */
  avisoNaMao() {
    const naMao = this.movendo || this.conjunto;
    let faixa = document.getElementById('na-mao');
    if (!naMao) { if (faixa) faixa.remove(); return; }
    if (!faixa) {
      faixa = document.createElement('div');
      faixa.id = 'na-mao';
      faixa.innerHTML = '<span></span><button type="button">Cancelar</button>';
      faixa.querySelector('button').onclick = () => {
        this.movendo = null; this.conjunto = null; this.avisoNaMao();
      };
      document.querySelector('.palco').appendChild(faixa);
    }
    const texto = this.conjunto
      ? '“' + this.conjunto.nome + '” na mão · clique para largar · G gira · Esc cancela'
      : 'Clique onde o móvel deve ficar · Esc cancela';
    const alvo = faixa.querySelector('span');
    if (alvo.textContent !== texto) alvo.textContent = texto;
  },

  /** Põe o cartão onde foi pedido, mas sem deixar nenhum botão fora da tela.
   *  A conta antiga usava a largura da JANELA e um tamanho chutado (500px), e
   *  por isso o menu escapava por baixo e sumia atrás do painel lateral. Aqui a
   *  gente mede o cartão de verdade e o palco de verdade. */
  _encaixarNoPalco(caixa, x, y) {
    const palco = document.querySelector('.palco').getBoundingClientRect();
    const c = caixa.getBoundingClientRect();      // já está no DOM: tem tamanho
    const larg = c.width || 300, alt = c.height || 140;
    const M = 8;
    const maxX = Math.max(M, palco.width - larg - M);
    const maxY = Math.max(M, palco.height - alt - M);
    caixa.style.left = Math.round(Math.max(M, Math.min(x, maxX))) + 'px';
    caixa.style.top = Math.round(Math.max(M, Math.min(y, maxY))) + 'px';
  },

  /** Amarra o cartão a um ponto do mapa. `calcular` devolve onde o cartão
   *  deve ficar (em px do palco) ou null quando o alvo deixou de existir. */
  _ancorar(caixa, calcular) {
    caixa._ancora = calcular;
    caixa._assinatura = '';
    this.ancorarMenu();
  },

  /** Chamado a cada quadro pelo app.js. O menu é HTML por cima do canvas; a
   *  câmera anda (zoom, teclado, janela redimensionada, outra pessoa moveu o
   *  móvel) e antes o cartão ficava parado no pixel em que nasceu, apontando
   *  para o nada. Se o alvo sumiu do mapa, o cartão fecha. */
  ancorarMenu() {
    const m = this.menu;
    if (!m || !m._ancora || !this.jogo || !this.jogo.mapa) return;
    const pos = m._ancora();
    if (!pos) { this.fecharMenu(); return; }
    const tela = document.getElementById('tela');
    // só mexe no DOM quando algo mudou: câmera, zoom, tamanho do palco, o alvo
    const assinatura = [Math.round(pos.x), Math.round(pos.y), tela.width, tela.height].join(',');
    if (assinatura === m._assinatura) return;
    m._assinatura = assinatura;
    this._encaixarNoPalco(m, pos.x, pos.y);
  },

  /** Onde, na tela, está o canto do tile (tx, ty). */
  _naTela(tx, ty) {
    const r = document.getElementById('tela').getBoundingClientRect();
    const e = this.jogo.escala || 1.5;
    const palco = document.querySelector('.palco').getBoundingClientRect();
    return {
      x: r.left - palco.left + (tx * this.jogo.tile - this.jogo.camera.x) * e,
      y: r.top - palco.top + (ty * this.jogo.tile - this.jogo.camera.y) * e,
    };
  },

  abrirMenu(id) {
    this.fecharMenu();
    const mapa = this.jogo.mapa;
    const o = mapa.objetos.find((x) => x.id === id);
    if (!o) return;
    const info = mapa.catalogo[o.tipo];
    const m = Objetos.medida(o.tipo, info, o.g);
    const pos = this._naTela(o.x + m.l / 2, o.y);
    // Em que sala esse móvel está? é o caminho mais natural para reivindicar:
    // a pessoa clica na mesa da sala vazia, não na plaquinha flutuante.
    const sala = this.jogo.visitante ? null : (mapa.zonas.find(
      (z) => z.privada && o.x >= z.x1 && o.x <= z.x2 && o.y >= z.y1 && o.y <= z.y2) || null);
    // o móvel do menu é o selecionado: assim ⌘/Ctrl+D duplica ele mesmo com o
    // menu aberto a partir do jogo (editor fechado)
    this.selecionado = o;

    const caixa = document.createElement('div');
    caixa.className = 'menu-movel';
    caixa.innerHTML = `
      <div class="cabeca">
        <img src="${Objetos.miniatura(o.tipo, info.l, info.a, 34, o.g)}" alt="">
        <div><strong>${this._esc(info.nome)}</strong><span>${m.l}×${m.a} · ${this._esc(info.grupo)}</span></div>
      </div>
      ${sala ? `<div class="dono-sala">
        ${sala.dono_nome ? `<span>${this._esc(sala.nome)} é de <b>${this._esc(sala.dono_nome)}</b></span>`
                         : `<span>${this._esc(sala.nome)} está livre</span>`}
        ${sala.dono_nome ? '' : '<button data-fazer="pegar-sala">Reivindicar</button>'}
      </div>` : ''}
      <div class="acoes">
        <button data-fazer="girar" title="Girar 90° (G)">${this.icone('girar')} Girar</button>
        <button data-fazer="mover">${this.icone('mover')} Mover</button>
        <button data-fazer="trocar">${this.icone('trocar')} Trocar</button>
        <button data-fazer="duplicar" title="Uma cópia ao lado (⌘/Ctrl+D)">${this.icone('duplicar')} Duplicar</button>
        <button data-fazer="remover" class="perigo" title="Remover (Delete)">${this.icone('apagar')} Remover</button>
      </div>
      <div class="troca oculto"></div>`;
    document.querySelector('.palco').appendChild(caixa);
    this.menu = caixa;
    this._ancorar(caixa, () => {
      const atual = this.jogo.mapa.objetos.find((x) => x.id === id);
      const infoAtual = atual && this.jogo.mapa.catalogo[atual.tipo];
      if (!infoAtual) return null;                       // apagado: o menu fecha
      const ma = Objetos.medida(atual.tipo, infoAtual, atual.g);
      const p = this._naTela(atual.x + ma.l / 2, atual.y);
      return { x: p.x - 96, y: p.y - 12 };
    });

    const pegarSala = caixa.querySelector('[data-fazer="pegar-sala"]');
    if (pegarSala) pegarSala.onclick = () => {
      this.enviar({ tipo: 'sala', acao: 'reivindicar', id: sala.id });
      this.fecharMenu();
    };
    caixa.querySelector('[data-fazer="girar"]').onclick = () => {
      this.acao({ acao: 'girar', id: o.id });
      this.fecharMenu();
    };
    caixa.querySelector('[data-fazer="duplicar"]').onclick = () => this.duplicar(o.id);
    caixa.querySelector('[data-fazer="mover"]').onclick = () => {
      this.movendo = { id: o.id, dx: 0, dy: 0 };
      this.fecharMenu();
      const ajuda = document.getElementById('editor-ajuda');
      if (ajuda) ajuda.textContent = 'Clique onde o móvel deve ficar (Esc cancela).';
    };
    caixa.querySelector('[data-fazer="remover"]').onclick = () => {
      this.acao({ acao: 'remover', id: o.id });
      this.fecharMenu();
    };
    caixa.querySelector('[data-fazer="trocar"]').onclick = () => {
      const alvo = caixa.querySelector('.troca');
      alvo.classList.toggle('oculto');
      // A lista de troca faz o cartão triplicar de altura. Sem recolocar, ela
      // nascia inteira embaixo da tela e o recurso ficava inalcançável.
      const recolocar = () => requestAnimationFrame(() =>
        this._encaixarNoPalco(caixa, caixa.offsetLeft, caixa.offsetTop));
      if (alvo.childElementCount) { recolocar(); return; }
      // Quem cabe no espaço atual, da MESMA camada, do mais parecido ao menor.
      // Trocar por um maior invadiria o vizinho; trocar de camada faria um
      // tapete virar cadeira, que não é troca, é outra coisa. A categoria da
      // peça vem primeiro na fila: tapete oferece tapete antes de qualquer
      // outra coisa rente ao piso.
      const cabem = Object.entries(mapa.catalogo)
        .filter(([tipo, i]) => tipo !== o.tipo && i.l <= info.l && i.a <= info.a
                               && (i.camada || 'chao') === (info.camada || 'chao'))
        .sort((a, b) => {
          const mesmoGrupo = (x) => (x[1].grupo === info.grupo ? 0 : 1);
          const sobra = (x) => (info.l - x[1].l) + (info.a - x[1].a);
          return mesmoGrupo(a) - mesmoGrupo(b) || sobra(a) - sobra(b);
        });
      for (const [tipo, i] of cabem) {
        const b = document.createElement('button');
        b.title = i.nome;
        b.innerHTML = `<img src="${Objetos.miniatura(tipo, i.l, i.a, 34)}" alt="">`;
        b.onclick = () => { this.acao({ acao: 'trocar', id: o.id, tipo }); this.fecharMenu(); };
        alvo.appendChild(b);
      }
      if (!alvo.childElementCount) {
        alvo.innerHTML = '<p class="vazio">Nenhuma outra peça desse tamanho e dessa camada.</p>';
      }
      recolocar();
    };
  },

  /* ==================== menu da sala ==================== */

  abrirMenuSala(id) {
    this.fecharMenu();
    const mapa = this.jogo.mapa;
    const z = mapa.zonas.find((x) => x.id === id);
    if (!z) return;
    const pos = this._naTela((z.x1 + z.x2 + 1) / 2, z.y1);
    // é a minha sala? o servidor decide de verdade; aqui é só o que mostrar
    const meuDono = !!(z.dono_nome && this.jogo.eu && z.dono_nome === this.jogo.eu.nome);

    const cores = ['#8b7fd0', '#6f9fd8', '#4fae91', '#c99a4a', '#d9776a',
                   '#a889cc', '#d9789e', '#5aa86e', '#8a8f9c'];
    let corSel = z.cor;
    const caixa = document.createElement('div');
    caixa.className = 'menu-movel menu-sala';
    caixa.innerHTML = `
      <div class="cabeca">
        <span class="ponto-sala" style="background:${z.cor}"></span>
        <div><strong>Sala</strong><span>${z.x2 - z.x1 + 1}×${z.y2 - z.y1 + 1} tiles</span></div>
      </div>
      <input id="sala-menu-nome" maxlength="28" value="${this._esc(z.nome)}">
      <label><input type="checkbox" id="sala-menu-privada" ${z.privada ? 'checked' : ''}>
        🔒 Áudio fechado</label>
      <div class="cores">${cores.map((c) => `<button data-cor="${c}" style="background:${c}"
        aria-pressed="${c === z.cor}"></button>`).join('')}</div>
      ${z.privada ? `<div class="dono-sala">
        ${z.dono_nome ? `<span>Sala de <b>${this._esc(z.dono_nome)}</b></span>` : '<span>Sala livre</span>'}
        <button data-fazer="${z.dono_nome ? 'soltar' : 'pegar'}">${z.dono_nome ? 'Soltar a sala' : 'Reivindicar'}</button>
      </div>` : ''}
      ${meuDono ? `<div class="dono-sala">
        <span>${z.trancada ? '🔒 Porta trancada' : '🚪 Porta aberta'}</span>
        <button data-fazer="${z.trancada ? 'destrancar' : 'trancar'}">${z.trancada ? 'Destrancar' : 'Trancar por dentro'}</button>
      </div>` : ''}
      <div class="acoes">
        <button data-fazer="salvar" class="ok">Salvar</button>
        <button data-fazer="area">${this.icone('area')} Área</button>
        <button data-fazer="remover" class="perigo">${this.icone('apagar')}</button>
      </div>
      <p class="dica">📐 redesenha o espaço da sala. Para mudar as <b>paredes</b>,
        use 🧱 no editor (Shift preenche um retângulo).</p>`;
    document.querySelector('.palco').appendChild(caixa);
    this.menu = caixa;
    this._ancorar(caixa, () => {
      const atual = this.jogo.mapa.zonas.find((x) => x.id === id);
      if (!atual) return null;                           // sala removida: o menu fecha
      const p = this._naTela((atual.x1 + atual.x2 + 1) / 2, atual.y1);
      return { x: p.x - 110, y: p.y + 26 };
    });

    caixa.querySelectorAll('[data-cor]').forEach((b) => {
      b.onclick = () => {
        corSel = b.dataset.cor;
        caixa.querySelectorAll('[data-cor]').forEach((o) => o.setAttribute('aria-pressed', o === b));
      };
    });
    const nome = caixa.querySelector('#sala-menu-nome');
    const salvar = () => {
      // A sala de AGORA, não a de quando o menu abriu. A ação `zona` reescreve
      // a zona inteira: com a cópia velha, salvar o nome desfazia a área que
      // outra pessoa tinha acabado de redesenhar.
      const atual = this.jogo.mapa.zonas.find((x) => x.id === z.id) || z;
      this.acao({ acao: 'zona', ...atual, nome: nome.value.trim() || atual.nome, cor: corSel,
                  privada: caixa.querySelector('#sala-menu-privada').checked });
      this.fecharMenu();
    };
    caixa.querySelector('[data-fazer="salvar"]').onclick = salvar;
    nome.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') salvar(); });
    caixa.querySelector('[data-fazer="remover"]').onclick = () => {
      this.acao({ acao: 'zona_remover', id: z.id });
      this.fecharMenu();
    };
    // Reivindicar / soltar a sala. Quem manda é o servidor: aqui é só o pedido,
    // e o mapa novo volta para todo mundo pela mensagem `mapa`.
    const pegar = caixa.querySelector('[data-fazer="pegar"]');
    if (pegar) pegar.onclick = () => {
      this.enviar({ tipo: 'sala', acao: 'reivindicar', id: z.id });
      this.fecharMenu();
    };
    const soltar = caixa.querySelector('[data-fazer="soltar"]');
    if (soltar) soltar.onclick = () => {
      this.enviar({ tipo: 'sala', acao: 'liberar', id: z.id });
      this.fecharMenu();
    };
    for (const acao of ['trancar', 'destrancar']) {
      const b = caixa.querySelector(`[data-fazer="${acao}"]`);
      if (b) b.onclick = () => { this.enviar({ tipo: 'sala', acao, id: z.id }); this.fecharMenu(); };
    }
    caixa.querySelector('[data-fazer="area"]').onclick = () => {
      // redesenhar exige as ferramentas: abre o editor já na hora certa
      this.fecharMenu();
      if (!this.ativo) this.alternar();
      this.usarFerramenta('sala');
      this.redesenhando = z.id;
      document.getElementById('editor-ajuda').textContent =
        `Arraste no mapa a área nova de "${z.nome}".`;
    };
    // Antes o campo já vinha com o foco: quem apertava S para andar escrevia um
    // "s" no nome da sala, o boneco não saía do lugar, e Salvar sem perceber
    // renomeava a sala para "s".
    nome.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.fecharMenu(); });
  },

  /* ==================== o que aparece por cima do mapa ==================== */

  desenhar(ctx, x0, y0, x1, y1) {
    const t = this.jogo.tile;
    const mapa = this.jogo.mapa;

    // Duplicar pediu “seleciona o próximo móvel que o servidor devolver”: o id
    // da cópia só existe quando o mapa novo chega, e ele chega por aqui.
    if (this._novo) {
      if (mapa.objetos.length > this._novo.antes) {
        this.selecionado = mapa.objetos[mapa.objetos.length - 1];
        this._novo = null;
      } else if (Date.now() - this._novo.quando > 3000) {
        this._novo = null;                         // recusado ou perdido: desiste
      }
    }

    ctx.strokeStyle = 'rgba(148,163,184,.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x <= x1; x++) { ctx.moveTo(x * t, y0 * t); ctx.lineTo(x * t, y1 * t); }
    for (let y = y0; y <= y1; y++) { ctx.moveTo(x0 * t, y * t); ctx.lineTo(x1 * t, y * t); }
    ctx.stroke();

    // ponto de entrada
    const [nx, ny] = mapa.nascimento;
    ctx.fillStyle = 'rgba(56,189,248,.35)';
    ctx.fillRect(nx * t, ny * t, t, t);
    ctx.font = '16px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📍', nx * t + t / 2, ny * t + t / 2);

    // traço de parede/piso em andamento
    if (this.pincel) {
      ctx.fillStyle = this.pincel.tipo === 'parede'
        ? (this.pincel.valor ? 'rgba(70,88,120,.75)' : 'rgba(244,63,94,.45)')
        : 'rgba(56,189,248,.45)';
      for (const [x, y] of this.pincel.tiles) ctx.fillRect(x * t, y * t, t, t);
    }

    // móvel sendo arrastado
    // Outra pessoa pode apagar o móvel no meio do arrasto: `aoMudarMapa` solta
    // o arrasto quando o mapa chega, e esta conferência é a rede de segurança
    // — um `alvo` nulo aqui estourava o quadro inteiro.
    const arrastado = this.arrasto && mapa.objetos.find((o) => o.id === this.arrasto.id);
    if (this.arrasto && !arrastado) this.arrasto = null;
    if (arrastado) {
      const alvo = arrastado;
      const m = Objetos.medida(alvo.tipo, mapa.catalogo[alvo.tipo], alvo.g);
      ctx.globalAlpha = 0.65;
      Objetos.desenhar(ctx, alvo.tipo, this.arrasto.x * t, this.arrasto.y * t,
                       m.l * t, m.a * t, alvo.g);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.strokeRect(this.arrasto.x * t, this.arrasto.y * t, m.l * t, m.a * t);
    } else if (this.movendo && this.cursor) {
      this.desenharNaMao(ctx);
    } else if (this.conjunto && this.cursor && this.ferramenta === 'mobilia') {
      this.desenharConjunto(ctx);                     // pegada inteira do conjunto
    } else if (this.cursor && this.ferramenta === 'mobilia') {
      const info = mapa.catalogo[this.tipoSel];       // prévia do que vai ser colocado
      if (info) {
        const m = Objetos.medida(this.tipoSel, info, this.giro);
        ctx.globalAlpha = 0.45;
        Objetos.desenhar(ctx, this.tipoSel, this.cursor.x * t, this.cursor.y * t,
                         m.l * t, m.a * t, this.giro);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(56,189,248,.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.cursor.x * t, this.cursor.y * t, m.l * t, m.a * t);
      }
    }

    // retângulo da sala nova
    if (this.retangulo) {
      const r = this.retangulo;
      const x = Math.min(r.x1, r.x2) * t, y = Math.min(r.y1, r.y2) * t;
      const w = (Math.abs(r.x2 - r.x1) + 1) * t, h = (Math.abs(r.y2 - r.y1) + 1) * t;
      ctx.fillStyle = 'rgba(56,189,248,.18)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#38bdf8';
      ctx.setLineDash([8, 5]);
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }

    if (this.selecionado) {
      const o = mapa.objetos.find((x) => x.id === this.selecionado.id);
      if (o) {
        const m = Objetos.medida(o.tipo, mapa.catalogo[o.tipo], o.g);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.strokeRect(o.x * t + 1, o.y * t + 1, m.l * t - 2, m.a * t - 2);
      }
    }
  },

  /* ==================== arsenal: busca, categorias, favoritos, conjuntos ==================== */

  // O que a pessoa escolheu no painel sobrevive à troca de ferramenta: sair
  // para Piso e voltar não pode apagar a busca nem a categoria.
  arsenal: { busca: '', categoria: 'todos' },
  _observador: null,     // IntersectionObserver: miniatura só quando entra na tela
  _novo: null,           // “selecione o próximo móvel que chegar” (duplicar)
  _indiceCache: null,    // texto de busca por peça, montado uma vez por catálogo
  _conjuntosCache: null, // conjuntos já conferidos contra o catálogo
  _miniConjuntos: new Map(),

  CHAVE_FAVORITOS: 'escritorio:favoritos',
  CHAVE_RECENTES: 'escritorio:recentes',
  MAX_RECENTES: 10,

  /** Etiquetas que a busca entende além do nome, do id e da categoria da peça.
   *  Curto de propósito: só entra o que NÃO está escrito no nome. Um valor em
   *  texto é apelido de outra etiqueta (“descanso” acha o mesmo que “lounge”). */
  TAGS: {
    gamer: ['mesa_gamer', 'cadeira_gamer', 'monitor_gamer', 'teclado_gamer', 'mouse_gamer',
            'torre_gamer', 'mousepad', 'fone_mesa', 'fone_branco', 'fita_led', 'monitor_curvo',
            'monitor_ultra'],
    madeira: ['mesa_madeira', 'porta_madeira', 'painel_madeira', 'estante', 'estante_alta',
              'aparador', 'mesa_reuniao', 'banco', 'mesa_centro', 'arquivo'],
    branco: ['mesa_branca', 'cadeira_branca', 'gamer_branca', 'teclado_branco', 'monitor_branco',
             'fone_branco', 'porta_branca', 'armario', 'geladeira', 'quadro'],
    azul: ['cadeira_azul', 'gamer_azul', 'sofa_azul', 'tapete_azul', 'narguile_azul'],
    verde: ['cadeira_verde', 'gamer_verde', 'sofa_verde', 'poltrona_verde', 'tapete_verde'],
    preto: ['mesa_preta', 'gamer_preta', 'poltrona_preta', 'narguile_preto', 'torre',
            'torre_grande', 'cadeira_gamer'],
    rosa: ['gamer_rosa'],
    cinza: ['cadeira_cinza', 'tapete_cinza'],
    bege: ['cadeira_bege', 'sofa_bege'],
    laranja: ['cadeira_laranja'],
    caramelo: ['sofa_caramelo', 'poltrona_caramelo'],
    couro: ['cadeira_couro', 'cadeira_executiva', 'poltrona_preta'],
    planta: ['vasinho', 'arvore', 'arbusto'],        // as da categoria Plantas já entram por ela
    copa: ['balcao', 'banqueta', 'caneca', 'copo', 'bolo'],
    porta: ['janela', 'janela_grande'],
    reuniao: ['mesa_reuniao', 'mesa_reuniao_p', 'mesa_reuniao_oval', 'tv', 'tv_grande', 'quadro',
              'webcam', 'mural', 'cadeira_visita'],
    chefe: ['mesa_ampla', 'cadeira_executiva', 'cadeira_couro', 'cadeira_visita', 'mesa_l'],
    executivo: 'chefe',
    lounge: ['sofa', 'poltrona', 'tapete', 'tapete_redondo', 'mesa_centro', 'narguile', 'puff',
             'pebolim', 'banco_espera'],
    descanso: 'lounge',
    tela: ['tv', 'tv_grande', 'monitor', 'imac', 'notebook', 'tablet'],
    luz: ['luminaria', 'luminaria_mesa', 'fita_led'],
    vidro: ['porta_vidro', 'painel_vidro', 'janela', 'janela_grande'],
    parede: ['quadro', 'quadro_abstrato', 'mural', 'relogio', 'janela', 'janela_grande', 'tv',
             'tv_grande'],
    guardar: ['armario', 'estante', 'estante_alta', 'arquivo', 'armario_aereo', 'aparador',
              'porta_documentos'],
    escrever: ['papeis', 'bloco_notas', 'canetas', 'quadro', 'mural'],
    bebida: ['caneca', 'copo', 'copos', 'bebedouro', 'cafeteira', 'maquina_cafe', 'frigobar',
             'geladeira'],
    comida: ['frutas', 'bolo', 'microondas', 'geladeira', 'frigobar'],
    jogo: ['pebolim', 'palco'],
    festa: ['palco', 'bolo', 'narguile', 'caixa_som'],
    som: ['caixa_som', 'microfone', 'fone_mesa', 'fone_branco'],
    video: ['webcam', 'microfone', 'tv', 'tv_grande'],
  },

  /** A categoria inteira ganha estas etiquetas (chave sem acento, minúscula):
   *  “copa” acha tudo do Café, “sentar” acha cadeira, sofá e poltrona. */
  TAGS_GRUPO: {
    'cafe': ['copa', 'cozinha', 'cafe', 'comer'],
    'computadores': ['computador', 'pc', 'tela', 'trabalho'],
    'monitores': ['computador', 'pc', 'tela'],
    'acessorios': ['computador', 'periferico', 'teclado', 'mouse'],
    'eletronicos': ['eletronico', 'tela', 'som'],
    'assentos': ['sentar', 'assento'],
    'cadeiras': ['sentar', 'assento'],
    'cadeiras gamer': ['sentar', 'assento', 'gamer'],
    'sofas': ['sentar', 'assento', 'lounge', 'descanso'],
    'poltronas': ['sentar', 'assento', 'lounge', 'descanso'],
    'plantas': ['planta', 'verde', 'natureza'],
    'externo': ['jardim', 'fora', 'rua', 'natureza'],
    'iluminacao': ['luz', 'lampada'],
    'portas': ['porta', 'entrada', 'passagem'],
    'paredes': ['parede', 'divisoria', 'painel'],
    'convivencia': ['tapete', 'lounge', 'descanso', 'chao'],
    'narguiles': ['narguile', 'fumar', 'lounge'],
    'decoracao': ['decoracao', 'enfeite', 'parede'],
    'na mesa': ['enfeite', 'objeto'],
    'mesas': ['mesa', 'trabalho', 'escritorio'],
    'mesas de reuniao': ['mesa', 'reuniao'],
    'mesas de centro': ['mesa', 'lounge', 'descanso'],
    'escritorio': ['arquivo', 'guardar'],
    'sala': ['escritorio'],
  },

  /** Conjuntos prontos. Cada peça é [tipo, dx, dy, giro]; dx/dy contam do
   *  canto superior esquerdo do conjunto. A cadeira embaixo da mesa vem com
   *  giro 2 (olhando para cima, para a mesa). Peça que não existir no catálogo
   *  fica de fora sem quebrar o conjunto (ver `_conjuntos`). */
  CONJUNTOS: [
    { id: 'padrao', nome: 'Escritório padrão', pecas: [
      ['mesa_grande', 0, 0], ['monitor', 1, 0], ['teclado', 1, 1], ['mouse', 2, 1],
      ['cadeira', 1, 2, 2], ['planta', 4, 1]] },
    { id: 'executivo', nome: 'Escritório executivo', pecas: [
      ['cadeira_visita', 1, 0], ['cadeira_visita', 4, 0],
      ['mesa_ampla', 0, 1], ['monitor', 2, 1], ['notebook', 4, 2],
      ['cadeira_executiva', 2, 3, 2]] },
    { id: 'gamer', nome: 'Escritório gamer', pecas: [
      ['mesa_gamer', 0, 0], ['monitor_gamer', 2, 0], ['fone_mesa', 4, 0],
      ['teclado_gamer', 2, 1], ['mouse_gamer', 3, 1], ['cadeira_gamer', 2, 2, 2]] },
    { id: 'reuniao', nome: 'Sala de reunião', pecas: [
      ['tv', 2, 0], ['planta', 6, 2],
      ['cadeira', 1, 1], ['cadeira', 3, 1], ['cadeira', 5, 1],
      ['mesa_reuniao', 0, 2],
      ['cadeira', 1, 4, 2], ['cadeira', 3, 4, 2], ['cadeira', 5, 4, 2]] },
    { id: 'lounge', nome: 'Lounge', pecas: [
      ['tapete', 0, 1], ['sofa', 0, 0], ['mesa_centro', 0, 1], ['poltrona', 3, 1, 1],
      ['planta', 3, 0]] },
    { id: 'copa', nome: 'Copa', pecas: [
      ['geladeira', 0, 0], ['balcao', 1, 1], ['cafeteira', 1, 1], ['microondas', 3, 1]] },
  ],

  /* ---------- o painel ---------- */

  montarArsenal(alvo) {
    const est = this.arsenal;
    const caixa = document.createElement('div');
    caixa.className = 'arsenal';
    caixa.innerHTML = `
      <div class="arsenal-topo">
        <div class="arsenal-busca">
          <input id="arsenal-busca" type="text" role="searchbox" maxlength="40" autocomplete="off"
                 spellcheck="false" placeholder="Buscar móveis e objetos…">
          <button type="button" class="limpar" title="Limpar busca" hidden>✕</button>
          <button id="editor-girar" type="button" class="girar"
                  title="Girar 90° o próximo móvel (tecla G)">↻</button>
        </div>
        <div class="arsenal-cats" id="arsenal-cats"></div>
      </div>
      <div class="arsenal-corpo" id="arsenal-corpo"></div>`;
    alvo.appendChild(caixa);

    const busca = caixa.querySelector('#arsenal-busca');
    const limpar = caixa.querySelector('.limpar');
    const fita = caixa.querySelector('#arsenal-cats');
    busca.value = est.busca;
    limpar.hidden = !est.busca;
    busca.oninput = () => {
      est.busca = busca.value;
      limpar.hidden = !busca.value;
      // busca é do catálogo inteiro: começar a digitar sai da categoria
      if (busca.value && est.categoria !== 'todos') {
        est.categoria = 'todos';
        this._renderizarCategorias();
      }
      this._renderizarGrade();
    };
    limpar.onclick = () => {
      busca.value = '';
      est.busca = '';
      limpar.hidden = true;
      this._renderizarGrade();
      busca.focus();
    };
    const girar = caixa.querySelector('#editor-girar');
    girar.onclick = () => this.girar();
    girar.setAttribute('aria-pressed', this.giro !== 0);
    // a roda do mouse rola a fita de categorias para o lado
    fita.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        fita.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    }, { passive: false });

    this._renderizarCategorias();
    this._renderizarGrade();
  },

  /** [id, rótulo, quantas] — as fixas primeiro, depois as categorias do catálogo. */
  _categorias() {
    const cat = this.jogo.mapa.catalogo;
    const grupos = new Map();
    for (const info of Object.values(cat)) grupos.set(info.grupo, (grupos.get(info.grupo) || 0) + 1);
    return [
      ['todos', 'Todos', Object.keys(cat).length],
      ['favoritos', '♥ Favoritos', this._favoritos().filter((t) => cat[t]).length],
      ['recentes', '🕘 Recentes', this._recentes().filter((t) => cat[t]).length],
      ['conjuntos', '✨ Conjuntos', this._conjuntos().length],
      ...[...grupos].map(([g, n]) => ['g:' + g, g, n]),
    ];
  },

  _renderizarCategorias() {
    const fita = document.getElementById('arsenal-cats');
    if (!fita) return;
    fita.innerHTML = '';
    for (const [id, nome, n] of this._categorias()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.cat = id;
      // nome de categoria pode vir de peça do estúdio, escrita por gente:
      // sem escapar, um `<img onerror=...>` no nome roda no navegador de quem abre o editor
      b.innerHTML = `${this._esc(nome)} <small>${n}</small>`;
      b.setAttribute('aria-pressed', id === this.arsenal.categoria);
      b.onclick = () => {
        this.arsenal.categoria = id;
        fita.querySelectorAll('button').forEach((o) => o.setAttribute('aria-pressed', o === b));
        this._mostrarChip(fita, b);
        this._renderizarGrade();
        const rolagem = document.getElementById('editor-conteudo');
        if (rolagem) rolagem.scrollTop = 0;
      };
      fita.appendChild(b);
    }
    const ativo = fita.querySelector('[aria-pressed="true"]');
    if (ativo) this._mostrarChip(fita, ativo);
  },

  /** Rola a fita até o chip ficar à vista. Não usa scrollIntoView de propósito:
   *  ele rolaria também o palco (overflow hidden) e o mapa pularia. */
  _mostrarChip(fita, chip) {
    const alvo = chip.offsetLeft - fita.clientWidth / 2 + chip.offsetWidth / 2;
    fita.scrollLeft = Math.max(0, alvo);
  },

  /** Só as contagens dos chips (favoritar ou usar uma peça não redesenha a grade). */
  _atualizarContagens() {
    const fita = document.getElementById('arsenal-cats');
    if (!fita) return;
    for (const [id, , n] of this._categorias()) {
      const chip = fita.querySelector(`[data-cat="${CSS.escape(id)}"] small`);
      if (chip) chip.textContent = n;
    }
  },

  _pararObservador() {
    if (this._observador) { this._observador.disconnect(); this._observador = null; }
  },

  _renderizarGrade() {
    const corpo = document.getElementById('arsenal-corpo');
    if (!corpo) return;
    this._pararObservador();
    corpo.innerHTML = '';
    const cat = this.jogo.mapa.catalogo;
    const est = this.arsenal;
    const q = this._normalizar(est.busca).trim();

    // conjuntos aparecem na categoria deles e quando a busca bate no nome/peças
    const conjuntos = this._conjuntos().filter((c) =>
      est.categoria === 'conjuntos' || (q && this._bate(this._textoConjunto(c), q)));
    const pecas = this._pecasFiltradas(q);

    if (!conjuntos.length && !pecas.length) {
      const p = document.createElement('p');
      p.className = 'arsenal-vazio';
      p.textContent = q
        ? `Nada com “${est.busca.trim()}”. Tente por cor (azul), material (madeira) ou uso (copa, gamer, reunião).`
        : est.categoria === 'favoritos'
          ? 'Nenhum favorito ainda. Passe o mouse numa peça e clique no ♡.'
          : est.categoria === 'recentes'
            ? 'Nada usado ainda. As últimas 10 peças escolhidas aparecem aqui.'
            : 'Nada por aqui.';
      corpo.appendChild(p);
      return;
    }

    if (conjuntos.length) {
      if (pecas.length) corpo.appendChild(this._titulo('Conjuntos'));
      corpo.appendChild(this._blocoConjuntos(conjuntos));
      if (pecas.length) corpo.appendChild(this._titulo('Peças'));
    }
    if (!pecas.length) return;

    const favoritos = new Set(this._favoritos());
    const grade = document.createElement('div');
    grade.className = 'arsenal-grade';
    for (const [tipo, info] of pecas) grade.appendChild(this._celula(tipo, info, favoritos));
    corpo.appendChild(grade);

    // São 150 canvas: a miniatura só é desenhada quando a peça entra na tela.
    // Sem IntersectionObserver (navegador velho), desenha tudo de uma vez.
    const imgs = grade.querySelectorAll('img[data-tipo]');
    const pintar = (img) => {
      img.src = Objetos.miniatura(img.dataset.tipo, +img.dataset.l, +img.dataset.a, 44);
      delete img.dataset.tipo;
    };
    if (!('IntersectionObserver' in window)) { imgs.forEach(pintar); return; }
    this._observador = new IntersectionObserver((entradas) => {
      for (const en of entradas) {
        if (!en.isIntersecting) continue;
        pintar(en.target);
        this._observador.unobserve(en.target);
      }
    }, { root: document.getElementById('editor-conteudo'), rootMargin: '200px 0px' });
    imgs.forEach((img) => this._observador.observe(img));
  },

  /* ==================== estúdio: subir imagem e criar peça ==================== */

  /** Formulário de criação. Vive dentro do editor, só aparece para admin, e
   *  fala com as rotas /estudio/* — não passa pelo WebSocket porque arquivo
   *  grande em socket de jogo é receita de travar a sala inteira. */
  painelEstudio() {
    const alvo = document.getElementById('editor-conteudo');
    alvo.innerHTML = '';
    const cx = document.createElement('div');
    cx.className = 'estudio';
    cx.innerHTML = `
      <div class="abas-estudio">
        <button type="button" data-aba="movel" aria-pressed="true">Móvel e objeto</button>
        <button type="button" data-aba="roupa" aria-pressed="false">Roupa do boneco</button>
      </div>

      <form id="form-movel" class="form-estudio">
        <label>Imagem da peça
          <input type="file" id="movel-arquivo" accept="image/png,image/webp,image/jpeg,image/gif" required>
        </label>
        <label>Nome <input id="movel-nome" maxlength="40" placeholder="Ex.: Poltrona do chefe" required></label>
        <label>Categoria
          <input id="movel-grupo" list="grupos-existentes" maxlength="24" value="Decoração">
          <datalist id="grupos-existentes"></datalist>
        </label>
        <div class="linha">
          <label>Largura <input id="movel-l" type="number" min="1" max="12" value="1"></label>
          <label>Altura <input id="movel-a" type="number" min="1" max="12" value="1"></label>
        </div>
        <label class="marca"><input type="checkbox" id="movel-bloqueia" checked> Bloqueia a passagem</label>
        <label>Onde fica
          <select id="movel-camada">
            <option value="chao">No chão (móvel)</option>
            <option value="mesa">Em cima da mesa</option>
            <option value="piso">Rente ao piso (tapete)</option>
          </select>
        </label>
        <button type="submit" class="ok">Criar peça</button>
        <p class="dica">A imagem é encaixada no espaço que a peça ocupa. Fundo transparente
          fica muito melhor: PNG ou WebP com transparência.</p>
      </form>

      <form id="form-roupa" class="form-estudio" hidden>
        <label>Folha andando (PNG 576x256)
          <input type="file" id="roupa-andando" accept="image/png" required>
        </label>
        <label>Folha sentado (PNG 192x256, opcional)
          <input type="file" id="roupa-sentado" accept="image/png">
        </label>
        <label>Nome <input id="roupa-nome" maxlength="28" placeholder="Ex.: Camisa da empresa" required></label>
        <label>Onde entra
          <select id="roupa-grupo">
            <option value="camisaTipo">Roupa de cima</option>
            <option value="calcaTipo">Roupa de baixo</option>
            <option value="sapatoTipo">Calçado</option>
            <option value="chapeuTipo">Cabeça</option>
          </select>
        </label>
        <button type="submit" class="ok">Criar roupa</button>
        <p class="dica">Tem de ser a folha do acervo LPC: 9 quadros por 4 direções, de 64
          pixels. Sem a folha de sentado, a peça usa a pose parada quando a pessoa senta.</p>
      </form>

      <p id="estudio-aviso" class="aviso-estudio"></p>
      <div id="estudio-lista"></div>`;
    alvo.appendChild(cx);

    const grupos = new Set(Object.values(this.jogo.mapa.catalogo).map((i) => i.grupo));
    cx.querySelector('#grupos-existentes').innerHTML =
      [...grupos].sort().map((g) => `<option value="${g}">`).join('');

    for (const b of cx.querySelectorAll('.abas-estudio button')) {
      b.onclick = () => {
        for (const o of cx.querySelectorAll('.abas-estudio button')) {
          o.setAttribute('aria-pressed', o === b);
        }
        cx.querySelector('#form-movel').hidden = b.dataset.aba !== 'movel';
        cx.querySelector('#form-roupa').hidden = b.dataset.aba !== 'roupa';
      };
    }
    cx.querySelector('#form-movel').onsubmit = (e) => { e.preventDefault(); this._enviarPeca(); };
    cx.querySelector('#form-roupa').onsubmit = (e) => { e.preventDefault(); this._enviarRoupa(); };
    this._listarEstudio();
  },

  _avisoEstudio(texto, ruim) {
    const p = document.getElementById('estudio-aviso');
    if (!p) return;
    p.textContent = texto || '';
    p.classList.toggle('ruim', !!ruim);
  },

  async _enviarPeca() {
    const arq = document.getElementById('movel-arquivo').files[0];
    if (!arq) return this._avisoEstudio('Escolha a imagem.', true);
    const dados = new FormData();
    dados.append('token', localStorage.getItem('escritorio:token') || '');
    dados.append('imagem', arq);
    dados.append('nome', document.getElementById('movel-nome').value);
    dados.append('grupo', document.getElementById('movel-grupo').value);
    dados.append('largura', document.getElementById('movel-l').value);
    dados.append('altura', document.getElementById('movel-a').value);
    dados.append('bloqueia', document.getElementById('movel-bloqueia').checked ? '1' : '0');
    dados.append('camada', document.getElementById('movel-camada').value);
    this._avisoEstudio('Subindo…');
    try {
      const r = await (await fetch('/estudio/peca', { method: 'POST', body: dados })).json();
      if (r.erro) return this._avisoEstudio(r.erro, true);
      this._avisoEstudio(`"${r.peca.nome}" entrou no arsenal, em ${r.peca.grupo}.`);
      document.getElementById('form-movel').reset();
      this._indiceCache = null;
      this._listarEstudio();
    } catch (e) {
      this._avisoEstudio('Não consegui falar com o servidor.', true);
    }
  },

  async _enviarRoupa() {
    const andando = document.getElementById('roupa-andando').files[0];
    if (!andando) return this._avisoEstudio('Escolha a folha andando.', true);
    const dados = new FormData();
    dados.append('token', localStorage.getItem('escritorio:token') || '');
    dados.append('andando', andando);
    const sentado = document.getElementById('roupa-sentado').files[0];
    if (sentado) dados.append('sentado', sentado);
    dados.append('nome', document.getElementById('roupa-nome').value);
    dados.append('grupo', document.getElementById('roupa-grupo').value);
    this._avisoEstudio('Subindo…');
    try {
      const r = await (await fetch('/estudio/roupa', { method: 'POST', body: dados })).json();
      if (r.erro) return this._avisoEstudio(r.erro, true);
      this._avisoEstudio(`"${r.roupa.nome}" entrou. Recarregue a página para vestir.`);
      document.getElementById('form-roupa').reset();
      this._listarEstudio();
    } catch (e) {
      this._avisoEstudio('Não consegui falar com o servidor.', true);
    }
  },

  async _listarEstudio() {
    const lista = document.getElementById('estudio-lista');
    if (!lista) return;
    const token = encodeURIComponent(localStorage.getItem('escritorio:token') || '');
    let d = {};
    try { d = await (await fetch('/estudio/pecas?token=' + token)).json(); } catch (e) { return; }
    if (d.erro) { lista.innerHTML = ''; return; }
    const itens = [...Object.entries(d.pecas || {}).map(([id, p]) => ({ id, ...p, roupa: 0 })),
                   ...Object.entries(d.roupas || {}).map(([id, p]) => ({ id, ...p, roupa: 1 }))];
    if (!itens.length) { lista.innerHTML = '<p class="dica">Nada criado ainda.</p>'; return; }
    lista.innerHTML = '<div class="titulo-estudio">Criadas por você</div>';
    for (const it of itens) {
      const li = document.createElement('div');
      li.className = 'item-estudio';
      li.innerHTML = `${it.imagem ? `<img src="${it.imagem}" alt="">` : '<span class="sem-foto">👕</span>'}
        <span><b>${this._esc(it.nome)}</b><small>${it.roupa ? 'roupa' : `${it.l}×${it.a} · ${this._esc(it.grupo)}`}</small></span>`;
      const bt = document.createElement('button');
      bt.type = 'button'; bt.textContent = '🗑️'; bt.title = 'Apagar';
      bt.onclick = async () => {
        if (!confirm(`Apagar "${it.nome}"? Some do arsenal e do escritório.`)) return;
        await fetch('/estudio/remover', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: localStorage.getItem('escritorio:token') || '',
                                 id: it.id, roupa: it.roupa }),
        });
        this._indiceCache = null;
        this._listarEstudio();
      };
      li.appendChild(bt);
      lista.appendChild(li);
    }
  },

  _titulo(texto) {
    const t = document.createElement('div');
    t.className = 'secao';
    t.textContent = texto;
    return t;
  },

  /** As peças da categoria atual, já passadas pela busca. */
  _pecasFiltradas(q) {
    const cat = this.jogo.mapa.catalogo;
    const est = this.arsenal;
    let lista;
    if (est.categoria === 'favoritos') {
      lista = this._favoritos().filter((t) => cat[t]).map((t) => [t, cat[t]]);
    } else if (est.categoria === 'recentes') {
      lista = this._recentes().filter((t) => cat[t]).map((t) => [t, cat[t]]);
    } else if (est.categoria === 'conjuntos') {
      lista = [];
    } else if (est.categoria.startsWith('g:')) {
      lista = Object.entries(cat).filter(([, i]) => 'g:' + i.grupo === est.categoria);
    } else {
      lista = Object.entries(cat);
    }
    if (!q) return lista;
    const indice = this._indice();
    return lista.filter(([tipo]) => this._bate(indice.get(tipo), q));
  },

  _celula(tipo, info, favoritos) {
    const el = document.createElement('div');
    el.className = 'peca';
    el.dataset.tipo = tipo;
    const fav = favoritos.has(tipo);
    el.innerHTML = `
      <button type="button" class="escolher" title="${this._esc(info.nome)} (${info.l}×${info.a}) · ${this._esc(info.grupo)}"
              aria-pressed="${tipo === this.tipoSel}">
        <img alt="" width="44" height="44" data-tipo="${tipo}" data-l="${info.l}" data-a="${info.a}">
        <span class="nome">${this._esc(info.nome)}</span>
      </button>
      <button type="button" class="coracao${fav ? ' ligado' : ''}" aria-pressed="${fav}"
              title="${fav ? 'Tirar dos favoritos' : 'Favoritar'}">${fav ? '♥' : '♡'}</button>`;
    el.querySelector('.escolher').onclick = () => this.escolherPeca(tipo);
    el.querySelector('.coracao').onclick = (e) => {
      e.stopPropagation();
      const ligado = this.alternarFavorito(tipo);
      // a mesma peça pode estar na tela mais de uma vez: acerta todos os corações
      document.querySelectorAll(`#editor .peca[data-tipo="${CSS.escape(tipo)}"] .coracao`).forEach((b) => {
        b.classList.toggle('ligado', ligado);
        b.textContent = ligado ? '♥' : '♡';
        b.setAttribute('aria-pressed', ligado);
        b.title = ligado ? 'Tirar dos favoritos' : 'Favoritar';
      });
      this._atualizarContagens();
      if (this.arsenal.categoria === 'favoritos' && !ligado) this._renderizarGrade();
    };
    return el;
  },

  /** Peça escolhida na grade: vira a próxima a ser colocada e entra nos recentes. */
  escolherPeca(tipo) {
    // O foco ficava na busca, então "G gira antes" digitava um g na busca e a
    // grade zerava — parecia que o arsenal tinha quebrado.
    const busca = document.getElementById('arsenal-busca');
    if (busca && document.activeElement === busca) busca.blur();
    this.tipoSel = tipo;
    this.conjunto = null;
    this._registrarRecente(tipo);
    document.querySelectorAll('#editor .peca .escolher').forEach((b) => {
      b.setAttribute('aria-pressed', b.parentElement.dataset.tipo === tipo);
    });
    document.querySelectorAll('#editor .conjunto').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    this._atualizarContagens();
    this._avisarGiro();
  },

  /* ---------- busca ---------- */

  /** Sem acento e sem maiúscula: “Reunião” e “reuniao” são a mesma coisa. */
  _normalizar(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  },

  /** Todas as palavras da busca têm de aparecer no texto da peça. */
  _bate(texto, q) {
    return q.split(/\s+/).filter(Boolean).every((p) => texto.includes(p));
  },

  /** tipo → texto onde a busca procura (nome, categoria, id e etiquetas). */
  _indice() {
    const cat = this.jogo.mapa.catalogo;
    if (this._indiceCache && this._indiceCache.cat === cat) return this._indiceCache.mapa;
    const partes = new Map();
    for (const [tipo, info] of Object.entries(cat)) {
      partes.set(tipo, [info.nome, info.grupo, tipo.replace(/_/g, ' '),
                        ...(this.TAGS_GRUPO[this._normalizar(info.grupo)] || [])]);
    }
    for (const [tag, valor] of Object.entries(this.TAGS)) {
      const ids = typeof valor === 'string' ? this.TAGS[valor] : valor;
      for (const id of ids || []) if (partes.has(id)) partes.get(id).push(tag);
    }
    const mapa = new Map();
    for (const [tipo, lista] of partes) mapa.set(tipo, this._normalizar(lista.join(' ')));
    this._indiceCache = { cat, mapa };
    return mapa;
  },

  _textoConjunto(c) {
    const cat = this.jogo.mapa.catalogo;
    return this._normalizar([c.nome, 'conjunto', ...c.pecas.map((p) => cat[p.tipo].nome)].join(' '));
  },

  /* ---------- favoritos e recentes (gosto da pessoa: localStorage) ---------- */

  _ler(chave) {
    try {
      const v = JSON.parse(localStorage.getItem(chave));
      return Array.isArray(v) ? v.filter((t) => typeof t === 'string') : [];
    } catch (e) { return []; }
  },

  _gravar(chave, lista) {
    try { localStorage.setItem(chave, JSON.stringify(lista)); }
    catch (e) { /* janela anônima ou cota cheia: vale só até fechar a aba */ }
  },

  _favoritos() { return this._ler(this.CHAVE_FAVORITOS); },
  _recentes() { return this._ler(this.CHAVE_RECENTES); },

  /** Liga/desliga o favorito. Devolve true se ficou favorito. */
  alternarFavorito(tipo) {
    const lista = this._favoritos();
    const i = lista.indexOf(tipo);
    if (i >= 0) lista.splice(i, 1); else lista.unshift(tipo);
    this._gravar(this.CHAVE_FAVORITOS, lista);
    return i < 0;
  },

  _registrarRecente(tipo) {
    const lista = this._recentes().filter((t) => t !== tipo);
    lista.unshift(tipo);
    this._gravar(this.CHAVE_RECENTES, lista.slice(0, this.MAX_RECENTES));
  },

  /* ---------- conjuntos ---------- */

  /** Os conjuntos conferidos contra o catálogo que está em memória: peça que
   *  não existe sai, e a pegada (l × a) é medida do que sobrou. */
  _conjuntos() {
    const cat = this.jogo.mapa.catalogo;
    if (this._conjuntosCache && this._conjuntosCache.cat === cat) return this._conjuntosCache.lista;
    const lista = [];
    for (const c of this.CONJUNTOS) {
      const pecas = c.pecas.filter(([tipo]) => cat[tipo])
        .map(([tipo, dx, dy, g]) => ({ tipo, dx, dy, g: g | 0 }));
      if (pecas.length) lista.push(this._medirConjunto({ id: c.id, nome: c.nome, pecas }));
    }
    this._conjuntosCache = { cat, lista };
    return lista;
  },

  /** Recalcula a pegada e encosta o conjunto no canto (0,0). */
  _medirConjunto(c) {
    const cat = this.jogo.mapa.catalogo;
    let x0 = Infinity, y0 = Infinity, x1 = 0, y1 = 0;
    for (const p of c.pecas) {
      const m = Objetos.medida(p.tipo, cat[p.tipo], p.g);
      x0 = Math.min(x0, p.dx); y0 = Math.min(y0, p.dy);
      x1 = Math.max(x1, p.dx + m.l); y1 = Math.max(y1, p.dy + m.a);
    }
    for (const p of c.pecas) { p.dx -= x0; p.dy -= y0; }
    c.l = x1 - x0;
    c.a = y1 - y0;
    return c;
  },

  /** Ordem de desenho E de envio: tapete, depois o que fica no chão (mesa
   *  antes do que se apoia nela, mais em cima antes do mais embaixo), depois o
   *  que fica em cima da mesa. É a mesma regra do jogo, para a prévia bater. */
  _ordemDeDesenho(pecas) {
    const cat = this.jogo.mapa.catalogo;
    const camada = { piso: 0, chao: 1, mesa: 2 };
    const superficie = new Set(['Mesas', 'Mesas de Reunião', 'Mesas de Centro']);
    return [...pecas].sort((a, b) => {
      const ia = cat[a.tipo], ib = cat[b.tipo];
      const ca = camada[ia.camada] || 0, cb = camada[ib.camada] || 0;
      if (ca !== cb) return ca - cb;
      const ba = a.dy + Objetos.medida(a.tipo, ia, a.g).a;
      const bb = b.dy + Objetos.medida(b.tipo, ib, b.g).a;
      if (ba !== bb) return ba - bb;
      return (superficie.has(ia.grupo) ? 0 : 1) - (superficie.has(ib.grupo) ? 0 : 1);
    });
  },

  _blocoConjuntos(lista) {
    const cat = this.jogo.mapa.catalogo;
    const bloco = document.createElement('div');
    bloco.className = 'arsenal-conjuntos';
    for (const c of lista) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'conjunto';
      b.dataset.conjunto = c.id;
      b.title = c.pecas.map((p) => cat[p.tipo].nome).join(', ');
      b.setAttribute('aria-pressed', !!(this.conjunto && this.conjunto.id === c.id));
      b.innerHTML = `<img alt="" width="96" height="60" src="${this._miniaturaConjunto(c, 96, 60)}">
        <b>${c.nome}</b><small>${c.pecas.length} peças · ${c.l}×${c.a}</small>`;
      b.onclick = () => this.pegarConjunto(c);
      bloco.appendChild(b);
    }
    return bloco;
  },

  /** O conjunto inteiro desenhado num canvas pequeno, como a miniatura de uma peça. */
  _miniaturaConjunto(c, largura, altura) {
    const chave = c.id + ':' + largura + 'x' + altura + ':' + c.pecas.map((p) => p.tipo + p.g).join(',');
    if (this._miniConjuntos.has(chave)) return this._miniConjuntos.get(chave);
    const cat = this.jogo.mapa.catalogo;
    const cv = document.createElement('canvas');
    cv.width = largura;
    cv.height = altura;
    const cx = cv.getContext('2d');
    const escala = Math.min(largura / (c.l * 32), altura / (c.a * 32)) * 0.9;
    cx.translate((largura - c.l * 32 * escala) / 2, (altura - c.a * 32 * escala) / 2);
    cx.scale(escala, escala);
    for (const p of this._ordemDeDesenho(c.pecas)) {
      const m = Objetos.medida(p.tipo, cat[p.tipo], p.g);
      Objetos.desenhar(cx, p.tipo, p.dx * 32, p.dy * 32, m.l * 32, m.a * 32, p.g);
    }
    const url = cv.toDataURL();
    this._miniConjuntos.set(chave, url);
    return url;
  },

  /** Pega o conjunto para a mão. É uma cópia: girar mexe nas peças, e o cartão
   *  da lista precisa continuar como era. */
  pegarConjunto(c) {
    this.conjunto = { id: c.id, nome: c.nome, l: c.l, a: c.a, pecas: c.pecas.map((p) => ({ ...p })) };
    this.movendo = null;
    this.fecharMenu();
    document.querySelectorAll('#editor .conjunto').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.conjunto === c.id);
    });
    document.querySelectorAll('#editor .peca .escolher').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    const ajuda = document.getElementById('editor-ajuda');
    if (ajuda) {
      ajuda.textContent = `“${c.nome}” na mão (${c.pecas.length} peças, ${c.l}×${c.a}). `
        + 'Clique no mapa para colocar; G gira o conjunto inteiro; Esc solta.';
    }
  },

  /** Esc: larga o conjunto sem colocar. */
  cancelarMao() {
    if (!this.conjunto) return;
    this.conjunto = null;
    document.querySelectorAll('#editor .conjunto').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    this._avisarGiro();
  },

  /** Gira o conjunto na mão 90° no sentido horário: cada peça gira e troca de
   *  lugar como se o conjunto inteiro fosse uma peça só. Uma peça em
   *  (x, y) com h de altura vai para (A − y − h, x), sendo A a altura do conjunto. */
  girarConjunto() {
    const c = this.conjunto;
    const cat = this.jogo.mapa.catalogo;
    for (const p of c.pecas) {
      const m = Objetos.medida(p.tipo, cat[p.tipo], p.g);
      const dx = c.a - p.dy - m.a, dy = p.dx;
      p.dx = dx;
      p.dy = dy;
      p.g = (p.g + 1) % 4;
    }
    this._medirConjunto(c);
  },

  _cabeConjunto(t) {
    const c = this.conjunto, m = this.jogo.mapa;
    return !!c && t.x >= 0 && t.y >= 0 && t.x + c.l <= m.largura && t.y + c.a <= m.altura;
  },

  /** Solta o conjunto no tile: uma ação por peça, e cada uma vira um móvel
   *  comum do mapa — dá para mover, girar, trocar ou remover depois. */
  soltarConjunto(t) {
    const c = this.conjunto;
    const ajuda = document.getElementById('editor-ajuda');
    if (!this._cabeConjunto(t)) {
      if (ajuda) {
        ajuda.textContent = `“${c.nome}” tem ${c.l}×${c.a} e não cabe aí: `
          + 'chegue mais para dentro do mapa (Esc solta).';
      }
      return;
    }
    for (const p of this._ordemDeDesenho(c.pecas)) {
      this.acao({ acao: 'objeto', tipo: p.tipo, x: t.x + p.dx, y: t.y + p.dy, g: p.g });
    }
    this.conjunto = null;
    document.querySelectorAll('#editor .conjunto').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    if (ajuda) {
      ajuda.textContent = `“${c.nome}” colocado: ${c.pecas.length} peças, cada uma é um móvel normal. `
        + 'Clique numa para mover, girar, duplicar ou remover.';
    }
  },

  /** Prévia do conjunto embaixo do cursor: as peças meio transparentes e a
   *  pegada inteira tracejada — vermelha quando não cabe no mapa. */
  desenharConjunto(ctx) {
    const c = this.conjunto;
    const t = this.jogo.tile;
    const cat = this.jogo.mapa.catalogo;
    const cabe = this._cabeConjunto(this.cursor);
    ctx.globalAlpha = 0.5;
    for (const p of this._ordemDeDesenho(c.pecas)) {
      const m = Objetos.medida(p.tipo, cat[p.tipo], p.g);
      Objetos.desenhar(ctx, p.tipo, (this.cursor.x + p.dx) * t, (this.cursor.y + p.dy) * t,
                       m.l * t, m.a * t, p.g);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = cabe ? '#38bdf8' : '#f43f5e';
    ctx.setLineDash([8, 5]);
    ctx.lineWidth = 2;
    ctx.strokeRect(this.cursor.x * t, this.cursor.y * t, c.l * t, c.a * t);
    ctx.setLineDash([]);
  },

  /* ---------- duplicar ---------- */

  /** Duplica o móvel: a cópia nasce ao lado (direita, baixo, esquerda, cima —
   *  o primeiro lugar vago da mesma camada) e já fica selecionada, então
   *  ⌘/Ctrl+D de novo vai enfileirando cópias. */
  duplicar(id) {
    const mapa = this.jogo.mapa;
    const o = mapa.objetos.find((x) => x.id === id);
    if (!o) return;
    const info = mapa.catalogo[o.tipo];
    const m = Objetos.medida(o.tipo, info, o.g);
    const cabe = (x, y) => x >= 0 && y >= 0 && x + m.l <= mapa.largura && y + m.a <= mapa.altura;
    const lugares = [[o.x + m.l, o.y], [o.x, o.y + m.a], [o.x - m.l, o.y], [o.x, o.y - m.a]]
      .filter(([x, y]) => cabe(x, y));
    if (!lugares.length) return;
    const vago = lugares.find(([x, y]) => !this._ocupado(x, y, m.l, m.a, info.camada));
    const [x, y] = vago || lugares[0];
    this._novo = { antes: mapa.objetos.length, quando: Date.now() };
    this.acao({ acao: 'objeto', tipo: o.tipo, x, y, g: o.g | 0 });
    this.fecharMenu();
    const ajuda = document.getElementById('editor-ajuda');
    if (ajuda) ajuda.textContent = `${info.nome} duplicado ao lado. ⌘/Ctrl+D faz outra cópia; Delete apaga.`;
  },

  /** Já tem móvel da mesma camada nesse retângulo? */
  _ocupado(x, y, l, a, camada) {
    const cat = this.jogo.mapa.catalogo;
    return this.jogo.mapa.objetos.some((o) => {
      const i = cat[o.tipo];
      if (!i || i.camada !== camada) return false;
      const m = Objetos.medida(o.tipo, i, o.g);
      return o.x < x + l && o.x + m.l > x && o.y < y + a && o.y + m.a > y;
    });
  },
};

/* Atalhos do arsenal. Vai na fase de captura para passar ANTES do teclado do
 * jogo (app.js): lá, D é “andar para a direita”; aqui, ⌘/Ctrl+D é duplicar e
 * o evento morre para o boneco não sair andando. Esc só cuida do conjunto —
 * o móvel na mão e o menu o app.js já fecha. */
document.addEventListener('keydown', (e) => {
  const campo = document.activeElement;
  const digitando = campo && ['INPUT', 'TEXTAREA', 'SELECT'].includes(campo.tagName)
    && campo.offsetParent !== null;
  if (e.key === 'Escape') {
    if (!digitando) Editor.cancelarMao();
    return;
  }
  if (digitando) return;
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') {
    if (!Editor.selecionado || !(Editor.ativo || Editor.menu)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    Editor.duplicar(Editor.selecionado.id);
  }
}, true);
