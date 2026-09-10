"""Reivindicar sala, com servidor de pé e dois WebSockets — de ponta a ponta.

    ../.venv/bin/python testes/salas_ao_vivo.py

Sobe o app numa porta própria, cria duas contas novas (com sufixo do relógio,
como os outros testes), e passa pelo caminho inteiro: pegar a sala, bater na
porta, ser aceito, entrar, e soltar no fim.
"""

import asyncio
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import websockets

RAIZ = Path(__file__).resolve().parent.parent
PORTA = int(os.environ.get("PORTA_TESTE", "8401"))
BASE = f"http://127.0.0.1:{PORTA}"
# O servidor do teste grava nos MESMOS contas.json e mapa.json do escritório de
# verdade (as contas Dono/Visita ficavam lá, ocupando vaga): guarda e devolve.
GUARDADOS = [(RAIZ / n, RAIZ / (n + ".salas-bak")) for n in ("contas.json", "mapa.json")]
falhas = []
provas = 0


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
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())


async def esperar(ws, tipo, acao=None, limite=6):
    """Lê até chegar a mensagem procurada (as outras passam batido)."""
    fim = time.time() + limite
    while time.time() < fim:
        try:
            m = json.loads(await asyncio.wait_for(ws.recv(), timeout=fim - time.time()))
        except asyncio.TimeoutError:
            return None
        if m.get("tipo") == tipo and (acao is None or m.get("acao") == acao):
            return m
    return None


