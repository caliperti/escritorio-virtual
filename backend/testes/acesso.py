"""Quem entra e o que cada um pode: membro, visitante e o teto de contas.

O teto é opcional (MAX_CONTAS=0 é sem limite, o padrão). Este teste sobe o
servidor com MAX_CONTAS=10 de propósito, para provar que o teto funciona
quando alguém quiser usar.

    ../.venv/bin/python testes/acesso.py

Sobe o app numa porta própria com o código da sala, e passa pelo caminho todo.
Guarda e devolve o contas.json de verdade — o teste enche as 10 vagas.
"""

import asyncio
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import websockets

RAIZ = Path(__file__).resolve().parent.parent
PORTA = int(os.environ.get("PORTA_TESTE", "8402"))
BASE = f"http://127.0.0.1:{PORTA}"
CODIGO = "digital dreamer"
CONTAS = RAIZ / "contas.json"
BACKUP = RAIZ / "contas.json.teste-bak"
# O servidor do teste grava no MESMO mapa.json do escritório de verdade (a sala
# reivindicada aqui ficava com um dono fantasma): guarda antes e devolve no fim.
MAPA = RAIZ / "mapa.json"
MAPA_BAK = RAIZ / "mapa.json.teste-bak"
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
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())


async def esperar(ws, tipo, limite=5):
    fim = time.time() + limite
    while time.time() < fim:
        try:
            m = json.loads(await asyncio.wait_for(ws.recv(), timeout=fim - time.time()))
        except (asyncio.TimeoutError, Exception):
            return None
        if m.get("tipo") == tipo:
            return m
    return None


