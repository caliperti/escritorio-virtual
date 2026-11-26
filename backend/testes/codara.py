"""O escritório da Codara (26/11) de ponta a ponta, num navegador de verdade.

Confere: nascer na entrada; o caminho da entrada até a mesa e até cada uma das
três diretorias (passando pela porta da arte); as formas que bloqueiam batendo
com os móveis; o tampo cobrindo quem passa atrás da mesa; sentar e "Entrar na
reunião" ligando a chamada (e quem só passa pela mesa continuar no salão);
trancar a diretoria barrando quem é de fora; chat; e tira as capturas.

    cd backend
    DADOS_DIR=/pasta/vazia SENHA=teste123 .venv/bin/python -m uvicorn main:app --port 8411 &
    ENDERECO=http://127.0.0.1:8411 CONVITE=teste123 .venv/bin/python testes/codara.py

As capturas vão para referencia-codara/capturas/.
"""
import asyncio
import os
import sys
import time
from pathlib import Path

from playwright.async_api import async_playwright

END = os.environ.get("ENDERECO", "http://127.0.0.1:8411")
CONVITE = os.environ.get("CONVITE", "teste123")
MARCA = str(int(time.time()))[-5:]
CAPTURAS = Path(__file__).resolve().parents[2] / "referencia-codara" / "capturas"
provas, falhas = [], []


def ok(nome, cond, extra=""):
    provas.append(nome)
    print(("  ok    " if cond else "FALHOU  ") + nome + (("  " + str(extra)) if extra else ""))
    if not cond:
        falhas.append(nome)


async def entrar(nav, nome, conta=True, w=1672, h=941):
    ctx = await nav.new_context(viewport={"width": w, "height": h}, permissions=["microphone", "camera"])
    pg = await ctx.new_page()
    pg.erros = []
    pg.on("pageerror", lambda e: pg.erros.append(str(e)[:200]))
    await pg.goto(END)
    await asyncio.sleep(1.0)
    if conta:
        await pg.click("#aba-criar")
        await pg.fill("#campo-email", nome.lower() + MARCA + "@teste.local")
        await pg.fill("#campo-nome", nome)
        await pg.fill("#campo-senha", "teste1234")
    else:
        await pg.click("#aba-visitante")
        await pg.fill("#campo-nome", nome)
    await pg.fill("#campo-convite", CONVITE)
    await pg.evaluate("() => entrar(true)")
    await pg.wait_for_function("() => typeof Jogo!=='undefined' && !!Jogo.eu && !!Jogo.mapa", timeout=40000)
    await asyncio.sleep(1.2)
    return pg


async def andar(pg, x, y, segundos=25):
    """Clica no chão e espera chegar (o mesmo trajeto do clique de verdade)."""
    tem = await pg.evaluate("""([x, y]) => {
        const o = origemDoCaminho();
        Jogo.caminho = tracarCaminho(o.x, o.y, x, y) || caminhoPertoDe({x, y});
        return !!Jogo.caminho; }""", [x, y])
    if not tem:
        return False
    try:
        await pg.wait_for_function("() => !Jogo.caminho", timeout=segundos * 1000)
    except Exception:
        return False
    await asyncio.sleep(0.4)
    return True


async def onde(pg):
    return await pg.evaluate("""() => ({x: Math.round(Jogo.eu.x), y: Math.round(Jogo.eu.y),
        zona: (zonaDe(Jogo.eu.x, Jogo.eu.y) || {}).id || null,
        sentado: !!Cenario.assentoEm(Jogo.eu.x, Jogo.eu.y)})""")


async def correcoes(pg):
    """Quantas vezes o servidor recusou um passo (a colisão dos dois lados diverge)."""
    await asyncio.sleep(0.6)
    return await pg.evaluate("() => Jogo.correcoes || 0")


