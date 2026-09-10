"""A chamada não pode entrar em laço quando o P2P não fecha.

Sem TURN é comum a conexão falhar. Antes, falhar fechava a chamada e o vigia —
que roda a cada 250 ms — criava outra na hora: a câmera de quem estava do seu
lado ficava entrando e saindo sem parar. Aqui a gente força a falha e mede.

    ADMIN_SENHA=... .venv/bin/python testes/chamadas.py
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
        pg = await (await nav.new_context(viewport={"width": 1100, "height": 800})).new_page()
        erros = []
        pg.on("pageerror", lambda e: erros.append(str(e)[:180]))
        await pg.goto(END)
        await asyncio.sleep(1.4)
        await pg.fill("#campo-email", ADMIN)
        await pg.fill("#campo-senha", SENHA)
        await pg.evaluate("() => entrar(false)")
        await pg.wait_for_function("() => typeof Jogo !== 'undefined' && !!Jogo.eu", timeout=40000)
        await asyncio.sleep(1.4)

        # uma chamada de mentira com alguém que não existe: ninguém responde
        criou = await pg.evaluate("""() => {
            Midia.espera.clear();
            const par = Midia.garantirPar('fantasma');
            return !!par && Midia.pares.has('fantasma');
        }""")
        ok("a chamada é criada quando ainda não existe", criou)

        # força a falha, como faria uma rede que não deixa o P2P fechar
        estado = await pg.evaluate("""() => {
            const par = Midia.pares.get('fantasma');
            par.tentativas = 5;                     // já tentou refazer o ICE
            Object.defineProperty(par.pc, 'connectionState', { get: () => 'failed' });
            par.pc.onconnectionstatechange();
            return { aberta: Midia.pares.has('fantasma'),
                     espera: Midia.espera.get('fantasma') - Date.now() };
        }""")
        ok("depois de falhar de vez, a chamada é fechada", estado["aberta"] is False)
        ok("e fica um tempo de espera antes de tentar de novo", estado["espera"] > 1000)

        # o vigia roda a cada 250 ms: em 1 segundo não pode ter recriado
        await asyncio.sleep(1.0)
        ok("o vigia NÃO recria a chamada durante a espera",
           await pg.evaluate("""() => {
               for (let i = 0; i < 8; i++) Midia.garantirPar('fantasma');
               return !Midia.pares.has('fantasma');
           }"""))

        # mas um sinal que CHEGA fura a espera: o outro lado está tentando agora
        ok("sinal que chega fura a espera",
           await pg.evaluate("""() => {
               Midia.receberSinal('fantasma', {});
               return Midia.pares.has('fantasma');
           }"""))

        ok("nenhum erro de página", not erros)
        if erros:
            print("   ", erros)
        await pg.evaluate("() => { Midia.fechar('fantasma'); Midia.espera.clear(); }")
        await nav.close()


asyncio.run(principal())
print("\n%d provas, %d falharam" % (len(provas), len(falhas)))
sys.exit(1 if falhas else 0)
