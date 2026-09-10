"""Estúdio: subir imagem vira peça, e roupa fora do formato é recusada."""
import asyncio, json, os, subprocess, sys, time, urllib.request
from pathlib import Path
import websockets

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
from sala import limpar_aparencia          # noqa: E402  (a mesma poda que o servidor faz)
PORTA = int(os.environ.get("PORTA_TESTE", "8404"))
BASE = f"http://127.0.0.1:{PORTA}"
CODIGO = "digital dreamer"
CONTAS = RAIZ / "contas.json"
BACKUP = RAIZ / "contas.json.est-bak"
PECAS = RAIZ / "pecas.json"
PECAS_BAK = RAIZ / "pecas.json.est-bak"
MAPA = RAIZ / "mapa.json"                  # o teste põe e tira peça do mapa de verdade
MAPA_BAK = RAIZ / "mapa.json.est-bak"
falhas, provas = [], 0


def conferir(nome, ok):
    global provas
    provas += 1
    print(("  ok  " if ok else "FALHOU") + "  " + nome)
    if not ok:
        falhas.append(nome)


def post_json(rota, dados):
    req = urllib.request.Request(BASE + rota, data=json.dumps(dados).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


def post_arquivos(rota, campos, arquivos):
    """multipart na mão: o teste não pode depender de biblioteca extra."""
    limite = "----teste%d" % int(time.time())
    corpo = b""
    for k, v in campos.items():
        corpo += (f"--{limite}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n").encode()
    for k, (nome, dados) in arquivos.items():
        corpo += (f"--{limite}\r\nContent-Disposition: form-data; name=\"{k}\"; "
                  f"filename=\"{nome}\"\r\nContent-Type: image/png\r\n\r\n").encode()
        corpo += dados + b"\r\n"
    corpo += f"--{limite}--\r\n".encode()
    req = urllib.request.Request(BASE + rota, data=corpo,
                                 headers={"Content-Type": "multipart/form-data; boundary=" + limite})
    with urllib.request.urlopen(req, timeout=20) as r:
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


async def colocar_e_apagar(t_admin, peca_id):
    """Admin põe a peça do estúdio no mapa; apagar a peça tem de tirá-la de lá."""
    async with websockets.connect(f"ws://127.0.0.1:{PORTA}/ws") as ws:
        await ws.send(json.dumps({"tipo": "entrar", "token": t_admin}))
        await esperar(ws, "bemvindo")
        await ws.send(json.dumps({"tipo": "editar", "acao": {"acao": "objeto", "tipo": peca_id, "x": 9, "y": 3}}))
        m = await esperar(ws, "mapa")
        colocou = bool(m) and any(o["tipo"] == peca_id for o in m["mapa"]["objetos"])
        r = post_json("/estudio/remover", {"token": t_admin, "id": peca_id})
        m = await esperar(ws, "mapa")
        sumiu = bool(m) and not any(o["tipo"] == peca_id for o in m["mapa"]["objetos"])
        return colocou, r.get("ok") is True, sumiu


def principal():
    t_admin = post_json("/conta/registrar", {"nome": "gulisboa5@hotmail.com", "senha": "segredo1", "convite": CODIGO})["token"]
    t_membro = post_json("/conta/registrar", {"nome": "Zezinho", "senha": "segredo1", "convite": CODIGO})["token"]
    png = (RAIZ / "static/assets/logo-128.png").read_bytes()
    folha = (RAIZ / "static/assets/lpc/camisa_m.png").read_bytes()          # 576x256
    folha_sit = (RAIZ / "static/assets/lpc/sit_camisa_m.png").read_bytes()  # 192x256

    print("\n-- quem pode criar --")
    r = post_arquivos("/estudio/peca", {"token": t_membro, "nome": "Pirata", "largura": 1,
                                        "altura": 1, "camada": "chao"}, {"imagem": ("a.png", png)})
    conferir("membro comum NÃO cria peça", bool(r.get("erro")))
    r = post_arquivos("/estudio/peca", {"token": "", "nome": "Pirata", "largura": 1,
                                        "altura": 1, "camada": "chao"}, {"imagem": ("a.png", png)})
    conferir("sem token também não", bool(r.get("erro")))

    print("\n-- criar móvel --")
    r = post_arquivos("/estudio/peca",
                      {"token": t_admin, "nome": "Quadro da empresa", "grupo": "Decoração",
                       "largura": "2", "altura": "1", "bloqueia": "0", "camada": "chao"},
                      {"imagem": ("logo.png", png)})
    conferir("admin cria a peça", bool(r.get("peca")))
    peca_id = (r.get("peca") or {}).get("id")
    cat = json.loads(urllib.request.urlopen(BASE + "/catalogo", timeout=8).read())["catalogo"]
    conferir("a peça aparece no catálogo", peca_id in cat)
    conferir("com o tamanho pedido", cat.get(peca_id, {}).get("l") == 2)
    conferir("e apontando para a imagem", "/static/assets/pecas/" in cat.get(peca_id, {}).get("imagem", ""))
    conferir("a imagem está no ar",
             urllib.request.urlopen(BASE + cat[peca_id]["imagem"], timeout=8).status == 200)

    print("\n-- id que já é de fábrica --")
    r = post_arquivos("/estudio/peca", {"token": t_admin, "nome": "Mesa", "largura": "1", "altura": "1",
                                        "camada": "chao"}, {"imagem": ("mesa.png", png)})
    clone = (r.get("peca") or {}).get("id")
    cat = json.loads(urllib.request.urlopen(BASE + "/catalogo", timeout=8).read())["catalogo"]
    conferir("peça chamada 'Mesa' NÃO toma o id da mesa de fábrica", bool(clone) and clone != "mesa")
    conferir("a mesa de fábrica continua inteira no catálogo",
             cat.get("mesa", {}).get("l") == 2 and "imagem" not in cat.get("mesa", {}))
    post_json("/estudio/remover", {"token": t_admin, "id": clone})
    cat = json.loads(urllib.request.urlopen(BASE + "/catalogo", timeout=8).read())["catalogo"]
    conferir("apagar a cópia não leva a mesa de fábrica", "mesa" in cat)

    print("\n-- criar roupa --")
    r = post_arquivos("/estudio/roupa", {"token": t_admin, "nome": "Torta", "grupo": "camisaTipo"},
                      {"andando": ("errada.png", png)})
    conferir("folha fora do formato é recusada", "576x256" in (r.get("erro") or ""))
    r = post_arquivos("/estudio/roupa", {"token": t_admin, "nome": "Uniforme", "grupo": "camisaTipo"},
                      {"andando": ("walk.png", folha), "sentado": ("sit.png", folha_sit)})
    conferir("folha certa é aceita", bool(r.get("roupa")))
    roupa_id = (r.get("roupa") or {}).get("id")
    conferir("as folhas foram gravadas com o nome que o boneco procura",
             all((RAIZ / f"static/assets/lpc/{n}").exists()
                 for n in [f"{roupa_id}_m.png", f"{roupa_id}_f.png",
                           f"sit_{roupa_id}_m.png", f"sit_{roupa_id}_f.png"]))
    conferir("e a roupa vem no catálogo",
             roupa_id in json.loads(urllib.request.urlopen(BASE + "/catalogo", timeout=8).read()).get("roupas", {}))

    print("\n-- roupa não atropela o acervo --")
    fabrica = RAIZ / "static/assets/lpc/camisa_blazer_m.png"
    original = fabrica.read_bytes()
    r = post_arquivos("/estudio/roupa", {"token": t_admin, "nome": "Blazer", "grupo": "camisaTipo"},
                      {"andando": ("walk.png", folha)})
    blazer = (r.get("roupa") or {}).get("id")
    conferir("'Blazer' do estúdio NÃO vira camisa_blazer", bool(blazer) and blazer != "camisa_blazer")
    conferir("o blazer de fábrica continua intacto", fabrica.read_bytes() == original)
    post_json("/estudio/remover", {"token": t_admin, "id": blazer, "roupa": 1})
    conferir("e apagar o do estúdio não leva o de fábrica", fabrica.exists())
    r = post_arquivos("/estudio/roupa", {"token": t_admin, "nome": "Camisa oficial da empresa 2026",
                                         "grupo": "camisaTipo"}, {"andando": ("walk.png", folha)})
    longa = (r.get("roupa") or {}).get("id")
    conferir("id de roupa comprida cabe na aparência que o servidor guarda",
             bool(longa) and limpar_aparencia({"camisaTipo": longa})["camisaTipo"] == longa)
    post_json("/estudio/remover", {"token": t_admin, "id": longa, "roupa": 1})
    r = post_arquivos("/estudio/roupa", {"token": t_admin, "nome": "Pesada", "grupo": "camisaTipo"},
                      {"andando": ("walk.png", folha + b"\0" * (3 * 1024 * 1024))})
    conferir("folha acima de 3 MB é recusada", "3 MB" in (r.get("erro") or ""))

    print("\n-- apagar --")
    r = post_json("/estudio/remover", {"token": t_membro, "id": peca_id})
    conferir("membro não apaga", bool(r.get("erro")))
    colocou, apagou, sumiu = asyncio.run(colocar_e_apagar(t_admin, peca_id))
    conferir("a peça do estúdio entra no mapa", colocou)
    conferir("admin apaga a peça", apagou)
    conferir("e ela SAI do mapa junto", sumiu)
    cat = json.loads(urllib.request.urlopen(BASE + "/catalogo", timeout=8).read())["catalogo"]
    conferir("e ela sai do catálogo", peca_id not in cat)
    post_json("/estudio/remover", {"token": t_admin, "id": roupa_id, "roupa": 1})
    conferir("roupa apagada leva as folhas junto",
             not (RAIZ / f"static/assets/lpc/{roupa_id}_m.png").exists())


for orig, bak in ((CONTAS, BACKUP), (PECAS, PECAS_BAK)):
    if orig.exists():
        orig.replace(bak)
if MAPA.exists():
    MAPA_BAK.write_bytes(MAPA.read_bytes())    # cópia: o servidor do teste precisa dele
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
    principal()
finally:
    servidor.terminate(); servidor.wait(timeout=10)
    for orig, bak in ((CONTAS, BACKUP), (PECAS, PECAS_BAK)):
        orig.unlink(missing_ok=True)
        if bak.exists():
            bak.replace(orig)
    if MAPA_BAK.exists():
        MAPA_BAK.replace(MAPA)

print("\n%d provas, %d falharam" % (provas, len(falhas)))
sys.exit(1 if falhas else 0)
