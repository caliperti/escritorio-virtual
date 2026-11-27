"""Situação, avisos em outra aba e "ir até" (26/11), num navegador de verdade.

Confere:
  - a situação (Disponível, Ocupado, Almoço, Não perturbe) chega aos outros,
    aparece na lista e no botão do cabeçalho, e sobrevive à queda da rede;
  - "Não perturbe" derruba a conversa pelo caminho e o chat "perto", mas não
    a da baia (quem sentou junto continua se ouvindo);
  - quem bate na porta de alguém em "Não perturbe" fica sabendo e a batida
    não chega;
  - com a aba "escondida": bater na porta, ser citado no chat e alguém chegar
    para conversar viram aviso do computador e título piscando; em "Não
    perturbe" fica tudo quieto; voltar para a aba limpa o título;
  - "Ir até" na lista leva o boneco para o lado da pessoa, e avisa quando ela
    está numa baia (onde só se conversa sentado).

    /Volumes/SSD/bets-documentos/temporarios-claude/religar-teste.sh
    ENDERECO=http://127.0.0.1:8411 CONVITE=teste123 .venv/bin/python testes/situacao_e_avisos.py

O aviso do computador é de mentira (o navegador de teste não mostra nenhum):
a página ganha um `Notification` que só anota o que receberia.
"""
import asyncio
import os
import sys

from playwright.async_api import async_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import codara  # noqa: E402  (entrar, andar, onde, ok)
from codara import andar, entrar, ok, onde  # noqa: E402

CAPTURAS = os.environ.get("CAPTURAS", "")

AVISO_DE_MENTIRA = """() => {
  window.__avisos = [];
  window.Notification = class {
    constructor(t, o) { window.__avisos.push({ titulo: t, texto: (o || {}).body || '' }); }
    close() {}
    static get permission() { return 'granted'; }
    static requestPermission() { return Promise.resolve('granted'); }
  };
  Chamar.atualizarItem();
}"""


async def conversando(pg, outro_id, segundos=15):
    try:
        await pg.wait_for_function("(id) => Midia.pares.has(id)", arg=outro_id, timeout=segundos * 1000)
        return True
    except Exception:
        return False


async def avisos(pg):
    return await pg.evaluate("() => window.__avisos.map(a => a.titulo)")


async def sentar_na_baia2(a, b):
    await a.evaluate("() => irSentar(Cenario.assentoPerto(180, 433, 12))")
    await b.evaluate("() => irSentar(Cenario.assentoPerto(190, 345, 12))")
    for pg in (a, b):
        try:
            await pg.wait_for_function("() => !!sentadoAgora() && !Jogo.caminho", timeout=25000)
        except Exception:
            pass
    await asyncio.sleep(1)


