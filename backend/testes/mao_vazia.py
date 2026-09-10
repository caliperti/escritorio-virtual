"""Mão vazia no editor: com uma peça armada o clique COLOCA; sem peça, o
clique volta a SELECIONAR, que é como se apaga ou gira um móvel do mapa.

    ADMIN_SENHA=... .venv/bin/python testes/mao_vazia.py
"""
import asyncio, os, sys
from playwright.async_api import async_playwright
ADMIN=os.environ.get("ADMIN_EMAIL","gulisboa5@hotmail.com"); SENHA=os.environ.get("ADMIN_SENHA","")
provas=[]; falhas=[]
def ok(n,c):
    provas.append(n); print(("  ok    " if c else "FALHOU  ")+n)
    if not c: falhas.append(n)
async def m():
    async with async_playwright() as p:
        nav=await p.chromium.launch(); pg=await (await nav.new_context(viewport={"width":1280,"height":860})).new_page()
        erros=[]; pg.on("pageerror", lambda e: erros.append(str(e)[:180]))
        await pg.goto(os.environ.get("ENDERECO", os.environ.get("END", "http://127.0.0.1:8400"))); await asyncio.sleep(1.4)
        await pg.fill("#campo-email",ADMIN); await pg.fill("#campo-senha",SENHA)
        await pg.evaluate("() => entrar(false)")
        await pg.wait_for_function("() => typeof Jogo!=='undefined' && !!Jogo.eu", timeout=40000)
        await asyncio.sleep(1.4)
        await pg.evaluate("() => { try{localStorage.removeItem('escritorio:painel');}catch(e){} if(!Editor.ativo) Editor.alternar(); Editor.ferramenta='mobilia'; }")
        await asyncio.sleep(0.9)
        ok("o editor abre com uma peça na mão", await pg.evaluate("() => !!Editor.tipoSel"))
        await pg.click("#editor-mao-vazia"); await asyncio.sleep(0.4)
        ok("o botão de mão vazia larga a peça", await pg.evaluate("() => Editor.tipoSel === null"))
        alvo = await pg.evaluate("""() => Jogo.mapa.objetos.find(o => (Jogo.mapa.catalogo[o.tipo]||{}).camada !== 'piso')""")
        n0 = await pg.evaluate("() => Jogo.mapa.objetos.length")
        await pg.evaluate("""(o) => { const t=Jogo.tile;
          Editor.aoApontar({button:0,altKey:false,shiftKey:false},{x:(o.x+0.5)*t,y:(o.y+0.5)*t});
          Editor.aoSoltar(); }""", alvo)
        await asyncio.sleep(0.9)
        ok("com a mão vazia, clique num móvel NÃO coloca nada",
           await pg.evaluate("() => Jogo.mapa.objetos.length") == n0)
        ok("e abre o menu dele", await pg.evaluate("() => !!document.querySelector('.menu-movel')"))
        ok("com o móvel selecionado, Delete apaga",
           await pg.evaluate("""async () => { const n=Jogo.mapa.objetos.length; Editor.removerSelecionado();
             await new Promise(r=>setTimeout(r,900)); return Jogo.mapa.objetos.length === n-1; }"""))
        # clique no chão de mão vazia não cria nada
        n1 = await pg.evaluate("() => Jogo.mapa.objetos.length")
        await pg.evaluate("""() => { const t=Jogo.tile;
          const tx=Math.floor(Jogo.eu.x/t)+3, ty=Math.floor(Jogo.eu.y/t);
          Editor.aoApontar({button:0,altKey:false,shiftKey:false},{x:(tx+0.5)*t,y:(ty+0.5)*t});
          Editor.aoSoltar(); }""")
        await asyncio.sleep(0.8)
        ok("e clique no chão vazio também não cria nada",
           await pg.evaluate("() => Jogo.mapa.objetos.length") == n1)
        # escolher uma peça volta a colocar
        await pg.evaluate("() => Editor.escolherPeca('planta')"); await asyncio.sleep(0.4)
        ok("escolher uma peça solta o botão de mão vazia",
           await pg.evaluate("() => document.getElementById('editor-mao-vazia').getAttribute('aria-pressed')") == "false")
        n2 = await pg.evaluate("() => Jogo.mapa.objetos.length")
        await pg.evaluate("""() => { const t=Jogo.tile;
          const tx=Math.floor(Jogo.eu.x/t)+3, ty=Math.floor(Jogo.eu.y/t);
          Editor.aoApontar({button:0,altKey:false,shiftKey:false},{x:(tx+0.5)*t,y:(ty+0.5)*t});
          Editor.aoSoltar(); }""")
        await asyncio.sleep(0.9)
        ok("e volta a colocar", await pg.evaluate("() => Jogo.mapa.objetos.length") == n2+1)
        await pg.evaluate("""() => { const p=Jogo.mapa.objetos.filter(o=>o.tipo==='planta');
          const u=p[p.length-1]; if(u) Editor.enviar({tipo:'editar',acao:{acao:'remover',id:u.id}}); }""")
        await asyncio.sleep(0.8)
        ok("nenhum erro de página", not erros)
        if erros: print("   ", erros)
        await nav.close()
asyncio.run(m())
print("\n%d provas, %d falharam" % (len(provas), len(falhas)))
sys.exit(1 if falhas else 0)
