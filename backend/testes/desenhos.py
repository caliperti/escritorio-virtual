"""Os desenhos, medidos no canvas: todo móvel do catálogo e toda roupa do guarda-roupa.

Não lê o código — desenha de verdade nas páginas de mostruário e mede os pixels.
O que fica garantido:

  móveis  — nos 4 giros, a tinta sólida fica dentro da caixa que o catálogo
            promete (peça alta pode subir o `e` de ALTOS, e mais nada); só a
            sombra do chão passa da caixa, e pouco; nenhuma peça some; e a
            miniatura da paleta não corta a peça em borda nenhuma.
            Era o que deixava o narguilé pequeno com o vaso no tile de baixo,
            a espada com as folhas no tile de cima e o armário sem topo na paleta.

  roupas  — toda peça (camisa, calça, sapato, chapéu, barba, cabelo), nos dois
            corpos, aparece em todo quadro andando e na cadeira — fora o que de
            fato não se vê de costas (barba, faixa e o sapato de quem senta);
            as peças que só existem na folha de andar entram na cadeira no
            lugar certo (chapéu a no máximo 1px da cabeça, casaco a no máximo
            1px de onde fica uma camisa que tem folha de sentado); e a cor
            pintada tem o matiz da cor pedida.
            Era o que deixava a cartola 3px ao lado da cabeça e o blazer com um
            ombro no ar em quem sentava de lado.

Precisa do servidor de pé (END, por padrão a 8400) e do Playwright. Não entra
em conta nenhuma: as páginas de mostruário e o /catalogo são abertos.

    END=http://127.0.0.1:8400 .venv/bin/python testes/desenhos.py
"""

import asyncio
import colorsys
import os
import sys

from playwright.async_api import async_playwright

END = os.environ.get("END", "http://127.0.0.1:8400")

provas = []
falhas = []


def conferir(nome, condicao, detalhe=None):
    provas.append(nome)
    print(("  ok    " if condicao else "FALHOU  ") + nome)
    if not condicao:
        falhas.append(nome)
        for linha in (detalhe or [])[:12]:
            print("          " + linha)
        if detalhe and len(detalhe) > 12:
            print("          … e mais %d" % (len(detalhe) - 12))


# ---------------------------------------------------------------------------
# móveis: cada peça, nos 4 giros, num canvas com 64px de folga em volta da caixa
# ---------------------------------------------------------------------------
JS_MOVEIS = r"""
async () => {
  const cat = (await (await fetch('/catalogo')).json()).catalogo;
  const T = 32, M = 64;
  const caixa = (d, W, H, limiar) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (d[(y * W + x) * 4 + 3] < limiar) continue;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return n ? { x0, y0, x1, y1, n } : null;
  };
  const carregar = (url) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = url; });
  const saida = {};
  for (const [tipo, info] of Object.entries(cat)) {
    const alto = Objetos.ALTOS[tipo];
    saida[tipo] = { e: alto ? alto.e : 0, giros: [] };
    for (let g = 0; g < 4; g++) {
      const m = Objetos.medida(tipo, info, g);
      const w = m.l * T, h = m.a * T;
      const c = document.createElement('canvas');
      c.width = w + 2 * M; c.height = h + 2 * M;
      const cx = c.getContext('2d');
      Objetos.desenhar(cx, tipo, M, M, w, h, g);
      const d = cx.getImageData(0, 0, c.width, c.height).data;
      // quanto a tinta passa de cada lado da caixa (negativo = está dentro)
      const fora = (b) => b && { esq: M - b.x0, cima: M - b.y0, dir: b.x1 - (M + w - 1),
                                 baixo: b.y1 - (M + h - 1), n: b.n };
      const solido = fora(caixa(d, c.width, c.height, 120));
      const fraco = fora(caixa(d, c.width, c.height, 8));
      // a miniatura da paleta do editor, no tamanho que o arsenal usa
      const img = await carregar(Objetos.miniatura(tipo, info.l, info.a, 44, g));
      const mc = document.createElement('canvas');
      mc.width = img.width; mc.height = img.height;
      const mcx = mc.getContext('2d');
      mcx.drawImage(img, 0, 0);
      const md = mcx.getImageData(0, 0, mc.width, mc.height).data;
      let borda = 0;
      for (let x = 0; x < mc.width; x++) {
        if (md[x * 4 + 3] >= 120) borda++;
        if (md[((mc.height - 1) * mc.width + x) * 4 + 3] >= 120) borda++;
      }
      for (let y = 0; y < mc.height; y++) {
        if (md[(y * mc.width) * 4 + 3] >= 120) borda++;
        if (md[(y * mc.width + mc.width - 1) * 4 + 3] >= 120) borda++;
      }
      saida[tipo].giros.push({ g, l: m.l, a: m.a, solido, fraco, borda });
    }
  }
  return saida;
}
"""

