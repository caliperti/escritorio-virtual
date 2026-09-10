"""Regras da sala: botão de trancar e destrancar na barra, e a sala de
reunião que abre câmera e microfone de quem entra.

O botão de trancar só existia num cartão que aparece uma vez por sessão: depois
de trancar, não sobrava nenhum jeito de destrancar.

    ADMIN_SENHA=... .venv/bin/python testes/sala_regras.py
"""
import asyncio, os, sys
from playwright.async_api import async_playwright
END=os.environ.get("ENDERECO","http://127.0.0.1:8400")
ADMIN=os.environ.get("ADMIN_EMAIL","gulisboa5@hotmail.com"); SENHA=os.environ.get("ADMIN_SENHA","")
provas=[]; falhas=[]
def ok(n,c):
    provas.append(n); print(("  ok    " if c else "FALHOU  ")+n)
    if not c: falhas.append(n)
async def m():
    async with async_playwright() as p:
        nav=await p.chromium.launch(args=["--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream"])
        ctx=await nav.new_context(viewport={"width":1280,"height":860}, permissions=["microphone","camera"])
        pg=await ctx.new_page(); erros=[]; pg.on("pageerror", lambda e: erros.append(str(e)[:180]))
        await pg.goto(END); await asyncio.sleep(1.4)
        await pg.fill("#campo-email",ADMIN); await pg.fill("#campo-senha",SENHA)
        await pg.evaluate("() => entrar(false)")
        await pg.wait_for_function("() => typeof Jogo!=='undefined' && !!Jogo.eu", timeout=40000)
        await asyncio.sleep(1.6)
        # entra numa sala livre e reivindica
        z = await pg.evaluate("""() => { const t=Jogo.tile;
          const z=Jogo.mapa.zonas.find(z=>z.privada && z.id!=='reuniao' && !z.dono_nome);
          const x=(z.x1+z.x2+1)/2*t, y=(z.y1+z.y2+1)/2*t;
          Jogo.caminho = tracarCaminho(Jogo.eu.x, Jogo.eu.y, x, y) || caminhoPertoDe({x, y});
          return {z, x, y}; }""")
        # anda de VERDADE: o servidor recusa salto grande, e reivindicar exige
        # estar dentro da sala pela posição que o SERVIDOR conhece
        await pg.wait_for_function("""([x,y]) => Math.hypot(Jogo.eu.x-x, Jogo.eu.y-y) < 40 || !Jogo.caminho""",
                                   arg=[z["x"], z["y"]], timeout=40000)
        await asyncio.sleep(1.0)
        await pg.evaluate("(id) => enviar({tipo:'sala', acao:'reivindicar', id})", z["z"]["id"])
        await asyncio.sleep(1.6)
        z = z["z"]
        ok("o botão de trancar aparece na minha sala",
           not await pg.evaluate("() => document.getElementById('btn-trancar').hidden"))
        ok("e começa dizendo Trancar",
           "Trancar" in await pg.evaluate("() => document.getElementById('btn-trancar').textContent"))
        await pg.click("#btn-trancar"); await asyncio.sleep(1.6)
        ok("clicar tranca a sala", await pg.evaluate("(id) => { const z=Jogo.mapa.zonas.find(z=>z.id===id); return !!z.trancada; }", z["id"]))
        ok("e o botão vira Destrancar",
           "Destrancar" in await pg.evaluate("() => document.getElementById('btn-trancar').textContent"))
        await pg.click("#btn-trancar"); await asyncio.sleep(1.6)
        ok("clicar de novo DESTRANCA", not await pg.evaluate("(id) => { const z=Jogo.mapa.zonas.find(z=>z.id===id); return !!z.trancada; }", z["id"]))
        ok("e o botão volta para Trancar",
           "Trancar" in await pg.evaluate("() => document.getElementById('btn-trancar').textContent")
           and "Destrancar" not in await pg.evaluate("() => document.getElementById('btn-trancar').textContent"))
        # sair da sala esconde o botão
        await pg.evaluate("""() => { const t=Jogo.tile;
          const x=9.5*t, y=19.5*t;
          Jogo.caminho = tracarCaminho(Jogo.eu.x, Jogo.eu.y, x, y) || caminhoPertoDe({x, y}); }""")
        await pg.wait_for_function("() => !zonaDe(Jogo.eu.x, Jogo.eu.y) || zonaDe(Jogo.eu.x, Jogo.eu.y).id === 'circulacao'", timeout=40000)
        await asyncio.sleep(1.0)
        ok("fora da sala o botão some", await pg.evaluate("() => document.getElementById('btn-trancar').hidden"))
        # sala de reunião abre câmera e microfone
        await pg.evaluate("() => { Midia.desligar('audio'); Midia.desligar('video'); }")
        await asyncio.sleep(0.5)
        await pg.evaluate("""() => { const t=Jogo.tile;
          const z=Jogo.mapa.zonas.find(z=>z.id==='reuniao');
          const x=(z.x1+z.x2+1)/2*t, y=(z.y1+z.y2+1)/2*t;
          Jogo.caminho = tracarCaminho(Jogo.eu.x, Jogo.eu.y, x, y) || caminhoPertoDe({x, y}); }""")
        await pg.wait_for_function("() => { const z=zonaDe(Jogo.eu.x,Jogo.eu.y); return !!z && z.id==='reuniao'; }", timeout=40000)
        await asyncio.sleep(3.0)
        ok("entrar na sala de reunião abre o microfone", await pg.evaluate("() => Midia.ligado('audio')"))
        ok("e abre a câmera", await pg.evaluate("() => Midia.ligado('video')"))
        # solta a sala para não deixar sujeira
        await pg.evaluate("(id) => enviar({tipo:'sala', acao:'liberar', id})", z["id"])
        await asyncio.sleep(1.0)
        ok("nenhum erro de página", not erros)
        if erros: print("   ", erros)
        await nav.close()
asyncio.run(m())
print("\n%d provas, %d falharam" % (len(provas), len(falhas)))
sys.exit(1 if falhas else 0)
