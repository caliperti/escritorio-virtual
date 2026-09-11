import json
import logging
import math
import os
import time
from pathlib import Path

from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
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
# Quanto tempo quem o admin expulsa fica de fora. Só fechar o WebSocket não
# expulsava nada: a pessoa voltava no clique seguinte com o mesmo login.
MINUTOS_EXPULSO = 30
# Quantas mensagens por segundo cada conexão pode mandar.
TETO_MENSAGENS = 40
# O sinal de WebRTC tem teto PRÓPRIO, e bem mais largo. Abrir uma chamada
# dispara dezenas de candidatos ICE em menos de um segundo; com três pessoas
# por perto, o teto único de 40 estourava, o sinal era jogado fora sem aviso e
# a chamada nunca fechava — câmera acendendo e apagando sem parar, para todo
# mundo. O tamanho de cada mensagem continua limitado logo abaixo.
TETO_SINAIS = 200
# E de que tamanho. O teto por segundo não olhava o tamanho: um `sinal` de
# 8 MB era lido, desmontado e repassado inteiro ao alvo — 40 vezes por
# segundo, se quisessem. Um SDP de WebRTC tem uns 10 KB; 64 KB é folgado.
MAX_CARACTERES_MENSAGEM = 64 * 1024
# O maior envio que o estúdio aceita: duas folhas de roupa no limite, mais a
# moldura do multipart.
MAX_CORPO_ESTUDIO = 2 * mod_estudio.MAX_BYTES + 512 * 1024

# Na subida, primeiro tenta trazer o estado do repositório (o disco do plano
# gratuito é apagado quando o serviço hiberna), depois carrega do arquivo. O
# catálogo do estúdio vem junto — ficava de fora, e o mapa restaurado perdia
# todo móvel criado pelo admin (tipo desconhecido é descartado na carga).
nuvem.restaurar([mod_contas.ARQUIVO, mapa.ARQUIVO, mod_estudio.ARQUIVO])
contas.carregar()
estudio.carregar()
# as figuras das peças e roupas moram em static/assets, que some com o disco
nuvem.restaurar([a for a in estudio.arquivos_de_imagem() if not a.exists()])
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


