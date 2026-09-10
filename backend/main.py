import logging
import os
from pathlib import Path

from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

import contas as mod_contas
import mapa
import nuvem
from contas import contas
import estudio as mod_estudio
from estudio import estudio
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
estudio.carregar()
# As peças que o admin criou entram POR CIMA do catálogo de fábrica. Se algo
# aqui estiver torto, o escritório continua de pé — só falta a peça nova.
mapa.CATALOGO.update({k: {**v} for k, v in estudio.pecas.items()})
escritorio.carregar()

class EstaticoSemCache(StaticFiles):
    """Arquivo estático que o navegador SEMPRE confere antes de usar.

    Sem `Cache-Control`, o navegador decide sozinho por quanto tempo guarda o
    `app.js` — e o Safari guarda por horas. Resultado: a pessoa atualiza a
    página depois de um deploy, vê a versão velha e conclui que o trabalho não
    foi feito. Aconteceu aqui, duas vezes. `no-cache` não desliga o cache: com
    o ETag, se o arquivo não mudou a resposta é um 304 vazio, que é barato.
    """

    def file_response(self, *a, **k):
        resposta = super().file_response(*a, **k)
        resposta.headers["Cache-Control"] = "no-cache, must-revalidate"
        return resposta


app = FastAPI(title="Escritório Virtual")
app.mount("/static", EstaticoSemCache(directory=STATIC_DIR), name="static")


# Carimbo de versão dos arquivos do site.
#
# Sem isso, quem já visitou continua vendo o CSS e o JS velhos por dias: o
# navegador guarda e nem pergunta. `Cache-Control: no-cache` só passa a valer
# na visita SEGUINTE à primeira que o recebe, então quem pegou a versão antiga
# antes disso fica preso — foi o que aconteceu na virada do tema.
#
# A saída é o endereço mudar quando o arquivo muda: `estilo.css?v=1699...`. Para
# o navegador é outro arquivo, então ele baixa. O carimbo é o relógio do arquivo
# mais novo entre os do site, calculado a cada pedido do index (é barato: são
# poucos arquivos e o index é pedido uma vez por visita).
ARQUIVOS_DO_SITE = ("estilo.css", "app.js", "editor.js", "objetos.js",
                    "boneco.js", "midia.js", "index.html")


def _carimbo() -> str:
    ultimo = 0.0
    for nome in ARQUIVOS_DO_SITE:
        alvo = STATIC_DIR / nome
        if alvo.exists():
            ultimo = max(ultimo, alvo.stat().st_mtime)
    return str(int(ultimo))


@app.get("/")
async def raiz():
    html = (STATIC_DIR / "index.html").read_text(encoding="utf-8")
    return HTMLResponse(html.replace("?v=VERSAO", "?v=" + _carimbo()))


@app.get("/config")
async def config():
    """A tela de entrada pergunta isto antes de desenhar: se a sala tem código,
    quantas vagas de membro sobraram e se dá para entrar como visitante."""
    return {"protegido": bool(SENHA), "contas": True, "nuvem": nuvem.ligado,
            "vagas": contas.vagas(), "total_membros": mod_contas.MAX_CONTAS,
            "visitante": True}


@app.post("/conta/registrar")
async def registrar(dados: dict):
    """Cadastro: e-mail é o login, nome é o que aparece em cima do boneco."""
    if SENHA and (dados.get("convite") or "") != SENHA:
        return {"erro": "Código de convite errado."}
    email = (dados.get("email") or "").strip()
    nome = (dados.get("nome") or "").strip()
    if not mod_contas.email_valido(email):
        return {"erro": "Escreva um e-mail de verdade."}
    if contas.existe(email):
        return {"erro": "Esse e-mail já tem conta. Use a aba Entrar."}
    if contas.nome_em_uso(nome):
        return {"erro": "Já tem alguém com esse nome no escritório. Escolha outro."}
    if contas.cheio():
        return {"erro": "As %d vagas de membro já foram preenchidas. "
                        "Você pode entrar como visitante." % mod_contas.MAX_CONTAS}
    cor = dados.get("cor") if cor_valida(dados.get("cor")) else "#4f7fd9"
    token = contas.registrar(email, nome, dados.get("senha") or "",
                             limpar_aparencia(dados.get("aparencia")), cor)
    if not token:
        return {"erro": "Nome precisa de 2 letras e senha de 4."}
    nuvem.marcar(mod_contas.ARQUIVO)
    return {"token": token, "conta": conta_publica(contas.por_token(token))}


