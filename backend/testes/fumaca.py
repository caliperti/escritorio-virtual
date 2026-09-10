"""O básico do escritório, de ponta a ponta.

Não é a bateria inteira: é o que precisa estar de pé depois de qualquer mexida
— entrar, ver o outro, andar, conversar, sentar, e mexer no escritório.
"""

import asyncio
from playwright.async_api import async_playwright

from comum import Sessao, SUFIXO, andar_ate, conferir, fechar

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
        a = await s.entrar("Ana")
        b = await s.entrar("Bruno")
        await asyncio.sleep(1.5)

        # --- o mapa chegou inteiro ---
        c("todo móvel do catálogo sabe se desenhar", await a.evaluate("""() =>
            Object.keys(Jogo.mapa.catalogo).filter(t => !Objetos.DESENHOS[t]).length"""), 0)
        c("as dez salas mais reunião estão lá", await a.evaluate("""() =>
            Jogo.mapa.zonas.filter(z => z.privada).length >= 10"""))

        # --- um enxerga o outro ---
        c("Ana vê o Bruno", await a.evaluate("() => Jogo.pessoas.size"), 1)

        # --- andar de verdade, sem atravessar móvel ---
        cad = await a.evaluate("""() => {
            const c = Jogo.mapa.objetos.find(o => o.tipo === 'cadeira');
            return [(c.x + 0.5) * Jogo.tile, (c.y + 2.5) * Jogo.tile]; }""")
        await andar_ate(a, cad[0], cad[1])
        c("posição de Ana chega no Bruno", await b.evaluate("""(n) => {
            const p = [...Jogo.pessoas.values()].find(p => p.nome.startsWith(n));
            return !!p && Math.abs(p.x - %s) < 2; }""" % await a.evaluate("() => Jogo.eu.x"), "Ana"))

        # --- sentar na cadeira ---
        assento = await a.evaluate("""() => {
            const c = Jogo.mapa.objetos.find(o => o.tipo === 'cadeira');
            return [(c.x + 0.5) * Jogo.tile, (c.y + 0.5) * Jogo.tile]; }""")
        await andar_ate(a, assento[0], assento[1])
        c("em cima da cadeira o boneco senta",
          await a.evaluate("() => !!assentoEm(Jogo.eu.x, Jogo.eu.y)"))

        # --- chat ---
        # Ana está longe do Bruno, então "perto" não alcançaria: é o combinado.
        await a.select_option("#escopo-chat", "todos")
        await a.fill("#campo-chat", "oi pessoal " + SUFIXO)
        await a.press("#campo-chat", "Enter")
        await asyncio.sleep(1.2)
        c("mensagem 'para todos' chega no Bruno", await b.evaluate("""(t) =>
            document.getElementById('mensagens').textContent.includes(t)""", "oi pessoal " + SUFIXO))
        await a.select_option("#escopo-chat", "perto")
        await a.fill("#campo-chat", "sussurro " + SUFIXO)
        await a.press("#campo-chat", "Enter")
        await asyncio.sleep(1.2)
        c("mensagem 'perto' não vaza para quem está longe", await b.evaluate("""(t) =>
            document.getElementById('mensagens').textContent.includes(t)""",
            "sussurro " + SUFIXO), False)

        # --- editor: colocar, girar e remover ---
        # Membro comum só mexe na sala que reivindicou: Ana vai até uma sala
        # livre, pega ela, e é lá dentro que o teste mexe nos móveis.
        sala = await a.evaluate("""() => {
            const z = Jogo.mapa.zonas.find(z => z.privada && z.id !== 'reuniao' && !z.dono_nome);
            return z ? { id: z.id, x: (z.x1 + z.x2 + 1) / 2 * Jogo.tile,
                         y: (z.y1 + z.y2 + 1) / 2 * Jogo.tile } : null; }""")
        c("achou uma sala livre para reivindicar", sala is not None)
        await andar_ate(a, sala["x"], sala["y"])
        await a.evaluate("(id) => enviar({ tipo: 'sala', acao: 'reivindicar', id })", sala["id"])
        await asyncio.sleep(1.2)
        c("Ana virou dona da sala", await a.evaluate("""(id) => {
            const z = Jogo.mapa.zonas.find(z => z.id === id);
            return !!z && z.dono_nome === Jogo.eu.nome; }""", sala["id"]))
        livre = await a.evaluate("""(id) => {
            const z = Jogo.mapa.zonas.find(z => z.id === id);
            for (let y = z.y1; y <= z.y2; y++)
              for (let x = z.x1; x <= z.x2 - 2; x++)
                if (Jogo.mapa.paredes[y][x] != '1' && !Editor.objetoEm(x, y)
                    && !Editor.objetoEm(x + 1, y) && !Editor.objetoEm(x + 2, y)) return [x, y];
            return null; }""", sala["id"])
        c("achou espaço vazio dentro da sala dela", livre is not None)
        await a.evaluate("([x,y]) => Editor.acao({acao:'objeto', tipo:'sofa', x, y, g:1})", livre)
        await asyncio.sleep(1.2)
        novo = await b.evaluate("() => Jogo.mapa.objetos[Jogo.mapa.objetos.length - 1]")
        c("móvel colocado chega girado no outro", novo.get("g"), 1)
        c("deitado, o espaço ocupado troca", await b.evaluate("""(o) =>
            JSON.stringify(Objetos.medida(o.tipo, Jogo.mapa.catalogo[o.tipo], o.g))""", novo),
          '{"l":1,"a":3}')
        await a.evaluate("(id) => Editor.acao({acao:'girar', id})", novo["id"])
        await asyncio.sleep(1.2)
        c("girar de novo avança um quarto de volta", await b.evaluate(
            "(id) => Jogo.mapa.objetos.find(o => o.id === id).g", novo["id"]), 2)
        c("monitor não tomba: só muda de vista", await a.evaluate("""() =>
            Objetos.EM_PE.has('monitor') && !Objetos.FILEIRA.has('monitor')"""))
        await a.evaluate("(id) => Editor.acao({acao:'remover', id})", novo["id"])
        await asyncio.sleep(1.2)
        c("móvel de teste removido", await b.evaluate(
            "(id) => !Jogo.mapa.objetos.some(o => o.id === id)", novo["id"]))

        await a.evaluate("(id) => enviar({ tipo: 'sala', acao: 'liberar', id })", sala["id"])
        await asyncio.sleep(1.0)
        await nav.close()
    fechar("fumaca", falhas, erros)


asyncio.run(main())