class TetoDeCorpo:
    """Diz não, na porta, a um envio maior do que o estúdio aceita.

    O corpo de um POST multipart é lido e desmontado INTEIRO antes de a rota
    olhar o token: qualquer um, sem login, mandava 40 MB (ou 4 GB) para
    /estudio/peca e o servidor engolia tudo — memória, disco temporário e
    tempo — para só então responder "só o administrador". O tamanho vem no
    cabeçalho, e o servidor HTTP garante que o corpo não passa dele."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if (scope["type"] == "http" and scope.get("method") == "POST"
                and scope["path"].startswith("/estudio/")):
            declarado = dict(scope["headers"]).get(b"content-length", b"")
            if not declarado.isdigit() or int(declarado) > MAX_CORPO_ESTUDIO:
                resposta = JSONResponse({"erro": "Envio grande demais (o limite é 3 MB por imagem)."},
                                        status_code=413)
                await resposta(scope, receive, send)
                return
        await self.app(scope, receive, send)


app = FastAPI(title="Escritório Virtual")
app.add_middleware(TetoDeCorpo)
app.mount("/static", EstaticoSemCache(directory=STATIC_DIR), name="static")


def _texto(valor) -> str:
    """O campo como texto, ou vazio se veio de outro tipo. Um número ou uma
    lista onde ia texto derrubava a rota com 500 (`.strip()` de int) — e, no
    WebSocket, fechava a conexão sem resposta nenhuma."""
    return valor if isinstance(valor, str) else ""


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
    if SENHA and _texto(dados.get("convite")) != SENHA:
        return {"erro": "Código de convite errado."}
    email = _texto(dados.get("email")).strip()
    nome = _texto(dados.get("nome")).strip()
    if not mod_contas.email_valido(email):
        return {"erro": "Escreva um e-mail de verdade."}
    if contas.existe(email):
        return {"erro": "Esse e-mail já tem conta. Use a aba Entrar."}
    # nem de membro, nem de quem está na sala agora (um visitante, por exemplo)
    if contas.nome_em_uso(nome) or sala.nome_em_uso(nome):
        return {"erro": "Já tem alguém com esse nome no escritório. Escolha outro."}
    if contas.cheio():
        return {"erro": "As %d vagas de membro já foram preenchidas. "
                        "Você pode entrar como visitante." % mod_contas.MAX_CONTAS}
    cor = dados.get("cor") if cor_valida(dados.get("cor")) else "#4f7fd9"
    token = await contas.registrar_async(email, nome, _texto(dados.get("senha")),
                                         limpar_aparencia(dados.get("aparencia")), cor)
    if not token:
        return {"erro": "Nome precisa de 2 letras e senha de 4."}
    nuvem.marcar(mod_contas.ARQUIVO)
    return {"token": token, "conta": conta_publica(contas.por_token(token))}


@app.post("/conta/entrar")
async def entrar_conta(dados: dict):
    # `nome` ainda é aceito para não quebrar quem tem a página velha aberta
    quem = _texto(dados.get("email")) or _texto(dados.get("nome"))
    token = await contas.entrar_async(quem, _texto(dados.get("senha")))
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
    conta = contas.por_token(_texto(token))
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
    nuvem.marcar(estudio.arquivo_da_peca(peca["id"]))     # a figura vai junto
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
    # A roupa nova não era marcada para a nuvem — nem o catálogo nem as folhas —
    # e sumia na primeira hibernação do servidor.
    nuvem.marcar(mod_estudio.ARQUIVO)
    for folha in estudio.arquivos_da_roupa(roupa["id"], roupa["sem_sentado"]):
        nuvem.marcar(folha)
    return {"roupa": roupa}


@app.post("/estudio/remover")
async def estudio_remover(dados: dict):
    if not _admin_do_token(dados.get("token")):
        return {"erro": "Só o administrador."}
    chave = _texto(dados.get("id"))
    if dados.get("roupa"):
        folhas = estudio.remover_roupa(chave)
        if folhas is not None:
            _espelhar_remocao(folhas)
        return {"ok": folhas is not None}
    removidos = estudio.remover_peca(chave)
    if removidos is not None:
        _espelhar_remocao(removidos)
        mapa.CATALOGO.pop(chave, None)
        # tira do mapa o que já tinha sido colocado com essa peça
        escritorio.objetos = [o for o in escritorio.objetos if o["tipo"] != chave]
        escritorio._recalcular()
        escritorio.salvar()
        nuvem.marcar(mapa.ARQUIVO)
        await sala.publicar({"tipo": "mapa", "mapa": escritorio.para_cliente(),
                             "por": "estúdio"})
        return {"ok": True}
    return {"erro": "Peça não encontrada."}


def _espelhar_remocao(arquivos) -> None:
    """Remover no estúdio não chegava à nuvem: o catálogo antigo (com a peça
    apagada) e as figuras voltavam do espelho na subida seguinte."""
    nuvem.marcar(mod_estudio.ARQUIVO)
    for arquivo in arquivos:
        nuvem.marcar_apagado(arquivo)


@app.get("/catalogo")
async def catalogo():
    """O arsenal inteiro, sem precisar abrir WebSocket. Serve o painel de móveis
    do editor e a página de mostruário."""
    return {"catalogo": mapa.CATALOGO, "pisos": mapa.PISOS, "tile": mapa.TAMANHO_TILE,
            "roupas": estudio.roupas}


@app.get("/saude")
async def saude():
    return {"ok": True, "pessoas": len(sala.participantes)}


class MensagemGrande(ValueError):
    pass


async def _receber(ws: WebSocket) -> dict:
    """Uma mensagem do cliente, já como dicionário — ou MensagemGrande antes
    de gastar CPU desmontando um JSON de megabytes."""
    texto = await ws.receive_text()
    if len(texto) > MAX_CARACTERES_MENSAGEM:
        raise MensagemGrande()
    dados = json.loads(texto)
    if not isinstance(dados, dict):
        raise TypeError("a mensagem não é um objeto")
    return dados


def _limpar_entrada(bruto: dict) -> dict:
    """A mensagem de entrada com cada campo no tipo certo. Token que vinha como
    lista, nome como número ou `voltando` com "nan" estouravam antes de
    qualquer resposta, e a conexão caía sem dizer por quê."""
    limpa = {"tipo": _texto(bruto.get("tipo")), "visitante": bool(bruto.get("visitante")),
             "convite": _texto(bruto.get("convite")), "nome": _texto(bruto.get("nome")),
             "token": _texto(bruto.get("token")), "emoji": _texto(bruto.get("emoji")),
             "cor": _texto(bruto.get("cor")), "aparencia": bruto.get("aparencia")}
    voltando = bruto.get("voltando")
    if isinstance(voltando, dict):
        try:
            vx, vy = float(voltando.get("x")), float(voltando.get("y"))
        except (TypeError, ValueError):
            vx = vy = None
        if vx is not None and math.isfinite(vx) and math.isfinite(vy):
            limpa["voltando"] = {"x": vx, "y": vy}
    return limpa


def _nome_livre(base: str) -> str:
    """`base`, ou `base 2`, `base 3`… — o primeiro que ninguém usa."""
    nome, n = base, 2
    while sala.nome_em_uso(nome) or contas.nome_em_uso(nome):
        nome = "%s %d" % (base, n)
        n += 1
    return nome


async def _reacomodar() -> None:
    """Quem ficou fora do mapa depois de uma edição volta para a entrada — e
    fica sabendo, assim como os outros."""
    for p in sala.reacomodar():
        await sala.enviar(p, {"tipo": "corrigir", "x": p.x, "y": p.y})
        await sala.publicar({"tipo": "mover", "id": p.id, "x": round(p.x, 1), "y": round(p.y, 1),
                             "direcao": p.direcao,
                             "zona": (mapa.zona_de(p.x, p.y) or {}).get("id")}, exceto=p.id)


@app.websocket("/ws")
async def websocket_sala(ws: WebSocket):
    await ws.accept()
    eu = None
    try:
        try:
            entrada = _limpar_entrada(await _receber(ws))
        except MensagemGrande:
            await ws.send_json({"tipo": "recusado", "texto": "Pedido grande demais."})
            await ws.close(code=1009)
            return
        except (TypeError, ValueError, KeyError, AttributeError):
            await ws.send_json({"tipo": "recusado", "texto": "Não entendi esse pedido."})
            await ws.close(code=4000)
            return
        if entrada["tipo"] != "entrar":
            await ws.close(code=4000)
            return
        # Visitante entra sem cadastro: precisa do código da sala e de um nome.
        # Ele anda, vê e conversa, mas nada do que ele faz muda o escritório.
        visitante = entrada["visitante"]
        if visitante:
            if SENHA and entrada["convite"] != SENHA:
                await ws.send_json({"tipo": "recusado", "texto": "Código da sala errado."})
                await ws.close(code=4003)
                return
            # O nome do visitante segue as MESMAS regras do cadastro. Sem isto
            # ele entrava como `gulisboa5@hotmail.com`, só de espaço invisível
            # ou com quebra de linha — coisa que nenhum membro consegue.
            if entrada["nome"].strip():
                nome = mod_contas.nome_limpo(entrada["nome"])
            else:
                nome = _nome_livre("Visitante")
            if not nome:
                await ws.send_json({"tipo": "recusado",
                                    "texto": "Escolha um nome de gente: 2 letras pelo menos, e sem @."})
                await ws.close(code=4003)
                return
            # Nome de membro é do membro: visitante com o mesmo nome aparecia
            # na lista e no mapa igualzinho ao dono da conta. E nome de quem
            # já está na sala também não: dois "Ana" eram dois bonecos iguais,
            # e expulsar um expulsava os dois.
            if contas.nome_em_uso(nome):
                await ws.send_json({"tipo": "recusado",
                                    "texto": "Esse nome é de um membro. Escolha outro."})
                await ws.close(code=4003)
                return
            if sala.nome_em_uso(nome):
                await ws.send_json({"tipo": "recusado",
                                    "texto": "Já tem alguém com esse nome na sala. Escolha outro."})
                await ws.close(code=4003)
                return
            entrada = {**entrada, "nome": nome}
            conta = None
        else:
            conta = contas.por_token(entrada["token"])
            if not conta:
                await ws.send_json({"tipo": "recusado", "texto": "Faça login para entrar."})
                await ws.close(code=4003)
                return
            entrada = {**entrada, "nome": conta["nome"],
                       "aparencia": conta.get("aparencia") or {},
                       "cor": conta.get("cor") or entrada["cor"]}

        # Quem foi expulso pelo admin não entra enquanto o castigo durar.
        castigo = sala.castigo_de(
            "" if visitante else mod_contas._chave(conta.get("email") or conta["nome"]),
            entrada.get("nome") or "")
        if castigo > 0:
            await ws.send_json({"tipo": "recusado",
                                "texto": "Você foi tirado do escritório. Pode voltar em %d minutos."
                                         % max(1, int(castigo / 60) + 1)})
            await ws.close(code=4004)
            return

        eu = await sala.entrar(ws, entrada)
        eu.visitante = visitante
        eu.token = entrada.get("token") if not visitante else ""
        # A sala reivindicada é do E-MAIL, não do nome. Assim trocar o nome não
        # deixa a sala órfã, que era um problema de verdade antes.
        eu.conta = "" if visitante else mod_contas._chave(conta.get("email") or conta["nome"])
        eu.admin = (not visitante) and mod_contas.eh_admin(conta.get("email") or conta["nome"])
        if sala.esta_calado(eu.conta, eu.nome):     # o castigo sobrevive ao F5
            eu.silenciado = True
            eu.mudo = True

        # Uma sessão por conta. Sem isso, abrir o escritório numa segunda aba
        # (ou alguém entrar com a sua conta) punha DOIS bonecos idênticos no
        # mapa e dois nomes iguais na lista — impossível saber qual é qual, e
        # os dois recebendo as mesmas chamadas. A sessão antiga cai avisada.
        if eu.conta:
            for outro in list(sala.participantes.values()):
                if outro.id != eu.id and outro.conta == eu.conta:
                    await sala.enviar(outro, {
                        "tipo": "recusado",
                        "texto": "Sua conta entrou em outro lugar. Esta janela foi desconectada."})
                    try:
                        await outro.ws.close(code=4005)
                    except Exception:
                        pass
                    await sala.sair(outro.id)
                    await sala.publicar({"tipo": "saiu", "id": outro.id})
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

        janela, contador, contador_sinal = time.monotonic(), 0, 0
        while True:
            # Uma mensagem com o campo do tipo errado (texto onde ia número,
            # objeto onde ia texto) derrubava o WebSocket sem dizer nada, e o
            # cliente reconectava em laço. Agora vira recusa, como as outras.
            msg = None
            try:
                msg = await _receber(ws)
                # Teto de mensagens: um cliente sozinho mandou mil em 0,2 s e o
                # servidor reenviou três mil (o custo se multiplica por quem
                # está na sala). Andando são ~15 por segundo; 40 é folgado.
                agora_ms = time.monotonic()
                if agora_ms - janela > 1:
                    janela, contador, contador_sinal = agora_ms, 0, 0
                tipo = msg.get("tipo")
                if tipo == "sinal":
                    contador_sinal += 1
                    if contador_sinal > TETO_SINAIS:
                        if contador_sinal == TETO_SINAIS + 1:
                            log.warning("sinal demais: %s", eu.nome)
                        continue
                else:
                    contador += 1
                    if contador > TETO_MENSAGENS:
                        if contador == TETO_MENSAGENS + 1:
                            log.warning("rápido demais: %s", eu.nome)
                            await ws.send_json({"tipo": "erro",
                                                "texto": "Calma aí: pedidos demais."})
                        continue

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
                    # Quem foi calado pelo admin não reabre o próprio microfone: o
                    # servidor já não encaminha o sinal dela, mas deixar o ícone
                    # voltar a "com voz" fazia a pessoa achar que estava falando.
                    pedido = bool(msg.get("mudo"))
                    eu.mudo = True if eu.silenciado else pedido
                    eu.sem_camera = bool(msg.get("sem_camera"))
                    eu.tela = bool(msg.get("tela"))
                    estado = {"tipo": "midia", "id": eu.id, "mudo": eu.mudo,
                              "sem_camera": eu.sem_camera, "tela": eu.tela}
                    await sala.publicar(estado, exceto=eu.id)
                    if eu.mudo != pedido:
                        # o pedido foi recusado: a própria pessoa precisa ver o
                        # microfone continuar fechado, senão fala achando que sai som
                        await ws.send_json({**estado, "proprio": True})

                elif tipo == "reacao":
                    emoji = (msg.get("emoji") or "")[:4]
                    await sala.publicar({"tipo": "reacao", "id": eu.id, "emoji": emoji}, exceto=eu.id)

                elif tipo == "perfil":
                    # Mesmas regras do cadastro para o nome novo; se não serve,
                    # fica o de antes (e a pessoa fica sabendo). Antes, a sessão
                    # passava a usar o nome torto enquanto a conta guardava o
                    # antigo — dois nomes para a mesma pessoa até o F5.
                    nome_novo = eu.nome
                    if _texto(msg.get("nome")).strip():
                        nome_novo = mod_contas.nome_limpo(msg["nome"])
                        if not nome_novo:
                            await ws.send_json({"tipo": "erro",
                                                "texto": "Nome precisa de 2 letras e não pode ser um e-mail."})
                            nome_novo = eu.nome
                    if cor_valida(msg.get("cor")):
                        eu.cor = msg["cor"]
                    eu.emoji = (_texto(msg.get("emoji")) or eu.emoji)[:4]
                    if msg.get("aparencia"):
                        eu.aparencia = limpar_aparencia(msg["aparencia"])
                    if nome_novo != eu.nome and sala.nome_em_uso(nome_novo, eu.id):
                        await ws.send_json({"tipo": "erro",
                                            "texto": "Já tem alguém com esse nome na sala. Ficou o de antes."})
                        nome_novo = eu.nome
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
                    if acao == "expulsos":               # quem está de castigo agora
                        await ws.send_json({"tipo": "expulsos", "lista": sala.expulsos()})
                        continue
                    if acao == "readmitir":
                        sala.readmitir(str(msg.get("chave") or ""))
                        await ws.send_json({"tipo": "expulsos", "lista": sala.expulsos()})
                        continue
                    if alvo is None or alvo.id == eu.id:
                        await ws.send_json({"tipo": "erro", "texto": "Não achei essa pessoa."})
                        continue
                    if acao == "expulsar":
                        # Fechar o socket não bastava: a pessoa voltava no segundo
                        # seguinte com o mesmo login, e expulsar não expulsava nada.
                        # Agora ela fica de fora por um tempo; o admin pode readmitir
                        # antes disso.
                        sala.expulsar(alvo, MINUTOS_EXPULSO * 60)
                        await sala.enviar(alvo, {
                            "tipo": "recusado",
                            "texto": "%s tirou você do escritório. Você pode voltar em %d minutos."
                                     % (eu.nome, MINUTOS_EXPULSO)})
                        try:
                            await alvo.ws.close(code=4004)
                        except Exception:
                            pass
                        await sala.publicar({"tipo": "sistema",
                                             "texto": "%s tirou %s do escritório por %d minutos."
                                                      % (eu.nome, alvo.nome, MINUTOS_EXPULSO)})
                    elif acao in ("silenciar", "devolver_voz"):
                        # o silêncio fica gravado na conta: recarregar a página não
                        # devolve a voz, que era como o castigo se desfazia sozinho
                        sala.calar(alvo, acao == "silenciar")
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
                        await _reacomodar()
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
                            # recusar calado parece defeito para quem clicou
                            await ws.send_json({"tipo": "erro",
                                                "texto": "Só o dono da sala responde a quem bate."})
                            continue
                        visita = sala.participantes.get(str(msg.get("para") or ""))
                        if visita is None:
                            await ws.send_json({"tipo": "erro",
                                                "texto": "Essa pessoa já saiu."})
                            continue
                        if msg.get("aceita"):
                            sala.convidar(zid, visita.id)
                        await sala.enviar(visita, {"tipo": "sala", "acao": "resposta", "id": zid,
                                                   "nome_sala": z["nome"], "aceita": bool(msg.get("aceita")),
                                                   "dono": eu.nome})

                    elif acao == "expulsar":
                        z = escritorio.zona_por_id(zid)
                        if not z or z.get("dono") != eu.conta:
                            await ws.send_json({"tipo": "erro",
                                                "texto": "Só o dono tira alguém da própria sala."})
                            continue
                        sala.esquecer_convite(zid, str(msg.get("para") or ""))

                elif tipo == "ping":
                    await ws.send_json({"tipo": "pong"})
            except MensagemGrande:
                # já foi lida, mas não é desmontada nem repassada — e a conexão
                # fecha, porque isso não vem do nosso cliente
                log.warning("mensagem grande demais de %s", eu.nome)
                await ws.send_json({"tipo": "erro", "texto": "Pedido grande demais."})
                await ws.close(code=1009)
                return
            except (TypeError, ValueError, KeyError, AttributeError, IndexError):
                log.warning("mensagem malformada de %s: %s", eu.nome, str(msg)[:200])
                await ws.send_json({"tipo": "erro", "texto": "Não entendi esse pedido."})

    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("erro no websocket")
    finally:
        if eu:
            await sala.sair(eu.id)
            await sala.publicar({"tipo": "saiu", "id": eu.id})
            log.info("saiu: %s — %d na sala", eu.nome, len(sala.participantes))
