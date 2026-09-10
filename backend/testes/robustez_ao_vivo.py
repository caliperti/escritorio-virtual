"""O que um cliente malicioso (ou só torto) manda, com servidor de pé.

    ../.venv/bin/python testes/robustez_ao_vivo.py

Entrada com campo do tipo errado ganha resposta em vez de queda muda; mensagem
de megabytes não é repassada; rota HTTP não devolve 500; quem ficou fora do
mapa depois de o admin encolher o escritório volta para a entrada; upload sem
login é cortado na porta; nome de visitante segue as regras do cadastro; e um
login não congela o escritório inteiro.
"""
import asyncio
import json
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

import websockets

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
import contas as mod_contas                  # noqa: E402  (para medir o custo de um hash)

PORTA = int(os.environ.get("PORTA_TESTE", "8406"))
BASE = f"http://127.0.0.1:{PORTA}"
URL = f"ws://127.0.0.1:{PORTA}/ws"
CODIGO = "digital dreamer"
GUARDADOS = [(RAIZ / n, RAIZ / (n + ".rob-bak")) for n in ("contas.json", "mapa.json")]
falhas, provas = [], 0


def conferir(nome, ok):
    global provas
    provas += 1
    print(("  ok  " if ok else "FALHOU") + "  " + nome)
    if not ok:
        falhas.append(nome)