# ---------------------------------------------------------------------------
# roupas: cada peça, nos dois corpos, andando (4 direções x 9 quadros) e na
# cadeira (4 direções). O que a peça pinta é a diferença entre a folha com ela
# e a folha sem ela.
# ---------------------------------------------------------------------------
JS_ROUPAS = r"""
() => {
  const B = Boneco, Q = B.QUADRO, C = B.CATALOGO;
  const BASE = { corpo: 'm', pele: C.pele[1], cabelo: 'parted', corCabelo: '#4a2f1b',
                 barba: 'nenhuma', camisaTipo: 'camisa', corCamisa: '#4f7fd9',
                 calcaTipo: 'calca', corCalca: '#3d4457',
                 sapatoTipo: 'sapato', corSapato: '#3a3a42', chapeuTipo: 'nenhum' };
  const folha = (ap, sentado) => {
    B._cache.clear();
    const f = B._folha(ap, sentado);
    return { L: f.width, d: f.getContext('2d').getImageData(0, 0, f.width, f.height).data };
  };
  const sem = (ap, sentado, nomes) => {
    const guardado = {};
    for (const n of nomes) for (const p of ['', 'sit_']) { guardado[p + n] = B._imgs[p + n]; B._imgs[p + n] = null; }
    const f = folha(ap, sentado);
    for (const [k, v] of Object.entries(guardado)) B._imgs[k] = v;
    B._cache.clear();
    return f;
  };
  const diff = (a, b, L, lin, col) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0, r = 0, g = 0, bl = 0;
    for (let y = 0; y < Q; y++) for (let x = 0; x < Q; x++) {
      const i = ((lin * Q + y) * L + col * Q + x) * 4;
      if (a[i + 3] < 24 && b[i + 3] < 24) continue;
      if (a[i + 3] === b[i + 3] && a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2]) continue;
      n++; r += a[i]; g += a[i + 1]; bl += a[i + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return n ? { x0, y0, x1, y1, n, cor: [Math.round(r / n), Math.round(g / n), Math.round(bl / n)] } : null;
  };
  const saida = { cabeca: {}, pecas: [] };
  for (const corpo of ['m', 'f']) {
    saida.cabeca[corpo] = {
      parado: B._caixasDaCabeca(corpo, '', Q * B.QUADROS, Q * 4).map((l) => l[0]),
      sentado: B._caixasDaCabeca(corpo, 'sit_', Q * B.QUADROS_SENTADO, Q * 4).map((l) => l[B.POSE_CADEIRA]),
    };
  }
  const grupos = [
    ['camisaTipo', C.camisaTipo, (t, corpo) => [t + '_' + corpo], 'corCamisa'],
    ['calcaTipo', C.calcaTipo, (t, corpo) => [t + '_' + corpo], 'corCalca'],
    ['sapatoTipo', C.sapatoTipo, (t, corpo) => [t + '_' + corpo], 'corSapato'],
    ['chapeuTipo', C.chapeuTipo.filter((t) => t !== 'nenhum'), (t, corpo) => [t + '_' + corpo], 'corCamisa'],
    ['barba', C.barba.filter((t) => t !== 'nenhuma'), (t) => ['barba_' + t], 'corCabelo'],
    ['cabelo', C.cabelo, (t) => ['cabelo_' + t], 'corCabelo'],
  ];
  for (const [chave, tipos, camadas, corChave] of grupos) {
    for (const tipo of tipos) {
      for (const corpo of ['m', 'f']) {
        const ap = { ...BASE, corpo, [chave]: tipo };
        const item = { chave, tipo, corpo, cor: ap[corChave], semSentado: B.SEM_SENTADO.has(tipo),
                       andando: [], sentado: [] };
        for (const sentado of [false, true]) {
          const com = folha(ap, sentado);
          const semEla = tipo === 'bone_pintado'
            ? folha({ ...ap, chapeuTipo: 'nenhum' }, sentado)
            : sem(ap, sentado, camadas(tipo, corpo));
          const cols = com.L / Q;
          for (let lin = 0; lin < 4; lin++) {
            const qs = [];
            for (let col = 0; col < cols; col++) qs.push(diff(com.d, semEla.d, com.L, lin, col));
            item[sentado ? 'sentado' : 'andando'].push(qs);
          }
        }
        saida.pecas.push(item);
      }
    }
  }
  return saida;
}
"""

