"""A tela viva: lista de pessoas, cartões de vídeo, grade da reunião, tablet,
dedo no mapa e a rolagem do chat.

O que dava errado antes:
  - a lista de pessoas era refeita quatro vezes por segundo: o clique lento no
    botão de expulsar não chegava (o botão apertado já não era o solto) e o
    foco de quem navega pelo teclado caía;
  - o cartão de vídeo só nascia quando chegava uma faixa de mídia: quem
    entrava sem microfone e sem câmera não ganhava cartão no outro lado, e sem
    cartão não entrava na grade da reunião;
  - na grade com palco o palco tinha 980px numa janela de 820 (saía por
    baixo) e os cartões da tira lateral subiam uns em cima dos outros;
  - o botão "sair da grade" era texto escuro em fundo escuro;
  - no tablet (761–860px) esconder o painel deixava uma faixa vazia de 240px
    no pé da tela, e o puxador flutuava no meio do mapa;
  - o dedo arrastando no mapa era cancelado pelo navegador no segundo
    movimento (`pointercancel`), e não havia pinça;
  - mensagem nova puxava a rolagem do chat de quem estava lendo o histórico.

    ENDERECO=http://127.0.0.1:8412 ADMIN_SENHA=... .venv/bin/python testes/tela_viva.py
"""

import asyncio
import os

from playwright.async_api import async_playwright

from comum import CONVITE, ENDERECO, SUFIXO, Sessao, conferir, fechar

ADMIN = os.environ.get("ADMIN_EMAIL", "gulisboa5@hotmail.com")
SENHA = os.environ.get("ADMIN_SENHA", "")

erros = []
falhas = 0
ESPERA = "() => typeof Jogo !== 'undefined' && !!Jogo.eu"

# cada cartão da grade, e quantos pares se sobrepõem
MEDIR_GRADE = """() => { const c = document.getElementById('videos');
  const tiles = [...c.children].map(t => { const r = t.getBoundingClientRect();
    return { destaque: t.classList.contains('destaque'), r: [r.left, r.top, r.right, r.bottom] }; });
  let sobrepoe = 0;
  for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) {
    const a = tiles[i].r, b = tiles[j].r;
    if (a[0] < b[2] - 1 && b[0] < a[2] - 1 && a[1] < b[3] - 1 && b[1] < a[3] - 1) sobrepoe++; }
  const palco = tiles.find(t => t.destaque);
  return { n: tiles.length, sobrepoe, palcoCabe: !!palco && palco.r[3] <= innerHeight + 1 && palco.r[2] <= innerWidth + 1,
           todosCabem: tiles.every(t => t.r[3] <= innerHeight + 1), rola: c.scrollHeight > c.clientHeight + 1 }; }"""


def c(rotulo, valor, esperado=True):
    global falhas
    if not conferir(rotulo, valor, esperado):
        falhas += 1


async def entrar_admin(nav):
    ctx = await nav.new_context(viewport={"width": 1280, "height": 800})
    pg = await ctx.new_page()
    pg.on("pageerror", lambda e: erros.append(("admin", str(e)[:160])))
    await pg.goto(ENDERECO)
    await asyncio.sleep(1.2)
    await pg.fill("#campo-email", ADMIN)
    await pg.fill("#campo-senha", SENHA)
    await pg.evaluate("() => entrar(false)")
    await pg.wait_for_function(ESPERA, timeout=40000)
    await asyncio.sleep(1.2)
    return pg


async def entrar_no_celular(nav, nome):
    """Como Sessao.entrar, mas num celular: tela estreita e dedo em vez de mouse."""
    ctx = await nav.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
    pg = await ctx.new_page()
    pg.on("pageerror", lambda e: erros.append((nome, str(e)[:160])))
    await pg.goto(ENDERECO)
    await asyncio.sleep(1.2)
    await pg.click("#aba-criar")
    await pg.fill("#campo-email", nome.lower() + SUFIXO + "@teste.local")
    await pg.fill("#campo-nome", nome + SUFIXO)
    await pg.fill("#campo-senha", "teste1234")
    await pg.fill("#campo-convite", CONVITE)
    await pg.evaluate("() => entrar(false)")
    await pg.wait_for_function(ESPERA, timeout=40000)
    await asyncio.sleep(1.2)
    return ctx, pg


