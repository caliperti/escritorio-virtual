"""Quem liga o microfone DEPOIS que a chamada já existe é ouvido?

A ouve. B entra, desliga o microfone, e só depois A chega: a chamada A-B nasce com
B mudo. Aí B liga o microfone. C é o controle: chamada nasce com o microfone dele
ligado, ele desliga e liga de novo. Medimos em A o som que de fato chega ao
cartão de cada um (analisador ligado no srcObject do <video>).
"""
import asyncio, os, sys, time
from playwright.async_api import async_playwright

END = os.environ.get("ENDERECO", "http://127.0.0.1:8411")
CONVITE = os.environ.get("CONVITE", "teste123")
MARCA = str(int(time.time()))[-5:]
provas, falhas = [], []


def ok(nome, cond):
    provas.append(nome)
    print(("  ok    " if cond else "FALHOU  ") + nome)
    if not cond:
        falhas.append(nome)


async def entrar(nav, nome):
    ctx = await nav.new_context(viewport={"width": 900, "height": 700}, permissions=["microphone", "camera"])
    pg = await ctx.new_page()
    pg.on("pageerror", lambda e: print("   [erro de página]", nome, str(e)[:150]))
    await pg.goto(END)
    await asyncio.sleep(1.3)
    await pg.click("#aba-criar")
    await pg.fill("#campo-email", nome.lower() + MARCA + "@teste.local")
    await pg.fill("#campo-nome", nome + MARCA)
    await pg.fill("#campo-senha", "teste1234")
    await pg.fill("#campo-convite", CONVITE)
    await pg.evaluate("() => entrar(true)")
    await pg.wait_for_function("() => typeof Jogo!=='undefined' && !!Jogo.eu", timeout=40000)
    await asyncio.sleep(1.5)
    return pg


MEDIR = """async (nome) => {
  const p = [...Jogo.pessoas.values()].find(x => x.nome === nome);
  if (!p) return {erro: 'não achei ' + nome};
  const par = Midia.pares.get(p.id);
  if (!par) return {erro: 'sem chamada com ' + nome};
  const v = par.video;
  const faixas = v && v.srcObject ? v.srcObject.getAudioTracks() : [];
  // bytes de som que chegam pela rede
  const bytes = async () => { let t = 0; (await par.pc.getStats()).forEach(s => {
      if (s.type === 'inbound-rtp' && s.kind === 'audio') t += s.bytesReceived || 0; }); return t; };
  const b0 = await bytes();
  // som que chega ao cartão (o que a pessoa ouviria)
  let nivel = 0;
  if (faixas.length) {
    const ctx = new AudioContext(); await ctx.resume();
    const src = ctx.createMediaStreamSource(v.srcObject);
    const an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
    const d = new Float32Array(an.fftSize);
    for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 100));
      an.getFloatTimeDomainData(d); let m = 0; for (const x of d) m = Math.max(m, Math.abs(x)); nivel = Math.max(nivel, m); }
    ctx.close();
  } else { await new Promise(r => setTimeout(r, 2000)); }
  const b1 = await bytes();
  return { estado: par.pc.connectionState, faixasNoCartao: faixas.length,
           faixasVivas: faixas.filter(f => f.readyState === 'live').length,
           bytesChegando: b1 - b0, nivelNoCartao: Math.round(nivel * 1000) / 1000,
           transceptoresAudio: par.pc.getTransceivers().filter(t => t.receiver.track.kind === 'audio').length };
}"""


async def main():
    async with async_playwright() as p:
        nav = await p.chromium.launch(args=[
            "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
            "--autoplay-policy=no-user-gesture-required"])
        b = await entrar(nav, "Bmudo")
        await b.evaluate("() => alternarMic()")            # B fica mudo ANTES de A chegar
        await asyncio.sleep(1)
        ok("B ficou mudo", not await b.evaluate("() => Midia.ligado('audio')"))
        c = await entrar(nav, "Cligado")
        # D já está mostrando a tela quando A chega (voz num stream, tela em outro)
        d = await entrar(nav, "Dtela")
        await d.evaluate("""async () => {
            const cv = document.createElement('canvas'); cv.width = 320; cv.height = 200;
            const g = cv.getContext('2d'); setInterval(() => { g.fillStyle = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6,'0'); g.fillRect(0,0,320,200); }, 200);
            navigator.mediaDevices.getDisplayMedia = async () => cv.captureStream(5);
            await Midia.compartilharTela(); avisarMidia(); }""")
        await asyncio.sleep(1)
        ok("D está mostrando a tela", await d.evaluate("() => !!Midia.telaStream"))
        a = await entrar(nav, "Aouve")
        try:
            await a.wait_for_function("() => [...Midia.pares.values()].filter(p => p.pc.connectionState === 'connected').length >= 3", timeout=25000)
        except Exception:
            pass
        ok("A tem chamada ligada com B, C e D", await a.evaluate("() => [...Midia.pares.values()].filter(p => p.pc.connectionState === 'connected').length") >= 3)

        # C (controle): desliga e liga de novo
        await c.evaluate("() => alternarMic()"); await asyncio.sleep(1.5)
        await c.evaluate("() => alternarMic()")
        # B liga o microfone com a chamada já de pé
        await b.evaluate("() => alternarMic()")
        await asyncio.sleep(5)
        ok("B ligou o microfone", await b.evaluate("() => Midia.ligado('audio')"))

        mb = await a.evaluate(MEDIR, "Bmudo" + MARCA)
        mc = await a.evaluate(MEDIR, "Cligado" + MARCA)
        print("   A ouvindo B (ligou o mic depois):", mb)
        print("   A ouvindo C (mic ligado desde o começo):", mc)
        ok("o som de C chega pela rede a A", mc.get("bytesChegando", 0) > 1000)
        ok("o som de C toca no cartão dele em A", mc.get("nivelNoCartao", 0) > 0.01)
        ok("o som de B chega pela rede a A", mb.get("bytesChegando", 0) > 1000)
        ok("o som de B toca no cartão dele em A", mb.get("nivelNoCartao", 0) > 0.01)

        md = await a.evaluate(MEDIR, "Dtela" + MARCA)
        print("   A ouvindo D (mostrando a tela):", md)
        ok("A ouve D, que já mostrava a tela", md.get("nivelNoCartao", 0) > 0.01)
        ok("e vê a tela de D", await a.evaluate("""(nome) => { const p = [...Jogo.pessoas.values()].find(x => x.nome === nome);
            const par = Midia.pares.get(p.id); return !!par.video && par.video.srcObject.getVideoTracks().some(f => f.readyState === 'live'); }""", "Dtela" + MARCA))
        # o cartão toca de verdade (não só o stream tem a faixa)?
        tocando = await a.evaluate("""() => [...Midia.pares.values()].map(p => p.video && !p.video.paused && p.video.srcObject === p.stream)""")
        ok("todos os cartões de A estão tocando o stream certo", all(tocando) and len(tocando) >= 3)

        # e o contrário: B ouve A?
        ma = await b.evaluate(MEDIR, "Aouve" + MARCA)
        print("   B ouvindo A:", ma)
        ok("B ouve A", ma.get("nivelNoCartao", 0) > 0.01)
        await nav.close()


asyncio.run(main())
print("\n%d provas, %d falharam" % (len(provas), len(falhas)))
sys.exit(1 if falhas else 0)
