"""Expulsar e calar: com servidor de pé e WebSockets de verdade.

Expulsar tem que EXPULSAR (fechar o socket não bastava: a pessoa voltava no
clique seguinte) e quem foi calado não pode reabrir o próprio microfone.
"""
import asyncio, json, os, subprocess, sys, time, urllib.request
from pathlib import Path
import websockets

RAIZ = Path(__file__).resolve().parent.parent
PORTA = int(os.environ.get("PORTA_TESTE", "8405"))
BASE = f"http://127.0.0.1:{PORTA}"
CODIGO = "digital dreamer"
CONTAS = RAIZ / "contas.json"
BACKUP = RAIZ / "contas.json.mod-bak"
MAPA = RAIZ / "mapa.json"
MAPA_BAK = RAIZ / "mapa.json.mod-bak"
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
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read())


async def esperar(ws, tipo, limite=5):
    fim = time.time() + limite
    while time.time() < fim:
        try:
            m = json.loads(await asyncio.wait_for(ws.recv(), timeout=max(.1, fim - time.time())))
        except Exception:
            return None
        if m.get("tipo") == tipo:
            return m
    return None


async def entrar(ws, token):
    await ws.send(json.dumps({"tipo": "entrar", "token": token}))
    return await esperar(ws, "bemvindo")


async def principal():
    marca = str(int(time.time()))[-4:]
    t_admin = post("/conta/registrar", {"email": "gulisboa5@hotmail.com", "nome": "Chefe",
                                        "senha": "segredo1", "convite": CODIGO})["token"]
    t_membro = post("/conta/registrar", {"email": "alvo" + marca + "@teste.local",
                                         "nome": "Alvo" + marca, "senha": "segredo1",
                                         "convite": CODIGO})["token"]
    url = f"ws://127.0.0.1:{PORTA}/ws"

    async with websockets.connect(url) as wa:
        bem_a = await entrar(wa, t_admin)
        conferir("o admin entra como admin", bool(bem_a) and bem_a.get("admin") is True)

        print("\n-- calar --")
        async with websockets.connect(url) as wm:
            bem_m = await entrar(wm, t_membro)
            id_membro = bem_m["voce"]["id"]
            await wa.send(json.dumps({"tipo": "moderar", "acao": "silenciar", "id": id_membro}))
            conferir("o calado é avisado", bool(await esperar(wm, "moderado")))
            # ele tenta reabrir o próprio microfone
            await wm.send(json.dumps({"tipo": "midia", "mudo": False,
                                      "sem_camera": True, "tela": False}))
            volta = await esperar(wm, "midia", 4)
            conferir("o servidor devolve o estado para quem foi calado", bool(volta))
            conferir("e o microfone continua fechado", bool(volta) and volta.get("mudo") is True)
            # o admin devolve a voz
            await wa.send(json.dumps({"tipo": "moderar", "acao": "devolver_voz", "id": id_membro}))
            await esperar(wm, "moderado")
            await wm.send(json.dumps({"tipo": "midia", "mudo": False,
                                      "sem_camera": True, "tela": False}))
            eco = await esperar(wm, "midia", 2)
            conferir("com a voz devolvida, o pedido não é mais recusado", eco is None)

        print("\n-- expulsar --")
        async with websockets.connect(url) as wm:
            bem_m = await entrar(wm, t_membro)
            id_membro = bem_m["voce"]["id"]
            await wa.send(json.dumps({"tipo": "moderar", "acao": "expulsar", "id": id_membro}))
            fora = await esperar(wm, "recusado", 5)
            conferir("o expulso é avisado", bool(fora))
            conferir("e o aviso diz quando pode voltar",
                     bool(fora) and "minutos" in (fora.get("texto") or ""))

        # a prova que faltava: voltar com o MESMO login
        async with websockets.connect(url) as wv:
            await wv.send(json.dumps({"tipo": "entrar", "token": t_membro}))
            r = await esperar(wv, "recusado", 5)
            conferir("voltar com o mesmo login é recusado", bool(r))
            bem = await esperar(wv, "bemvindo", 1)
            conferir("e ele NÃO entra", bem is None)

        print("\n-- readmitir --")
        lista = None
        await wa.send(json.dumps({"tipo": "moderar", "acao": "expulsos"}))
        resp = await esperar(wa, "expulsos", 4)
        lista = (resp or {}).get("lista") or []
        conferir("o admin consegue ver quem está de castigo", len(lista) == 1)
        if lista:
            await wa.send(json.dumps({"tipo": "moderar", "acao": "readmitir",
                                      "chave": lista[0]["chave"]}))
            depois = await esperar(wa, "expulsos", 4)
            conferir("readmitir tira da lista", (depois or {}).get("lista") == [])
        async with websockets.connect(url) as wv:
            bem = await entrar(wv, t_membro)
            conferir("readmitido, ele volta a entrar", bool(bem))

        print("\n-- só o admin modera --")
        async with websockets.connect(url) as wm, websockets.connect(url) as wo:
            bem_m = await entrar(wm, t_membro)
            t_outro = post("/conta/registrar", {"email": "outro" + marca + "@teste.local",
                                                "nome": "Outro" + marca, "senha": "segredo1",
                                                "convite": CODIGO})["token"]
            bem_o = await entrar(wo, t_outro)
            await wm.send(json.dumps({"tipo": "moderar", "acao": "expulsar",
                                      "id": bem_o["voce"]["id"]}))
            conferir("membro comum NÃO expulsa ninguém", bool(await esperar(wm, "erro", 4)))
            conferir("e o outro continua dentro", await esperar(wo, "recusado", 1.5) is None)


if CONTAS.exists():
    CONTAS.replace(BACKUP)
if MAPA.exists():
    MAPA_BAK.write_bytes(MAPA.read_bytes())
servidor = subprocess.Popen(
    [str(RAIZ / ".venv/bin/uvicorn"), "main:app", "--host", "127.0.0.1", "--port", str(PORTA)],
    cwd=str(RAIZ), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    env={**os.environ, "SENHA": CODIGO})
try:
    for _ in range(60):
        try:
            urllib.request.urlopen(BASE + "/saude", timeout=1); break
        except Exception:
            time.sleep(.5)
    asyncio.run(principal())
finally:
    servidor.terminate(); servidor.wait(timeout=10)
    CONTAS.unlink(missing_ok=True)
    if BACKUP.exists():
        BACKUP.replace(CONTAS)
    if MAPA_BAK.exists():
        MAPA_BAK.replace(MAPA)

print("\n%d provas, %d falharam" % (provas, len(falhas)))
sys.exit(1 if falhas else 0)