async def main():
    async with async_playwright() as p:
        nav = await p.chromium.launch(args=[
            "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
            "--autoplay-policy=no-user-gesture-required"])
        a = await entrar(nav, "Gustavo")
        b = await entrar(nav, "Felipe")
        for pg in (a, b):
            await pg.evaluate(AVISO_DE_MENTIRA)
        id_a = await a.evaluate("() => Jogo.eu.id")
        id_b = await b.evaluate("() => Jogo.eu.id")

        # ---- de pé no salão, perto: conversam
        await andar(a, 450, 520)
        await andar(b, 530, 520)
        ok("de pé no salão, perto um do outro, os dois conversam", await conversando(a, id_b))

        # ---- Não perturbe pelo botão do cabeçalho
        await a.click("#btn-situacao")
        await asyncio.sleep(0.2)
        itens = await a.evaluate("() => [...document.querySelectorAll('#situacao .item-situacao')].map(b => b.innerText.split('\\n')[0])")
        ok("o menu de situação tem as quatro opções", itens == ["Disponível", "Ocupado", "Almoço", "Não perturbe"], itens)
        if CAPTURAS:
            await a.screenshot(path=os.path.join(CAPTURAS, "situacao-menu.png"),
                               clip={"x": 900, "y": 0, "width": 772, "height": 330})
        await a.click("#situacao .item-situacao[data-situacao='nao_perturbe']")
        await asyncio.sleep(0.8)
        chip = await a.evaluate("() => document.querySelector('#btn-situacao .nome-situacao').textContent")
        ok("o botão do cabeçalho mostra 'Não perturbe'", chip == "Não perturbe", chip)
        visto = await b.evaluate("(id) => Jogo.pessoas.get(id).situacao", id_a)
        ok("a outra pessoa vê a situação", visto == "nao_perturbe", visto)
        lista = await b.evaluate("(id) => document.querySelector(`#lista-pessoas li[data-id='${id}']`).innerText", id_a)
        ok("e a lista de pessoas mostra 'não perturbe'", "não perturbe" in lista, lista)
        try:
            await a.wait_for_function("(id) => !Midia.pares.has(id)", arg=id_b, timeout=8000)
            caiu = True
        except Exception:
            caiu = False
        ok("em Não perturbe, a conversa pelo caminho cai", caiu)
        await b.evaluate("() => enviar({ tipo: 'chat', texto: 'oi perto 123', escopo: 'perto' })")
        await asyncio.sleep(0.8)
        chegou = await a.evaluate("() => document.getElementById('mensagens').innerText.includes('oi perto 123')")
        ok("e o chat 'perto' não chega a quem está em Não perturbe", not chegou)
        if CAPTURAS:
            await a.evaluate("() => { Jogo.eu.direcao = 'baixo'; }")
            await asyncio.sleep(0.4)
            r = await a.evaluate("""() => { const t = tela.getBoundingClientRect();
                return [t.left + (380 - Jogo.camera.x) * ESCALA, t.top + (330 - Jogo.camera.y) * ESCALA,
                        240 * ESCALA, 220 * ESCALA]; }""")
            await a.screenshot(path=os.path.join(CAPTURAS, "situacao-cracha.png"),
                               clip={"x": r[0], "y": r[1], "width": r[2], "height": r[3]})

        # ---- a situação sobrevive à queda da rede
        await a.evaluate("() => { window.__wsVelho = Jogo.ws; Jogo.ws.close(); }")
        try:
            await a.wait_for_function("() => Jogo.ws !== window.__wsVelho && Jogo.ws.readyState === 1", timeout=15000)
        except Exception:
            pass
        await asyncio.sleep(1.5)
        id_a = await a.evaluate("() => Jogo.eu.id")
        visto = await b.evaluate("(id) => (Jogo.pessoas.get(id) || {}).situacao", id_a)
        ok("depois de cair e voltar, continua em Não perturbe", visto == "nao_perturbe", visto)

        # ---- na baia, quem sentou junto continua se ouvindo
        await sentar_na_baia2(a, b)
        pa, pb = await onde(a), await onde(b)
        ok("os dois sentam na baia 2", pa["zona"] == pb["zona"] == "baia2", (pa, pb))
        ok("na baia, Não perturbe não atrapalha quem sentou junto", await conversando(a, id_b))

        # ---- bater na porta de quem está em Não perturbe
        await andar(a, 683, 250)
        await a.evaluate("() => enviar({ tipo: 'sala', acao: 'reivindicar', id: 'diretoria1' })")
        await asyncio.sleep(0.6)
        await a.evaluate("() => enviar({ tipo: 'sala', acao: 'trancar', id: 'diretoria1' })")
        await asyncio.sleep(0.6)
        await andar(b, 588, 360)
        await andar(b, 588, 308, segundos=8)
        await asyncio.sleep(0.6)
        cartao = await b.evaluate("() => (document.getElementById('pedido-sala') || {}).innerText || ''")
        ok("na porta trancada, o cartão já diz que o dono está em Não perturbe",
           "Não perturbe" in cartao and "Bater" not in cartao, cartao)
        await b.evaluate("() => enviar({ tipo: 'sala', acao: 'bater', id: 'diretoria1' })")
        await asyncio.sleep(0.8)
        recusa = await b.evaluate("() => document.getElementById('mensagens').innerText")
        bateu = await a.evaluate("() => (document.getElementById('pedido-sala') || {}).innerText || ''")
        ok("bater mesmo assim: a batida não chega e quem bateu fica sabendo",
           "em Não perturbe" in recusa and "quer entrar" not in bateu, bateu)

        # ---- avisos com a aba "escondida"
        await a.evaluate("() => { mudarSituacao('disponivel'); Chamar.fora = () => true; }")
        await asyncio.sleep(0.6)
        await b.evaluate("() => enviar({ tipo: 'sala', acao: 'bater', id: 'diretoria1' })")
        await asyncio.sleep(0.8)
        av = await avisos(a)
        titulo = await a.evaluate("() => document.title")
        ok("bateram na porta com a aba escondida: aviso do computador", "Felipe bateu na sua porta" in av, av)
        ok("  e o título da aba pisca", titulo.startswith("🔔"), titulo)
        await a.evaluate("() => { const c = document.getElementById('pedido-sala'); if (c) c.remove(); }")
        await b.evaluate("() => enviar({ tipo: 'chat', texto: 'Gustavo, olha isso', escopo: 'todos' })")
        await b.evaluate("() => enviar({ tipo: 'chat', texto: 'bom dia geral', escopo: 'todos' })")
        await asyncio.sleep(0.8)
        av = await avisos(a)
        ok("citado no chat de todos: aviso", "Felipe citou você" in av, av)
        ok("  e mensagem de todos sem citar ninguém não vira aviso", len(av) == 2, av)
        pend = await a.evaluate("() => Chamar.pendentes")
        ok("  mas conta no título da aba", pend == 3, pend)

        # alguém chega para conversar
        await a.evaluate("() => enviar({ tipo: 'sala', acao: 'destrancar', id: 'diretoria1' })")
        await asyncio.sleep(0.6)
        await andar(b, 588, 300, segundos=10)
        await andar(b, 640, 250, segundos=10)
        try:
            await a.wait_for_function("() => window.__avisos.some(a => a.titulo.includes('chegou para conversar'))", timeout=8000)
            chegou = True
        except Exception:
            chegou = False
        ok("alguém chegou para conversar com a aba escondida: aviso", chegou, await avisos(a))

        # Não perturbe: quieto
        antes = len(await avisos(a))
        await a.evaluate("() => mudarSituacao('nao_perturbe')")
        await asyncio.sleep(0.5)
        await b.evaluate("() => enviar({ tipo: 'chat', texto: 'Gustavo? dentro da sala', escopo: 'perto' })")
        await asyncio.sleep(0.8)
        dentro = await a.evaluate("() => document.getElementById('mensagens').innerText.includes('dentro da sala')")
        ok("dentro da sala, em Não perturbe, o chat chega", dentro)
        ok("  mas nenhum aviso toca", len(await avisos(a)) == antes, await avisos(a))

        # voltar para a aba limpa o título
        await a.evaluate("() => { Chamar.fora = () => false; Chamar.limpar(); }")
        titulo = await a.evaluate("() => document.title")
        ok("voltar para a aba limpa o título", titulo == "Gather da Shopee", titulo)
        cita = await a.evaluate("""() => [citaMeuNome('oi gustavo!'), citaMeuNome('@Gustavo'),
            citaMeuNome('GUSTAVO tá aí?'), citaMeuNome('Gustavinho'), citaMeuNome('agustavo'), citaMeuNome('')]""")
        ok("citar o nome: sem acento nem maiúscula, e só a palavra inteira",
           cita == [True, True, True, False, False, False], cita)
        item = await a.evaluate("() => document.querySelector('#btn-avisos-pc .estado-aviso').textContent")
        ok("o item de ajustes mostra os avisos ligados", item == "ligado", item)

        # ---- Ir até
        await a.evaluate("() => mudarSituacao('disponivel')")
        await andar(b, 450, 560)
        await asyncio.sleep(0.5)
        corr = await a.evaluate("() => Jogo.correcoes || 0")
        li = "#lista-pessoas li[data-id='%s']" % id_b
        await a.hover(li)
        await a.click(li + " .ir-ate")
        try:
            await a.wait_for_function("() => !Jogo.caminho", timeout=25000)
        except Exception:
            pass
        await asyncio.sleep(0.6)
        d = await a.evaluate("""(id) => { const p = Jogo.pessoas.get(id);
            return { dist: Math.round(Math.hypot(Jogo.eu.x - p.x, Jogo.eu.y - p.y)),
                     mesma: (salaDoPiso(Jogo.eu.x, Jogo.eu.y) || {}).id === (salaDoPiso(p.x, p.y) || {}).id }; }""", id_b)
        ok("'Ir até' leva para o lado da pessoa (sem subir em cima)", 30 < d["dist"] < 110 and d["mesma"], d)
        ok("  e o servidor aceitou cada passo", await a.evaluate("() => Jogo.correcoes || 0") == corr)
        ok("  e os dois conversam", await conversando(a, id_b))

        await b.evaluate("() => irSentar(Cenario.assentoPerto(190, 345, 12))")
        try:
            await b.wait_for_function("() => !!sentadoAgora() && !Jogo.caminho", timeout=25000)
        except Exception:
            pass
        await asyncio.sleep(0.8)
        await a.click(li + " > span:nth-child(2)")       # clicar na linha (no nome) também leva
        await asyncio.sleep(0.5)
        dica = await a.evaluate("() => document.getElementById('mensagens').innerText")
        ok("até alguém sentado na baia: avisa para sentar numa cadeira livre",
           "Felipe está na Baia" in dica and "sente numa cadeira livre" in dica)
        try:
            await a.wait_for_function("() => !Jogo.caminho", timeout=25000)
        except Exception:
            pass
        await asyncio.sleep(0.4)
        d = await a.evaluate("""(id) => { const p = Jogo.pessoas.get(id);
            return { dist: Math.round(Math.hypot(Jogo.eu.x - p.x, Jogo.eu.y - p.y)),
                     eu: [Math.round(Jogo.eu.x), Math.round(Jogo.eu.y)], ela: [p.x, p.y],
                     correcoes: Jogo.correcoes || 0, caminho: !!Jogo.caminho }; }""", id_b)
        ok("  e chega perto da baia", d["dist"] < 130, d)

        erros = a.erros + b.erros
        ok("nenhum erro de página", not erros, erros[:3])
        await nav.close()


if __name__ == "__main__":
    asyncio.run(main())
    print("\n%d provas, %d falharam" % (len(codara.provas), len(codara.falhas)))
    for f in codara.falhas:
        print("  -", f)
    sys.exit(1 if codara.falhas else 0)