async def main():
    async with async_playwright() as p:
        nav = await p.chromium.launch()
        s = Sessao(nav, erros)
        a = await entrar_admin(nav)
        outros = [await s.entrar(n) for n in ["Ana", "Bia", "Caio"]]
        await asyncio.sleep(2.5)

        # --- cartão para quem chega sem mídia ---
        c("o admin tem uma chamada com cada um dos três", await a.evaluate("() => Midia.pares.size"), 3)
        c("e um cartão de vídeo para cada chamada, mesmo sem mídia",
          await a.evaluate("() => document.querySelectorAll('#videos .video-tile').length"), 3)
        c("o outro lado também vê o cartão de quem chegou sem mídia",
          await outros[0].evaluate("() => document.querySelectorAll('#videos .video-tile').length"), 3)

        # --- lista de pessoas: parada quando nada muda, clique lento chega, foco fica ---
        n = await a.evaluate("""() => new Promise((ok) => {
            let n = 0; const ul = document.getElementById('lista-pessoas');
            const mo = new MutationObserver(() => n++); mo.observe(ul, { childList: true });
            setTimeout(() => { mo.disconnect(); ok(n); }, 1000); })""")
        c("a lista não é refeita quando nada muda (mutações em 1s)", n, 0)
        await a.evaluate("() => { window.__confirmou = 0; window.confirm = () => { window.__confirmou++; return false; }; }")
        alvo = await a.evaluate("""() => { const li = [...document.querySelectorAll('#lista-pessoas li')].find(l => l.textContent.includes('Ana'));
            const r = li.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; }""")
        await a.mouse.move(alvo["x"], alvo["y"])
        await asyncio.sleep(0.3)
        botao = await a.evaluate("""() => { const li = [...document.querySelectorAll('#lista-pessoas li')].find(l => l.textContent.includes('Ana'));
            const b = li.querySelector('.moderar button:last-child'); const r = b.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2, largura: r.width }; }""")
        c("o botão de expulsar aparece ao passar o mouse", botao["largura"] > 0)
        for _ in range(3):
            await a.mouse.move(botao["x"], botao["y"])
            await a.mouse.down()
            await asyncio.sleep(0.3)          # clique lento: mais que o intervalo do vigia
            await a.mouse.up()
            await asyncio.sleep(0.1)
        c("três cliques lentos em 'expulsar' chegam nos três", await a.evaluate("() => window.__confirmou"), 3)
        await a.evaluate("() => document.querySelector('#lista-pessoas .moderar button').focus()")
        await asyncio.sleep(0.7)
        c("o foco num botão da lista sobrevive ao vigia",
          await a.evaluate("() => !!document.activeElement.closest('#lista-pessoas .moderar')"))
        # `inline-flex` vira `flex` no valor calculado: item de container flex é
        # "blocado" pelo próprio CSS. O que importa é não estar em `none`.
        c("e o botão focado fica visível",
          await a.evaluate("() => getComputedStyle(document.activeElement.parentElement).display") != "none")
        await a.evaluate("() => document.activeElement.blur()")
        await a.mouse.move(600, 400)

        # --- grade da reunião com palco ---
        c("'sair da grade' é texto claro em fundo escuro",
          await a.evaluate("() => getComputedStyle(document.getElementById('btn-fechar-reuniao')).color"), "rgb(246, 244, 239)")
        fixado = await a.evaluate("() => { const id = [...Midia.pares.keys()][0]; abrirReuniao(id); return id; }")
        await asyncio.sleep(0.6)
        g = await a.evaluate(MEDIR_GRADE)
        c("a grade abriu com palco", await a.evaluate("() => document.getElementById('videos').classList.contains('com-destaque')"))
        c("o palco cabe na janela", g["palcoCabe"])
        c("a tira lateral não se sobrepõe", g["sobrepoe"], 0)
        c("a grade não precisa rolar", g["rola"], False)
        # nove pessoas: cópias dos cartões só para a conta do CSS
        await a.evaluate("""() => { const cx = document.getElementById('videos'); const t = cx.children[1];
            for (let i = 0; i < 6; i++) { const k = t.cloneNode(true); k.dataset.id = 'copia' + i; cx.appendChild(k); }
            atualizarDestaque(); }""")
        await asyncio.sleep(0.3)
        g9 = await a.evaluate(MEDIR_GRADE)
        c("com nove cartões ninguém sobe em cima de ninguém", g9["sobrepoe"], 0)
        c("e todos cabem na janela", g9["todosCabem"])
        await a.evaluate("() => { for (const k of [...document.getElementById('videos').children]) if (k.dataset.id.startsWith('copia')) k.remove(); atualizarDestaque(); }")
        await a.set_viewport_size({"width": 640, "height": 360})
        await asyncio.sleep(0.5)
        gp = await a.evaluate(MEDIR_GRADE)
        c("numa janela de 640x360 o palco também cabe", gp["palcoCabe"] and gp["sobrepoe"] == 0)
        await a.set_viewport_size({"width": 1280, "height": 800})
        await asyncio.sleep(0.4)
        # quem estava no palco sai no meio da reunião
        quem = await a.evaluate("(id) => Jogo.pessoas.get(id).nome", fixado)
        for o in outros:
            if await o.evaluate("() => Jogo.eu.nome") == quem:
                await o.evaluate("() => { Conexao.saindo = true; Jogo.ws.close(); }")
        await asyncio.sleep(1.5)
        c("o palco solta quem saiu", await a.evaluate("() => Reuniao.fixado"), None)
        c("a reunião continua de pé", await a.evaluate("() => Reuniao.ativa"))
        c("com dois cartões", await a.evaluate("() => document.querySelectorAll('#videos .video-tile').length"), 2)
        await a.evaluate("() => fecharReuniao()")

        # --- chat: quem lê o histórico não é puxado ---
        await a.evaluate("() => { for (let i = 0; i < 40; i++) escreverChat({ sistema: true, texto: 'linha ' + i }); }")
        await a.evaluate("() => { document.getElementById('mensagens').scrollTop = 0; }")
        await a.evaluate("() => escreverChat({ sistema: true, texto: 'chegou mais uma' })")
        c("mensagem nova não puxa quem está lendo o histórico",
          await a.evaluate("() => document.getElementById('mensagens').scrollTop"), 0)
        await a.evaluate("() => { const m = document.getElementById('mensagens'); m.scrollTop = m.scrollHeight; }")
        await a.evaluate("() => escreverChat({ sistema: true, texto: 'e outra' })")
        c("quem está no fim continua acompanhando", await a.evaluate(
            "() => { const m = document.getElementById('mensagens'); return m.scrollHeight - m.scrollTop - m.clientHeight < 2; }"))

        # --- tablet: painel escondido devolve o espaço ---
        t = await s.entrar("Dado", 800, 900)
        await asyncio.sleep(0.5)
        medir = """() => { const p = document.querySelector('.palco').getBoundingClientRect();
            const b = document.getElementById('btn-lateral').getBoundingClientRect();
            return { palcoFim: Math.round(p.bottom), puxadorEsq: Math.round(b.left), puxadorTopo: Math.round(b.top) }; }"""
        com = await t.evaluate(medir)
        c("tablet: o puxador fica encostado na borda direita, não no meio do mapa", com["puxadorEsq"] > 800 - 70)
        await t.evaluate("() => alternarLateral(false)")
        await asyncio.sleep(0.5)
        sem = await t.evaluate(medir)
        c("tablet: esconder o painel entrega o pé da tela ao mapa", sem["palcoFim"], 900)
        c("tablet: e o puxador desce para o canto", sem["puxadorTopo"] > 900 - 70)
        await t.evaluate("() => alternarLateral(true)")

        # --- dedo no mapa: arrastar, tocar e pinçar ---
        ctxm, m = await entrar_no_celular(nav, "Dedo")
        cdp = await ctxm.new_cdp_session(m)
        await m.evaluate("""() => { window.__ev = { cancel: 0, move: 0, up: 0 };
            tela.addEventListener('pointercancel', () => window.__ev.cancel++);
            tela.addEventListener('pointermove', () => window.__ev.move++);
            tela.addEventListener('pointerup', () => window.__ev.up++); }""")
        x, y = 195, 420
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
        for i in range(1, 10):
            await cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y + i * 12}]})
            await asyncio.sleep(0.03)
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        await asyncio.sleep(0.3)
        ev = await m.evaluate("() => window.__ev")
        c("arrastar o dedo no mapa não é cancelado pelo navegador", ev["cancel"], 0)
        c("e o mapa recebe o movimento inteiro", ev["move"] >= 8 and ev["up"] == 1)
        z0 = await m.evaluate("() => ESCALA")
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x - 40, "y": y}, {"x": x + 40, "y": y}]})
        for i in range(1, 8):
            await cdp.send("Input.dispatchTouchEvent", {"type": "touchMove",
                           "touchPoints": [{"x": x - 40 - i * 10, "y": y}, {"x": x + 40 + i * 10, "y": y}]})
            await asyncio.sleep(0.03)
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        await asyncio.sleep(0.4)
        c("a pinça aproxima o mapa", await m.evaluate("() => ESCALA") > z0 * 1.3)
        # com o editor aberto: um toque coloca, a pinça não
        await m.evaluate("""() => { Editor.alternar(); Editor.usarFerramenta('mobilia');
            window.__acoes = 0; const orig = Editor.acao.bind(Editor);
            Editor.acao = (acao) => { if (acao.acao === 'objeto') window.__acoes++; return orig(acao); }; }""")
        await asyncio.sleep(0.5)
        await m.touchscreen.tap(x, y)
        await asyncio.sleep(0.3)
        c("com o editor aberto, um toque pede para colocar a peça", await m.evaluate("() => window.__acoes"), 1)
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x - 40, "y": y}, {"x": x + 40, "y": y}]})
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x - 60, "y": y}, {"x": x + 60, "y": y}]})
        await cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        await asyncio.sleep(0.4)
        c("a pinça com o editor aberto não coloca nada", await m.evaluate("() => window.__acoes"), 1)
        await m.evaluate("() => Editor.alternar()")
        await ctxm.close()

        await nav.close()
    fechar("tela_viva", falhas, erros)


asyncio.run(main())
