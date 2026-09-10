"""O teclado e o foco, por uso real.

O que dava errado antes:
  - a tela de entrada obedecia aos atalhos do jogo: E deixava o editor "ligado"
    sem painel (e cada clique no mapa, depois, colocava uma mesa), R e B
    estouravam com `Jogo.eu` nulo, e o Enter num botão focado era engolido —
    quem entrava pelo teclado não conseguia apertar "Entrar";
  - ⌘C/Ctrl+C abria a grade da reunião, Ctrl+V ligava a câmera, ⌘+ virava
    zoom do mapa;
  - tecla segurada repetia: o microfone piscava ligado/desligado;
  - Tab era sempre "rebater o painel": o teclado nunca alcançava botão nenhum,
    e Enter num botão focado abria o chat em vez de apertar o botão;
  - Enter com o painel escondido ficava mudo (o campo do chat estava em
    display:none e não recebe foco);
  - B com o editor do boneco aberto reabria e descartava a escolha feita.

    ENDERECO=http://127.0.0.1:8412 .venv/bin/python testes/teclado.py
"""

import asyncio

from playwright.async_api import async_playwright

from comum import ENDERECO, SUFIXO, Sessao, conferir, fechar

erros = []
falhas = 0

ESPERA = "() => typeof Jogo !== 'undefined' && !!Jogo.eu"
FOCO = "() => document.activeElement === document.body ? 'body' : (document.activeElement.id || document.activeElement.tagName)"
SEM_LATERAL = "() => document.getElementById('app').classList.contains('sem-lateral')"
MENSAGENS = "(t) => [...document.querySelectorAll('#mensagens .msg')].filter(m => m.textContent.includes(t)).length"


def c(rotulo, valor, esperado=True):
    global falhas
    if not conferir(rotulo, valor, esperado):
        falhas += 1


