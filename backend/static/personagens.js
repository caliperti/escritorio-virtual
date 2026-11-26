/* Personagens 3D (26/11): bonecos no estilo da referência, gerados por IA a
 * partir da foto da pessoa e preparados por referencia-codara/personagens/
 * processar.py. Cada um é uma folha 4x3: colunas de frente, de costas, para a
 * esquerda, para a direita; linhas parado, andando, sentado.
 *
 * Entra como mais um item da aparência (`personagem`), então a escolha vai e
 * volta pelo mesmo caminho de sempre (perfil, conta, localStorage). Quem não
 * escolheu nenhum ('nenhum') continua com o boneco de pixel do LPC.
 * A lista vem de assets/personagens/lista.js, carregada antes deste arquivo.  */

const Personagens = {
  dados: window.PERSONAGENS || { personagens: [], celula: [220, 300], base: 288 },
  folhas: new Map(),
  COLUNA: { baixo: 0, cima: 1, esquerda: 2, direita: 3 },
  ALTURA_EM_PE: 262,                 // a pose parada de frente, em px da folha
  // Sentado, os pés ficam um pouco à frente do centro da pessoa (o assento):
  // é o que põe o quadril em cima da cadeira, e não o corpo em pé sobre ela.
  SENTADO: { baixo: 22, cima: -2, esquerda: 22, direita: 22 },   // de costas: cabeça e ombros acima do encosto

  info(id) {
    return this.dados.personagens.find((p) => p.id === id) || null;
  },

  /** Os que esta pessoa pode escolher: o próprio (vinculado à conta pelo nome)
   *  e os livres. O servidor confere de novo (personagens.py). */
  permitidos(nome, visitante) {
    const chave = (s) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().trim().replace(/\s+/g, ' ');
    const eu = chave(nome);
    return this.dados.personagens.filter((p) => !p.dono || (!visitante && chave(p.dono) === eu))
      .map((p) => p.id);
  },

  /** O personagem desta aparência. Sem escolha válida, o genérico: a mulher
   *  para quem tinha corpo feminino no boneco antigo, o homem para o resto. */
  de(aparencia) {
    const id = aparencia && aparencia.personagem;
    return (id && this.info(id)) || this.padrao(aparencia);
  },

  padrao(aparencia) {
    const livres = this.dados.personagens.filter((p) => !p.dono);
    const mulher = livres.find((p) => p.id === 'mulher');
    if (mulher && aparencia && aparencia.corpo === 'f') return mulher;
    return livres.find((p) => p.id === 'barbudo') || livres[0] || null;
  },

  folha(id) {
    if (!this.folhas.has(id)) {
      const img = new Image();
      img.decoding = 'async';
      img.src = '/static/assets/personagens/' + id + '.png?v=' + ((this.info(id) || {}).v || 1);
      this.folhas.set(id, img);
    }
    const img = this.folhas.get(id);
    return img.complete && img.naturalWidth ? img : null;
  },

  retrato(id) {
    return '/static/assets/personagens/' + id + '-retrato.png?v=' + ((this.info(id) || {}).v || 1);
  },

  _medidas(escala, sentado, direcao, y) {
    const [L, A] = this.dados.celula;
    const f = (escala * 23.5) / this.ALTURA_EM_PE;      // um pouco maior que o de pixel, como na referência
    const pes = y + 13 + (sentado ? (this.SENTADO[direcao] || 20) : 0);
    return { L, A, f, pes };
  },

  /** Desenha; devolve false se a folha ainda não carregou (aí vai o de pixel). */
  desenhar(ctx, id, x, y, direcao, quadro, escala, sentado) {
    const img = this.folha(id);
    if (!img) return false;
    const col = this.COLUNA[direcao] === undefined ? 0 : this.COLUNA[direcao];
    // andando, alterna parado e passo (a folha tem uma pose de passo por lado)
    const lin = sentado ? 2 : (quadro > 0 && Math.floor(quadro / 2) % 2 ? 1 : 0);
    const { L, A, f, pes } = this._medidas(escala, sentado, direcao, y);
    const base = this.dados.base;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, col * L, lin * A, L, A,
                  x - (L * f) / 2, pes - base * f - (lin === 1 ? 1.5 : 0), L * f, A * f);
    ctx.restore();
    return true;
  },

  /** Onde fica o alto da cabeça (para o crachá com o nome ficar logo acima). */
  topo(aparencia, x, y, escala, sentado, direcao) {
    const p = this.de(aparencia);
    if (!p) return null;
    const col = this.COLUNA[direcao] === undefined ? 0 : this.COLUNA[direcao];
    const lin = sentado ? 2 : 0;
    const { f, pes } = this._medidas(escala, sentado, direcao, y);
    const topo = (p.topos && p.topos[lin + ',' + col]) || 20;
    return pes - (this.dados.base - topo) * f;
  },
};

/* ---------- ligando no boneco de sempre ---------- */
(function () {
  const ids = Personagens.dados.personagens.map((p) => p.id);
  Boneco.CATALOGO.personagem = [...ids];
  Boneco.ROTULOS.personagem = 'Personagem 3D';
  for (const p of Personagens.dados.personagens) Boneco.ROTULOS[p.id] = p.nome;
  // o sorteio nunca dá o personagem de outra pessoa
  Boneco.RARO = Boneco.RARO || {};
  Boneco.RARO.personagem = Infinity;

  // "nunca escolheu" tem de continuar sem a chave: é assim que o servidor sabe
  // que pode dar ao dono o personagem dele (personagens.py). Preencher com
  // 'nenhum' contava como "escolheu o boneco de pixel".
  const normalizarPixel = Boneco.normalizar.bind(Boneco);
  Boneco.normalizar = function (ap) {
    const saida = normalizarPixel(ap);
    if (!ap || !ap.personagem) delete saida.personagem;
    return saida;
  };
  const sortearPixel = Boneco.aleatoria.bind(Boneco);
  Boneco.aleatoria = function () {
    const ap = sortearPixel();
    delete ap.personagem;
    return ap;
  };

  Boneco.desenhar = function (ctx, aparencia, x, y, direcao, quadro, escala, sentado) {
    // sem boneco de pixel: enquanto a folha não chega, só a sombra no chão
    const p = Personagens.de(aparencia);
    if (p) Personagens.desenhar(ctx, p.id, x, y, direcao, quadro, escala, sentado);
  };

  Boneco.retrato = function (aparencia) {
    const p = Personagens.de(aparencia);
    return p ? Personagens.retrato(p.id) : '';
  };

  const miniaturaPixel = Boneco.miniaturaOpcao ? Boneco.miniaturaOpcao.bind(Boneco) : null;
  Boneco.miniaturaOpcao = function (chave, valor) {
    if (chave === 'personagem') return Personagens.retrato(valor);
    return miniaturaPixel ? miniaturaPixel(chave, valor) : null;
  };

  // já pede as folhas, para não aparecer o boneco de pixel por um instante
  for (const id of ids) Personagens.folha(id);
})();