@app.post("/conta/entrar")
async def entrar_conta(dados: dict):
    # `nome` ainda é aceito para não quebrar quem tem a página velha aberta
    quem = (dados.get("email") or dados.get("nome") or "")
    token = contas.entrar(quem, dados.get("senha") or "")
    if not token:
        return {"erro": "E-mail ou senha não conferem."}
    nuvem.marcar(mod_contas.ARQUIVO)
    return {"token": token, "conta": conta_publica(contas.por_token(token))}


@app.get("/conta/eu")
async def conta_eu(token: str = ""):
    conta = contas.por_token(token)
    return {"conta": conta_publica(conta)} if conta else {"erro": "Sessão expirada."}


def conta_publica(conta):
    return {"nome": conta["nome"], "email": conta.get("email", ""),
            "aparencia": conta.get("aparencia") or {},
            "cor": conta.get("cor")} if conta else None


def _admin_do_token(token: str):
    """Devolve a conta se o token for de um administrador, senão None."""
    conta = contas.por_token(token or "")
    if conta and mod_contas.eh_admin(conta.get("email") or conta["nome"]):
        return conta
    return None


@app.get("/estudio/pecas")
async def estudio_listar(token: str = ""):
    if not _admin_do_token(token):
        return {"erro": "Só o administrador."}
    return {"pecas": estudio.pecas, "roupas": estudio.roupas}


@app.post("/estudio/peca")
async def estudio_criar_peca(
    token: str = Form(""), nome: str = Form(""), grupo: str = Form("Decoração"),
    largura: int = Form(1), altura: int = Form(1), bloqueia: str = Form("1"),
    camada: str = Form("chao"), imagem: UploadFile = File(...),
):
    if not _admin_do_token(token):
        return {"erro": "Só o administrador cria peça."}
    dados = await imagem.read()
    peca, porque = estudio.criar_peca(dados, nome, grupo, largura, altura,
                                      bloqueia not in ("0", "false", ""), camada)
    if not peca:
        return {"erro": porque}
    mapa.CATALOGO[peca["id"]] = {k: v for k, v in peca.items() if k != "id"}
    nuvem.marcar(mod_estudio.ARQUIVO)
    await sala.publicar({"tipo": "mapa", "mapa": escritorio.para_cliente(),
                         "por": "estúdio"})
    return {"peca": peca}


@app.post("/estudio/roupa")
async def estudio_criar_roupa(
    token: str = Form(""), nome: str = Form(""), grupo: str = Form("camisaTipo"),
    andando: UploadFile = File(...), sentado: Optional[UploadFile] = File(None),
):
    if not _admin_do_token(token):
        return {"erro": "Só o administrador cria roupa."}
    bytes_sentado = await sentado.read() if sentado is not None else None
    roupa, porque = estudio.criar_roupa(await andando.read(), bytes_sentado or None,
                                        nome, grupo)
    if not roupa:
        return {"erro": porque}
    return {"roupa": roupa}


@app.post("/estudio/remover")
async def estudio_remover(dados: dict):
    if not _admin_do_token(dados.get("token") or ""):
        return {"erro": "Só o administrador."}
    chave = str(dados.get("id") or "")
    if dados.get("roupa"):
        return {"ok": estudio.remover_roupa(chave)}
    if estudio.remover_peca(chave):
        mapa.CATALOGO.pop(chave, None)
        # tira do mapa o que já tinha sido colocado com essa peça
        escritorio.objetos = [o for o in escritorio.objetos if o["tipo"] != chave]
        escritorio._recalcular()
        escritorio.salvar()
        await sala.publicar({"tipo": "mapa", "mapa": escritorio.para_cliente(),
                             "por": "estúdio"})
        return {"ok": True}
    return {"erro": "Peça não encontrada."}


