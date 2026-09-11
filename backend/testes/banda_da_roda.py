"""Quanto maior a roda, menor a imagem que cada um manda.

Aqui não existe servidor de vídeo: cada pessoa manda a própria imagem para
CADA uma das outras. Numa roda de quatro são três envios ao mesmo tempo, e a
subida da internet de casa não dá conta — a imagem congela e o som vai junto.
Este teste põe gente de verdade na mesma roda e lê os números de envio do
navegador.

    CONVITE=... .venv/bin/python testes/banda_da_roda.py
"""
import asyncio
import os
import sys

from playwright.async_api import async_playwright

END = os.environ.get("ENDERECO", "http://127.0.0.1:8400")
CONVITE = os.environ.get("CONVITE", "digital dreamer")
MARCA = os.environ.get("MARCA") or str(os.getpid())[-4:]

provas, falhas = [], []


def ok(nome, cond):
    provas.append(nome)
    print(("  ok    " if cond else "FALHOU  ") + nome)
    if not cond:
        falhas.append(nome)


async def entrar(nav, nome):
    ctx = await nav.new_context(viewport={"width": 900, "height": 700},
                                permissions=["microphone", "camera"])
    pg = await ctx.new_page()
    await pg.goto(END)
    await asyncio.sleep(1.3)
    await pg.click("#aba-criar")
    await pg.fill("#campo-email", nome.lower() + "@teste.local")
    await pg.fill("#campo-nome", nome)
    await pg.fill("#campo-senha", "teste1234")
    await pg.fill("#campo-convite", CONVITE)
    await pg.evaluate("() => entrar(true)")
    await pg.wait_for_function("() => typeof Jogo!=='undefined' && !!Jogo.eu", timeout=40000)
    await asyncio.sleep(1.5)
    return pg


async def envio_de_video(pg):
    """Os números que o navegador está usando para mandar a câmera."""
    return await pg.evaluate("""() => {
        const par = [...Midia.pares.values()][0];
        if (!par) return null;
        const s = par.pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (!s) return null;
        const e = (s.getParameters().encodings || [])[0] || {};
        return { kbps: e.maxBitrate ? Math.round(e.maxBitrate / 1000) : null,
                 encolher: e.scaleResolutionDownBy || null,
                 fps: e.maxFramerate || null,
                 chamadas: Midia.pares.size }; }""")


async def andar_ate(pg, x, y):
    await pg.evaluate("""([x, y]) => {
        Jogo.caminho = tracarCaminho(Jogo.eu.x, Jogo.eu.y, x, y) || caminhoPertoDe({ x, y });
    }""", [x, y])
    try:
        await pg.wait_for_function(
            "([x, y]) => Math.hypot(Jogo.eu.x - x, Jogo.eu.y - y) < 34 || !Jogo.caminho",
            arg=[x, y], timeout=15000)
    except Exception:
        pass
    await asyncio.sleep(.6)


