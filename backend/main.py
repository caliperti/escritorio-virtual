import logging
import os
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import contas as mod_contas
import mapa
import nuvem
from contas import contas
from mapa import escritorio
from sala import RAIO_CONVERSA, RAIO_SILENCIO, CORES, cor_valida, limpar_aparencia, sala

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("escritorio")

STATIC_DIR = Path(__file__).parent / "static"

# Sala aberta por padrão (uso interno). Com SENHA definida — o caso de deixar o
# endereço na internet — ninguém entra sem ela.
SENHA = os.environ.get("SENHA", "").strip()

# Na subida, primeiro tenta trazer o estado do repositório (o disco do plano
# gratuito é apagado quando o serviço hiberna), depois carrega do arquivo.
nuvem.restaurar([mod_contas.ARQUIVO, mapa.ARQUIVO])
contas.carregar()
escritorio.carregar()

app = FastAPI(title="Escritório Virtual")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def raiz():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/config")
async def config():
    return {"protegido": bool(SENHA), "contas": True, "nuvem": nuvem.ligado}


@app.post("/conta/registrar")
async def registrar(dados: dict):
    """Cadastro: só entra quem tem o código de convite da sala."""
    if SENHA and (dados.get("convite") or "") != SENHA:
        return {"erro": "Código de convite errado."}
    nome = (dados.get("nome") or "").strip()
    if contas.existe(nome):
        return {"erro": "Já existe alguém com esse nome. Escolha outro ou faça login."}
    token = contas.registrar(nome, dados.get("senha") or "",
                             mod_contas_limpar(dados.get("aparencia")), dados.get("cor") or "#4f7fd9")
    if not token:
        return {"erro": "Nome precisa de 2 letras e senha de 4."}
    nuvem.marcar(mod_contas.ARQUIVO)
    return {"token": token, "conta": conta_publica(contas.por_token(token))}


@app.post("/conta/entrar")
async def entrar_conta(dados: dict):
    token = contas.entrar((dados.get("nome") or ""), dados.get("senha") or "")
    if not token:
        return {"erro": "Nome ou senha não conferem."}
    nuvem.marcar(mod_contas.ARQUIVO)
    return {"token": token, "conta": conta_publica(contas.por_token(token))}


@app.get("/conta/eu")
async def conta_eu(token: str = ""):
    conta = contas.por_token(token)
    return {"conta": conta_publica(conta)} if conta else {"erro": "Sessão expirada."}


def conta_publica(conta):
    return {"nome": conta["nome"], "aparencia": conta.get("aparencia") or {},
            "cor": conta.get("cor")} if conta else None


def mod_contas_limpar(bruto):
    return mapa.limpar_aparencia(bruto) if hasattr(mapa, "limpar_aparencia") else (bruto or {})


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
        conta = contas.por_token(entrada.get("token") or "")
        if not conta:
            await ws.send_json({"tipo": "recusado", "texto": "Faça login para entrar."})
            await ws.close(code=4003)
            return
        entrada = {**entrada, "nome": conta["nome"],
                   "aparencia": conta.get("aparencia") or {},
                   "cor": conta.get("cor") or entrada.get("cor")}

        eu = await sala.entrar(ws, entrada)
        eu.token = entrada.get("token")
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
                contas.atualizar(getattr(eu, "token", ""), nome=eu.nome,
                                 aparencia=eu.aparencia, cor=eu.cor)
                nuvem.marcar(mod_contas.ARQUIVO)
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
                    nuvem.marcar(mapa.ARQUIVO)
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