DIRS = ["cima", "esquerda", "baixo", "direita"]
CADEIRA = 2                       # coluna da pose de cadeira na folha de sentado


def matiz(rgb):
    h, s, v = colorsys.rgb_to_hsv(*[c / 255 for c in rgb])
    return h * 360, s


def conferir_moveis(medidas):
    somem, solido, fraco, minis = [], [], [], []
    for tipo, v in sorted(medidas.items()):
        e = v["e"]
        for g in v["giros"]:
            rot = "%s g=%d (%dx%d)" % (tipo, g["g"], g["l"], g["a"])
            s = g["solido"]
            if not s or s["n"] < 30:
                somem.append(rot)
                continue
            # tinta sólida: nada para os lados nem para baixo; para cima só o `e`
            # da peça alta (mais 1px de contorno)
            passa = {k: s[k] for k in ("esq", "dir", "baixo") if s[k] > 1}
            if s["cima"] > e + 1:
                passa["cima"] = s["cima"] - e
            if passa:
                solido.append("%s passa %s" % (rot, passa))
            # tinta fraca é a sombra do chão: cai 3px para a direita e uns 6 para
            # baixo, de propósito. Mais que isso é peça pintando fora.
            f = g["fraco"]
            passa = {k: f[k] for k, tol in (("esq", 3), ("dir", 5), ("baixo", 8)) if f[k] > tol}
            if f["cima"] > e + 4:
                passa["cima"] = f["cima"] - e
            if passa:
                fraco.append("%s sombra passa %s" % (rot, passa))
            if g["borda"]:
                minis.append("%s: %d px na borda" % (rot, g["borda"]))
    conferir("todo móvel aparece em todo giro", not somem, somem)
    conferir("nenhum móvel pinta fora da caixa que o catálogo promete", not solido, solido)
    conferir("só a sombra do chão passa da caixa, e pouco", not fraco, fraco)
    conferir("a miniatura da paleta não corta a peça", not minis, minis)


