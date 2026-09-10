"""Colocar uma peça em cima de outra: monitor na mesa, tapete sob a mesa.

O clique no editor pega o móvel da MESMA camada da peça que está na mão. Sem
essa regra o clique agarrava o que estava por cima de qualquer camada, e era
impossível pôr um computador em cima de uma mesa.

ADMIN_SENHA=... .venv/bin/python testes/camadas.py
"""

import asyncio
import os
import sys

from playwright.async_api import async_playwright

END = os.environ.get("ENDERECO", os.environ.get("END", "http://127.0.0.1:8400"))
ADMIN = os.environ.get("ADMIN_EMAIL", "gulisboa5@hotmail.com")
SENHA = os.environ.get("ADMIN_SENHA", "")

provas = []
falhas = []


def conferir(nome, condicao):
    provas.append(nome)
    print(("  ok    " if condicao else "FALHOU  ") + nome)
    if not condicao:
        falhas.append(nome)


async def principal():
    async with async_playwright() as p:
        nav = await p.chromium.launch()
        pg = await (await nav.new_context(viewport={"width": 1280, "height": 800})).new_page()
        erros = []
        pg.on("pageerror", lambda e: erros.append(str(e)[:180]))
        await pg.goto(END)
        await asyncio.sleep(1.5)
        await pg.fill("#campo-email", ADMIN)
        await pg.fill("#campo-senha", SENHA)
        await pg.evaluate("() => entrar(false)")
        await pg.wait_for_function("() => typeof Jogo !== 'undefined' && !!Jogo.eu", timeout=40000)
        await asyncio.sleep(1.5)

        # guarda o que já existia: no fim só sai o que ESTE teste criou
        antigos = await pg.evaluate("() => Jogo.mapa.objetos.map(o => o.id)")

        # uma mesa preta num canto livre da sala de reunião
        base = await pg.evaluate("""() => {
          const z = Jogo.mapa.zonas.find(z => z.id === 'reuniao') || Jogo.mapa.zonas[0];
          return { x: z.x1 + 1, y: z.y1 + 1 };
        }""")
        await pg.evaluate("""(b) => Editor.enviar({ tipo: 'editar',
            acao: { acao: 'objeto', tipo: 'mesa_preta', x: b.x, y: b.y, g: 0 } })""", base)
        await asyncio.sleep(1.0)
        mesa = await pg.evaluate("""(b) => Jogo.mapa.objetos.find(
            o => o.tipo === 'mesa_preta' && o.x === b.x && o.y === b.y) || null""", base)
        conferir("a mesa preta entra no mapa", bool(mesa))
        if not mesa:
            await nav.close()
            return

        await pg.evaluate("() => { Editor.ativo = true; Editor.ferramenta = 'mobilia'; }")

        async def clicar(tipo, tx, ty):
            await pg.evaluate("""([tipo, tx, ty]) => {
              const t = Jogo.tile;
              Editor.tipoSel = tipo;
              Editor.aoApontar({ button: 0, altKey: false, shiftKey: false },
                               { x: (tx + 0.5) * t, y: (ty + 0.5) * t });
              Editor.aoSoltar();
            }""", [tipo, tx, ty])
            await asyncio.sleep(1.0)

        async def segurar(tipo, tx, ty):
            """Mesmo clique, mas com o botão preso: é o gesto de abrir o menu."""
            await pg.evaluate("""([tipo, tx, ty]) => {
              const t = Jogo.tile;
              Editor.tipoSel = tipo;
              Editor.aoApontar({ button: 0, altKey: false, shiftKey: false },
                               { x: (tx + 0.5) * t, y: (ty + 0.5) * t });
              Editor.arrasto.quando -= 900;          // como se tivesse segurado
              Editor.aoSoltar();
            }""", [tipo, tx, ty])
            await asyncio.sleep(1.0)

        async def quantos(tipo):
            return await pg.evaluate("(t) => Jogo.mapa.objetos.filter(o => o.tipo === t).length", tipo)

        # 1) monitor em cima da mesa preta
        antes = await quantos("monitor")
        await clicar("monitor", mesa["x"] + 1, mesa["y"])
        conferir("computador entra em cima da mesa preta", await quantos("monitor") > antes)

        # 2) teclado no tile ao lado, também em cima da mesa
        antes = await quantos("teclado")
        await clicar("teclado", mesa["x"] + 2, mesa["y"])
        conferir("teclado entra na mesma mesa", await quantos("teclado") > antes)

        # 3) clique seco COLOCA, mesmo em cima de outro móvel: era o que impedia
        #    pôr um gabinete numa mesa que já tinha teclado ou caneca
        antes = await quantos("monitor")
        await clicar("monitor", mesa["x"] + 1, mesa["y"])
        conferir("clique em cima de outro móvel coloca assim mesmo",
                 await quantos("monitor") == antes + 1)
        # segurar o botão é que abre o menu do que já está ali
        antes = await quantos("monitor")
        await segurar("monitor", mesa["x"] + 1, mesa["y"])
        conferir("segurar não coloca nada", await quantos("monitor") == antes)
        conferir("e abre o menu do móvel de cima",
                 await pg.evaluate("() => Editor.selecionado && Editor.selecionado.tipo") == "monitor")

        # 4) tapete (camada do piso) entra por baixo da mesa
        antes = await quantos("tapete")
        await clicar("tapete", mesa["x"], mesa["y"])
        conferir("tapete entra por baixo da mesa", await quantos("tapete") > antes)

        # 5) segurar com a cadeira na mão pega a MESA, que é da mesma camada
        antes = await quantos("cadeira")
        await segurar("cadeira", mesa["x"], mesa["y"])
        conferir("segurar com peça de chão na mão não coloca nada",
                 await quantos("cadeira") == antes)
        conferir("e o menu aberto é o da mesa",
                 await pg.evaluate("() => Editor.selecionado && Editor.selecionado.tipo") == "mesa_preta")

        conferir("nenhum erro de página", not erros)
        if erros:
            print("   ", erros)

        # limpa só o que este teste criou — nada do mapa de antes
        await pg.evaluate("""(antigos) => {
          const velhos = new Set(antigos);
          for (const o of Jogo.mapa.objetos.filter(o => !velhos.has(o.id)))
            Editor.enviar({ tipo: 'editar', acao: { acao: 'remover', id: o.id } });
        }""", antigos)
        await asyncio.sleep(1.2)
        await nav.close()


asyncio.run(principal())
print("\n%d provas, %d falharam" % (len(provas), len(falhas)))
sys.exit(1 if falhas else 0)
