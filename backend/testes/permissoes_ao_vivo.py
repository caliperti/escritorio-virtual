"""Admin e membro, com servidor de pé e dois WebSockets."""
import asyncio, json, os, subprocess, sys, time, urllib.request
from pathlib import Path
import websockets

RAIZ = Path(__file__).resolve().parent.parent
PORTA = int(os.environ.get("PORTA_TESTE", "8403"))
BASE = f"http://127.0.0.1:{PORTA}"
CODIGO = "digital dreamer"
CONTAS = RAIZ / "contas.json"
BACKUP = RAIZ / "contas.json.perm-bak"
# O servidor do teste grava no MESMO mapa.json do escritório de verdade (cada
# rodada deixava plantas nas salas 1 e 2): guarda antes e devolve no fim.
MAPA = RAIZ / "mapa.json"
MAPA_BAK = RAIZ / "mapa.json.perm-bak"
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


async def esvaziar(ws):
    """Joga fora o que já chegou. Sem isto, um `mapa` que sobrou da edição
    anterior é lido como resposta da edição atual, e o teste mente."""
    while True:
        try:
            await asyncio.wait_for(ws.recv(), timeout=.25)
        except Exception:
            return


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


def tile_livre_da_zona(mapa, z):
    """Um tile de chão livre dentro da sala. O meio costuma ter a mesa em cima."""
    cat = mapa["catalogo"]
    ocupado = set()
    for o in mapa["objetos"]:
        i = cat.get(o["tipo"]) or {}
        if not i.get("bloqueia"):
            continue
        l, a = i["l"], i["a"]
        if (o.get("g", 0) % 2) and o["tipo"] not in ():
            l, a = a, l
        for dy in range(a):
            for dx in range(l):
                ocupado.add((o["x"] + dx, o["y"] + dy))
    for y in range(z["y1"], z["y2"] + 1):
        for x in range(z["x1"], z["x2"] + 1):
            if mapa["paredes"][y][x] == "1" or (x, y) in ocupado:
                continue
            return x, y
    return None