async def main():
    CAPTURAS.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        nav = await p.chromium.launch(args=[
            "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
            "--autoplay-policy=no-user-gesture-required"])
        a = await entrar(nav, "Gustavo")
        b = await entrar(nav, "Felipe")

        # ---- chegada e enquadramento
        pa = await onde(a)
        ok("quem entra nasce na entrada (entre os pilares, no pé da tela)",
           569 < pa["x"] < 777 and pa["y"] > 700, pa)
        cabe = await a.evaluate("""() => { const r = tela.getBoundingClientRect();
            const ponto = (x, y) => [(x - Jogo.camera.x) * ESCALA, (y - Jogo.camera.y) * ESCALA];
            const pts = [[673, 750], [673, 482], [450, 337], [838, 337], [1156, 337]];
            return pts.every(([x, y]) => { const [sx, sy] = ponto(x, y);
                return sx >= 0 && sy >= 0 && sx <= r.width && sy <= r.height; }); }""")
        ok("entrada, mesa e as três portas aparecem juntas na tela (1672x941)", cabe)

        # ---- formas: o que bloqueia e o que é livre
        formas = await a.evaluate("""() => ({
            mesa: livre(673, 490), cadeira: livre(513, 620), sofa: livre(90, 480),
            vidro: livre(300, 337), parede_fundo: livre(400, 150),
            porta1: livre(450, 337), porta2: livre(838, 337), porta3: livre(1156, 337),
            entrada: livre(673, 740), salao: livre(250, 520), atras_da_mesa: livre(605, 432) })""")
        ok("a mesa, a cadeira, o sofá, o vidro e a parede do fundo bloqueiam",
           not any(formas[k] for k in ("mesa", "cadeira", "sofa", "vidro", "parede_fundo")), formas)
        ok("as três portas, a entrada e o salão são livres",
           all(formas[k] for k in ("porta1", "porta2", "porta3", "entrada", "salao", "atras_da_mesa")), formas)

        # andar reto para dentro da mesa: para na borda
        await andar(a, 673, 690)
        await a.keyboard.down("ArrowUp")
        await asyncio.sleep(2.5)
        await a.keyboard.up("ArrowUp")
        pa = await onde(a)
        ok("andando reto para a mesa, o boneco para antes da cadeira e do tampo", pa["y"] > 650, pa)

        # ---- caminhos: entrada -> mesa -> cada diretoria
        antes = await correcoes(a)
        for nome, (x, y), zona in [("a mesa (atrás dela)", (605, 432), "salao"),
                                   ("a diretoria do Gustavo (atrás da mesa dele)", (365, 208), "diretoria1"),
                                   ("a diretoria do Christian", (838, 250), "diretoria2"),
                                   ("a diretoria do Felipe Vargas", (1165, 250), "diretoria3"),
                                   ("a frente das poltronas do Felipe", (1022, 318), "diretoria3"),
                                   ("a entrada de novo", (673, 735), "salao")]:
            chegou = await andar(a, x, y)
            pa = await onde(a)
            perto = abs(pa["x"] - x) < 30 and abs(pa["y"] - y) < 30
            ok("anda até %s pela porta certa" % nome, chegou and perto and pa["zona"] == zona, pa)
            depois = await correcoes(a)
            ok("  e o servidor aceitou cada passo", depois == antes, depois - antes)
            antes = depois

        # ---- atrás da mesa: o tampo cobre as pernas
        await andar(a, 605, 432)
        await asyncio.sleep(0.8)
        await a.screenshot(path=str(CAPTURAS / "atras-da-mesa.png"),
                           clip={"x": 480, "y": 300, "width": 380, "height": 300})
        cobre = await a.evaluate("""() => {
            // desenha o quadro de novo sem o recorte da mesa e compara a região das pernas
            const r = tela.getBoundingClientRect(), dpr = Jogo.dpr || 1;
            const px = (Jogo.eu.x - Jogo.camera.x) * ESCALA * dpr, py = (Jogo.eu.y + 10 - Jogo.camera.y) * ESCALA * dpr;
            const ler = () => ctx.getImageData(px - 6, py, 12, 14).data;
            desenhar(); const com = ler();
            const salvo = Jogo.mapa.cenario.frentes; Jogo.mapa.cenario.frentes = salvo.filter(f => f.nome !== 'mesa');
            desenhar(); const sem = ler(); Jogo.mapa.cenario.frentes = salvo; desenhar();
            let dif = 0; for (let i = 0; i < com.length; i++) dif += Math.abs(com[i] - sem[i]);
            return dif / com.length; }""")
        ok("quem está atrás da mesa tem as pernas cobertas pelo tampo", cobre > 8, round(cobre, 1))

        # ---- mesa de reunião: passar não entra; sentar entra e liga a chamada
        await andar(b, 1100, 600)
        await andar(b, 260, 620)                       # passa na frente da mesa inteira
        pb = await onde(b)
        ok("quem só passa pela mesa continua no salão", pb["zona"] == "salao" and not pb["sentado"], pb)

        await andar(a, 513, 668)
        botao = await a.evaluate("() => { const b = document.getElementById('acao-reuniao'); return !b.hidden && b.textContent; }")
        ok("perto da cadeira aparece 'Entrar na reunião'", bool(botao) and "Entrar na reunião" in botao, botao)
        await a.click("#acao-reuniao")
        await asyncio.sleep(2.5)
        pa = await onde(a)
        ok("o botão senta na cadeira e entra na reunião", pa["sentado"] and pa["zona"] == "reuniao", pa)
        botao = await a.evaluate("() => document.getElementById('acao-reuniao').textContent")
        ok("sentado, o botão vira 'Sair da reunião'", "Sair da reunião" in botao)
        sozinho = await a.evaluate("() => !document.getElementById('chamada').hidden && Reuniao.ativa")
        ok("sozinho na mesa, a tela de chamada não abre", not sozinho)

        await andar(b, 805, 356)                       # a cadeira da fila de trás, do outro lado
        await b.keyboard.press("f")
        await asyncio.sleep(2.5)
        pb = await onde(b)
        ok("a tecla F senta na cadeira da fila de trás", pb["sentado"] and pb["zona"] == "reuniao", pb)
        await asyncio.sleep(1)
        chamada = await a.evaluate("() => !document.getElementById('chamada').hidden && Reuniao.ativa")
        ok("com mais alguém sentado, a tela de chamada (estilo Meet) abre sozinha", chamada)
        try:
            await a.wait_for_function("() => [...Midia.pares.values()].some(p => p.pc.connectionState === 'connected')", timeout=20000)
            ligou = True
        except Exception:
            ligou = False
        ok("os dois sentados na mesa estão em chamada", ligou)
        som = await a.evaluate("""async () => { const par = [...Midia.pares.values()][0]; if (!par) return 0;
            const b0 = await new Promise(r => par.pc.getStats().then(s => { let t = 0; s.forEach(x => { if (x.type === 'inbound-rtp' && x.kind === 'audio') t += x.bytesReceived; }); r(t); }));
            await new Promise(r => setTimeout(r, 1500));
            const b1 = await new Promise(r => par.pc.getStats().then(s => { let t = 0; s.forEach(x => { if (x.type === 'inbound-rtp' && x.kind === 'audio') t += x.bytesReceived; }); r(t); }));
            return b1 - b0; }""")
        ok("e o som de um chega ao outro", som > 1000, som)
        await a.screenshot(path=str(CAPTURAS / "reuniao-na-mesa.png"))

        # ---- chat
        await b.fill("#campo-chat", "Estou na mesa.")
        await b.press("#campo-chat", "Enter")
        await asyncio.sleep(1.2)
        chegou = await a.evaluate("() => document.getElementById('mensagens').textContent.includes('Estou na mesa.')")
        ok("o chat chega de um para o outro", chegou)

        # sair da reunião: o botão vermelho da tela de chamada
        await a.click("#btn-desligar")
        await asyncio.sleep(1)
        pa = await onde(a)
        ok("o botão vermelho levanta e volta para o salão", not pa["sentado"] and pa["zona"] == "salao", pa)
        ok("  e a tela de chamada fecha", await a.evaluate("() => document.getElementById('chamada').hidden"))

        # ---- porta da diretoria: o dono tranca, quem é de fora é barrado
        await andar(a, 440, 250)
        await a.evaluate("() => enviar({ tipo: 'sala', acao: 'reivindicar', id: 'diretoria1' })")
        await asyncio.sleep(0.8)
        await a.evaluate("() => enviar({ tipo: 'sala', acao: 'trancar', id: 'diretoria1' })")
        await asyncio.sleep(0.8)
        trancada = await b.evaluate("() => !!Jogo.mapa.zonas.find(z => z.id === 'diretoria1').trancada")
        ok("o dono tranca a porta da diretoria", trancada)
        await andar(b, 450, 380)
        await andar(b, 450, 300, segundos=8)
        pb = await onde(b)
        ok("quem é de fora não entra na diretoria trancada", pb["zona"] != "diretoria1", pb)
        await b.screenshot(path=str(CAPTURAS / "porta-trancada.png"),
                           clip={"x": 300, "y": 180, "width": 420, "height": 260})
        await a.evaluate("() => enviar({ tipo: 'sala', acao: 'destrancar', id: 'diretoria1' })")
        await asyncio.sleep(0.8)
        await andar(b, 450, 300, segundos=10)
        pb = await onde(b)
        ok("destrancada, entra", pb["zona"] == "diretoria1", pb)

        # ---- as poltronas de visita: sentar na frente da mesa do dono
        await b.evaluate("() => irSentar(Cenario.assentoPerto(354, 270, 10))")
        await asyncio.sleep(3)
        pb = await onde(b)
        ok("senta na poltrona de visita, dentro da diretoria", pb["sentado"] and pb["zona"] == "diretoria1", pb)
        await a.evaluate("() => irSentar(Cenario.assentoPerto(318, 208, 10))")
        await asyncio.sleep(3)
        pa = await onde(a)
        ok("o dono senta na cadeira dele, atrás da mesa", pa["sentado"] and pa["zona"] == "diretoria1", pa)
        await a.screenshot(path=str(CAPTURAS / "diretoria-com-visita.png"),
                           clip={"x": 60, "y": 90, "width": 520, "height": 330})
        await b.keyboard.down("ArrowDown"); await asyncio.sleep(0.3); await b.keyboard.up("ArrowDown")
        await a.keyboard.down("ArrowRight"); await asyncio.sleep(0.3); await a.keyboard.up("ArrowRight")
        await asyncio.sleep(0.5)

        # ---- os 8 lugares da mesa existem e são da reunião
        n = await a.evaluate("() => Jogo.mapa.cenario.assentos.filter(s => s.zona === 'reuniao').length")
        ok("a mesa de reunião tem 8 lugares", n == 8, n)

        # ---- a composição da referência: um de cada lado da mesa
        await andar(a, 250, 520)
        await andar(b, 1100, 540)
        await a.evaluate("() => { Jogo.eu.direcao = 'direita'; }")
        await asyncio.sleep(1.5)
        await a.screenshot(path=str(CAPTURAS / "codara-escritorio.png"))

        erros = a.erros + b.erros
        ok("nenhum erro de página", not erros, erros[:3])
        await nav.close()


if __name__ == "__main__":
    asyncio.run(main())
    print("\n%d provas, %d falharam" % (len(provas), len(falhas)))
    for f in falhas:
        print("  -", f)
    sys.exit(1 if falhas else 0)
