"""Os lugares (27/11): o Escritório e o Pingou, num navegador de verdade.

Confere: a entrada pergunta onde entrar e cada lugar tem a sua chave; quem está
num lugar não vê nem ouve quem está no outro, mas a lista mostra os dois; a
porta de saída abre "Para onde você quer ir?"; sem a chave, o pedido aparece
(com som) para quem está lá dentro, que deixa ou não; com a chave (digitada na
janela) entra direto; voltar pela porta; "Ir até" alguém do outro lugar; o chat
"todos" chega aos dois lugares; a conta que ainda não tem o lugar pede a chave
uma vez só.

    EXTRA="SENHA_PINGOU=Pingou" /Volumes/SSD/bets-documentos/temporarios-claude/religar-teste.sh
    ENDERECO=http://127.0.0.1:8411 CONVITE=teste123 .venv/bin/python testes/lugares.py
"""
import asyncio
import os
import sys

from playwright.async_api import async_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import codara  # noqa: E402
from codara import CONVITE, END, MARCA, andar, ok  # noqa: E402

CHAVE_PINGOU = os.environ.get("CHAVE_PINGOU", "Pingou")
CHAVE_ARENA = os.environ.get("CHAVE_ARENA", "arenasete")
CAPTURAS = os.environ.get("CAPTURAS", "")


async def abrir(nav):
    ctx = await nav.new_context(viewport={"width": 1500, "height": 900}, permissions=["microphone", "camera"])
    pg = await ctx.new_page()
    pg.erros = []
    pg.on("pageerror", lambda e: pg.erros.append(str(e)[:200]))
    await pg.goto(END)
    await asyncio.sleep(1.0)
    return pg


async def entrar_em(nav, nome, lugar, chave, modo="criar", email=None):
    pg = await abrir(nav)
    await pg.click("#aba-" + modo)
    if modo != "visitante":
        await pg.fill("#campo-email", email or (nome.lower() + MARCA + "@teste.local"))
        await pg.fill("#campo-senha", "teste1234")
    if modo != "entrar":
        await pg.fill("#campo-nome", nome)
    await pg.evaluate("(l) => escolherLugar(l)", lugar)
    if modo != "entrar":
        await pg.fill("#campo-convite", chave)
    if modo == "criar":
        # o Pingou tem galeria de personagens: escolhe o primeiro livre
        await asyncio.sleep(0.6)
        pg.personagem = await pg.evaluate("""() => {
            if (document.getElementById('galeria-lugar').hidden) return null;
            const b = document.querySelector('#galeria-personagens button:not([disabled])');
            if (b) b.click();
            return b ? b.dataset.personagem : null; }""")
    await pg.evaluate("() => entrar(true)")
    return pg


async def dentro(pg, segundos=30):
    try:
        await pg.wait_for_function("() => !!Jogo.eu && !!Jogo.mapa && !!Jogo.espaco", timeout=segundos * 1000)
        await asyncio.sleep(1.0)
        return True
    except Exception:
        return False


async def lugar(pg):
    return await pg.evaluate("() => Jogo.espaco && Jogo.espaco.id")


async def esperar_lugar(pg, id_, segundos=15):
    try:
        await pg.wait_for_function("(id) => Jogo.espaco && Jogo.espaco.id === id && Jogo.ws.readyState === 1",
                                   arg=id_, timeout=segundos * 1000)
        await asyncio.sleep(1.0)
        return True
    except Exception:
        return False


async def ir_para_a_porta(pg):
    """Anda até a porta de saída do lugar em que está (a janela abre sozinha)."""
    s = await pg.evaluate("() => Jogo.mapa.cenario.saida")
    await andar(pg, (s[0] + s[2]) / 2, s[1] + 12)
    try:
        await pg.wait_for_function("() => Saida.aberta", timeout=5000)
        return True
    except Exception:
        return False


async def texto(pg, sel):
    return await pg.evaluate("(s) => { const e = document.querySelector(s); return e ? e.innerText : ''; }", sel)


