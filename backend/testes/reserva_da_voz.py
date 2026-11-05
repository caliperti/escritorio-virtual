"""A voz que não fecha direto passa pelo servidor de reserva (03/11/2026).

"Toda hora um para de ouvir o outro e tem que ficar saindo e entrando." A chamada
era só direta (STUN): quem estava atrás de celular, VPN ou rede de empresa ficava
sem som, e o som que o navegador barrava sem clique sumia calado. Aqui:

  1. quem entra recebe o servidor de reserva com uma senha temporária que o
     coturn aceita (o mesmo cálculo do use-auth-secret), e o /config aberto não;
  2. uma chamada obrigada a passar pela reserva fecha e chega ao registro do
     servidor como "conectou (pela reserva)";
  3. o som barrado pelo navegador mostra o botão "Clique para ouvir", e o clique
     solta o som.

Precisa do servidor de teste de pé com TURN_SEGREDO e TURN_URLS apontando para o
coturn de verdade, e do registro dele num arquivo:

    TURN_SEGREDO=... CONVITE=... REGISTRO=/caminho/do/log .venv/bin/python testes/reserva_da_voz.py
"""
import asyncio
import base64
import hashlib
import hmac
import json
import os
import time
import urllib.request

import websockets
from playwright.async_api import async_playwright

END = os.environ.get("ENDERECO", "http://127.0.0.1:8400")
CONVITE = os.environ.get("CONVITE", "digital dreamer")
SEGREDO = os.environ.get("TURN_SEGREDO", "")
REGISTRO = os.environ.get("REGISTRO", "")
MARCA = os.environ.get("MARCA") or str(os.getpid())[-4:]

provas, falhas = [], []


def ok(nome, cond):
    provas.append(nome)
    print(("  ok    " if cond else "FALHOU  ") + nome)
    if not cond:
        falhas.append(nome)


async def bemvindo_de_visitante():
    ws_end = END.replace("http", "ws", 1) + "/ws"
    async with websockets.connect(ws_end) as ws:
        await ws.send(json.dumps({"tipo": "entrar", "visitante": True, "nome": "Visita" + MARCA, "convite": CONVITE}))
        for _ in range(20):
            msg = json.loads(await asyncio.wait_for(ws.recv(), 10))
            if msg.get("tipo") == "bemvindo":
                return msg
    return None


async def entrar(nav, nome, sem_gesto=False, com_microfone=True):
    # Sem microfone: o Chrome deixa tocar som de chamada sem clique enquanto a página
    # usa o microfone; quem entra só para ouvir é quem fica sem som.
    ctx = await nav.new_context(viewport={"width": 900, "height": 700},
                                permissions=["microphone", "camera"] if com_microfone else [])
    if not com_microfone:
        # O navegador do teste aceita o pedido de microfone sozinho; aqui ele recusa,
        # como na pessoa que negou o aparelho.
        await ctx.add_init_script("navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('negado', 'NotAllowedError'));")
    pg = await ctx.new_page()
    await pg.goto(END)
    await asyncio.sleep(1.3)
    # sem_gesto: entra só por código, sem clique nem tecla, para o navegador não
    # contar como gesto da pessoa e barrar o som (o caso do "não ouço ninguém").
    await pg.evaluate("""([email, nome, convite]) => {
        document.getElementById('aba-criar').dispatchEvent(new Event('click'));
        for (const [id, v] of [['campo-email', email], ['campo-nome', nome], ['campo-senha', 'teste1234'], ['campo-convite', convite]])
          document.getElementById(id).value = v;
        entrar(true); }""", [nome.lower() + "@teste.local", nome, CONVITE])
    await pg.wait_for_function("() => typeof Jogo!=='undefined' && !!Jogo.eu", timeout=40000)
    await asyncio.sleep(1.5)
    return pg


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


def registro():
    try:
        return open(REGISTRO, encoding="utf-8", errors="replace").read() if REGISTRO else ""
    except OSError:
        return ""