async def principal():
    marca = str(int(time.time()))[-4:]
    t_admin = post("/conta/registrar", {"email": "gulisboa5@hotmail.com", "nome": "Chefe", "senha": "segredo1", "convite": CODIGO})["token"]
    t_membro = post("/conta/registrar", {"email": "membro" + marca + "@teste.local", "nome": "Membro" + marca, "senha": "segredo1", "convite": CODIGO})["token"]

    async with websockets.connect(f"ws://127.0.0.1:{PORTA}/ws") as wa, \
               websockets.connect(f"ws://127.0.0.1:{PORTA}/ws") as wm:
        await wa.send(json.dumps({"tipo": "entrar", "token": t_admin}))
        bem_a = await esperar(wa, "bemvindo")
        # O membro entra JÁ dentro da Sala 1. Um `mover` sozinho não atravessa
        # mais o escritório (isso era teleporte, e furava parede), e reivindicar
        # exige estar lá dentro. Nascer numa sala destrancada é permitido.
        z1 = next(z for z in bem_a["mapa"]["zonas"] if z["id"] == "sala1")
        t0 = bem_a["mapa"]["tile"]
        dentro = tile_livre_da_zona(bem_a["mapa"], z1)
        await wm.send(json.dumps({"tipo": "entrar", "token": t_membro,
                                  "voltando": {"x": (dentro[0] + .5) * t0,
                                               "y": (dentro[1] + .5) * t0}}))
        bem_m = await esperar(wm, "bemvindo")
        conferir("o e-mail de admin entra como admin", bem_a.get("admin") is True)
        conferir("o outro entra como membro comum", bem_m.get("admin") is False)

        mapa = bem_m["mapa"]
        tile = mapa["tile"]
        s1 = next(z for z in mapa["zonas"] if z["id"] == "sala1")
        s2 = next(z for z in mapa["zonas"] if z["id"] == "sala2")

        # membro sem sala não edita
        await wm.send(json.dumps({"tipo": "editar", "acao": {
            "acao": "objeto", "tipo": "planta", "x": s1["x1"] + 1, "y": s1["y1"] + 1}}))
        conferir("membro sem sala é recusado", bool(await esperar(wm, "erro")))

        # membro pega a sala 1 e passa a poder decorar ela
        livre = tile_livre_da_zona(mapa, s1)
        conferir("achei chão livre dentro da Sala 1", livre is not None)
        await asyncio.sleep(.4)
        await wm.send(json.dumps({"tipo": "sala", "acao": "reivindicar", "id": "sala1"}))
        r = await esperar(wm, "mapa", 3)
        conferir("a sala fica com o nome de quem reivindicou", bool(r) and any(
            z["id"] == "sala1" and z.get("dono_nome") for z in r["mapa"]["zonas"]))
        antes = len(r["mapa"]["objetos"]) if r else len(bem_m["mapa"]["objetos"])
        await wm.send(json.dumps({"tipo": "editar", "acao": {
            "acao": "objeto", "tipo": "planta", "x": livre[0], "y": livre[1]}}))
        novo = await esperar(wm, "mapa", 3)
        conferir("dono decora a PRÓPRIA sala", bool(novo) and len(novo["mapa"]["objetos"]) == antes + 1)

        # mas não a do vizinho
        await wm.send(json.dumps({"tipo": "editar", "acao": {
            "acao": "objeto", "tipo": "planta", "x": s2["x1"] + 1, "y": s2["y1"] + 1}}))
        e = await esperar(wm, "erro")
        conferir("dono NÃO decora a sala do vizinho", bool(e) and "fora" in (e.get("texto") or "").lower())

        # nem levanta parede
        await wm.send(json.dumps({"tipo": "editar", "acao": {
            "acao": "parede", "valor": 1, "tiles": [[s1["x1"] + 2, s1["y1"] + 2]]}}))
        conferir("dono NÃO levanta parede", bool(await esperar(wm, "erro")))

        # Trocar o nome não pode dar poder. Agora administrador é decidido pelo
        # E-MAIL, então nem se a pessoa se chamar igual ao admin ela vira admin.
        # (a reconexão com o mesmo token fica para o fim: uma conta só pode ter
        # uma sessão, então reconectar aqui derrubaria o `wm` que ainda usamos)
        await esvaziar(wm)
        await wm.send(json.dumps({"tipo": "perfil", "nome": "Chefe"}))
        await asyncio.sleep(.5)
        eu = json.loads(urllib.request.urlopen(BASE + "/conta/eu?token=" + t_membro, timeout=5).read())
        conferir("nome já usado por outro membro é recusado",
                 (eu.get("conta") or {}).get("nome") == "Membro" + marca)

        # renomear de verdade leva a sala junto: ela é da chave da conta
        await esvaziar(wm)
        await wm.send(json.dumps({"tipo": "perfil", "nome": "Novo" + marca}))
        r = await esperar(wm, "mapa", 3)
        conferir("renomear troca a plaquinha da sala, sem perder a sala", bool(r) and any(
            z["id"] == "sala1" and z.get("dono_nome") == "Novo" + marca for z in r["mapa"]["zonas"]))
        await esvaziar(wm)
        await wm.send(json.dumps({"tipo": "editar", "acao": {
            "acao": "objeto", "tipo": "planta", "x": livre[0], "y": livre[1]}}))
        conferir("e continua decorando a própria sala", bool(await esperar(wm, "mapa", 3)))

        # admin faz tudo
        await esvaziar(wa)
        await wa.send(json.dumps({"tipo": "editar", "acao": {
            "acao": "objeto", "tipo": "planta", "x": s2["x1"] + 1, "y": s2["y1"] + 1}}))
        conferir("admin decora sala de qualquer um", bool(await esperar(wa, "mapa")))
        await esvaziar(wa)
        await wa.send(json.dumps({"tipo": "editar", "acao": {
            "acao": "tamanho", "largura": mapa["largura"] + 6, "altura": mapa["altura"] + 4}}))
        m2 = await esperar(wa, "mapa")
        conferir("admin aumenta o escritório",
                 bool(m2) and m2["mapa"]["largura"] == mapa["largura"] + 6)
        await wa.send(json.dumps({"tipo": "editar", "acao": {
            "acao": "tamanho", "largura": mapa["largura"], "altura": mapa["altura"]}}))
        await esperar(wa, "mapa")

        # admin tira o dono de todas
        await esvaziar(wa)
        await wa.send(json.dumps({"tipo": "sala", "acao": "liberar_tudo", "id": ""}))
        m3 = await esperar(wa, "mapa")
        donos = [z for z in (m3 or {"mapa": {"zonas": []}})["mapa"]["zonas"] if z.get("dono")]
        conferir("admin tira o dono de TODAS as salas", bool(m3) and not donos)
        await esvaziar(wm)
        await wm.send(json.dumps({"tipo": "sala", "acao": "liberar_tudo", "id": ""}))
        conferir("membro NÃO consegue soltar todas", bool(await esperar(wm, "erro")))

    # ---- sessão única: entrar de novo com a mesma conta derruba a anterior ----
    async with websockets.connect(f"ws://127.0.0.1:{PORTA}/ws") as w1:
        await w1.send(json.dumps({"tipo": "entrar", "token": t_membro}))
        b1 = await esperar(w1, "bemvindo")
        conferir("membro volta e continua membro comum", bool(b1) and b1.get("admin") is False)
        async with websockets.connect(f"ws://127.0.0.1:{PORTA}/ws") as w2:
            await w2.send(json.dumps({"tipo": "entrar", "token": t_membro}))
            b2 = await esperar(w2, "bemvindo")
            conferir("a segunda entrada é aceita", bool(b2))
            r = await esperar(w1, "recusado", 4)
            conferir("e a primeira janela é desconectada com aviso", bool(r))


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
