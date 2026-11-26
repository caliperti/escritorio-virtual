/* Cenário: o escritório desenhado como arte pronta (26/11, redesign Codara).
 *
 * Em vez de piso e parede de quadradinho, o servidor manda `mapa.cenario` com:
 *   fundo      a arte inteira (1 px da arte = 1 px do mundo);
 *   bloqueios  formas em pixel que a caixinha do avatar não atravessa
 *              (r: retângulo [x1,y1,x2,y2]; c: cápsula deitada [xa,xb,cy,rx,ry]);
 *   frentes    recortes da própria arte que ficam NA FRENTE de quem passa atrás
 *              (tampo da mesa, cadeiras, vidro das salas…), com a linha do chão
 *              (`base`) que decide quem cobre quem;
 *   assentos   pontos em que a pessoa senta, para onde olha e em que camada fica.
 * A conta de colisão é a MESMA de mapa.py (bate_no_cenario): mudou lá, muda aqui.
 * `?depurar=1` no endereço pinta formas, bases e assentos por cima da arte.     */

const Cenario = {
  dados: null,
  fundo: null,
  imagens: new Map(),            // url -> Image
  depurar: /[?&]depurar=1\b/.test(location.search),

  configurar(mapa) {
    this.dados = (mapa && mapa.cenario) || null;
    if (!this.dados) return;
    this.fundo = this._imagem(this.dados.fundo);
    for (const f of this.dados.frentes || []) this._imagem(f.img);
  },

  ativo() { return !!this.dados; },

  _imagem(url) {
    if (!this.imagens.has(url)) {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      this.imagens.set(url, img);
    }
    return this.imagens.get(url);
  },

  escalaBoneco() { return (this.dados && this.dados.boneco) || 2; },

  /* ---------- colisão (igual a mapa.py) ---------- */

  assentoEm(px, py, folga = 2) {
    if (!this.dados) return null;
    for (const a of this.dados.assentos || []) {
      if (Math.abs(px - a.x) <= folga && Math.abs(py - a.y) <= folga) return a;
    }
    return null;
  },

  sentadoNa(zonaId, px, py) {
    const a = this.assentoEm(px, py);
    return !!(a && a.zona === zonaId);
  },

  bate(px, py, r) {
    const c = this.dados;
    if (!c) return false;
    if (this.assentoEm(px, py)) return false;          // sentar é DENTRO da cadeira
    if (px - r < 0 || py - r < 0 || px + r > c.largura || py + r > c.altura) return true;
    for (const f of c.bloqueios || []) {
      if (f.r) {
        const [x1, y1, x2, y2] = f.r;
        if (px + r > x1 && px - r < x2 && py + r > y1 && py - r < y2) return true;
      } else if (f.c) {
        const [xa, xb, cy, rx, ry] = f.c;
        const dx = px < xa ? px - xa : (px > xb ? px - xb : 0);
        const dy = py - cy;
        if ((dx / (rx + r)) ** 2 + (dy / (ry + r)) ** 2 < 1) return true;
      }
    }
    return false;
  },

  /** O assento livre mais perto de (px, py), até `raio` px. `soDaZona` filtra
   *  (a mesa de reunião só senta quem pediu). Ocupado = alguém já está nele. */
  assentoPerto(px, py, raio, filtro) {
    if (!this.dados) return null;
    let melhor = null, dist = raio;
    for (const a of this.dados.assentos || []) {
      if (filtro && !filtro(a)) continue;
      const d = Math.hypot(a.x - px, a.y - py);
      if (d > dist) continue;
      if (this.ocupado(a)) continue;
      melhor = a; dist = d;
    }
    return melhor;
  },

  ocupado(a, menos) {
    for (const p of Jogo.pessoas.values()) {
      if (p === menos) continue;
      if (Math.abs(p.x - a.x) <= 2 && Math.abs(p.y - a.y) <= 2) return true;
    }
    return false;
  },

  /* ---------- caminho por clique: A* numa grade fina ----------
   * A grade de 32 px não passa pelas portas da arte (45 px, em posição que não
   * cai alinhada com tile nenhum). Aqui a grade é de 8 px e cada nó vale se a
   * caixinha do avatar cabe nele (a mesma conta do movimento). */

  PASSO: 8,

  /** Trajeto com 1 px de folga das formas; se não houver (a pessoa está num
   *  ponto apertado, como o corredor entre o vidro das salas e as cadeiras de
   *  trás da mesa), tenta de novo sem folga em vez de desistir no meio. */
  caminho(x0, y0, x1, y1, livreDeVerdade) {
    const r = Jogo.raioAvatar || 11;
    return this._caminho(x0, y0, x1, y1, livreDeVerdade, r + 1)
        || this._caminho(x0, y0, x1, y1, livreDeVerdade, r);
  },

  _caminho(x0, y0, x1, y1, livreDeVerdade, folga) {
    // Colado nas formas, o boneco raspava na quina (um décimo de pixel de
    // arredondamento) e travava ali. O ponto final pode ser colado (é onde a
    // pessoa clicou).
    const livre = (x, y) => livreDeVerdade(x, y) && !this.bate(x, y, folga);
    const P = this.PASSO;
    const L = Math.ceil(this.dados.largura / P), A = Math.ceil(this.dados.altura / P);
    const no = (x, y) => y * L + x;
    const centro = (i) => [(i % L) * P + P / 2, Math.floor(i / L) * P + P / 2];
    const ini = no(Math.floor(x0 / P), Math.floor(y0 / P));
    const fx = Math.floor(x1 / P), fy = Math.floor(y1 / P);
    if (fx < 0 || fy < 0 || fx >= L || fy >= A) return null;
    const fim = no(fx, fy);
    if (!livreDeVerdade(x1, y1)) return null;
    if (ini === fim) return null;

    const cache = new Map();
    const pode = (i) => {
      if (!cache.has(i)) cache.set(i, i === fim || livre(...centro(i)));
      return cache.get(i);
    };
    const g = new Map([[ini, 0]]);
    const veio = new Map();
    const [ex, ey] = [fx, fy];
    const h = (i) => {
      const dx = Math.abs((i % L) - ex), dy = Math.abs(Math.floor(i / L) - ey);
      return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
    };
    // fila de prioridade simples (heap binário)
    const heap = [[h(ini), ini]];
    const subir = (k) => { while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const descer = (k) => { for (;;) { let m = k; const a = 2 * k + 1, b = a + 1;
      if (a < heap.length && heap[a][0] < heap[m][0]) m = a;
      if (b < heap.length && heap[b][0] < heap[m][0]) m = b;
      if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } };
    const fechado = new Set();
    let voltas = 0;
    while (heap.length && voltas++ < 60000) {
      const [, atual] = heap[0];
      const ultimo = heap.pop();
      if (heap.length) { heap[0] = ultimo; descer(0); }
      if (fechado.has(atual)) continue;
      fechado.add(atual);
      if (atual === fim) {
        const pontos = [];
        for (let i = fim; i !== undefined && i !== ini; i = veio.get(i)) pontos.unshift(centro(i));
        pontos[pontos.length - 1] = [x1, y1];              // termina onde clicou
        return this._alisar([x0, y0], pontos, livre, livreDeVerdade).map(([x, y]) => ({ x, y }));
      }
      const ax = atual % L, ay = Math.floor(atual / L);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = ax + dx, ny = ay + dy;
          if (nx < 0 || ny < 0 || nx >= L || ny >= A) continue;
          const viz = no(nx, ny);
          if (fechado.has(viz) || !pode(viz)) continue;
          // na diagonal os dois lados precisam estar livres (não corta quina)
          if (dx && dy && (!pode(no(ax + dx, ay)) || !pode(no(ax, ay + dy)))) continue;
          const custo = g.get(atual) + (dx && dy ? 1.414 : 1);
          if (g.has(viz) && g.get(viz) <= custo) continue;
          g.set(viz, custo);
          veio.set(viz, atual);
          heap.push([custo + h(viz), viz]);
          subir(heap.length - 1);
        }
      }
    }
    return null;
  },

  /** Tira os degraus da grade: pula para o ponto mais longe que dá para ver em
   *  linha reta. O boneco anda reto até a porta em vez de em zigue-zague. */
  _alisar(inicio, pontos, livre, livreNoFim) {
    const reta = (a, b) => {
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(d / 4));
      for (let i = 1; i <= n; i++) {
        const x = a[0] + (b[0] - a[0]) * i / n, y = a[1] + (b[1] - a[1]) * i / n;
        // perto do fim vale o livre de verdade (o ponto clicado pode ser colado)
        const ultimo = b === pontos[pontos.length - 1] && Math.hypot(b[0] - x, b[1] - y) < 14;
        if (!(ultimo ? livreNoFim(x, y) : livre(x, y))) return false;
      }
      return true;
    };
    const saida = [];
    let atual = inicio, i = 0;
    while (i < pontos.length) {
      let j = pontos.length - 1;
      while (j > i && !reta(atual, pontos[j])) j--;
      saida.push(pontos[j]);
      atual = pontos[j];
      i = j + 1;
    }
    return saida;
  },

  /** Clicou em cima de um móvel: o ponto livre mais perto do clique. */
  pertoLivre(ponto, livre) {
    for (let raio = 6; raio <= 120; raio += 6) {
      let melhor = null, dist = Infinity;
      for (let ang = 0; ang < 360; ang += 15) {
        const x = ponto.x + raio * Math.cos(ang * Math.PI / 180);
        const y = ponto.y + raio * Math.sin(ang * Math.PI / 180);
        if (!livre(x, y)) continue;
        const d = Math.hypot(x - ponto.x, y - ponto.y);
        if (d < dist) { dist = d; melhor = { x, y }; }
      }
      if (melhor) return melhor;
    }
    return null;
  },

  /* ---------- desenho ---------- */

  desenharFundo(ctx) {
    const c = this.dados;
    ctx.fillStyle = c.cor_fora || '#121014';
    ctx.fillRect(-4000, -4000, 8000 + c.largura, 8000 + c.altura);
    if (this.fundo && this.fundo.complete && this.fundo.naturalWidth) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // Em volta do salão, a própria arte ampliada, desfocada e escura (26/11):
      // numa tela de outro formato a sobra vira "o resto do prédio na penumbra",
      // e não um vazio preto. Feito uma vez só (desfocar a cada quadro pesa).
      const amb = this._ambiente || (this._ambiente = this._fazerAmbiente());
      if (amb) ctx.drawImage(amb, -c.largura * 0.75, -c.altura * 0.75, c.largura * 2.5, c.altura * 2.5);
      ctx.drawImage(this.fundo, 0, 0, c.largura, c.altura);
    }
  },

  _fazerAmbiente() {
    try {
      const W = 540, H = Math.round(540 * this.dados.altura / this.dados.largura);
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const g = cv.getContext('2d');
      g.filter = 'blur(9px) brightness(0.3) saturate(0.85)';
      g.drawImage(this.fundo, -24, -24, W + 48, H + 48);
      // sombra em volta do salão: ele "pousa" na penumbra
      g.filter = 'blur(14px)';
      g.fillStyle = 'rgba(0,0,0,.75)';
      g.fillRect(W * 0.3 - 6, H * 0.3 - 6, W * 0.4 + 12, H * 0.4 + 12);
      return cv;
    } catch (e) {
      return null;
    }
  },

  /** Os recortes entram na mesma fila de profundidade que pessoas e móveis. */
  porNaFila(fila, ctx) {
    for (const f of this.dados.frentes || []) {
      const img = this._imagem(f.img);
      fila.push({ base: f.base, peso: 1.5, desenhar: () => {
        if (!img.complete || !img.naturalWidth) return;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, f.x, f.y, f.w, f.h);
      } });
    }
  },

  /** A porta da diretoria em cima da porta da arte. Aberta: a arte já mostra
   *  o vão com a fita roxa, e a gente só acende a soleira. Trancada: um vidro
   *  fumê fecha o vão e aparece o cadeado. */
  desenharPorta(ctx, z) {
    const p = z.porta_px;
    if (!p) return;
    // Porta larga = a frente inteira da sala (a sede maior é "em corte", sem
    // vidro desenhado): aberta não leva nada; trancada vira uma parede de vidro.
    const w = p.x2 - p.x1, larga = w > 120, alto = larga ? 120 : 74;
    if (!z.trancada && larga) return;
    if (!z.trancada) {
      const g = ctx.createLinearGradient(0, p.y - 4, 0, p.y + 10);
      g.addColorStop(0, 'rgba(255,196,120,.0)');
      g.addColorStop(0.5, 'rgba(255,196,120,.35)');
      g.addColorStop(1, 'rgba(255,196,120,0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x1, p.y - 4, w, 14);
      return;
    }
    ctx.fillStyle = 'rgba(20,16,26,.62)';
    ctx.fillRect(p.x1, p.y - alto, w, alto);
    ctx.strokeStyle = 'rgba(167,139,250,.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x1 + 1, p.y - alto + 1, w - 2, alto - 2);
    const cx = p.x1 + w / 2, cy = p.y - alto / 2;
    ctx.fillStyle = 'rgba(124,58,237,.95)';
    ctx.beginPath();
    ctx.arc(cx, cy, 11, 0, Math.PI * 2);
    ctx.fill();
    // cadeado desenhado (emoji muda de cara em cada sistema)
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(cx, cy - 2, 3.4, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - 5, cy - 2, 10, 7.5);
  },

  /** A plaquinha da diretoria na parede do fundo, como na referência: cartão
   *  escuro, barra roxa, nome e "Diretoria" embaixo. Devolve o retângulo (para
   *  o clique abrir o menu da sala). */
  desenharPlaca(ctx, z) {
    const pos = z.placa_px;
    if (!pos) return null;
    if (pos.na_arte) {
      // o nome já vem desenhado na arte: só o aviso de trancada, logo abaixo
      if (z.trancada) {
        ctx.font = '600 11px Inter, -apple-system, "Segoe UI", sans-serif';
        const t = 'trancada', lt = ctx.measureText(t).width + 26;
        const x = pos.x, y = pos.y + pos.h + 5;
        ctx.fillStyle = 'rgba(24,21,27,.9)';
        arredondado(x, y, lt, 18, 9);
        ctx.fill();
        ctx.fillStyle = '#a78bfa';
        ctx.beginPath(); ctx.arc(x + 10, y + 9, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e9e4f5';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(t, x + 18, y + 9.5);
      }
      return { x: pos.x, y: pos.y, w: pos.w, h: pos.h };
    }
    const titulo = z.nome;
    const sub = z.sub || '';
    ctx.font = '600 15px Inter, -apple-system, "Segoe UI", sans-serif';
    const lt = ctx.measureText(titulo).width;
    ctx.font = '12px Inter, -apple-system, "Segoe UI", sans-serif';
    const ls = ctx.measureText(sub).width;
    const w = Math.max(lt, ls) + 54, h = 50;
    const x = pos.x, y = pos.y;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = 'rgba(24,21,27,.88)';
    arredondado(x, y, w, h, 6);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.lineWidth = 1;
    arredondado(x + .5, y + .5, w - 1, h - 1, 6);
    ctx.stroke();
    ctx.fillStyle = '#8b5cf6';
    arredondado(x + 12, y + 10, 4, h - 20, 2);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f5f3f7';
    ctx.font = '600 15px Inter, -apple-system, "Segoe UI", sans-serif';
    ctx.fillText(titulo, x + 26, y + 22);
    ctx.fillStyle = 'rgba(232,228,238,.72)';
    ctx.font = '12px Inter, -apple-system, "Segoe UI", sans-serif';
    ctx.fillText(sub, x + 26, y + 39);
    if (z.trancada) {
      ctx.fillStyle = '#a78bfa';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('trancada', x + w - 10, y + 39);
    }
    return { x, y, w, h };
  },

  /** `?depurar=1`: formas que bloqueiam, linha de base dos recortes e assentos. */
  desenharDepuracao(ctx) {
    if (!this.depurar || !this.dados) return;
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0,255,255,.9)';
    ctx.fillStyle = 'rgba(0,255,255,.12)';
    for (const f of this.dados.bloqueios || []) {
      ctx.beginPath();
      if (f.r) ctx.rect(f.r[0], f.r[1], f.r[2] - f.r[0], f.r[3] - f.r[1]);
      else {
        const [xa, xb, cy, rx, ry] = f.c;
        ctx.ellipse(xa, cy, rx, ry, 0, Math.PI / 2, Math.PI * 1.5);
        ctx.lineTo(xb, cy - ry);
        ctx.ellipse(xb, cy, rx, ry, 0, -Math.PI / 2, Math.PI / 2);
        ctx.closePath();
      }
      ctx.fill(); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,80,200,.9)';
    ctx.setLineDash([6, 4]);
    for (const f of this.dados.frentes || []) {
      if (f.base > this.dados.altura) continue;
      ctx.beginPath(); ctx.moveTo(f.x, f.base); ctx.lineTo(f.x + f.w, f.base); ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const a of this.dados.assentos || []) {
      ctx.fillStyle = a.zona ? 'rgba(167,139,250,.95)' : 'rgba(255,220,0,.95)';
      ctx.beginPath(); ctx.arc(a.x, a.y, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },
};