async def principal():
    # ---- 1. a senha da reserva ----
    aberto = json.loads(urllib.request.urlopen(END + "/config", timeout=10).read())
    ok("o /config aberto não entrega o servidor de reserva", "ice" not in json.dumps(aberto))
    msg = await bemvindo_de_visitante()
    ice = (msg or {}).get("config", {}).get("ice") or []
    turn = [s for s in ice if any(str(u).startswith("turn:") for u in s.get("urls", []))]
    ok("quem entra recebe o servidor de reserva", len(turn) == 1)
    ok("e o STUN continua na lista", any("stun:" in str(s.get("urls")) for s in ice))
    if turn:
        usuario, senha = turn[0]["username"], turn[0]["credential"]
        validade = int(usuario.split(":", 1)[0])
        ok("a senha vale umas 24 horas", 23 * 3600 < validade - time.time() <= 24 * 3600 + 5)
        certa = base64.b64encode(hmac.new(SEGREDO.encode(), usuario.encode(), hashlib.sha1).digest()).decode()
        ok("e é a que o coturn confere (use-auth-secret)", bool(SEGREDO) and senha == certa)

    async with async_playwright() as p:
        nav = await p.chromium.launch(args=[
            "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
            "--autoplay-policy=no-user-gesture-required"])
        # ---- 2. a chamada obrigada a passar pela reserva ----
        a = await entrar(nav, "Reservaa" + MARCA)
        await a.evaluate("""() => {
            const Original = window.RTCPeerConnection;
            window.RTCPeerConnection = function (cfg) { return new Original({ ...(cfg || {}), iceTransportPolicy: 'relay' }); };
            window.RTCPeerConnection.prototype = Original.prototype; }""")
        onde = await a.evaluate("() => ({x: Jogo.eu.x, y: Jogo.eu.y})")
        b = await entrar(nav, "Reservab" + MARCA)
        await andar_ate(b, onde["x"] + 40, onde["y"])
        try:
            await a.wait_for_function("() => [...Midia.pares.values()].some(p => p.pc.connectionState === 'connected')", timeout=25000)
            conectou = True
        except Exception:
            conectou = False
        ok("a chamada fecha só pelo servidor de reserva", conectou)
        await asyncio.sleep(3)
        via = await a.evaluate("""async () => {
            const par = [...Midia.pares.values()][0]; if (!par) return null;
            const st = await par.pc.getStats(); let tipo = null;
            st.forEach(s => { if (s.type === 'transport' && s.selectedCandidatePairId) { const c = st.get(s.selectedCandidatePairId); tipo = st.get(c.localCandidateId).candidateType; } });
            return tipo; }""")
        print("   tipo do caminho:", via)
        ok("e o caminho usado é o da reserva", via == "relay")
        reg = registro()
        ok("o registro do servidor conta que conectou pela reserva",
           f"chamada: Reservaa{MARCA} ↔ Reservab{MARCA} conectou (pela reserva)" in reg)
        await a.context.close()
        await b.context.close()

        # ---- 3. o som barrado pelo navegador ----
        # O Playwright conta cada comando como gesto da pessoa, então o navegador do
        # teste nunca barra o som sozinho. O teste faz o navegador recusar o play(),
        # como ele faz de verdade com quem entrou só para ouvir, e confere a página.
        c = await entrar(nav, "Somc" + MARCA)
        await c.evaluate("""() => {
            HTMLMediaElement.prototype._tocar = HTMLMediaElement.prototype.play;
            HTMLMediaElement.prototype.play = function () { return Promise.reject(new DOMException('sem gesto', 'NotAllowedError')); }; }""")
        onde = await c.evaluate("() => ({x: Jogo.eu.x, y: Jogo.eu.y})")
        # Alguém sem microfone e sem câmera na roda: o cartão dele fica com a fonte vazia,
        # e o play() dela nunca termina (a revisão pegou o clique travando nele).
        e = await entrar(nav, "Some" + MARCA, com_microfone=False)
        await andar_ate(e, onde["x"], onde["y"] + 40)
        d = await entrar(nav, "Somd" + MARCA)
        await andar_ate(d, onde["x"] + 40, onde["y"])
        await d.evaluate("() => Midia.ligado('audio') || alternarMic()")
        await asyncio.sleep(3)
        try:
            await c.wait_for_selector("#ouvir:not(.oculto)", timeout=20000)
            apareceu = True
        except Exception:
            apareceu = False
        ok("o som barrado mostra o botão para ouvir", apareceu)
        if apareceu:
            await c.evaluate("() => { HTMLMediaElement.prototype.play = HTMLMediaElement.prototype._tocar; }")
            await c.click("#ouvir")
            await asyncio.sleep(1.5)
            sumiu = await c.evaluate("() => document.getElementById('ouvir').classList.contains('oculto')")
            cartoes = await c.evaluate("""() => {
                const vs = [...document.querySelectorAll('#videos .video-tile:not([data-id="eu"]) video')];
                const comFaixa = vs.filter(v => v.srcObject && v.srcObject.getTracks().length);
                return { comFaixa: comFaixa.length, vazios: vs.length - comFaixa.length, tocando: comFaixa.every(v => !v.paused) }; }""")
            print("   cartões na roda:", cartoes)
            ok("na roda tem quem fala e quem não manda nada", cartoes["comFaixa"] >= 1 and cartoes["vazios"] >= 1)
            ok("o clique solta o som", cartoes["tocando"])
            ok("e o botão sai da tela", sumiu)
        await nav.close()

    print(f"\n{len(provas) - len(falhas)} de {len(provas)} provas passaram")
    if falhas:
        raise SystemExit(1)


asyncio.run(principal())
