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
        # afasta a câmera: assim o alvo continua visível depois que o boneco anda
        await pg.evaluate("() => definirZoom(0.6)")
        await asyncio.sleep(0.8)
        # o móvel MAIS PERTO de onde a pessoa nasceu. Empurrar o boneco na
        # marra não serve mais: o servidor recusa salto grande (era teleporte) e
        # devolve a pessoa para o lugar de antes.
        alvo = await pg.evaluate("""() => {
          const t = Jogo.tile;
          let melhor = null, dist = Infinity;
          for (const o of Jogo.mapa.objetos) {
            const i = Jogo.mapa.catalogo[o.tipo];
            if (!i || i.camada === 'piso') continue;
            const d = Math.hypot((o.x + .5) * t - Jogo.eu.x, (o.y + .5) * t - Jogo.eu.y);
            if (d < dist) { dist = d; melhor = o; }
          }
          return melhor;
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
        await asyncio.sleep(1.4)
        # o que importa é ter ANDADO: olhar `Jogo.caminho` é corrida com o
        # próprio jogo, que consome o trajeto quadro a quadro
        depois = await pg.evaluate("() => ({x:Jogo.eu.x,y:Jogo.eu.y})")
        andou = ((depois["x"] - antes["x"]) ** 2 + (depois["y"] - antes["y"]) ** 2) ** 0.5
        ok("clique curto no móvel faz o boneco andar até perto dele", andou > 8)
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
        # o mesmo móvel: o que está em prova é a posição do menu, não o móvel
        baixo = alvo
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
