"""Todo mundo ouve todo mundo? Matriz "quem ouve quem" com 3 pessoas.

Os dois defeitos que voltavam sempre:
  1. quem entra com câmera e microfone fechados e liga o microfone depois não é
     ouvido por ninguém;
  2. com 3 ou mais na roda, "escuto um e não escuto o outro".

Cada rodada abre 3 navegadores com microfone falso (o Chromium toca um bipe),
numa ordem de entrada diferente, e confere em CADA página, para CADA outra
pessoa: a chamada está ligada e estável, o som chega pela rede, chega ao
elemento que toca, e esse elemento está tocando. Uma célula vazia na matriz é
falha. Como quem é o "polido" muda a cada entrada (o id é sorteado), cada
cenário roda várias vezes.

Como rodar (servidor de teste numa porta separada, dados numa pasta à parte):

    cd backend
    DADOS_DIR=/caminho/vazio SENHA=teste123 .venv/bin/uvicorn main:app --port 8411 &
    ENDERECO=http://127.0.0.1:8411 CONVITE=teste123 .venv/bin/python testes/malha_de_som.py

REPETIR=n muda quantas vezes cada cenário roda (padrão 3).
"""
import asyncio
import os
import sys
import time

from playwright.async_api import async_playwright

END = os.environ.get("ENDERECO", "http://127.0.0.1:8411")
CONVITE = os.environ.get("CONVITE", "teste123")
REPETIR = int(os.environ.get("REPETIR", "3"))
MARCA = str(int(time.time()))[-5:]
falhas = []
contador = [0]


async def entrar(nav, nome, com_midia):
    ctx = await nav.new_context(viewport={"width": 1000, "height": 700},
                                permissions=["microphone", "camera"])
    pg = await ctx.new_page()
    pg.on("pageerror", lambda e: print("   [erro de página]", nome, str(e)[:150]))
    await pg.goto(END)
    await asyncio.sleep(1.0)
    contador[0] += 1
    unico = nome + MARCA + str(contador[0])
    await pg.click("#aba-criar")
    await pg.fill("#campo-email", unico.lower() + "@teste.local")
    await pg.fill("#campo-nome", unico)
    await pg.fill("#campo-senha", "teste1234")
    await pg.fill("#campo-convite", CONVITE)
    await pg.evaluate("(m) => entrar(m)", com_midia)
    await pg.wait_for_function("() => typeof Jogo!=='undefined' && !!Jogo.eu", timeout=40000)
    return ctx, pg, unico


MEDIR = """async (nome) => {
  const p = [...Jogo.pessoas.values()].find(x => x.nome === nome);
  if (!p) return {erro: 'não vejo a pessoa'};
  const par = Midia.pares.get(p.id);
  if (!par) return {erro: 'sem chamada'};
  const bytes = async () => { let t = 0; (await par.pc.getStats()).forEach(s => {
      if (s.type === 'inbound-rtp' && s.kind === 'audio') t += s.bytesReceived || 0; }); return t; };
  const b0 = await bytes();
  const faixas = par.stream.getAudioTracks().filter(f => f.readyState === 'live');
  // o elemento que de fato toca o som dessa pessoa (seja <audio> ou <video>)
  const els = [...document.querySelectorAll('audio, video')].filter(e => e.srcObject
      && e.srcObject.getAudioTracks().some(f => faixas.includes(f)));
  const tocando = els.some(e => !e.paused && !e.muted && e.volume > 0);
  let nivel = 0;
  if (faixas.length) {
    const ctx = new AudioContext(); await ctx.resume();
    const src = ctx.createMediaStreamSource(new MediaStream(faixas));
    const an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
    const d = new Float32Array(an.fftSize);
    for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 100));
      an.getFloatTimeDomainData(d); let m = 0; for (const x of d) m = Math.max(m, Math.abs(x)); nivel = Math.max(nivel, m); }
    ctx.close();
  } else { await new Promise(r => setTimeout(r, 2000)); }
  const b1 = await bytes();
  return { conexao: par.pc.connectionState, negociacao: par.pc.signalingState,
           bytes: b1 - b0, nivel: Math.round(nivel * 1000) / 1000, tocando, faixas: faixas.length };
}"""


