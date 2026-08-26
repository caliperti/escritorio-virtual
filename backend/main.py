import logging
import os
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import mapa
from mapa import escritorio
from sala import RAIO_CONVERSA, RAIO_SILENCIO, CORES, cor_valida, limpar_aparencia, sala

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("escritorio")

STATIC_DIR = Path(__file__).parent / "static"

# Sala aberta por padrão (uso interno). Com SENHA definida — o caso de deixar o
# endereço na internet — ninguém entra sem ela.
SENHA = os.environ.get("SENHA", "").strip()

escritorio.carregar()

app = FastAPI(title="Escritório Virtual")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def raiz():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/config")
async def config():
    return {"protegido": bool(SENHA)}


@app.get("/saude")
async def saude():
    return {"ok": True, "pessoas": len(sala.participantes)}


@app.websocket("/ws")
async def websocket_sala(ws: WebSocket):
    await ws.accept()
    eu = None
    try:
        entrada = await ws.receive_json()
        if entrada.get("tipo") != "entrar":
            await ws.close(code=4000)
            return
        if SENHA and (entrada.get("senha") or "") != SENHA:
            await ws.send_json({"tipo": "recusado", "texto": "Senha incorreta."})
            await ws.close(code=4003)
            return

        eu = await sala.entrar(ws, entrada)
        log.info("entrou: %s (%s) — %d na sala", eu.nome, eu.id, len(sala.participantes))

        await ws.send_json({
            "tipo": "bemvindo",
            "voce": eu.publico(),
            "mapa": escritorio.para_cliente(),
            "config": {
                "raio_conversa": RAIO_CONVERSA,
                "raio_silencio": RAIO_SILENCIO,
                "cores": CORES,
            },
            "participantes": [p.publico() for p in sala.participantes.values() if p.id != eu.id],
        })
        await sala.publicar({"tipo": "entrou", "participante": eu.publico()}, exceto=eu.id)

        while True:
            msg = await ws.receive_json()
            tipo = msg.get("tipo")

            if tipo == "mover":
                if not sala.mover(eu, msg.get("x"), msg.get("y"), msg.get("direcao")):
                    await ws.send_json({"tipo": "corrigir", "x": eu.x, "y": eu.y})
                    continue
                await sala.publicar({
                    "tipo": "mover", "id": eu.id,
                    "x": round(eu.x, 1), "y": round(eu.y, 1), "direcao": eu.direcao,
                    "zona": (mapa.zona_de(eu.x, eu.y) or {}).get("id"),
                }, exceto=eu.id)

            elif tipo == "chat":
                texto = (msg.get("texto") or "").strip()[:500]
                if not texto:
                    continue
                escopo = "todos" if msg.get("escopo") == "todos" else "perto"
                pacote = {"tipo": "chat", "de": eu.id, "nome": eu.nome, "cor": eu.cor,
                          "texto": texto, "escopo": escopo}
                if escopo == "todos":
                    await sala.publicar(pacote, exceto=eu.id)
                    ouviram = [p.id for p in sala.participantes.values() if p.id != eu.id]
                else:
                    ouviram = await sala.publicar_perto(eu, pacote)
                await ws.send_json({**pacote, "proprio": True, "ouviram": len(ouviram)})

            elif tipo == "midia":
                eu.mudo = bool(msg.get("mudo"))
                eu.sem_camera = bool(msg.get("sem_camera"))
                eu.tela = bool(msg.get("tela"))
                await sala.publicar({"tipo": "midia", "id": eu.id, "mudo": eu.mudo,
                                     "sem_camera": eu.sem_camera, "tela": eu.tela}, exceto=eu.id)

            elif tipo == "reacao":
                emoji = (msg.get("emoji") or "")[:4]
                await sala.publicar({"tipo": "reacao", "id": eu.id, "emoji": emoji}, exceto=eu.id)

            elif tipo == "perfil":
                eu.nome = (msg.get("nome") or eu.nome).strip()[:24] or eu.nome
                if cor_valida(msg.get("cor")):
                    eu.cor = msg["cor"]
                eu.emoji = (msg.get("emoji") or eu.emoji)[:4]
                if msg.get("aparencia"):
                    eu.aparencia = limpar_aparencia(msg["aparencia"])
                await sala.publicar({"tipo": "perfil", "participante": eu.publico()})

            elif tipo == "sinal":
                # Encaminhamento cru de WebRTC (offer/answer/ICE). O servidor não
                # entende nem toca no conteúdo — áudio e vídeo vão direto P2P.
                destino = sala.participantes.get(msg.get("para"))
                if destino:
                    await sala.enviar(destino, {"tipo": "sinal", "de": eu.id,
                                                "dados": msg.get("dados")})

            elif tipo == "editar":
                # O editor de mapa é aberto a todo mundo (é ferramenta interna).
                # O servidor valida a ação, grava e devolve o mapa inteiro: são
                # ~20 KB e as edições são esporádicas, então não vale a pena
                # sincronizar diferença por diferença e arriscar divergir.
                if escritorio.editar(msg.get("acao") or {}):
                    escritorio.salvar()
                    await sala.publicar({"tipo": "mapa", "mapa": escritorio.para_cliente(),
                                         "por": eu.nome})
                else:
                    await ws.send_json({"tipo": "erro", "texto": "Edição recusada."})

            elif tipo == "ping":
                await ws.send_json({"tipo": "pong"})

    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("erro no websocket")
    finally:
        if eu:
            await sala.sair(eu.id)
            await sala.publicar({"tipo": "saiu", "id": eu.id})
            log.info("saiu: %s — %d na sala", eu.nome, len(sala.participantes))