async def principal():
    marca = str(int(time.time()))[-5:]
    print("\n-- código da sala --")
    r = post("/conta/registrar", {"email": "Errado" + marca + "@teste.local", "nome": "Errado" + marca, "senha": "segredo1", "convite": "outra coisa"})
    conferir("código errado não cria conta", bool(r.get("erro")))
    r = post("/conta/registrar", {"email": "Membro" + marca + "@teste.local", "nome": "Membro" + marca, "senha": "segredo1", "convite": CODIGO})
    conferir("com o código certo, cria", bool(r.get("token")))
    token_membro = r.get("token")

    print("\n-- o que a conta guarda --")
    # o boneco tem 12 escolhas; o servidor cortava em 10 e a calça e a barba sumiam
    doze = {"corpo": "m", "pele": "#f2cfa8", "cabelo": "messy1", "corCabelo": "#241a12",
            "corCamisa": "#d94f5c", "camisaTipo": "camisa", "calcaTipo": "calca",
            "sapatoTipo": "sapato", "corSapato": "#3a3a42", "chapeuTipo": "bone_pintado",
            "corCalca": "#d9a441", "barba": "medium"}
    r = post("/conta/registrar", {"email": "Doze" + marca + "@teste.local", "nome": "Doze" + marca, "senha": "segredo1", "convite": CODIGO,
                                  "aparencia": doze, "cor": "#d94f5c"})
    eu = json.loads(urllib.request.urlopen(BASE + "/conta/eu?token=" + (r.get("token") or "x"),
                                           timeout=5).read())
    conferir("as 12 escolhas do boneco ficam salvas na conta",
             (eu.get("conta") or {}).get("aparencia") == doze)
    r = post("/conta/registrar", {"email": "日本@teste.local", "nome": "日本", "senha": "segredo1", "convite": CODIGO})
    conferir("nome sem letra que vire chave é recusado", bool(r.get("erro")))

    print("\n-- teto de 10 membros --")
    criados = 2                                   # Membro e Doze já estão dentro
    for i in range(2, 12):
        r = post("/conta/registrar", {"email": "M%d%s" % (i, marca) + "@teste.local", "nome": "M%d%s" % (i, marca), "senha": "segredo1", "convite": CODIGO})
        if r.get("token"):
            criados += 1
    conferir("para exatamente em 10 contas", criados == 10)
    r = post("/conta/registrar", {"email": "Sobra" + marca + "@teste.local", "nome": "Sobra" + marca, "senha": "segredo1", "convite": CODIGO})
    conferir("a 11ª é recusada com explicação", "visitante" in (r.get("erro") or ""))
    conferir("e /config diz que não há mais vaga",
             json.loads(urllib.request.urlopen(BASE + "/config", timeout=5).read())["vagas"] == 0)

    print("\n-- visitante --")
    async with websockets.connect(f"ws://127.0.0.1:{PORTA}/ws") as wv:
        await wv.send(json.dumps({"tipo": "entrar", "visitante": True,
                                  "nome": "Visita" + marca, "convite": "chute"}))
        conferir("visitante com código errado é recusado", bool(await esperar(wv, "recusado")))

    async with websockets.connect(f"ws://127.0.0.1:{PORTA}/ws") as wv:
        await wv.send(json.dumps({"tipo": "entrar", "visitante": True,
                                  "nome": "Membro" + marca, "convite": CODIGO}))
        conferir("visitante NÃO entra com o nome de um membro", bool(await esperar(wv, "recusado")))

    async with websockets.connect(f"ws://127.0.0.1:{PORTA}/ws") as wv, \
               websockets.connect(f"ws://127.0.0.1:{PORTA}/ws") as wm:
        await wv.send(json.dumps({"tipo": "entrar", "visitante": True,
                                  "nome": "Visita" + marca, "convite": CODIGO}))
        bem = await esperar(wv, "bemvindo")
        conferir("visitante entra sem cadastro", bool(bem))
        conferir("e o servidor marca ele como visitante", bool(bem) and bem.get("visitante") is True)

        await wv.send(json.dumps({"tipo": "editar", "acao": {"acao": "piso", "x": 30, "y": 30, "piso": "g"}}))
        erro = await esperar(wv, "erro")
        conferir("visitante NÃO edita o escritório", bool(erro))

        alvo = next(z for z in bem["mapa"]["zonas"] if z["privada"])
        await wv.send(json.dumps({"tipo": "sala", "acao": "reivindicar", "id": alvo["id"]}))
        erro = await esperar(wv, "erro")
        conferir("visitante NÃO reivindica sala", bool(erro))

        # o membro, sim
        await wm.send(json.dumps({"tipo": "entrar", "token": token_membro}))
        bem_m = await esperar(wm, "bemvindo")
        conferir("membro entra com a conta", bool(bem_m) and bem_m.get("visitante") is False)
        tile = bem_m["mapa"]["tile"]
        meio = ((alvo["x1"] + alvo["x2"] + 1) / 2 * tile, (alvo["y1"] + alvo["y2"] + 1) / 2 * tile)
        await wm.send(json.dumps({"tipo": "mover", "x": meio[0], "y": meio[1], "direcao": "baixo"}))
        await wm.send(json.dumps({"tipo": "sala", "acao": "reivindicar", "id": alvo["id"]}))
        novo = await esperar(wm, "mapa")
        z = next((x for x in novo["mapa"]["zonas"] if x["id"] == alvo["id"]), {}) if novo else {}
        conferir("membro reivindica a sala", bool(z.get("dono")))


if CONTAS.exists():
    shutil.copy(CONTAS, BACKUP)
CONTAS.unlink(missing_ok=True)
if MAPA.exists():
    shutil.copy(MAPA, MAPA_BAK)
servidor = subprocess.Popen(
    [str(RAIZ / ".venv/bin/uvicorn"), "main:app", "--host", "127.0.0.1", "--port", str(PORTA)],
    cwd=str(RAIZ), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    env={**os.environ, "SENHA": CODIGO, "MAX_CONTAS": "10"})
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
    CONTAS.unlink(missing_ok=True)          # o teste encheu as vagas: devolve limpo
    if BACKUP.exists():
        shutil.move(str(BACKUP), str(CONTAS))
    if MAPA_BAK.exists():
        shutil.move(str(MAPA_BAK), str(MAPA))

print("\n%d provas, %d falharam" % (provas, len(falhas)))
sys.exit(1 if falhas else 0)
