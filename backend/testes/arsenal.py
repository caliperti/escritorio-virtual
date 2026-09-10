"""Prova de fogo do arsenal: busca, categoria, favorito, colocar e persistência.

    ../.venv/bin/python testes/arsenal.py

Precisa do servidor de pé em 8400 e do Playwright. Entra como ADMIN, porque
membro comum só edita dentro da sala que reivindicou — quem cuida dessa regra é
`testes/permissoes.py`.
"""
import asyncio, os, sys, time
from playwright.async_api import async_playwright
END = os.environ.get("ENDERECO", "http://127.0.0.1:8400")
erros, falhas, provas = [], [], 0

def conferir(nome, ok):
    global provas; provas += 1
    print(("  ok  " if ok else "FALHOU") + "  " + nome)
    if not ok: falhas.append(nome)

ADMIN = os.environ.get("ADMIN_EMAIL", "gulisboa5@hotmail.com")
SENHA = os.environ.get("ADMIN_SENHA", "")


async def entrar(pg, nome):
    await pg.goto(END); await asyncio.sleep(1.4)
    # o login agora é por e-mail: o campo de nome nem aparece na aba Entrar
    await pg.fill("#campo-email", ADMIN); await pg.fill("#campo-senha", SENHA)
    await pg.evaluate("() => entrar(false)")
    await pg.wait_for_function("() => typeof Jogo !== 'undefined' && !!Jogo.eu", timeout=40000)
    await asyncio.sleep(1.4)

async def m():
    async with async_playwright() as p:
        nav = await p.chromium.launch()
        ctx = await nav.new_context(viewport={"width": 1280, "height": 860})
        pg = await ctx.new_page()
        pg.on("pageerror", lambda e: erros.append(str(e)[:200]))
        pg.on("console", lambda c: erros.append("console: " + c.text[:200]) if c.type == "error" else None)
        await entrar(pg, ADMIN)
        await pg.evaluate("() => Editor.alternar()")
        await asyncio.sleep(1)

        contar = "() => document.querySelectorAll('#arsenal-corpo .peca').length"
        total = await pg.evaluate(contar)
        conferir("a grade mostra as peças (%d)" % total, total > 100)

        campo = await pg.query_selector("#arsenal-busca") or await pg.query_selector("input[type=search]")
        conferir("existe campo de busca", campo is not None)
        if campo:
            await campo.fill("gamer"); await asyncio.sleep(.7)
            n = await pg.evaluate(contar)
            conferir("buscar 'gamer' filtra (%d peças)" % n, 0 < n < total)
            await campo.fill("narguile"); await asyncio.sleep(.7)
            n2 = await pg.evaluate(contar)
            conferir("buscar 'narguile' acha os 6 modelos (%d)" % n2, n2 >= 5)
            await campo.fill(""); await asyncio.sleep(.6)

        # favoritar a primeira peça e recarregar
        marcou = await pg.evaluate("""() => {
            const b = document.querySelector('#arsenal-corpo .peca .coracao');
            if (!b) return null;
            b.click(); return true;
        }""")
        conferir("dá para favoritar", marcou is True)
        antes = await pg.evaluate("() => localStorage.getItem('escritorio:favoritos')")
        conferir("o favorito foi guardado", bool(antes and antes != '[]'))

        # colocar uma peça no mapa e conferir que o servidor gravou
        n0 = await pg.evaluate("() => Jogo.mapa.objetos.length")
        await pg.evaluate("""() => {
            Editor.usarFerramenta('mobilia');
            Editor.tipoSel = 'planta';
            Editor.acao({ acao: 'objeto', tipo: 'planta', x: 10, y: 21, g: 0 });
        }""")
        await asyncio.sleep(1.2)
        n1 = await pg.evaluate("() => Jogo.mapa.objetos.length")
        conferir("colocar peça aumenta o mapa (%d -> %d)" % (n0, n1), n1 == n0 + 1)

        await pg.reload(); await asyncio.sleep(1.4)
        await pg.evaluate("() => entrar(false)")
        await pg.wait_for_function("() => typeof Jogo !== 'undefined' && !!Jogo.eu", timeout=40000)
        await asyncio.sleep(1.4)
        await pg.evaluate("() => Editor.alternar()")   # a recarga fecha o editor
        await asyncio.sleep(.8)
        n2 = await pg.evaluate("() => Jogo.mapa.objetos.length")
        conferir("depois de recarregar a peça continua lá (%d)" % n2, n2 == n1)
        # o teste planta uma peça no escritório de verdade: tira antes de sair
        await pg.evaluate("""() => {
            const p = [...Jogo.mapa.objetos].reverse()
                .find(o => o.tipo === 'planta' && o.x === 10 && o.y === 21);
            if (p) Editor.acao({ acao: 'remover', id: p.id });
        }""")
        await asyncio.sleep(1)
        fav = await pg.evaluate("() => localStorage.getItem('escritorio:favoritos')")
        conferir("e o favorito também", fav == antes)

        clicou = await pg.evaluate("""() => {
            for (const b of document.querySelectorAll('#arsenal-cats button')) {
                if (b.textContent.includes('Conjuntos')) { b.click(); return true; }
            }
            return false;
        }""")
        await asyncio.sleep(.8)
        conferir("a categoria Conjuntos existe na fita", clicou is True)
        presets = await pg.evaluate("() => document.querySelectorAll('.arsenal-conjuntos .conjunto').length")
        conferir("os conjuntos prontos existem (%d)" % presets, presets >= 4)
        await nav.close()

asyncio.run(m())
print("\nerros de console:", erros or "nenhum")
print("%d provas, %d falharam" % (provas, len(falhas)))
sys.exit(1 if falhas else 0)