async def main():
    async with async_playwright() as p:
        nav = await p.chromium.launch()
        s = Sessao(nav, erros)

        # --- tela de entrada: o teclado é do navegador, não do jogo ---
        ctx = await nav.new_context(viewport={"width": 1200, "height": 820})
        pg = await ctx.new_page()
        pg.on("pageerror", lambda e: erros.append(("entrada", str(e)[:160])))
        await pg.goto(ENDERECO)
        await asyncio.sleep(1.2)
        await pg.focus("#btn-entrar")
        await pg.keyboard.press("Enter")
        await asyncio.sleep(0.4)
        c("Enter num botão da entrada aperta o botão",
          await pg.text_content("#aviso-entrada"), "Preencha e-mail e senha.")
        await pg.focus("#aba-visitante")
        await pg.keyboard.press("Enter")
        await asyncio.sleep(0.2)
        c("Enter na aba Visitante troca a aba", await pg.get_attribute("#aba-visitante", "aria-pressed"), "true")
        await pg.focus("#aba-entrar")
        for tecla in ["e", "r", "b", "c", "Tab"]:
            await pg.keyboard.press(tecla)
        await asyncio.sleep(0.3)
        c("atalhos do jogo ficam quietos na entrada",
          await pg.evaluate("() => !Editor.ativo && !Reuniao.ativa"))
        c("e não estouram", [e for e in erros if e[0] == "entrada"], [])
        await ctx.close()

        # --- dentro da sala ---
        a = await s.entrar("Tecla")

        await a.keyboard.press("Control+c")
        await a.keyboard.press("Meta+c")
        await asyncio.sleep(0.2)
        c("Ctrl+C e ⌘C (copiar) não abrem a grade da reunião", await a.evaluate("() => Reuniao.ativa"), False)
        n0 = await a.evaluate(MENSAGENS, "Câmera")
        await a.keyboard.press("Control+v")
        await asyncio.sleep(0.5)
        c("Ctrl+V (colar) não mexe na câmera", await a.evaluate(MENSAGENS, "Câmera"), n0)
        z0 = await a.evaluate("() => ESCALA")
        await a.keyboard.press("Meta+=")
        await asyncio.sleep(0.2)
        c("⌘+ fica com o navegador, o mapa não muda de zoom", await a.evaluate("() => ESCALA"), z0)

        # tecla segurada: um keydown normal e quatro repetidos valem UM toque
        m0 = await a.evaluate(MENSAGENS, "Microfone")
        await a.keyboard.press("m")
        await asyncio.sleep(0.5)
        m1 = await a.evaluate(MENSAGENS, "Microfone")
        await a.evaluate("""() => { for (let i = 0; i < 5; i++) document.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'm', repeat: i > 0, bubbles: true })); }""")
        await asyncio.sleep(0.6)
        m2 = await a.evaluate(MENSAGENS, "Microfone")
        c("M segurada vale um toque só (mensagens de um toque: %d)" % (m1 - m0), m2 - m1, m1 - m0)

        # Tab: sem nada focado rebate o painel; com um botão focado, anda
        await a.evaluate("() => document.activeElement.blur()")
        await a.keyboard.press("Tab")
        await asyncio.sleep(0.2)
        c("Tab sem nada focado esconde o painel", await a.evaluate(SEM_LATERAL))
        await a.keyboard.press("Tab")
        await asyncio.sleep(0.2)
        c("e mostra de novo", await a.evaluate(SEM_LATERAL), False)
        await a.focus("#btn-mic")
        await a.keyboard.press("Tab")
        await asyncio.sleep(0.2)
        c("Tab com um botão focado vai para o próximo botão", await a.evaluate(FOCO), "btn-cam")
        c("e não rebate o painel", await a.evaluate(SEM_LATERAL), False)
        await a.focus("#btn-reuniao")
        await a.keyboard.press("Enter")
        await asyncio.sleep(0.3)
        c("Enter no botão focado aperta o botão (abre a grade)", await a.evaluate("() => Reuniao.ativa"))
        await a.keyboard.press("Escape")
        await asyncio.sleep(0.2)
        c("Esc fecha a grade", await a.evaluate("() => Reuniao.ativa"), False)
        await a.click("#btn-reacao")
        await asyncio.sleep(0.2)
        c("clique de mouse na barra devolve o teclado ao jogo", await a.evaluate(FOCO), "body")

        # Enter com o painel escondido: abre o painel e foca o chat
        await a.evaluate("() => alternarLateral(false)")
        await a.keyboard.press("Enter")
        await asyncio.sleep(0.3)
        c("Enter com o painel escondido abre o painel", await a.evaluate(SEM_LATERAL), False)
        c("e foca o campo do chat", await a.evaluate(FOCO), "campo-chat")
        await a.keyboard.press("Escape")

        # B: abre, a escolha fica, B fecha (como o E faz com o editor do escritório)
        await a.keyboard.press("b")
        await asyncio.sleep(0.3)
        c("B abre o editor do boneco",
          await a.evaluate("() => !document.getElementById('modal-boneco').classList.contains('oculto')"))
        antes = await a.evaluate("() => JSON.stringify(editorSala.ver())")
        await a.evaluate("""() => { const b = [...document.querySelectorAll('#opcoes-editar .fileira')[0]
            .querySelectorAll('button')].find(b => b.getAttribute('aria-pressed') !== 'true'); b.click(); }""")
        c("a escolha muda a prévia", await a.evaluate("() => JSON.stringify(editorSala.ver())") != antes)
        await a.keyboard.press("b")
        await asyncio.sleep(0.3)
        c("B de novo fecha o editor do boneco",
          await a.evaluate("() => document.getElementById('modal-boneco').classList.contains('oculto')"))

        # a conta entra em outro lugar: esta janela cai para a entrada e o
        # teclado volta a ser do navegador
        ctx2 = await nav.new_context(viewport={"width": 1200, "height": 820})
        pg2 = await ctx2.new_page()
        await pg2.goto(ENDERECO)
        await asyncio.sleep(1.2)
        await pg2.fill("#campo-email", "tecla" + SUFIXO + "@teste.local")
        await pg2.fill("#campo-senha", "teste1234")
        await pg2.evaluate("() => entrar(false)")
        await pg2.wait_for_function(ESPERA, timeout=40000)
        await asyncio.sleep(1.0)
        c("a janela antiga voltou para a entrada", await a.is_visible("#entrada"))
        await a.focus("#aba-entrar")
        for tecla in ["e", "r", "b", "c", "Enter"]:
            await a.keyboard.press(tecla)
        await asyncio.sleep(0.3)
        c("na entrada de 'sessão recusada' os atalhos também ficam quietos",
          await a.evaluate("() => !Editor.ativo && !Reuniao.ativa"))

        await nav.close()
    fechar("teclado", falhas, erros)


asyncio.run(main())
