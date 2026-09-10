"""Mutar o microfone corta o som de verdade, com microfone de mentira do
navegador. Não basta o ícone mudar: a faixa tem de sair do envio.

    .venv/bin/python testes/mudo.py
"""
import asyncio, os, sys
from playwright.async_api import async_playwright
END = os.environ.get("ENDERECO", "http://127.0.0.1:8400")
CONVITE = "digital dreamer"
provas=[]; falhas=[]
def ok(n,c):
    provas.append(n); print(("  ok    " if c else "FALHOU  ")+n)
    if not c: falhas.append(n)

async def entrar(nav, nome):
    ctx = await nav.new_context(viewport={"width":1000,"height":760}, permissions=["microphone","camera"])
    pg = await ctx.new_page()
    await pg.goto(END); await asyncio.sleep(1.3)
    await pg.click("#aba-criar")
    await pg.fill("#campo-email", nome.lower()+"@teste.local")
    await pg.fill("#campo-nome", nome)
    await pg.fill("#campo-senha", "teste1234")
    await pg.fill("#campo-convite", CONVITE)
    await pg.evaluate("() => entrar(true)")
    await pg.wait_for_function("() => typeof Jogo!=='undefined' && !!Jogo.eu", timeout=40000)
    await asyncio.sleep(1.6)
    return pg

async def m():
    marca = str(abs(hash(END)) % 1000)
    async with async_playwright() as p:
        nav = await p.chromium.launch(args=[
            "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
            "--autoplay-policy=no-user-gesture-required"])
        a = await entrar(nav, "Mudoa"+marca)
        ok("o microfone abriu", await a.evaluate("() => Midia.ligado('audio')"))
        b = await entrar(nav, "Mudob"+marca)
        # põe os dois lado a lado e espera a chamada
        pos = await a.evaluate("() => ({x: Jogo.eu.x, y: Jogo.eu.y})")
        await b.evaluate("""(p) => { Jogo.eu.x = p.x + 20; Jogo.eu.y = p.y;
            Jogo.eu.xr = Jogo.eu.x; Jogo.eu.yr = Jogo.eu.y;
            enviar({tipo:'mover', x:Jogo.eu.x, y:Jogo.eu.y, direcao:'esquerda'}); }""", pos)
        await asyncio.sleep(3.5)
        ok("os dois abriram chamada", await a.evaluate("() => Midia.pares.size") >= 1)
        antes = await a.evaluate("""() => {
            const par = [...Midia.pares.values()][0];
            const s = par.pc.getSenders().find(s => s.track && s.track.kind === 'audio');
            return { temFaixa: !!s, viva: !!s && s.track.readyState === 'live' }; }""")
        print("   antes de mutar:", antes)
        ok("com o microfone aberto, sai faixa de áudio para o outro", antes["temFaixa"])
        await a.evaluate("() => alternarMic()")
        await asyncio.sleep(2.0)
        depois = await a.evaluate("""() => {
            const par = [...Midia.pares.values()][0];
            const s = par.pc.getSenders().find(s => s.track && s.track.kind === 'audio');
            return { aindaManda: !!s, estado: s ? s.track.readyState : null,
                     ligado: Midia.ligado('audio'),
                     faixasLocais: Midia.streamLocal ? Midia.streamLocal.getAudioTracks().length : -1 }; }""")
        print("   depois de mutar:", depois)
        ok("mutar tira a faixa de áudio do envio", not depois["aindaManda"])
        ok("e o botão fica desligado", depois["ligado"] is False)
        ok("e não sobra faixa de microfone aberta", depois["faixasLocais"] == 0)
        # o outro lado deixa de receber som?
        rec = await b.evaluate("""() => {
            const par = [...Midia.pares.values()][0];
            if (!par) return null;
            const r = par.pc.getReceivers().find(r => r.track && r.track.kind === 'audio');
            return { recebe: !!r, mudo: r ? r.track.muted : null }; }""")
        print("   do outro lado:", rec)
        await nav.close()
asyncio.run(m())
print("\n%d provas, %d falharam" % (len(provas), len(falhas)))
sys.exit(1 if falhas else 0)