async def principal():
    async with async_playwright() as p:
        nav = await p.chromium.launch(args=[
            "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
            "--autoplay-policy=no-user-gesture-required"])
        a = await entrar(nav, "Bandaa" + MARCA)
        onde = await a.evaluate("() => ({x: Jogo.eu.x, y: Jogo.eu.y})")

        b = await entrar(nav, "Bandab" + MARCA)
        await andar_ate(b, onde["x"] + 40, onde["y"])
        await asyncio.sleep(5)

        dois = await envio_de_video(a)
        print("   com duas pessoas:", dois)
        ok("a chamada abriu entre os dois", bool(dois) and dois["chamadas"] == 1)
        ok("e já nasce com teto de banda", bool(dois) and dois["kbps"] == 900)
        ok("em tamanho cheio", bool(dois) and dois["encolher"] == 1)

        c = await entrar(nav, "Bandac" + MARCA)
        await andar_ate(c, onde["x"], onde["y"] + 40)
        await asyncio.sleep(6)

        tres = await envio_de_video(a)
        print("   com três pessoas:", tres)
        ok("entrou o terceiro na roda", bool(tres) and tres["chamadas"] == 2)
        ok("a banda de cada envio cai", bool(tres) and tres["kbps"] == 600)
        ok("e a imagem encolhe", bool(tres) and tres["encolher"] == 1.5)
        ok("os quadros por segundo também", bool(tres) and tres["fps"] == 20)

        som = await a.evaluate("""() => {
            const par = [...Midia.pares.values()][0];
            const s = par.pc.getSenders().find(s => s.track && s.track.kind === 'audio');
            const e = (s.getParameters().encodings || [])[0] || {};
            return e.networkPriority || e.priority || null; }""")
        print("   prioridade do som:", som)
        ok("o som passa na frente do vídeo", som == "high")

        # o terceiro sai: quem fica volta ao tamanho cheio
        await c.close()
        await asyncio.sleep(4)
        volta = await envio_de_video(a)
        print("   depois que um sai:", volta)
        ok("a imagem volta ao tamanho cheio quando a roda diminui",
           bool(volta) and volta["encolher"] == 1 and volta["kbps"] == 900)

        # ---- aparelho que cai por fora ----
        # É o que acontece quando outro programa toma o microfone, o fone sai
        # ou a aba fica horas escondida: a faixa morre mas continua no stream,
        # com `enabled` true. O botão mostrava ligado e ninguém ouvia nada.
        ok("o microfone está ligado antes do tombo",
           await b.evaluate("() => Midia.ligado('audio')"))
        await b.evaluate("() => { const f = Midia.streamLocal.getAudioTracks()[0];"
                         " f.stop(); if (f.onended) f.onended(); }")
        await asyncio.sleep(1)
        ok("depois do tombo o botão não mente mais",
           await b.evaluate("() => Midia.ligado('audio')") is False)
        avisou = await b.evaluate(
            "() => [...document.querySelectorAll('#mensagens .sistema')]"
            ".some(d => d.textContent.includes('desligado por fora'))")
        ok("e a pessoa é avisada do que houve", avisou)
        await b.evaluate("() => alternarMic()")
        await asyncio.sleep(1.5)
        ok("e dá para ligar de novo no mesmo clique",
           await b.evaluate("() => Midia.ligado('audio')"))
        volta = await b.evaluate(
            "() => { const par = [...Midia.pares.values()][0];"
            " const s = par.pc.getSenders().find(s => s.track && s.track.kind === 'audio');"
            " return !!(s && s.track && s.track.readyState === 'live'); }")
        ok("e o som volta a sair para a chamada", volta)

        # ---- borda do raio ----
        # Um passo para fora e outro para dentro derrubava a chamada e abria
        # outra do zero. Agora a saída tem carência: só cai quem ficou fora.
        alvo = await b.evaluate("() => [...Midia.pares.keys()][0]")
        await andar_ate(b, onde["x"] + 330, onde["y"])
        d = await b.evaluate("([x,y]) => Math.hypot(Jogo.eu.x-x, Jogo.eu.y-y)",
                             [onde["x"], onde["y"]])
        print("   distância depois de andar: %.0f px" % d)
        ok("andou mesmo para fora do raio", d > 215)
        # o relógio da carência é o que decide: com ela ainda correndo a
        # chamada fica de pé, e é isso que impede o pisca-pisca na fronteira
        estado = await b.evaluate("""(id) => {
            foraDesde.set(id, Date.now());          // acabou de cruzar a linha
            Midia.garantirPar(id);
            cuidarDasChamadas();
            return { dePe: Midia.pares.has(id), marcado: foraDesde.has(id) }; }""", alvo)
        print("   recém-saído:", estado)
        ok("recém-saído do raio, a chamada continua de pé", estado["dePe"])
        ok("e fica marcado como quem saiu agora", estado["marcado"])
        caiu = await b.evaluate("""(id) => {
            foraDesde.set(id, Date.now() - 5000);   // ficou fora de verdade
            cuidarDasChamadas();
            return !Midia.pares.has(id); }""", alvo)
        ok("passada a carência, a chamada cai", caiu)

        await nav.close()


asyncio.run(principal())