def post(rota, dados):
    req = urllib.request.Request(BASE + rota, data=json.dumps(dados).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, {}


async def esperar(ws, tipo, limite=5):
    fim = time.time() + limite
    while time.time() < fim:
        try:
            m = json.loads(await asyncio.wait_for(ws.recv(), timeout=max(.05, fim - time.time())))
        except Exception:
            return None
        if m.get("tipo") == tipo:
            return m
    return None


async def esvaziar(ws):
    while True:
        try:
            await asyncio.wait_for(ws.recv(), timeout=.25)
        except Exception:
            return


async def primeira_resposta(msg):
    """Manda a mensagem de entrada e diz o que voltou: o tipo, ou 'caiu'."""
    async with websockets.connect(URL, max_size=None) as ws:
        await ws.send(json.dumps(msg))
        try:
            m = json.loads(await asyncio.wait_for(ws.recv(), timeout=3))
            return m.get("tipo"), m
        except Exception:
            return "caiu", {}


def tile_livre_da_zona(mapa, z):
    cat, ocupado = mapa["catalogo"], set()
    for o in mapa["objetos"]:
        i = cat.get(o["tipo"]) or {}
        if i.get("bloqueia"):
            l, a = (i["a"], i["l"]) if o.get("g", 0) % 2 else (i["l"], i["a"])
            ocupado |= {(o["x"] + dx, o["y"] + dy) for dy in range(a) for dx in range(l)}
    for y in range(z["y1"] + 1, z["y2"]):
        for x in range(z["x1"] + 1, z["x2"]):
            if all(mapa["paredes"][y + dy][x + dx] != "1" and (x + dx, y + dy) not in ocupado
                   for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                return x, y
    return None


async def principal():
    marca = str(int(time.time()))[-5:]
    t_admin = post("/conta/registrar", {"email": "gulisboa5@hotmail.com", "nome": "Chefe",
                                        "senha": "segredo1", "convite": CODIGO})[1]["token"]
    t_membro = post("/conta/registrar", {"email": "m%s@teste.local" % marca, "nome": "Membro" + marca,
                                         "senha": "segredo1", "convite": CODIGO})[1]["token"]

    print("\n-- entrada torta ganha resposta, não queda muda --")
    tipo, _ = await primeira_resposta({"tipo": "entrar", "token": ["a"]})
    conferir("token que é lista: recusado com aviso", tipo == "recusado")
    tipo, _ = await primeira_resposta({"tipo": "entrar", "token": {"a": 1}})
    conferir("token que é objeto: recusado com aviso", tipo == "recusado")
    tipo, m = await primeira_resposta({"tipo": "entrar", "token": t_admin, "voltando": {"x": "nan", "y": 100}})
    conferir("voltando com NaN entra, na recepção", tipo == "bemvindo" and m["voce"]["x"] < 1000)
    tipo, m = await primeira_resposta({"tipo": "entrar", "token": t_admin, "voltando": {"x": 1e400, "y": 100}})
    conferir("voltando com infinito entra, na recepção", tipo == "bemvindo" and m["voce"]["x"] < 1000)
    tipo, m = await primeira_resposta({"tipo": "entrar", "visitante": True, "convite": CODIGO,
                                       "nome": ["x"], "emoji": 5})
    conferir("visitante com nome e emoji de outro tipo entra com o nome padrão",
             tipo == "bemvindo" and m["voce"]["nome"].startswith("Visitante"))
    tipo, _ = await primeira_resposta(["nao", "sou", "objeto"])
    conferir("mensagem que não é objeto: recusada com aviso", tipo == "recusado")

    print("\n-- mensagem grande demais --")
    async with websockets.connect(URL, max_size=None) as wa, websockets.connect(URL, max_size=None) as wm:
        await wa.send(json.dumps({"tipo": "entrar", "token": t_admin}))
        bem_a = await esperar(wa, "bemvindo")
        await wm.send(json.dumps({"tipo": "entrar", "token": t_membro}))
        await esperar(wm, "bemvindo")
        await esvaziar(wa)
        await wm.send(json.dumps({"tipo": "sinal", "para": bem_a["voce"]["id"], "dados": "x" * (300 * 1024)}))
        conferir("o alvo NÃO recebe o sinal de 300 KB", await esperar(wa, "sinal", 1.5) is None)
        e = await esperar(wm, "erro", 3)
        conferir("quem mandou é avisado", bool(e) and "grande" in e.get("texto", ""))
        fechou = False
        try:
            await asyncio.wait_for(wm.recv(), timeout=3)
        except websockets.ConnectionClosed as exc:
            fechou = exc.rcvd is not None and exc.rcvd.code == 1009
        except Exception:
            pass
        conferir("e a conexão é fechada com o código de 'grande demais' (1009)", fechou)
        await wa.send(json.dumps({"tipo": "ping"}))
        conferir("os outros seguem atendidos", bool(await esperar(wa, "pong", 3)))

    print("\n-- rota HTTP com campo do tipo errado --")
    casos = [("/conta/registrar", {"email": 123, "nome": "X", "senha": "1234", "convite": CODIGO}),
             ("/conta/registrar", {"email": "a@b.co", "nome": ["x"], "senha": "1234", "convite": CODIGO}),
             ("/conta/registrar", {"email": "a@b.co", "nome": "Xis", "senha": 1234, "convite": CODIGO}),
             ("/conta/entrar", {"email": 123, "senha": "x"}),
             ("/conta/entrar", {"email": "a@b.co", "senha": 5}),
             ("/estudio/remover", {"token": ["x"], "id": "y"})]
    respostas = [post(rota, corpo) for rota, corpo in casos]
    conferir("nenhuma devolve 500", all(s < 500 for s, _ in respostas))
    conferir("todas explicam com 'erro'", all(r.get("erro") for _, r in respostas))

    print("\n-- o admin encolhe o escritório com alguém na ponta --")
    async with websockets.connect(URL, max_size=None) as wa, websockets.connect(URL, max_size=None) as wm:
        await wa.send(json.dumps({"tipo": "entrar", "token": t_admin}))
        bem_a = await esperar(wa, "bemvindo")
        mapa, tile = bem_a["mapa"], bem_a["mapa"]["tile"]
        copa = next(z for z in mapa["zonas"] if z["id"] == "copa")
        px, py = (copa["x1"] + 2.5) * tile, (copa["y1"] + 6.5) * tile
        await wm.send(json.dumps({"tipo": "entrar", "token": t_membro, "voltando": {"x": px, "y": py}}))
        bem_m = await esperar(wm, "bemvindo")
        conferir("o membro está longe da entrada", bem_m["voce"]["x"] == px)
        await esvaziar(wa)
        await esvaziar(wm)
        await wa.send(json.dumps({"tipo": "editar", "acao": {"acao": "tamanho", "largura": 20, "altura": 16}}))
        novo = await esperar(wa, "mapa")
        conferir("o mapa encolheu", bool(novo) and novo["mapa"]["largura"] == 20)
        corr = await esperar(wm, "corrigir", 3)
        conferir("quem ficou de fora recebe a posição nova",
                 bool(corr) and corr["x"] < 20 * tile and corr["y"] < 16 * tile)
        moveu = await esperar(wa, "mover", 3)
        conferir("e os outros veem a pessoa se mexer", bool(moveu) and moveu["id"] == bem_m["voce"]["id"])
        await esvaziar(wm)
        await wm.send(json.dumps({"tipo": "mover", "x": corr["x"] + 16, "y": corr["y"], "direcao": "direita"}))
        conferir("de lá ela anda de novo", await esperar(wm, "corrigir", 1.5) is None)
        await esvaziar(wa)
        await wa.send(json.dumps({"tipo": "editar", "acao": {"acao": "desfazer"}}))
        volta = await esperar(wa, "mapa")
        conferir("desfazer devolve o tamanho", bool(volta) and volta["mapa"]["largura"] == mapa["largura"])

    print("\n-- upload sem login é cortado na porta --")
    limite = "----teste"
    cabeca = (f"--{limite}\r\nContent-Disposition: form-data; name=\"token\"\r\n\r\n\r\n"
              f"--{limite}\r\nContent-Disposition: form-data; name=\"imagem\"; filename=\"a.png\"\r\n"
              f"Content-Type: image/png\r\n\r\n").encode()
    total = len(cabeca) + 40 * 1024 * 1024
    s = socket.create_connection(("127.0.0.1", PORTA))
    s.sendall((f"POST /estudio/peca HTTP/1.1\r\nHost: x\r\nContent-Type: multipart/form-data; "
               f"boundary={limite}\r\nContent-Length: {total}\r\n\r\n").encode() + cabeca + b"\0" * (1024 * 1024))
    s.settimeout(4)
    try:
        resposta = s.recv(300)
    except socket.timeout:
        resposta = b""
    s.close()
    conferir("40 MB anunciados: o servidor responde 413 com 1 MB recebido, sem esperar o resto",
             resposta.startswith(b"HTTP/1.1 413"))

    print("\n-- nome de visitante segue as regras do cadastro --")
    for rotulo, nome in [("com cara de e-mail", "gulisboa5@hotmail.com"), ("só de espaço invisível", "​​"),
                         ("de uma letra", "A")]:
        tipo, _ = await primeira_resposta({"tipo": "entrar", "visitante": True, "convite": CODIGO, "nome": nome})
        conferir("visitante %s é recusado" % rotulo, tipo == "recusado")
    async with websockets.connect(URL, max_size=None) as w1:
        await w1.send(json.dumps({"tipo": "entrar", "visitante": True, "convite": CODIGO, "nome": "Ana" + marca}))
        conferir("o primeiro visitante Ana entra", bool(await esperar(w1, "bemvindo")))
        tipo, _ = await primeira_resposta({"tipo": "entrar", "visitante": True, "convite": CODIGO, "nome": "ana" + marca})
        conferir("um segundo visitante com o mesmo nome é recusado", tipo == "recusado")
        s_, r = post("/conta/registrar", {"email": "ana%s@teste.local" % marca, "nome": "Ana" + marca,
                                          "senha": "segredo1", "convite": CODIGO})
        conferir("cadastrar conta com o nome de quem está na sala é recusado", bool(r.get("erro")))
        async with websockets.connect(URL, max_size=None) as wm:
            await wm.send(json.dumps({"tipo": "entrar", "token": t_membro}))
            await esperar(wm, "bemvindo")
            await wm.send(json.dumps({"tipo": "perfil", "nome": "Ana" + marca}))
            e = await esperar(wm, "erro", 3)
            conferir("membro que tenta o nome de quem está na sala é avisado", bool(e))
            eu = json.loads(urllib.request.urlopen(BASE + "/conta/eu?token=" + t_membro, timeout=5).read())
            conferir("e fica com o nome de antes", eu["conta"]["nome"] == "Membro" + marca)
        async with websockets.connect(URL, max_size=None) as w2, websockets.connect(URL, max_size=None) as w3:
            await w2.send(json.dumps({"tipo": "entrar", "visitante": True, "convite": CODIGO, "nome": ""}))
            b2 = await esperar(w2, "bemvindo")
            await w3.send(json.dumps({"tipo": "entrar", "visitante": True, "convite": CODIGO, "nome": ""}))
            b3 = await esperar(w3, "bemvindo")
            conferir("dois visitantes sem nome ganham nomes diferentes",
                     bool(b2 and b3) and b2["voce"]["nome"] != b3["voce"]["nome"])

    print("\n-- login não congela o escritório --")
    sal = "00" * 16
    t0 = time.time()
    mod_contas._hash("senha", sal)
    um_hash = time.time() - t0
    async with websockets.connect(URL, max_size=None) as wa:
        await wa.send(json.dumps({"tipo": "entrar", "token": t_admin}))
        await esperar(wa, "bemvindo")
        await esvaziar(wa)

        def rajada():
            for i in range(4):
                post("/conta/entrar", {"email": "gulisboa5@hotmail.com", "senha": "errada%d" % i})

        fio = threading.Thread(target=rajada)
        fio.start()
        piores = []
        for _ in range(12):
            t0 = time.time()
            await wa.send(json.dumps({"tipo": "ping"}))
            await esperar(wa, "pong")
            piores.append(time.time() - t0)
            await asyncio.sleep(.02)
        fio.join()
        pior = max(piores)
        print("     um hash leva %.0f ms; pior ping durante 4 logins: %.1f ms" % (um_hash * 1000, pior * 1000))
        # antes do conserto o pior ping era 4 hashes enfileirados; com o hash
        # fora do laço, nem um hash inteiro segura o escritório
        conferir("o pior ping durante os logins fica abaixo de um hash", pior < max(um_hash, .015))


for orig, bak in GUARDADOS:
    if orig.exists():
        orig.replace(bak)
    if orig.name == "mapa.json" and bak.exists():
        orig.write_bytes(bak.read_bytes())          # o servidor precisa do mapa
servidor = subprocess.Popen(
    [str(RAIZ / ".venv/bin/uvicorn"), "main:app", "--host", "127.0.0.1", "--port", str(PORTA)],
    cwd=str(RAIZ), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    env={**os.environ, "SENHA": CODIGO})
try:
    for _ in range(60):
        try:
            urllib.request.urlopen(BASE + "/saude", timeout=1)
            break
        except Exception:
            time.sleep(.5)
    asyncio.run(principal())
finally:
    servidor.terminate()
    servidor.wait(timeout=10)
    for orig, bak in GUARDADOS:
        orig.unlink(missing_ok=True)
        if bak.exists():
            bak.replace(orig)

print("\n%d provas, %d falharam" % (provas, len(falhas)))
sys.exit(1 if falhas else 0)
