"""O painel do editor flutua: arrasta, recolhe, lembra onde ficou e explica
cada botão ao passar o mouse.

Ele nascia grudado na direita e cobria um pedaço do mapa. Quem quisesse editar
justamente a sala que estava embaixo dele não conseguia.

    ADMIN_SENHA=... .venv/bin/python testes/painel.py
"""

import asyncio
import os
import sys

from playwright.async_api import async_playwright

END = os.environ.get("ENDERECO", os.environ.get("END", "http://127.0.0.1:8400"))
ADMIN = os.environ.get("ADMIN_EMAIL", "gulisboa5@hotmail.com")
SENHA = os.environ.get("ADMIN_SENHA", "")

provas, falhas = [], []


def ok(nome, cond):
    provas.append(nome)
    print(("  ok    " if cond else "FALHOU  ") + nome)
    if not cond:
        falhas.append(nome)


CAIXA = """() => { const p = document.getElementById('editor').getBoundingClientRect();
    const s = document.querySelector('.palco').getBoundingClientRect();
    return { x: Math.round(p.left - s.left), y: Math.round(p.top - s.top),
             l: Math.round(p.width), a: Math.round(p.height),
             palco: { l: Math.round(s.width), a: Math.round(s.height) } }; }"""


async def principal():
    async with async_playwright() as p:
        nav = await p.chromium.launch()
        ctx = await nav.new_context(viewport={"width": 1280, "height": 860})
        pg = await ctx.new_page()
        erros = []
        pg.on("pageerror", lambda e: erros.append(str(e)[:180]))
        await pg.goto(END)
        await asyncio.sleep(1.4)
        await pg.fill("#campo-email", ADMIN)
        await pg.fill("#campo-senha", SENHA)
        await pg.evaluate("() => entrar(false)")
        await pg.wait_for_function("() => typeof Jogo !== 'undefined' && !!Jogo.eu", timeout=40000)
        await asyncio.sleep(1.4)
        await pg.evaluate("() => { try { localStorage.removeItem('escritorio:painel'); } catch (e) {} }")
        await pg.evaluate("() => { if (!Editor.ativo) Editor.alternar(); }")
        await asyncio.sleep(0.8)

        antes = await pg.evaluate(CAIXA)
        ok("o painel abre", antes["l"] > 100)

        # arrasta pela barra de cima, da direita para a esquerda
        cab = await pg.evaluate("""() => { const c = document.querySelector('#editor .cabeca').getBoundingClientRect();
            return { x: c.left + 40, y: c.top + c.height / 2 }; }""")
        await pg.mouse.move(cab["x"], cab["y"])
        await pg.mouse.down()
        await pg.mouse.move(cab["x"] - 500, cab["y"] + 120, steps=12)
        await pg.mouse.up()
        await asyncio.sleep(0.5)
        depois = await pg.evaluate(CAIXA)
        ok("arrastar pela barra move o painel", abs(depois["x"] - antes["x"]) > 300)

        # não sai do palco, por mais que se arraste
        await pg.mouse.move(cab["x"] - 500, cab["y"] + 120)
        await pg.mouse.down()
        await pg.mouse.move(5, 5, steps=8)
        await pg.mouse.up()
        await asyncio.sleep(0.5)
        canto = await pg.evaluate(CAIXA)
        ok("não escapa pela borda de cima nem pela esquerda", canto["x"] >= 0 and canto["y"] >= 0)

        # recolher deixa só a barra
        alto = (await pg.evaluate(CAIXA))["a"]
        await pg.click("#editor .recolher")
        await asyncio.sleep(0.4)
        baixo = (await pg.evaluate(CAIXA))["a"]
        ok("recolher deixa só a barra de cima", baixo < alto / 2)
        # recolhido ele é baixinho, então dá para levar para o pé da tela
        topo = (await pg.evaluate(CAIXA))["y"]
        cab2 = await pg.evaluate("""() => { const c = document.querySelector('#editor .cabeca').getBoundingClientRect();
            return { x: c.left + 40, y: c.top + c.height / 2 }; }""")
        await pg.mouse.move(cab2["x"], cab2["y"])
        await pg.mouse.down()
        await pg.mouse.move(cab2["x"] + 200, cab2["y"] + 500, steps=12)
        await pg.mouse.up()
        await asyncio.sleep(0.5)
        ok("recolhido, dá para arrastar até o pé da tela",
           (await pg.evaluate(CAIXA))["y"] > topo + 200)
        await pg.click("#editor .recolher")
        await asyncio.sleep(0.4)
        ok("e abrir de novo devolve o painel", (await pg.evaluate(CAIXA))["a"] > baixo * 1.5)
        ok("aberto, ele continua inteiro dentro do palco", await pg.evaluate(
            """() => { const p = document.getElementById('editor').getBoundingClientRect();
                 const s = document.querySelector('.palco').getBoundingClientRect();
                 return p.bottom <= s.bottom + 1 && p.right <= s.right + 1; }"""))

        # lembra onde ficou, mesmo fechando e abrindo o editor
        lugar = await pg.evaluate(CAIXA)
        await pg.evaluate("() => Editor.alternar()")
        await asyncio.sleep(0.4)
        await pg.evaluate("() => Editor.alternar()")
        await asyncio.sleep(0.6)
        volta = await pg.evaluate(CAIXA)
        ok("o painel volta no lugar em que foi deixado",
           abs(volta["x"] - lugar["x"]) <= 2 and abs(volta["y"] - lugar["y"]) <= 2)

        # passar o mouse conta do que se trata
        faixa = "() => document.getElementById('editor-ajuda').textContent"
        antes_txt = await pg.evaluate(faixa)
        await pg.hover('#editor [data-fer="piso"]')
        await asyncio.sleep(0.4)
        sobre_piso = await pg.evaluate(faixa)
        ok("passar o mouse numa ferramenta explica o que ela faz",
           "chão" in sobre_piso.lower() and sobre_piso != antes_txt)
        await pg.hover("#editor .cabeca strong")
        await asyncio.sleep(0.4)
        ok("e sair devolve a ajuda de antes", await pg.evaluate(faixa) != sobre_piso)

        ok("nenhum erro de página", not erros)
        if erros:
            print("   ", erros)
        await pg.evaluate("() => { try { localStorage.removeItem('escritorio:painel'); } catch (e) {} }")
        await nav.close()


asyncio.run(principal())
print("\n%d provas, %d falharam" % (len(provas), len(falhas)))
sys.exit(1 if falhas else 0)