def ouviu(m):
    return (not m.get("erro") and m.get("conexao") == "connected"
            and m.get("bytes", 0) > 1000 and m.get("nivel", 0) > 0.01 and m.get("tocando"))


async def rodada(nav, titulo, ordem, ligam_depois, juntos=False):
    """ordem: [(nome, entra_com_midia)]; ligam_depois: quem liga o microfone
    depois que as chamadas já estão de pé."""
    gente = {}
    if juntos:
        prontos = await asyncio.gather(*[entrar(nav, n, c) for n, c in ordem])
        gente = {n: g for (n, _), g in zip(ordem, prontos)}
    else:
        for nome, com in ordem:
            gente[nome] = await entrar(nav, nome, com)
    pgs = {n: g[1] for n, g in gente.items()}
    nomes = {n: g[2] for n, g in gente.items()}
    outros = len(gente) - 1
    try:
        await asyncio.gather(*[pg.wait_for_function(
            "(n) => [...Midia.pares.values()].filter(p => p.pc.connectionState === 'connected').length >= n",
            arg=outros, timeout=25000) for pg in pgs.values()])
    except Exception:
        pass
    for n in ligam_depois:
        await pgs[n].evaluate("() => alternarMic()")
    await asyncio.sleep(5 if ligam_depois else 2)

    ok_rodada = True
    linhas = []
    for ouvinte, pg in pgs.items():
        alvos = [n for n in pgs if n != ouvinte]
        medidas = await asyncio.gather(*[pg.evaluate(MEDIR, nomes[a]) for a in alvos])
        for alvo, m in zip(alvos, medidas):
            bom = ouviu(m)
            ok_rodada &= bom
            if not bom:
                linhas.append(f"      {ouvinte} NÃO ouve {alvo}: {m}")
    print(("  ok    " if ok_rodada else "FALHOU  ") + titulo)
    for l in linhas:
        print(l)
    if not ok_rodada:
        falhas.append(titulo)
    for ctx, _pg, _ in gente.values():
        await ctx.close()
    await asyncio.sleep(1.5)       # dá tempo de o servidor tirar todo mundo da sala


CENARIOS = [
    ("todos entram com microfone",
     [("A", True), ("B", True), ("C", True)], []),
    ("B entra no meio sem nada e liga o microfone depois",
     [("A", True), ("B", False), ("C", True)], ["B"]),
    ("B entra primeiro sem nada e liga depois",
     [("B", False), ("A", True), ("C", True)], ["B"]),
    ("B entra por último sem nada e liga depois",
     [("A", True), ("C", True), ("B", False)], ["B"]),
    ("os três entram sem nada e ligam depois",
     [("A", False), ("B", False), ("C", False)], ["A", "B", "C"]),
]


async def main():
    async with async_playwright() as p:
        nav = await p.chromium.launch(args=[
            "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
            "--autoplay-policy=no-user-gesture-required"])
        for vez in range(1, REPETIR + 1):
            for titulo, ordem, ligam in CENARIOS:
                await rodada(nav, f"[{vez}/{REPETIR}] {titulo}", ordem, ligam)
            # todos entrando colados, sem esperar um ao outro: é quando as
            # ofertas mais se cruzam
            await rodada(nav, f"[{vez}/{REPETIR}] entram juntos, B sem nada e liga depois",
                         [("A", True), ("B", False), ("C", True)], ["B"], juntos=True)
        await nav.close()


asyncio.run(main())
total = REPETIR * (len(CENARIOS) + 1)
print("\n%d rodadas, %d falharam" % (total, len(falhas)))
sys.exit(1 if falhas else 0)