def conferir_roupas(m):
    def visivel_esperado(it, lin, modo):
        # o que de fato não existe de costas: barba, faixa de cabeça e o sapato
        # de quem está sentado (o encosto esconde as pernas)
        if DIRS[lin] != "cima":
            return True
        if it["chave"] == "barba" or it["tipo"] == "chapeu_faixa":
            return False
        if modo == "sentado" and it["chave"] == "sapatoTipo":
            return False
        return True

    somem, lugar, cores = [], [], []
    ref = {(it["corpo"], lin): it for it in m["pecas"] if it["tipo"] == "camisa_longa" for lin in range(4)}
    for it in m["pecas"]:
        nome = "%s %s (%s)" % (it["chave"], it["tipo"], it["corpo"])
        for modo in ("andando", "sentado"):
            for lin, qs in enumerate(it[modo]):
                for col, q in enumerate(qs):
                    if modo == "sentado" and col != CADEIRA:
                        continue
                    if (q["n"] if q else 0) < 6 and visivel_esperado(it, lin, modo):
                        somem.append("%s %s %s q%d" % (nome, modo, DIRS[lin], col))
        # peça sem folha de sentado: entra na cadeira com a pose de pé, deslocada
        # para onde o corpo sentado está — conferimos que ficou no lugar
        if it["semSentado"]:
            for lin in range(4):
                a, s = it["andando"][lin][0], it["sentado"][lin][CADEIRA]
                if not a or not s:
                    continue
                if it["chave"] == "chapeuTipo":
                    ca, cs = m["cabeca"][it["corpo"]]["parado"][lin], m["cabeca"][it["corpo"]]["sentado"][lin]
                    fundo_a, fundo_s = a["y1"] - ca["y"], s["y1"] - cs["y"]
                    x_a = (a["x0"] + a["x1"]) / 2 - (ca["x"] + ca["l"] / 2)
                    x_s = (s["x0"] + s["x1"]) / 2 - (cs["x"] + cs["l"] / 2)
                    if abs(fundo_a - fundo_s) > 1 or abs(x_a - x_s) > 1.5:
                        lugar.append("%s %s: contra a cabeça, parado y%+d x%+.1f, sentado y%+d x%+.1f"
                                     % (nome, DIRS[lin], fundo_a, x_a, fundo_s, x_s))
                else:
                    r = ref[(it["corpo"], lin)]
                    ra, rs = r["andando"][lin][0], r["sentado"][lin][CADEIRA]
                    x_a = (a["x0"] + a["x1"]) / 2 - (ra["x0"] + ra["x1"]) / 2
                    x_s = (s["x0"] + s["x1"]) / 2 - (rs["x0"] + rs["x1"]) / 2
                    y_a, y_s = a["y0"] - ra["y0"], s["y0"] - rs["y0"]
                    if abs(x_a - x_s) > 1.5 or abs(y_a - y_s) > 1:
                        lugar.append("%s %s: contra a manga longa, parado x%+.1f y%+d, sentado x%+.1f y%+d"
                                     % (nome, DIRS[lin], x_a, y_a, x_s, y_s))
        # a cor: o matiz médio do que a peça pintou, de frente e parada, tem de
        # ser o da cor pedida (só faz sentido em cor com saturação)
        q = it["andando"][2][0]
        if q:
            alvo = [int(it["cor"][i:i + 2], 16) for i in (1, 3, 5)]
            ha, sa = matiz(alvo)
            hp, sp = matiz(q["cor"])
            if sa > 0.25 and sp > 0.12:
                d = min(abs(ha - hp), 360 - abs(ha - hp))
                if d > 25:
                    cores.append("%s: pedido %s (matiz %.0f), pintado rgb%s (matiz %.0f)"
                                 % (nome, it["cor"], ha, q["cor"], hp))
    conferir("toda roupa aparece em toda direção, andando e sentado", not somem, somem)
    conferir("peça sem folha de sentado entra na cadeira no lugar certo", not lugar, lugar)
    conferir("a cor pintada tem o matiz da cor pedida", not cores, cores)


async def principal():
    async with async_playwright() as p:
        nav = await p.chromium.launch()
        ctx = await nav.new_context(viewport={"width": 1280, "height": 900})
        erros = []
        pg = await ctx.new_page()
        pg.on("pageerror", lambda e: erros.append("móveis: " + str(e)[:180]))
        pg.on("console", lambda c: erros.append("móveis: " + c.text[:180]) if c.type == "error" else None)
        await pg.goto(END + "/static/mostruario.html")
        await pg.wait_for_function(
            "() => !document.getElementById('resumo').textContent.includes('carregando')", timeout=60000)
        moveis = await pg.evaluate(JS_MOVEIS)
        conferir("o catálogo inteiro foi medido (%d peças)" % len(moveis), len(moveis) >= 100)
        conferir_moveis(moveis)

        pg2 = await ctx.new_page()
        pg2.on("pageerror", lambda e: erros.append("roupas: " + str(e)[:180]))
        pg2.on("console", lambda c: erros.append("roupas: " + c.text[:180]) if c.type == "error" else None)
        await pg2.goto(END + "/static/mostruario-roupas.html")
        await pg2.wait_for_function(
            "() => Boneco._pronto && !document.getElementById('resumo').textContent.includes('carregando')",
            timeout=90000)
        roupas = await pg2.evaluate(JS_ROUPAS)
        conferir("o guarda-roupa inteiro foi medido (%d peças x corpo)" % len(roupas["pecas"]),
                 len(roupas["pecas"]) >= 100)
        conferir_roupas(roupas)

        conferir("nenhum erro de página nos dois mostruários", not erros, erros)
        await nav.close()


asyncio.run(principal())
print("\n%d provas, %d falharam" % (len(provas), len(falhas)))
sys.exit(1 if falhas else 0)
