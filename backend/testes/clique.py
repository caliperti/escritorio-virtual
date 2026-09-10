"""Prova o gesto do mouse no mapa: clique curto anda, segurar abre o menu do
móvel, o menu nunca sai da tela e dá para largar a peça que está na mão."""
import asyncio, os, sys, time
from playwright.async_api import async_playwright
ADMIN = os.environ.get("ADMIN_EMAIL", "gulisboa5@hotmail.com")
SENHA = os.environ.get("ADMIN_SENHA", "")
provas=[]; falhas=[]
def ok(n,c):
    provas.append(n); print(("  ok    " if c else "FALHOU  ")+n)
    if not c: falhas.append(n)
async def m():
    async with async_playwright() as p:
        nav=await p.chromium.launch(); ctx=await nav.new_context(viewport={"width":1280,"height":800})
        pg=await ctx.new_page(); erros=[]; pg.on("pageerror", lambda e: erros.append(str(e)[:180]))
        await pg.goto("http://127.0.0.1:8400"); await asyncio.sleep(1.5)
        await pg.fill("#campo-email", ADMIN); await pg.fill("#campo-senha", SENHA)
        await pg.evaluate("() => entrar(false)")
        await pg.wait_for_function("() => typeof Jogo!=='undefined' && !!Jogo.eu", timeout=40000)
        await asyncio.sleep(1.5)
        alvo = await pg.evaluate("""() => {
          const t=Jogo.tile;
          const o = Jogo.mapa.objetos.find(o=>o.tipo==='mesa') || Jogo.mapa.objetos[0];
          Jogo.eu.x=(o.x+0.5)*t; Jogo.eu.y=(o.y+3.5)*t; Jogo.eu.xr=Jogo.eu.x; Jogo.eu.yr=Jogo.eu.y;
          return o;
        }""")
        await asyncio.sleep(0.9)          # a câmera precisa alcançar o boneco
        async def naTela(o, dx=0.5, dy=0.5):
            return await pg.evaluate("""([o,dx,dy]) => { const t=Jogo.tile, r=tela.getBoundingClientRect();
              return {x:r.left+((o.x+dx)*t-Jogo.camera.x)*ESCALA, y:r.top+((o.y+dy)*t-Jogo.camera.y)*ESCALA}; }""",[o,dx,dy])
        c = await naTela(alvo)
            # 1) clique curto em cima do móvel = andar, sem menu
        antes = await pg.evaluate("() => ({x:Jogo.eu.x,y:Jogo.eu.y})")
        await pg.mouse.click(c["x"], c["y"]); await asyncio.sleep(0.5)
        ok("clique curto no móvel não abre menu", not await pg.evaluate("() => !!document.querySelector('.menu-movel')"))
        ok("clique curto no móvel traça caminho", await pg.evaluate("() => !!Jogo.caminho"))
        await asyncio.sleep(1.4)
        # 2) segurar em cima do móvel abre o menu (a câmera andou: recalcula)
        c = await naTela(alvo)
        await pg.mouse.move(c["x"], c["y"]); await pg.mouse.down(); await asyncio.sleep(0.7); await pg.mouse.up()
        await asyncio.sleep(0.5)
        ok("segurar o botão abre o menu do móvel", await pg.evaluate("() => !!document.querySelector('.menu-movel')"))
        # 3) o menu cabe dentro do palco
        cx = await pg.evaluate("""() => { const m=document.querySelector('.menu-movel'); if(!m) return null;
          const c=m.getBoundingClientRect(), p=document.querySelector('.palco').getBoundingClientRect();
          return {dentro: c.left>=p.left-1 && c.right<=p.right+1 && c.top>=p.top-1 && c.bottom<=p.bottom+1,
                  c:{l:c.left,t:c.top,r:c.right,b:c.bottom}, p:{l:p.left,t:p.top,r:p.right,b:p.bottom}}; }""")
        ok("menu do móvel fica dentro do palco", bool(cx and cx["dentro"]))
        if cx and not cx["dentro"]: print("    ", cx)
        # 4) mover mostra a faixa e o Cancelar solta
        await pg.click('.menu-movel [data-fazer="mover"]'); await asyncio.sleep(0.5)
        ok("aparece a faixa de 'na mão'", await pg.evaluate("() => !!document.getElementById('na-mao')"))
        await pg.click('#na-mao button'); await asyncio.sleep(0.4)
        ok("Cancelar larga o móvel", await pg.evaluate("() => Editor.movendo === null"))
        ok("e a faixa some", not await pg.evaluate("() => !!document.getElementById('na-mao')"))
        # 5) menu perto do rodapé também cabe
        baixo = await pg.evaluate("""() => { const t=Jogo.tile;
          const o = Jogo.mapa.objetos.slice().sort((a,b)=>b.y-a.y)[0];
          Jogo.eu.x=(o.x+0.5)*t; Jogo.eu.y=(o.y-1.5)*t; Jogo.eu.xr=Jogo.eu.x; Jogo.eu.yr=Jogo.eu.y; return o; }""")
        await asyncio.sleep(1.2)
        cb = await naTela(baixo)
        await pg.mouse.move(cb["x"], cb["y"]); await pg.mouse.down(); await asyncio.sleep(0.7); await pg.mouse.up()
        await asyncio.sleep(0.5)
        cx2 = await pg.evaluate("""() => { const m=document.querySelector('.menu-movel'); if(!m) return null;
          const c=m.getBoundingClientRect(), p=document.querySelector('.palco').getBoundingClientRect();
          return c.bottom<=p.bottom+1 && c.right<=p.right+1; }""")
        ok("menu de móvel lá embaixo não sai da tela", cx2 is not False)
        ok("nenhum erro de página", not erros)
        if erros: print("   ", erros)
        await nav.close()
asyncio.run(m())
print("\n%d provas, %d falharam" % (len(provas), len(falhas)))
sys.exit(1 if falhas else 0)
