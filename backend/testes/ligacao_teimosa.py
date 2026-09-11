"""Duas coisas que faziam a câmera piscar e a pessoa cair para a tela de entrada.

1. O teto de mensagens por segundo era um só para tudo — e engolia o `sinal`
   do WebRTC junto com o resto. Abrir uma chamada dispara dezenas de candidatos
   ICE em menos de um segundo; com gente por perto o teto estourava, o sinal
   sumia sem aviso e a chamada nunca fechava.
2. A página escutava a ligação VELHA depois de abrir outra. O aviso de fim da
   velha fechava as chamadas da nova, e o "recusado" que o servidor manda para
   a sessão trocada jogava a pessoa para a tela de entrada.

    CONVITE=... .venv/bin/python testes/ligacao_teimosa.py
"""
import asyncio
import json
import os
import sys

import websockets
from playwright.async_api import async_playwright

END = os.environ.get("ENDERECO", "http://127.0.0.1:8400")
WS = END.replace("http://", "ws://").replace("https://", "wss://") + "/ws"
CONVITE = os.environ.get("CONVITE", "digital dreamer")
QUANTOS = 120                     # bem acima do teto geral, de 40 por segundo

provas, falhas = [], []


def ok(nome, cond):
    provas.append(nome)
    print(("  ok    " if cond else "FALHOU  ") + nome)
    if not cond:
        falhas.append(nome)


async def visitante(nome):
    ws = await websockets.connect(WS, max_size=None)
    await ws.send(json.dumps({"tipo": "entrar", "nome": nome, "convite": CONVITE,
                              "visitante": True}))
    while True:
        msg = json.loads(await ws.recv())
        if msg["tipo"] == "bemvindo":
            return ws, msg["voce"]["id"]
        if msg["tipo"] == "recusado":
            raise SystemExit("o servidor recusou a entrada: " + msg.get("texto", ""))


async def prova_do_teto(marca):
    """Uma enxurrada de sinal tem de chegar inteira do outro lado."""
    a, id_a = await visitante("Sinala" + marca)
    b, id_b = await visitante("Sinalb" + marca)
    for i in range(QUANTOS):
        await a.send(json.dumps({"tipo": "sinal", "para": id_b,
                                 "dados": {"candidato": {"n": i}}}))
    chegaram, avisos = set(), []
    try:
        while len(chegaram) < QUANTOS:
            msg = json.loads(await asyncio.wait_for(b.recv(), timeout=6))
            if msg["tipo"] == "sinal" and msg["de"] == id_a:
                chegaram.add(msg["dados"]["candidato"]["n"])
            elif msg["tipo"] == "erro":
                avisos.append(msg["texto"])
    except asyncio.TimeoutError:
        pass
    # o que o remetente ouviu de volta: não pode ser bronca por velocidade
    bronca = []
    try:
        while True:
            msg = json.loads(await asyncio.wait_for(a.recv(), timeout=0.6))
            if msg["tipo"] == "erro":
                bronca.append(msg["texto"])
    except asyncio.TimeoutError:
        pass
    print("   sinais enviados: %d | chegaram: %d" % (QUANTOS, len(chegaram)))
    ok("o sinal do WebRTC não é jogado fora pelo teto", len(chegaram) == QUANTOS)
    ok("e quem mandou não leva bronca de velocidade", not bronca)
    await a.close()
    await b.close()


async def prova_do_teto_de_comandos(marca):
    """Rajada de `mover` não pode engolir o que a pessoa mandou de verdade."""
    a, id_a = await visitante("Tetoa" + marca)
    b, id_b = await visitante("Tetob" + marca)
    # 200 posições de uma vez: é o que chega de uma conexão que engasgou
    for i in range(200):
        await a.send(json.dumps({"tipo": "mover", "x": 300 + (i % 3), "y": 300}))
    # e, logo depois, uma fala — o comando que não pode sumir
    await a.send(json.dumps({"tipo": "chat", "texto": "oi" + marca, "escopo": "todos"}))
    ouviu, bronca = False, []
    try:
        while True:
            msg = json.loads(await asyncio.wait_for(b.recv(), timeout=4))
            if msg["tipo"] == "chat" and ("oi" + marca) in (msg.get("texto") or ""):
                ouviu = True
                break
    except asyncio.TimeoutError:
        pass
    try:
        while True:
            msg = json.loads(await asyncio.wait_for(a.recv(), timeout=0.8))
            if msg["tipo"] == "erro":
                bronca.append(msg["texto"])
    except asyncio.TimeoutError:
        pass
    ok("a fala atravessa uma rajada de 200 movimentos", ouviu)
    ok("e o engasgo de rede não vira bronca no chat", not bronca)
    await a.close()
    await b.close()


async def prova_da_troca(marca):
    """Abrir outra ligação com a velha ainda de pé não derruba quem está dentro."""
    async with async_playwright() as p:
        nav = await p.chromium.launch()
        ctx = await nav.new_context(viewport={"width": 1000, "height": 760})
        pg = await ctx.new_page()
        erros = []
        pg.on("pageerror", lambda e: erros.append(str(e)[:160]))
        await pg.goto(END)
        await asyncio.sleep(1.3)
        await pg.click("#aba-criar")
        await pg.fill("#campo-email", "teimosa" + marca + "@teste.local")
        await pg.fill("#campo-nome", "Teimosa" + marca)
        await pg.fill("#campo-senha", "teste1234")
        await pg.fill("#campo-convite", CONVITE)
        await pg.evaluate("() => entrar(false)")
        await pg.wait_for_function("() => typeof Jogo!=='undefined' && !!Jogo.eu", timeout=40000)
        await asyncio.sleep(1.4)

        # uma chamada de mentira, só para ver se ela sobrevive à troca
        await pg.evaluate("() => { Midia.espera.clear(); Midia.garantirPar('fantasma'); }")
        # a ligação de antes segue ABERTA quando a nova é criada — era aqui que
        # a página passava a obedecer a duas ao mesmo tempo
        antes = await pg.evaluate("""() => {
            const velho = Conexao.atual || Jogo.ws;
            conectar(Conexao.perfil);
            return { velhoAberto: velho.readyState === WebSocket.OPEN,
                     trocou: (Conexao.atual || Jogo.ws) !== velho }; }""")
        ok("a ligação nova entra no lugar da velha", antes["trocou"])
        await asyncio.sleep(4)
        depois = await pg.evaluate("""() => ({
            dentro: !!Jogo.eu,
            telaDeEntrada: !document.getElementById('entrada').classList.contains('oculto'),
            perfil: !!Conexao.perfil,
            chamadas: Midia.pares.size,
            aberta: (Conexao.atual || Jogo.ws).readyState === WebSocket.OPEN }); """)
        print("   depois da troca:", depois)
        ok("a pessoa continua dentro do escritório", depois["dentro"] and depois["aberta"])
        ok("não cai para a tela de entrada", not depois["telaDeEntrada"])
        ok("não desiste de reconectar", depois["perfil"])
        ok("a chamada aberta não é derrubada pela ligação velha", depois["chamadas"] >= 1)
        ok("nenhum erro de página", not erros)
        if erros:
            print("   erros:", erros)
        await nav.close()


async def principal():
    marca = os.environ.get("MARCA") or str(os.getpid())[-4:]
    await prova_do_teto(marca)
    await prova_do_teto_de_comandos(marca)
    await prova_da_troca(marca)


asyncio.run(principal())
print("\n%d provas, %d falharam" % (len(provas), len(falhas)))
sys.exit(1 if falhas else 0)