@app.get("/catalogo")
async def catalogo():
    """O arsenal inteiro, sem precisar abrir WebSocket. Serve o painel de móveis
    do editor e a página de mostruário."""
    return {"catalogo": mapa.CATALOGO, "pisos": mapa.PISOS, "tile": mapa.TAMANHO_TILE,
            "roupas": estudio.roupas}


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
        # Visitante entra sem cadastro: precisa do código da sala e de um nome.
        # Ele anda, vê e conversa, mas nada do que ele faz muda o escritório.
        visitante = bool(entrada.get("visitante"))
        if visitante:
            if SENHA and (entrada.get("convite") or "") != SENHA:
                await ws.send_json({"tipo": "recusado", "texto": "Código da sala errado."})
                await ws.close(code=4003)
                return
            nome = (entrada.get("nome") or "").strip()[:24] or "Visitante"
            # Nome de membro é do membro: visitante com o mesmo nome aparecia
            # na lista e no mapa igualzinho ao dono da conta.
            # o nome que o visitante escolhe é o que aparece em cima do boneco:
            # não pode ser o de um membro, senão ele se passa por outra pessoa
            if contas.nome_em_uso(nome):
                await ws.send_json({"tipo": "recusado",
                                    "texto": "Esse nome é de um membro. Escolha outro."})
                await ws.close(code=4003)
                return
            entrada = {**entrada, "nome": nome}
            conta = None
        else:
            conta = contas.por_token(entrada.get("token") or "")
            if not conta:
                await ws.send_json({"tipo": "recusado", "texto": "Faça login para entrar."})
                await ws.close(code=4003)
                return
            entrada = {**entrada, "nome": conta["nome"],
                       "aparencia": conta.get("aparencia") or {},
                       "cor": conta.get("cor") or entrada.get("cor")}

        eu = await sala.entrar(ws, entrada)
        eu.visitante = visitante
        eu.token = entrada.get("token") if not visitante else ""
        # A sala reivindicada é do E-MAIL, não do nome. Assim trocar o nome não
        # deixa a sala órfã, que era um problema de verdade antes.
        eu.conta = "" if visitante else mod_contas._chave(conta.get("email") or conta["nome"])
        eu.admin = (not visitante) and mod_contas.eh_admin(conta.get("email") or conta["nome"])
        log.info("entrou: %s (%s) — %d na sala", eu.nome, eu.id, len(sala.participantes))

        await ws.send_json({
            "tipo": "bemvindo",
            "voce": eu.publico(),
            "visitante": eu.visitante,
            "admin": eu.admin,
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
                    volta = {"tipo": "corrigir", "x": eu.x, "y": eu.y}
                    # Se o que barrou foi sala de alguém, o cliente precisa saber
                    # QUAL — senão a pessoa fica batendo na parede sem entender.
                    try:
                        z = sala.zona_trancada_para(eu, float(msg.get("x")), float(msg.get("y")))
                    except (TypeError, ValueError):
                        z = None
                    if z is not None:
                        volta["trancada"] = {"id": z["id"], "nome": z["nome"],
                                             "dono": z.get("dono_nome", ""),
                                             "online": any(p.conta == z.get("dono")
                                                           for p in sala.participantes.values())}
                    await ws.send_json(volta)
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
                nome_novo = (msg.get("nome") or eu.nome).strip()[:24] or eu.nome
                if cor_valida(msg.get("cor")):
                    eu.cor = msg["cor"]
                eu.emoji = (msg.get("emoji") or eu.emoji)[:4]
                if msg.get("aparencia"):
                    eu.aparencia = limpar_aparencia(msg["aparencia"])
                if eu.visitante:
                    if nome_novo != eu.nome and contas.nome_em_uso(nome_novo):
                        await ws.send_json({"tipo": "erro",
                                            "texto": "Esse nome é de um membro. Escolha outro."})
                    else:
                        eu.nome = nome_novo
                else:
                    # A conta é do e-mail, então trocar o nome não mexe em quem
                    # a pessoa é: só muda o que está escrito em cima do boneco.
                    # O que ainda importa é não repetir nome de outro membro.
                    if nome_novo != eu.nome and contas.nome_em_uso(nome_novo, eu.conta):
                        await ws.send_json({"tipo": "erro",
                                            "texto": "Já tem alguém com esse nome. Ficou o de antes."})
                    else:
                        eu.nome = nome_novo
                    contas.atualizar(eu.token, nome=eu.nome,
                                     aparencia=eu.aparencia, cor=eu.cor)
                    nuvem.marcar(mod_contas.ARQUIVO)
                    # a plaquinha da sala mostra o nome: acompanha a troca
                    mudou = False
                    for z in escritorio.zonas:
                        if z.get("dono") == eu.conta and z.get("dono_nome") != eu.nome:
                            z["dono_nome"] = eu.nome
                            mudou = True
                    if mudou:
                        escritorio.salvar()
                        nuvem.marcar(mapa.ARQUIVO)
                        await sala.publicar({"tipo": "mapa", "mapa": escritorio.para_cliente(),
                                             "por": ""})
                await sala.publicar({"tipo": "perfil", "participante": eu.publico()})

            elif tipo == "moderar":
                # Expulsar e calar são do administrador. Silenciar não é só
                # pedido bonito ao navegador de quem fala: o servidor para de
                # encaminhar o sinal de WebRTC dessa pessoa, então chamada nova
                # com ela nem se forma, e quem já está na chamada corta o som.
                if not eu.admin:
                    await ws.send_json({"tipo": "erro", "texto": "Só o administrador faz isso."})
                    continue
                alvo = sala.participantes.get(str(msg.get("id") or ""))
                acao = msg.get("acao")
                if alvo is None or alvo.id == eu.id:
                    await ws.send_json({"tipo": "erro", "texto": "Não achei essa pessoa."})
                    continue
                if acao == "expulsar":
                    await sala.enviar(alvo, {"tipo": "recusado",
                                             "texto": "%s tirou você do escritório." % eu.nome})
                    try:
                        await alvo.ws.close(code=4004)
                    except Exception:
                        pass
                    await sala.publicar({"tipo": "sistema",
                                         "texto": "%s tirou %s do escritório." % (eu.nome, alvo.nome)})
                elif acao in ("silenciar", "devolver_voz"):
                    alvo.silenciado = acao == "silenciar"
                    if alvo.silenciado:
                        alvo.mudo = True
                    await sala.enviar(alvo, {"tipo": "moderado", "acao": acao, "por": eu.nome})
                    await sala.publicar({"tipo": "perfil", "participante": alvo.publico()})
                    await sala.publicar({"tipo": "sistema", "texto": "%s %s %s." % (
                        eu.nome, "calou" if alvo.silenciado else "devolveu a voz de", alvo.nome)})

            elif tipo == "sinal":
                # Encaminhamento cru de WebRTC (offer/answer/ICE). O servidor não
                # entende nem toca no conteúdo — áudio e vídeo vão direto P2P.
                destino = sala.participantes.get(msg.get("para"))
                if eu.silenciado or (destino is not None and destino.silenciado):
                    continue                      # calado não abre nem recebe chamada
                if destino:
                    await sala.enviar(destino, {"tipo": "sinal", "de": eu.id,
                                                "dados": msg.get("dados")})

            elif tipo == "editar" and eu.visitante:
                await ws.send_json({"tipo": "erro",
                                    "texto": "Visitante não edita o escritório."})

            elif tipo == "sala" and eu.visitante:
                await ws.send_json({"tipo": "erro",
                                    "texto": "Só membros reivindicam e trancam sala."})

            elif tipo == "editar":
                # O servidor valida a ação, grava e devolve o mapa inteiro: são
                # ~20 KB e as edições são esporádicas, então não vale a pena
                # sincronizar diferença por diferença e arriscar divergir.
                #
                # Quem pode o quê está em `mapa.pode_editar`: admin mexe em tudo,
                # membro mexe só dentro da sala que reivindicou.
                acao = msg.get("acao") or {}
                permitido, porque = escritorio.pode_editar(acao, eu.conta, eu.admin)
                if not permitido:
                    await ws.send_json({"tipo": "erro", "texto": porque})
                    continue
                if escritorio.editar(acao):
                    escritorio.salvar()
                    nuvem.marcar(mapa.ARQUIVO)
                    await sala.publicar({"tipo": "mapa", "mapa": escritorio.para_cliente(),
                                         "por": eu.nome})
                else:
                    await ws.send_json({"tipo": "erro", "texto": "Edição recusada."})

            elif tipo == "sala":
                # Reivindicar, soltar, bater na porta e responder a quem bateu.
                # Quem decide é sempre o servidor: o cliente só pede.
                acao = msg.get("acao")
                zid = str(msg.get("id") or "")

                if acao == "reivindicar":
                    z = escritorio.zona_por_id(zid)
                    dentro = z and mapa.zona_de(eu.x, eu.y) and mapa.zona_de(eu.x, eu.y)["id"] == zid
                    if not dentro:
                        await ws.send_json({"tipo": "erro", "texto": "Entre na sala para reivindicar."})
                        continue
                    ok, porque = escritorio.reivindicar(zid, eu.conta, eu.nome)
                    if not ok:
                        await ws.send_json({"tipo": "erro", "texto": porque})
                        continue
                    escritorio.salvar()
                    nuvem.marcar(mapa.ARQUIVO)
                    await sala.publicar({"tipo": "mapa", "mapa": escritorio.para_cliente(),
                                         "por": eu.nome})

                elif acao == "liberar":
                    z = escritorio.zona_por_id(zid)
                    dono = (z or {}).get("dono")
                    ok, porque = escritorio.liberar(zid, dono if eu.admin else eu.conta)
                    if not ok:
                        await ws.send_json({"tipo": "erro", "texto": porque})
                        continue
                    sala.convidados_da(zid).clear()
                    escritorio.salvar()
                    nuvem.marcar(mapa.ARQUIVO)
                    await sala.publicar({"tipo": "mapa", "mapa": escritorio.para_cliente(),
                                         "por": eu.nome})

                elif acao in ("trancar", "destrancar"):
                    ok, porque = escritorio.trancar(zid, eu.conta, acao == "trancar")
                    if not ok:
                        await ws.send_json({"tipo": "erro", "texto": porque})
                        continue
                    if acao == "destrancar":
                        sala.convidados_da(zid).clear()   # porta aberta, convite não faz falta
                    escritorio.salvar()
                    nuvem.marcar(mapa.ARQUIVO)
                    await sala.publicar({"tipo": "mapa", "mapa": escritorio.para_cliente(),
                                         "por": eu.nome})

                elif acao == "liberar_tudo":
                    if not eu.admin:
                        await ws.send_json({"tipo": "erro", "texto": "Só o administrador faz isso."})
                        continue
                    soltas = 0
                    for z in escritorio.zonas:
                        if z.get("dono"):
                            escritorio.liberar(z["id"], z["dono"])
                            sala.convidados_da(z["id"]).clear()
                            soltas += 1
                    escritorio.salvar()
                    nuvem.marcar(mapa.ARQUIVO)
                    await sala.publicar({"tipo": "mapa", "mapa": escritorio.para_cliente(),
                                         "por": eu.nome})
                    await ws.send_json({"tipo": "erro",
                                        "texto": "%d sala(s) ficaram sem dono." % soltas})

                elif acao == "bater":
                    z = escritorio.zona_por_id(zid)
                    if not z or not z.get("dono"):
                        await ws.send_json({"tipo": "erro", "texto": "Essa sala não tem dono."})
                        continue
                    if not z.get("trancada"):
                        await ws.send_json({"tipo": "erro", "texto": "A porta está aberta, é só entrar."})
                        continue
                    dono = next((p for p in sala.participantes.values()
                                 if p.conta == z["dono"]), None)
                    if dono is None:
                        await ws.send_json({"tipo": "erro",
                                            "texto": "%s não está no escritório agora." % z.get("dono_nome", "O dono")})
                        continue
                    await sala.enviar(dono, {"tipo": "sala", "acao": "bateram", "id": zid,
                                             "nome_sala": z["nome"], "de": eu.id, "quem": eu.nome})
                    await ws.send_json({"tipo": "sala", "acao": "bateu", "id": zid,
                                        "dono": z.get("dono_nome", "")})

                elif acao == "responder":
                    z = escritorio.zona_por_id(zid)
                    if not z or z.get("dono") != eu.conta:
                        continue                       # só o dono responde
                    visita = sala.participantes.get(str(msg.get("para") or ""))
                    if visita is None:
                        continue
                    if msg.get("aceita"):
                        sala.convidar(zid, visita.id)
                    await sala.enviar(visita, {"tipo": "sala", "acao": "resposta", "id": zid,
                                               "nome_sala": z["nome"], "aceita": bool(msg.get("aceita")),
                                               "dono": eu.nome})

                elif acao == "expulsar":
                    z = escritorio.zona_por_id(zid)
                    if not z or z.get("dono") != eu.conta:
                        continue
                    sala.esquecer_convite(zid, str(msg.get("para") or ""))

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
