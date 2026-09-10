"""Levantar e derrubar parede, e desfazer a última edição.

"Alt derruba" era só uma frase na ajuda, e quem levantava parede sem querer
ficava sem saber como tirar. Aqui a prova é pelos botões da tela.

    ADMIN_SENHA=... .venv/bin/python testes/paredes.py
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


async def principal():
    async with async_playwright() as p:
        nav = await p.chromium.launch()
        pg = await (await nav.new_context(viewport={"width": 1280, "height": 860})).new_page()
        erros = []
        pg.on("pageerror", lambda e: erros.append(str(e)[:180]))
        await pg.goto(END)
        await asyncio.sleep(1.4)
        await pg.fill("#campo-email", ADMIN)
        await pg.fill("#campo-senha", SENHA)
        await pg.evaluate("() => entrar(false)")
        await pg.wait_for_function("() => typeof Jogo !== 'undefined' && !!Jogo.eu", timeout=40000)
        await asyncio.sleep(1.4)
        await pg.evaluate("() => { if (!Editor.ativo) Editor.alternar(); }")
        await pg.click('#editor [data-fer="parede"]')
        await asyncio.sleep(0.6)

        ok("a ferramenta de parede mostra os dois modos",
           await pg.evaluate("() => document.querySelectorAll('.modos-parede [data-modo]').length") == 2)
        ok("e começa em Levantar", await pg.evaluate(
            "() => document.querySelector('[data-modo=\"levantar\"]').getAttribute('aria-pressed')") == "true")

        # um trecho de chão livre, longe de tudo
        onde = await pg.evaluate("""() => {
            for (let y = 2; y < Jogo.mapa.altura - 3; y++)
              for (let x = 2; x < Jogo.mapa.largura - 6; x++) {
                let livre = true;
                for (let d = 0; d < 4; d++) if (Jogo.mapa.paredes[y][x + d] !== '0') livre = false;
                if (livre) return { x, y };
              }
            return null; }""")
        ok("achei chão sem parede", onde is not None)

        async def pincelar(x, y, n):
            await pg.evaluate("""([x, y, n]) => {
                const t = Jogo.tile;
                Editor.aoApontar({ button: 0, altKey: false, shiftKey: false },
                                 { x: (x + 0.5) * t, y: (y + 0.5) * t });
                for (let d = 1; d < n; d++) Editor.aoMover({ x: (x + d + 0.5) * t, y: (y + 0.5) * t });
                Editor.aoSoltar();
            }""", [x, y, n])
            await asyncio.sleep(1.2)

        async def parede_em(x, y, n):
            return await pg.evaluate("""([x, y, n]) => {
                const l = []; for (let d = 0; d < n; d++) l.push(Jogo.mapa.paredes[y][x + d]);
                return l.join(''); }""", [x, y, n])

        await pincelar(onde["x"], onde["y"], 4)
        ok("arrastar levanta a parede", await parede_em(onde["x"], onde["y"], 4) == "1111")

        await pg.click('[data-modo="derrubar"]')
        await asyncio.sleep(0.4)
        ok("o botão Derrubar fica marcado", await pg.evaluate(
            "() => document.querySelector('[data-modo=\"derrubar\"]').getAttribute('aria-pressed')") == "true")
        await pincelar(onde["x"], onde["y"], 4)
        ok("e arrastar DERRUBA a parede", await parede_em(onde["x"], onde["y"], 4) == "0000")

        # desfazer devolve a parede
        await pg.click('[data-modo="levantar"]')
        await asyncio.sleep(0.3)
        await pincelar(onde["x"], onde["y"], 4)
        ok("levantei de novo para testar o desfazer",
           await parede_em(onde["x"], onde["y"], 4) == "1111")
        await pg.click("#editor-desfazer")
        await asyncio.sleep(1.4)
        ok("Desfazer tira a parede que acabei de levantar",
           await parede_em(onde["x"], onde["y"], 4) == "0000")

        # trocar de ferramenta volta para levantar
        await pg.click('#editor [data-fer="mobilia"]')
        await asyncio.sleep(0.4)
        await pg.click('#editor [data-fer="parede"]')
        await asyncio.sleep(0.5)
        ok("trocar de ferramenta e voltar começa em Levantar", await pg.evaluate(
            "() => document.querySelector('[data-modo=\"levantar\"]').getAttribute('aria-pressed')") == "true")

        ok("nenhum erro de página", not erros)
        if erros:
            print("   ", erros)
        await nav.close()


asyncio.run(principal())
print("\n%d provas, %d falharam" % (len(provas), len(falhas)))
sys.exit(1 if falhas else 0)
