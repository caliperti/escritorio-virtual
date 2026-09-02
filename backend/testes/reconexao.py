"""A sala tem que voltar sozinha quando a conexão cai.

O que dava errado antes: o WebSocket morria (proxy derrubando conexão parada,
ou o serviço reiniciando) e a tela simplesmente congelava até alguém apertar F5.
"""

import asyncio
from playwright.async_api import async_playwright

from comum import Sessao, conferir, fechar

erros = []
falhas = 0


def c(rotulo, valor, esperado=True):
    global falhas
    if not conferir(rotulo, valor, esperado):
        falhas += 1


async def main():
    async with async_playwright() as p:
        nav = await p.chromium.launch()
        s = Sessao(nav, erros)
        a = await s.entrar("Cai")
        b = await s.entrar("Fica")
        await asyncio.sleep(1)

        c("batida de coração ligada", await a.evaluate("() => !!Conexao.batida"))
        c("servidor responde pong", await a.evaluate("""() => new Promise(ok => {
            const antes = Jogo.ws.onmessage;
            Jogo.ws.onmessage = (ev) => { const m = JSON.parse(ev.data);
              antes(ev); if (m.tipo === 'pong') { Jogo.ws.onmessage = antes; ok(true); } };
            Jogo.ws.send(JSON.stringify({tipo:'ping'}));
            setTimeout(() => ok(false), 5000); })"""))

        # sai da recepção e derruba a conexão na marra
        alvo = await a.evaluate("""() => {
            const cad = Jogo.mapa.objetos.find(o => o.tipo === 'cadeira');
            Jogo.eu.x = (cad.x + 0.5) * Jogo.tile; Jogo.eu.y = (cad.y + 2.5) * Jogo.tile;
            enviar({tipo:'mover', x:Jogo.eu.x, y:Jogo.eu.y, direcao:'cima'});
            return [Jogo.eu.x, Jogo.eu.y]; }""")
        await asyncio.sleep(1.2)
        antes = await a.evaluate("() => Jogo.eu.id")
        await a.evaluate("() => Jogo.ws.close()")
        await asyncio.sleep(0.4)
        c("faixa 'Reconectando' aparece", await a.is_visible("#reconectando"))
        await a.wait_for_function(
            "() => Jogo.ws && Jogo.ws.readyState === WebSocket.OPEN", timeout=40000)
        await asyncio.sleep(1.5)
        c("faixa some ao voltar", not await a.is_visible("#reconectando"))
        depois = await a.evaluate("() => [Jogo.eu.x, Jogo.eu.y]")
        c("volta no mesmo lugar", [round(v) for v in depois] == [round(v) for v in alvo])
        c("sessão nova", (await a.evaluate("() => Jogo.eu.id")) != antes)
        c("laço de desenho não duplicou", await a.evaluate("() => Jogo.rodando === true"))

        await asyncio.sleep(2.5)
        c("o outro vê uma pessoa só", await b.evaluate("() => Jogo.pessoas.size"), 1)
        c("sem fantasma com nome repetido", await b.evaluate("""() => {
            const n = [...Jogo.pessoas.values()].map(p => p.nome);
            return new Set(n).size === n.length; }"""))

        await a.evaluate("""() => { Jogo.eu.x += 64;
            enviar({tipo:'mover', x:Jogo.eu.x, y:Jogo.eu.y, direcao:'direita'}); }""")
        await asyncio.sleep(1.2)
        meu = await a.evaluate("() => Math.round(Jogo.eu.x)")
        visto = await b.evaluate("""(nome) => {
            const p = [...Jogo.pessoas.values()].find(p => p.nome.startsWith(nome));
            return p ? Math.round(p.x) : null; }""", "Cai")
        c("movimento chega no outro depois de reconectar", visto, meu)

        # quedas seguidas e sessão recusada
        for _ in range(3):
            await a.evaluate("() => Jogo.ws.close()")
            await a.wait_for_function(
                "() => Jogo.ws && Jogo.ws.readyState === WebSocket.OPEN", timeout=40000)
            await asyncio.sleep(0.8)
        c("volta depois de três quedas seguidas",
          await a.evaluate("() => !!Jogo.eu && Jogo.ws.readyState === 1"))
        c("contagem de tentativas zera ao voltar", await a.evaluate("() => Conexao.tentativas"), 0)

        await a.evaluate("() => { Conexao.perfil = { token: 'invalido' }; Jogo.ws.close(); }")
        await asyncio.sleep(4)
        c("sessão recusada para de insistir", await a.evaluate("() => Conexao.perfil === null"))
        c("volta para a tela de entrada", await a.is_visible("#entrada"))

        await nav.close()
    fechar("reconexao", falhas, erros)


asyncio.run(main())
