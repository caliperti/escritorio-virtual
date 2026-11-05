"""Revisão de 05/11 (Fable): a voz chega ao cartão em todos os caminhos?

Parte 1 (um navegador, 3 pessoas, som liberado): B entra e desliga mic e câmera; C
entra e desliga a câmera; A chega por último. Cada chamada nasce com canal só de
receber do lado de B e de C. Depois: B liga/desliga/liga o mic (3 vezes); C mostra a
tela, para e liga a câmera; B liga a câmera; A refaz o caminho (restartIce) com B.
Em cada passo medimos no cartão de A o que de fato chega (faixas, nível de som,
tocando ou não, srcObject certo, sem faixa dobrada) e se o botão "Clique para
ouvir" apareceu à toa.

Parte 2 (navegador sem bandeira de autoplay, sem clique nenhum): entrada automática
de verdade. O Chromium barra o som de uma chamada sem gesto? O botão aparece?

Parte 3 (uma página): entrar(true) chamado duas vezes, como o botão "Entrar" clicado
durante a entrada automática. Quantas faixas o stream local ganha e quantas vezes a
pessoa entra no servidor?
"""
import asyncio, os, re, sys, time
from playwright.async_api import async_playwright

END = os.environ.get("ENDERECO", "http://127.0.0.1:8411")
CONVITE = os.environ.get("CONVITE", "teste123")
REGISTRO = os.environ.get("REGISTRO_SERVIDOR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "srv", "registro.log"))
MARCA = str(int(time.time()))[-5:]
provas, falhas = [], []


def ok(nome, cond):
    provas.append(nome)
    print(("  ok    " if cond else "FALHOU  ") + nome)
    if not cond:
        falhas.append(nome)


async def entrar(nav, nome, sem_clique=False, init=None):
    ctx = await nav.new_context(viewport={"width": 900, "height": 700}, permissions=["microphone", "camera"])
    if init:
        await ctx.add_init_script(init)
    pg = await ctx.new_page()
    pg.on("pageerror", lambda e: print("   [erro de página]", nome, str(e)[:150]))
    await pg.goto(END)
    await asyncio.sleep(1.3)
    email = nome.lower() + MARCA + "@teste.local"
    if sem_clique:
        # nada de clique nem tecla: a página não ganha "gesto do usuário"
        await pg.evaluate("""([email, nome, convite]) => { usarModo('criar');
            document.getElementById('campo-email').value = email;
            document.getElementById('campo-nome').value = nome;
            document.getElementById('campo-senha').value = 'teste1234';
            document.getElementById('campo-convite').value = convite; }""", [email, nome + MARCA, CONVITE])
    else:
        await pg.click("#aba-criar")
        await pg.fill("#campo-email", email)
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
  const videos = v && v.srcObject ? v.srcObject.getVideoTracks() : [];
  const bytes = async () => { let t = 0; (await par.pc.getStats()).forEach(s => {
      if (s.type === 'inbound-rtp' && s.kind === 'audio') t += s.bytesReceived || 0; }); return t; };
  const b0 = await bytes();
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
  const botao = document.getElementById('ouvir');
  return { estado: par.pc.connectionState, audioNoCartao: faixas.length,
           audioVivo: faixas.filter(f => f.readyState === 'live').length,
           videoVivo: videos.filter(f => f.readyState === 'live').length,
           bytesChegando: b1 - b0, nivel: Math.round(nivel * 1000) / 1000,
           tocando: !!v && !v.paused, prontidao: v ? v.readyState : -1,
           largura: v ? v.videoWidth : -1, volume: v ? v.volume : -1,
           streamCerto: !!v && v.srcObject === par.stream,
           transceptores: par.pc.getTransceivers().length,
           botaoOuvir: !!botao && !botao.classList.contains('oculto') };
}"""

ESPERAR_VIDEO = """async (nome) => {
  const p = [...Jogo.pessoas.values()].find(x => x.nome === nome);
  const par = p && Midia.pares.get(p.id);
  for (let i = 0; i < 60; i++) {
    const v = par && par.video;
    if (v && v.srcObject === par.stream && v.videoWidth > 0 && !v.paused
        && v.srcObject.getVideoTracks().some(f => f.readyState === 'live')) return true;
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}"""

TELA_FALSA = """async () => {
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 200;
  const g = cv.getContext('2d');
  setInterval(() => { g.fillStyle = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6,'0'); g.fillRect(0,0,320,200); }, 200);
  navigator.mediaDevices.getDisplayMedia = async () => cv.captureStream(5);
  await Midia.compartilharTela(); avisarMidia(); montarTiles(); }"""


def contar(padrao):
    try:
        with open(REGISTRO, encoding="utf-8", errors="replace") as f:
            return len(re.findall(padrao, f.read()))
    except FileNotFoundError:
        return -1


async def parte1(p):
    print("\n=== Parte 1: roda de 3 com canais só de receber ===")
    nav = await p.chromium.launch(args=[
        "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
        "--autoplay-policy=no-user-gesture-required"])
    b = await entrar(nav, "Bmudo")
    await b.evaluate("() => alternarMic()"); await asyncio.sleep(0.5)
    await b.evaluate("() => alternarCam()"); await asyncio.sleep(0.5)
    ok("B ficou sem mic e sem câmera", not await b.evaluate("() => Midia.ligado('audio') || Midia.ligado('video')"))
    c = await entrar(nav, "Csemcam")
    await c.evaluate("() => alternarCam()"); await asyncio.sleep(0.5)
    ok("C ficou sem câmera", not await c.evaluate("() => Midia.ligado('video')"))
    a = await entrar(nav, "Aouve")
    try:
        await a.wait_for_function("() => [...Midia.pares.values()].filter(p => p.pc.connectionState === 'connected').length >= 2", timeout=25000)
    except Exception:
        pass
    ok("A tem chamada ligada com B e C", await a.evaluate("() => [...Midia.pares.values()].filter(p => p.pc.connectionState === 'connected').length") >= 2)
    topo = await a.evaluate("() => [...Midia.pares.values()].map(p => p.pc.getTransceivers().map(t => t.mid + ':' + t.receiver.track.kind + ':' + t.currentDirection))")
    print("   transceptores de A:", topo)

    # B: liga, desliga, liga (3 cliques), com a chamada de pé
    for _ in range(3):
        await b.evaluate("() => alternarMic()"); await asyncio.sleep(1.2)
    ok("B terminou com o microfone ligado", await b.evaluate("() => Midia.ligado('audio')"))
    await asyncio.sleep(2.5)
    mb = await a.evaluate(MEDIR, "Bmudo" + MARCA)
    print("   A ouvindo B:", mb)
    ok("A ouve B (nível no cartão)", mb.get("nivel", 0) > 0.01)
    ok("cartão de B em A tem UMA faixa de áudio, viva", mb.get("audioNoCartao") == 1 and mb.get("audioVivo") == 1)
    ok("cartão de B em A está tocando o stream certo", mb.get("tocando") and mb.get("streamCerto"))
    ok("sem botão 'Clique para ouvir' à toa em A", not mb.get("botaoOuvir"))

    # C mostra a tela com a chamada de pé (câmera estava desligada quando nasceu)
    await c.evaluate(TELA_FALSA)
    ok("C está mostrando a tela", await c.evaluate("() => !!Midia.telaStream"))
    ok("A vê a tela de C (quadros chegando no cartão)", await a.evaluate(ESPERAR_VIDEO, "Csemcam" + MARCA))
    mc = await a.evaluate(MEDIR, "Csemcam" + MARCA)
    print("   A vendo/ouvindo C (tela):", mc)
    ok("A continua ouvindo C com a tela no ar", mc.get("nivel", 0) > 0.01 and mc.get("audioNoCartao") == 1)
    # C para a tela e liga a câmera
    await c.evaluate("async () => { await alternarTela(); }"); await asyncio.sleep(0.8)
    await c.evaluate("async () => { await alternarCam(); }")
    ok("C parou a tela e ligou a câmera", await c.evaluate("() => !Midia.telaStream && Midia.ligado('video')"))
    ok("A vê a câmera de C depois da tela", await a.evaluate(ESPERAR_VIDEO, "Csemcam" + MARCA))
    mc2 = await a.evaluate(MEDIR, "Csemcam" + MARCA)
    ok("cartão de C em A: 1 áudio vivo, 1 vídeo vivo, sem dobra", mc2.get("audioVivo") == 1 and mc2.get("videoVivo") == 1 and mc2.get("audioNoCartao") == 1)

    # B liga a câmera
    await b.evaluate("async () => { await alternarCam(); }")
    ok("A vê a câmera de B, ligada depois", await a.evaluate(ESPERAR_VIDEO, "Bmudo" + MARCA))

    # A refaz o caminho com B
    await a.evaluate("""(nome) => { const p = [...Jogo.pessoas.values()].find(x => x.nome === nome);
        Midia.pares.get(p.id).pc.restartIce(); }""", "Bmudo" + MARCA)
    await asyncio.sleep(4)
    mb2 = await a.evaluate(MEDIR, "Bmudo" + MARCA)
    print("   A ouvindo B depois do restartIce:", mb2)
    ok("depois do restartIce A segue ouvindo e vendo B", mb2.get("estado") == "connected" and mb2.get("nivel", 0) > 0.01 and mb2.get("videoVivo") == 1 and mb2.get("tocando"))
    ok("depois do restartIce o cartão de B não dobrou faixa", mb2.get("audioNoCartao") == 1)

    # o contrário
    ma = await b.evaluate(MEDIR, "Aouve" + MARCA)
    mca = await c.evaluate(MEDIR, "Aouve" + MARCA)
    mbc = await b.evaluate(MEDIR, "Csemcam" + MARCA)
    print("   B ouvindo A:", ma); print("   C ouvindo A:", mca); print("   B ouvindo C:", mbc)
    ok("B ouve A", ma.get("nivel", 0) > 0.01 and ma.get("tocando"))
    ok("C ouve A", mca.get("nivel", 0) > 0.01 and mca.get("tocando"))
    ok("B ouve C", mbc.get("nivel", 0) > 0.01 and mbc.get("tocando"))
    ok("ninguém viu o botão 'Clique para ouvir'", not any(m.get("botaoOuvir") for m in (ma, mca, mbc)))
    await nav.close()


async def parte2(p):
    print("\n=== Parte 2: entrada automática sem gesto, política de autoplay padrão ===")
    nav = await p.chromium.launch(args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"])
    b = await entrar(nav, "Bsem", sem_clique=True)
    await b.evaluate("() => alternarMic()"); await asyncio.sleep(0.5)
    a = await entrar(nav, "Asem", sem_clique=True)
    try:
        await a.wait_for_function("() => [...Midia.pares.values()].some(p => p.pc.connectionState === 'connected')", timeout=25000)
    except Exception:
        pass
    await asyncio.sleep(1.5)
    await b.evaluate("() => alternarMic()")
    await asyncio.sleep(3)
    mb = await a.evaluate(MEDIR, "Bsem" + MARCA)
    ma = await b.evaluate(MEDIR, "Asem" + MARCA)
    print("   A ouvindo B (sem gesto):", mb); print("   B ouvindo A (sem gesto):", ma)
    print("   (informativo) som tocando sem gesto no Chromium: A->", mb.get("tocando"), " B->", ma.get("tocando"),
          "; botão em A:", mb.get("botaoOuvir"), " em B:", ma.get("botaoOuvir"))
    ok("sem gesto: o som chega ao cartão de A ou o botão 'Clique para ouvir' aparece", (mb.get("tocando") and mb.get("nivel", 0) > 0.01) or mb.get("botaoOuvir"))
    ok("sem gesto: o som chega ao cartão de B ou o botão aparece", (ma.get("tocando") and ma.get("nivel", 0) > 0.01) or ma.get("botaoOuvir"))
    await nav.close()


async def parte3(p):
    print("\n=== Parte 3: entrar(true) duas vezes na mesma página ===")
    atraso = """(() => { const md = navigator.mediaDevices; const gum = md.getUserMedia.bind(md);
        md.getUserMedia = async (c) => { await new Promise(r => setTimeout(r, 1500)); return gum(c); }; })();"""
    nav = await p.chromium.launch(args=[
        "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
        "--autoplay-policy=no-user-gesture-required"])
    nome = "Dobro" + MARCA
    pg = await entrar(nav, "Dobro", init=atraso)
    ok("primeira entrada normal: 2 faixas locais", await pg.evaluate("() => Midia.streamLocal.getTracks().length") == 2)
    antes_entrou = contar(r"entrou: %s " % nome)
    antes_troca = contar(r"sessão trocada: %s " % nome)
    # F5: a sessão salva entra sozinha; enquanto pede o aparelho, a pessoa clica em "Entrar"
    await pg.reload()
    # espera a sessão salva ser reconhecida (é aí que a entrada automática começa)
    await pg.wait_for_function("() => typeof sessao !== 'undefined' && !!sessao.conta", timeout=10000)
    await asyncio.sleep(0.4)
    visivel = await pg.evaluate("() => { const b = document.getElementById('btn-entrar'); const r = b.getBoundingClientRect(); return !b.hidden && r.width > 0 && !b.disabled; }")
    print("   botão 'Entrar' clicável durante a entrada automática:", visivel)
    if visivel:
        await pg.click("#btn-entrar")
    else:
        await pg.evaluate("() => entrar(true)")
    await pg.wait_for_function("() => typeof Jogo!=='undefined' && !!Jogo.eu", timeout=30000)
    await asyncio.sleep(4)
    faixas = await pg.evaluate("() => Midia.streamLocal ? Midia.streamLocal.getTracks().map(f => f.kind + ':' + f.readyState) : []")
    enviando = await pg.evaluate("() => [...Midia.pares.values()].map(p => p.pc.getSenders().filter(s => s.track).length)")
    entrou = contar(r"entrou: %s " % nome) - antes_entrou
    troca = contar(r"sessão trocada: %s " % nome) - antes_troca
    print("   faixas locais depois do clique:", faixas, "| entradas no servidor:", entrou, "| sessão trocada:", troca)
    ok("stream local continua com 2 faixas (uma de som, uma de imagem)", len(faixas) == 2)
    ok("a pessoa entrou UMA vez no servidor (sem 'sessão trocada' consigo mesma)", entrou == 1 and troca == 0)
    await nav.close()


async def main():
    async with async_playwright() as p:
        await parte1(p)
        await parte2(p)
        await parte3(p)


asyncio.run(main())
print("\n%d provas, %d falharam" % (len(provas), len(falhas)))
for f in falhas:
    print("   -", f)
sys.exit(1 if falhas else 0)