async def principal():
    marca = str(int(time.time()))[-6:]
    dono_nome, visita_nome = "Dono" + marca, "Visita" + marca
    t_dono = post("/conta/registrar", {"email": dono_nome + "@teste.local", "nome": dono_nome, "senha": "segredo1"}).get("token")
    t_vis = post("/conta/registrar", {"email": visita_nome + "@teste.local", "nome": visita_nome, "senha": "segredo1"}).get("token")
    conferir("as duas contas foram criadas", bool(t_dono and t_vis))

    # Espia o mapa antes, para já entrar no lugar certo: um `mover` sozinho não
    # atravessa mais o escritório (isso era teleporte e furava parede), então
    # quem precisa estar dentro da sala entra pela conexão, e quem precisa estar
    # na porta anda um passo de cada vez.
    async with websockets.connect(f"ws://127.0.0.1:{PORTA}/ws") as espia:
        await espia.send(json.dumps({"tipo": "entrar", "token": t_dono}))
        mapa = (await esperar(espia, "bemvindo"))["mapa"]
    await asyncio.sleep(.4)

    tile = mapa["tile"]
    alvo = next(z for z in mapa["zonas"] if z["privada"] and z["id"] != "reuniao"
                and not z.get("dono_nome"))
    meio = ((alvo["x1"] + alvo["x2"] + 1) / 2 * tile, (alvo["y1"] + alvo["y2"] + 1) / 2 * tile)
    porta = alvo["porta"]
    fora = ((porta["x"] + .5) * tile, (porta["y"] + .5) * tile)
    # o tile de dentro colado na porta: é para lá que a visita dá o passo
    dentro = {
        "direita": ((alvo["x2"] + .5) * tile, (porta["y"] + .5) * tile),
        "esquerda": ((alvo["x1"] + .5) * tile, (porta["y"] + .5) * tile),
        "cima": ((porta["x"] + .5) * tile, (alvo["y1"] + .5) * tile),
        "baixo": ((porta["x"] + .5) * tile, (alvo["y2"] + .5) * tile),
    }[porta["lado"]]

    async with websockets.connect(f"ws://127.0.0.1:{PORTA}/ws") as wd, \
               websockets.connect(f"ws://127.0.0.1:{PORTA}/ws") as wv:
        await wd.send(json.dumps({"tipo": "entrar", "token": t_dono,
                                  "voltando": {"x": meio[0], "y": meio[1]}}))
        bem = await esperar(wd, "bemvindo")
        await wv.send(json.dumps({"tipo": "entrar", "token": t_vis,
                                  "voltando": {"x": fora[0], "y": fora[1]}}))
        bem_v = await esperar(wv, "bemvindo")
        conferir("os dois entraram na sala", bool(bem and bem_v))

        # o dono já está dentro e reivindica
        await wd.send(json.dumps({"tipo": "sala", "acao": "reivindicar", "id": alvo["id"]}))
        novo = await esperar(wd, "mapa")
        z = next((x for x in novo["mapa"]["zonas"] if x["id"] == alvo["id"]), {}) if novo else {}
        conferir("a sala ficou com o nome do dono", z.get("dono_nome") == dono_nome)

        # porta ABERTA: ter dono não fecha a sala
        await wv.send(json.dumps({"tipo": "mover", "x": dentro[0], "y": dentro[1], "direcao": "baixo"}))
        conferir("com a porta aberta a visita entra", await esperar(wv, "corrigir", limite=1.5) is None)
        await wv.send(json.dumps({"tipo": "mover", "x": fora[0], "y": fora[1], "direcao": "baixo"}))
        await asyncio.sleep(.4)

        # o dono tranca por dentro
        await wd.send(json.dumps({"tipo": "sala", "acao": "trancar", "id": alvo["id"]}))
        trancou = await esperar(wd, "mapa")
        z = next((x for x in trancou["mapa"]["zonas"] if x["id"] == alvo["id"]), {}) if trancou else {}
        conferir("a porta ficou trancada", z.get("trancada") is True)

        # a visita esbarra na porta e recebe o motivo
        await wv.send(json.dumps({"tipo": "mover", "x": dentro[0], "y": dentro[1], "direcao": "baixo"}))
        corrigir = await esperar(wv, "corrigir")
        conferir("a visita é barrada na porta", bool(corrigir))
        conferir("e o servidor diz QUAL sala e de quem",
                 bool(corrigir and corrigir.get("trancada", {}).get("dono") == dono_nome))
        conferir("e avisa que o dono está online",
                 bool(corrigir and corrigir["trancada"].get("online") is True))

        # bate na porta
        await wv.send(json.dumps({"tipo": "sala", "acao": "bater", "id": alvo["id"]}))
        bateram = await esperar(wd, "sala", "bateram")
        conferir("o dono é avisado de quem bateu",
                 bool(bateram and bateram.get("quem") == visita_nome))

        # o dono recusa
        await wd.send(json.dumps({"tipo": "sala", "acao": "responder", "id": alvo["id"],
                                  "para": bateram["de"], "aceita": False}))
        resp = await esperar(wv, "sala", "resposta")
        conferir("a visita recebe a recusa", bool(resp) and resp.get("aceita") is False)
        await wv.send(json.dumps({"tipo": "mover", "x": dentro[0], "y": dentro[1], "direcao": "baixo"}))
        conferir("recusado continua barrado", bool(await esperar(wv, "corrigir")))

        # o dono aceita
        await wd.send(json.dumps({"tipo": "sala", "acao": "responder", "id": alvo["id"],
                                  "para": bateram["de"], "aceita": True}))
        resp = await esperar(wv, "sala", "resposta")
        conferir("a visita recebe o sim", bool(resp) and resp.get("aceita") is True)
        await wv.send(json.dumps({"tipo": "mover", "x": dentro[0], "y": dentro[1], "direcao": "baixo"}))
        conferir("aceito ENTRA (nenhuma correção volta)",
                 await esperar(wv, "corrigir", limite=1.5) is None)

        # destrancar abre para todo mundo de novo
        await wd.send(json.dumps({"tipo": "sala", "acao": "destrancar", "id": alvo["id"]}))
        await esperar(wd, "mapa")
        await wv.send(json.dumps({"tipo": "mover", "x": fora[0], "y": fora[1], "direcao": "baixo"}))
        await asyncio.sleep(.4)
        await wv.send(json.dumps({"tipo": "mover", "x": dentro[0], "y": dentro[1], "direcao": "baixo"}))
        conferir("destrancou e entra sem bater", await esperar(wv, "corrigir", limite=1.5) is None)

        # e o dono solta a sala
        await wd.send(json.dumps({"tipo": "sala", "acao": "liberar", "id": alvo["id"]}))
        solto = await esperar(wd, "mapa")
        z = next((x for x in solto["mapa"]["zonas"] if x["id"] == alvo["id"]), {}) if solto else {}
        conferir("soltar tira o dono da sala", not z.get("dono_nome"))


for orig, bak in GUARDADOS:
    if orig.exists():
        bak.write_bytes(orig.read_bytes())
servidor = subprocess.Popen(
    [str(RAIZ / ".venv/bin/uvicorn"), "main:app", "--host", "127.0.0.1", "--port", str(PORTA)],
    cwd=str(RAIZ), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    env={**os.environ, "SENHA": ""})
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
        if bak.exists():
            bak.replace(orig)

print("\n%d provas, %d falharam" % (provas, len(falhas)))
sys.exit(1 if falhas else 0)