async def main():
    async with async_playwright() as p:
        nav = await p.chromium.launch(args=[
            "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
            "--autoplay-policy=no-user-gesture-required"])

        # ---- a entrada pergunta onde entrar
        pg = await abrir(nav)
        opcoes = await pg.evaluate("() => [...document.querySelectorAll('#lugares-entrada button')].map(b => b.innerText)")
        ok("a entrada pergunta onde entrar: Escritório, Pingou ou Arena 7",
           opcoes == ["Escritório", "Pingou", "Arena 7"], opcoes)
        await pg.close()

        # ---- conta nova no Pingou com a chave errada
        x = await entrar_em(nav, "Xavier", "pingou", "errada")
        await asyncio.sleep(1.5)
        aviso = await texto(x, "#aviso-entrada")
        ok("chave errada do Pingou não cria a conta", "Chave de acesso do Pingou errada" in aviso, aviso)
        await x.close()

        # ---- Gustavo no Escritório; a porta com o Pingou vazio
        a = await entrar_em(nav, "Gustavo", "escritorio", CONVITE)
        ok("Gustavo entra no Escritório", await dentro(a) and await lugar(a) == "escritorio")
        ok("a porta de saída abre 'Para onde você quer ir?'", await ir_para_a_porta(a))
        cartoes = await a.evaluate("""() => [...document.querySelectorAll('#lugares-saida .cartao-lugar')].map(c => ({
            nome: c.querySelector('b').innerText, aqui: c.classList.contains('aqui'),
            chave: !!c.querySelector('.chave-lugar'),
            pedir: (c.querySelector('.pedir-lugar') || {}).disabled }))""")
        ok("o Escritório é 'você está aqui'; o Pingou pede a chave", cartoes[0]["aqui"] and cartoes[1]["chave"], cartoes)
        ok("com o Pingou vazio, não dá para pedir", cartoes[1]["pedir"] is True, cartoes)
        if CAPTURAS:
            await a.screenshot(path=os.path.join(CAPTURAS, "porta-saida.png"))
        await a.keyboard.press("Escape")
        await asyncio.sleep(1.5)
        ok("Esc fecha e o boneco volta um passo (não reabre)",
           await a.evaluate("() => !Saida.aberta && !Saida.dentro(Jogo.eu)"))

        # ---- Paula cria a conta no Pingou com a chave dele
        pp = await entrar_em(nav, "Paula", "pingou", CHAVE_PINGOU.lower())
        ok("Paula cria a conta no Pingou (a chave vale sem maiúscula)", await dentro(pp) and await lugar(pp) == "pingou")
        ok("o cabeçalho diz Pingou", await texto(pp, "#titulo-lugar") == "Pingou")
        await asyncio.sleep(1.0)
        ve = await a.evaluate("() => [...Jogo.pessoas.values()].some(p => p.nome === 'Paula')")
        lista = await texto(a, "#lista-pessoas")
        ok("quem está no Escritório não vê a Paula no mapa", not ve)
        ok("mas a lista mostra 'No Pingou (1)' com ela", "No Pingou (1)" in lista and "Paula" in lista, lista)

        # ---- Gustavo pede para entrar; Paula deixa
        await ir_para_a_porta(a)
        await a.wait_for_function("() => { const b = document.querySelector('#lugares-saida .pedir-lugar'); return b && !b.disabled; }", timeout=5000)
        await a.click("#lugares-saida .pedir-lugar")
        try:
            await pp.wait_for_function("() => (document.getElementById('pedido-sala') || {}).innerText?.includes('quer entrar no Pingou')", timeout=5000)
            chegou = True
        except Exception:
            chegou = False
        ok("o pedido aparece na tela de quem está no Pingou", chegou, await texto(pp, "#pedido-sala"))
        try:        # a resposta do servidor chega logo depois do cartão do outro lado
            await a.wait_for_function("() => document.getElementById('aviso-saida').innerText.includes('Esperando')", timeout=5000)
        except Exception:
            pass
        esperando = await texto(a, "#aviso-saida")
        ok("e quem pediu vê que está esperando", "Esperando" in esperando, esperando)
        if CAPTURAS:
            await pp.screenshot(path=os.path.join(CAPTURAS, "pedido-pingou.png"))
        await pp.click("#pedido-sala button.ok")
        ok("Paula deixa: Gustavo vai para o Pingou", await esperar_lugar(a, "pingou"))
        ve = await pp.evaluate("() => [...Jogo.pessoas.values()].some(p => p.nome === 'Gustavo')")
        ok("e os dois se veem lá", ve)
        chat = await texto(a, "#mensagens")
        ok("Gustavo fica sabendo quem deixou", "Paula deixou você entrar no Pingou" in chat)
        await andar(a, 600, 500)
        await andar(pp, 680, 500)
        id_p = await pp.evaluate("() => Jogo.eu.id")
        try:
            await a.wait_for_function("(id) => Midia.pares.has(id)", arg=id_p, timeout=15000)
            conversam = True
        except Exception:
            conversam = False
        ok("no Pingou, perto, os dois conversam", conversam)

        # ---- chat "todos" chega aos dois lugares
        b = await entrar_em(nav, "Bruno", "escritorio", CONVITE)
        await dentro(b)
        await pp.evaluate("() => enviar({ tipo: 'chat', texto: 'oi de todos 77', escopo: 'todos' })")
        await asyncio.sleep(0.8)
        chat = await texto(b, "#mensagens")
        ok("o 'todos' do Pingou chega no Escritório, dizendo de onde", "oi de todos 77" in chat and "todos · Pingou" in chat)

        # ---- Bruno pede; Paula recusa
        await ir_para_a_porta(b)
        await b.wait_for_function("() => { const b = document.querySelector('#lugares-saida .pedir-lugar'); return b && !b.disabled; }", timeout=5000)
        await b.click("#lugares-saida .pedir-lugar")
        await pp.wait_for_function("() => (document.getElementById('pedido-sala') || {}).innerText?.includes('Bruno')", timeout=5000)
        # a Gustavo também recebeu (está no Pingou): quando a Paula responde, some da tela dele
        tinha = await a.evaluate("() => (document.getElementById('pedido-sala') || {}).innerText || ''")
        await pp.click("#pedido-sala button:not(.ok)")
        await asyncio.sleep(1.0)
        recusa = await texto(b, "#aviso-saida")
        ok("Paula recusa: Bruno fica sabendo e continua no Escritório",
           "não deixou você entrar" in recusa and await lugar(b) == "escritorio", recusa)
        sumiu = await a.evaluate("() => !document.getElementById('pedido-sala')")
        ok("o pedido apareceu para os dois do Pingou e sumiu da tela do outro quando um respondeu",
           "Bruno" in tinha and sumiu, tinha)

        # ---- Bruno digita a chave na janela
        await b.fill("#lugares-saida .chave-lugar input", "errada")
        await b.click("#lugares-saida .chave-lugar button")
        await asyncio.sleep(0.8)
        ok("chave errada na janela: avisa", "errada" in await texto(b, "#aviso-saida"))
        await b.fill("#lugares-saida .chave-lugar input", CHAVE_PINGOU)
        await b.click("#lugares-saida .chave-lugar button")
        ok("com a chave certa, Bruno entra no Pingou", await esperar_lugar(b, "pingou"))

        # ---- Gustavo volta pela porta
        await ir_para_a_porta(a)
        botao = await a.evaluate("() => [...document.querySelectorAll('#lugares-saida button.ok')].map(b => b.innerText)")
        ok("no Pingou, a porta oferece 'Ir para o Escritório'", "Ir para o Escritório" in botao, botao)
        await a.click("#lugares-saida button.ok")
        ok("e Gustavo volta para o Escritório", await esperar_lugar(a, "escritorio"))
        chat = await texto(pp, "#mensagens")
        ok("quem ficou vê 'Gustavo foi para o Escritório'", "Gustavo foi para o Escritório" in chat)

        # ---- "Ir até" alguém do outro lugar (Gustavo tem o passe do dia)
        li = "#lista-pessoas li.outro-lugar[data-id='%s']" % id_p
        await a.click(li + " > span:nth-child(2)")
        ok("'Ir até' a Paula, no Pingou: Gustavo troca de lugar", await esperar_lugar(a, "pingou"))
        try:
            await a.wait_for_function("(id) => { const p = Jogo.pessoas.get(id); return p && !Jogo.caminho && Math.hypot(Jogo.eu.x - p.x, Jogo.eu.y - p.y) < 110; }",
                                      arg=id_p, timeout=20000)
            perto = True
        except Exception:
            perto = False
        ok("  e anda até ela", perto)

        # ---- conta do Escritório que entra pela primeira vez no Pingou, pelo login
        email_c = "carla" + MARCA + "@teste.local"
        c = await entrar_em(nav, "Carla", "escritorio", CONVITE, email=email_c)
        await dentro(c)
        await c.evaluate("() => { localStorage.removeItem('escritorio:token'); }")
        await c.close()
        c = await entrar_em(nav, "Carla", "pingou", "", modo="entrar", email=email_c)
        await asyncio.sleep(2.5)
        pede = await c.evaluate("() => !document.getElementById('linha-convite').hidden")
        aviso = await texto(c, "#aviso-entrada")
        ok("conta sem o Pingou, pelo login: pede a chave dele", pede and "Digite a chave" in aviso, aviso)
        await c.fill("#campo-convite", CHAVE_PINGOU)
        await c.evaluate("() => entrar(true)")
        ok("  e com a chave, entra", await dentro(c) and await lugar(c) == "pingou")
        conta = await c.evaluate("async () => (await (await fetch('/conta/eu?token=' + encodeURIComponent(localStorage.getItem('escritorio:token')))).json()).conta.espacos")
        ok("  e a conta fica com os dois lugares (não pede de novo)", sorted(conta) == ["escritorio", "pingou"], conta)

        # ---- visitante: a chave do Escritório na entrada, a do Pingou na porta, e volta
        v = await entrar_em(nav, "Vera", "escritorio", CONVITE, modo="visitante")
        ok("visitante entra no Escritório com a chave dele", await dentro(v) and await lugar(v) == "escritorio")
        await ir_para_a_porta(v)
        await v.fill("#lugares-saida .chave-lugar input", CHAVE_PINGOU)
        await v.click("#lugares-saida .chave-lugar button")
        ok("  na porta, a chave do Pingou leva ao Pingou", await esperar_lugar(v, "pingou"))
        await ir_para_a_porta(v)
        await v.click("#lugares-saida button.ok")
        ok("  e volta para o Escritório (sem esbarrar no próprio nome)", await esperar_lugar(v, "escritorio"))

        # ---- Arena 7: a chave dela e o Lindson na galeria (um por pessoa)
        r = await entrar_em(nav, "Rui", "arena", "errada")
        await asyncio.sleep(1.5)
        ok("chave errada da Arena 7 não cria a conta", "Arena 7 errada" in await texto(r, "#aviso-entrada"))
        await r.close()
        r = await entrar_em(nav, "Rui", "arena", CHAVE_ARENA)
        galeria = await r.evaluate("() => [...document.querySelectorAll('#galeria-personagens button')].map(b => b.dataset.personagem)")
        ok("na Arena 7, a galeria tem Allan, Lindson e o Padrão (por último)",
           galeria == ["allan", "lindson", ""], galeria)
        ok("  e com a chave arenasete ele entra na Arena 7", await dentro(r) and await lugar(r) == "arena")
        ok("  com o boneco que escolheu (o primeiro livre)", await r.evaluate("() => Jogo.eu.aparencia.personagem") == "allan")
        ocupados = await r.evaluate("async () => (await (await fetch('/personagens/ocupados')).json()).ocupados")
        ok("  e esse boneco passa a constar como escolhido", "allan" in ocupados, ocupados)
        await ir_para_a_porta(r)
        nomes = await r.evaluate("() => [...document.querySelectorAll('#lugares-saida .cartao-lugar b')].map(b => b.innerText)")
        ok("a porta da Arena 7 leva aos três lugares", nomes == ["Escritório", "Pingou", "Arena 7"], nomes)
        await r.keyboard.press("Escape")
        # quem não tem boneco próprio (o Allan) entra com o Padrão, sem pegar o do Lindson
        al = await abrir(nav)
        await al.click("#aba-criar")
        await al.fill("#campo-email", "allan" + MARCA + "@teste.local")
        await al.fill("#campo-senha", "teste1234")
        await al.fill("#campo-nome", "Allan")
        await al.evaluate("() => escolherLugar('arena')")
        await al.fill("#campo-convite", CHAVE_ARENA)
        await asyncio.sleep(0.8)
        apagado = await al.evaluate("() => document.querySelector(\"#galeria-personagens button[data-personagem='allan']\").disabled")
        ok("boneco já escolhido por outro aparece apagado", apagado)
        await al.click("#galeria-personagens button[data-personagem='']")
        await al.evaluate("() => entrar(true)")
        ok("o Allan entra na Arena 7 com o Padrão", await dentro(al) and await lugar(al) == "arena")
        pers = await al.evaluate("() => Jogo.eu.aparencia.personagem")
        ok("  com o boneco genérico", pers in ("barbudo", "mulher"), pers)
        dono = await al.evaluate("() => (Jogo.mapa.zonas.find(z => z.id === 'a-allan') || {}).dono_nome")
        ok("  e a sala Allan fica dele", dono == "Allan", dono)
        al.erros and print(al.erros)

        saude = await a.evaluate("async () => (await (await fetch('/saude')).json()).lugares")
        ok("/saude conta cada lugar", saude.get("pingou", 0) >= 3 and saude.get("escritorio", 0) >= 1, saude)

        erros = [e for pg in (a, b, pp, c, v, r) for e in pg.erros]
        ok("nenhum erro de página", not erros, erros[:3])
        await nav.close()


if __name__ == "__main__":
    asyncio.run(main())
    print("\n%d provas, %d falharam" % (len(codara.provas), len(codara.falhas)))
    for f in codara.falhas:
        print("  -", f)
    sys.exit(1 if codara.falhas else 0)
