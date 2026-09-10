"""Guardar o estado num lugar que sobreviva ao servidor reiniciar.

No plano gratuito do Render o disco é apagado toda vez que o serviço hiberna —
o que apagaria as contas e o escritório editado. Então, quando as variáveis
`GITHUB_TOKEN` e `GITHUB_REPO` existem, os arquivos de estado são espelhados no
próprio repositório do projeto: na subida a gente baixa, e a cada mudança
(agrupada, para não virar enxurrada de commits) a gente sobe.

Vai para o espelho tudo o que o admin cria e que não está no código: contas,
mapa, o catálogo do estúdio (`pecas.json`) E as imagens dele — peça e roupa
são arquivo em `static/assets`, e sem elas o catálogo restaurado apontava
para figura nenhuma.

Sem essas variáveis nada disso acontece e o app segue com os arquivos locais —
que é o certo para rodar na sua máquina. A gravação em disco, essa vale sempre:
é feita num arquivo ao lado e trocada de nome no fim, para nunca existir um
`mapa.json` pela metade.
"""

import asyncio
import base64
import json
import logging
import os
import shutil
import urllib.request
from pathlib import Path
from typing import List, Optional, Union

log = logging.getLogger("escritorio.nuvem")

TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
REPO = os.environ.get("GITHUB_REPO", "").strip()          # ex.: caliperti/escritorio-virtual
PASTA = os.environ.get("ESTADO_PASTA", "estado").strip()   # onde ficam no repositório
RAMO = os.environ.get("ESTADO_RAMO", "estado").strip()     # branch só do estado
CHAVE = os.environ.get("ESTADO_CHAVE", "").strip()         # cifra o conteúdo
ESPERA = 20                                                # segundos de agrupamento
ESPERA_MAXIMA = 600                                        # teto entre tentativas com a API fora

# As imagens do estúdio moram aqui. No repositório vão para
# `estado/assets/<subpasta>/<arquivo>`, para peça e roupa não se atropelarem.
ASSETS = Path(__file__).parent / "static" / "assets"

ligado = bool(TOKEN and REPO)

# O repositório é público: contas levam hash de senha e token de sessão, então o
# conteúdo vai cifrado. Sem chave, só o mapa (que não tem nada sigiloso) sobe.
_cofre = None
if CHAVE:
    try:
        from cryptography.fernet import Fernet
        _cofre = Fernet(CHAVE.encode())
    except Exception:
        log.exception("ESTADO_CHAVE inválida — o estado sensível não será espelhado")


# ---------- disco ----------

def gravar_atomico(arquivo: Path, conteudo: Union[str, bytes]) -> None:
    """Grava num arquivo ao lado e troca de nome no fim.

    `write_text` direto abre o arquivo VAZIO e só depois escreve. Quem lê nesse
    instante (o envio para a nuvem, um backup) vê zero bytes; e o processo
    morrer no meio (o Render hibernando, queda de energia) deixa um JSON
    cortado — que na subida seguinte virava planta de fábrica e zero contas, em
    silêncio. A troca de nome é atômica: ou o arquivo velho inteiro, ou o novo
    inteiro, nunca o meio."""
    temporario = arquivo.with_name(arquivo.name + ".novo")
    if isinstance(conteudo, str):
        temporario.write_text(conteudo, encoding="utf-8")
    else:
        temporario.write_bytes(conteudo)
    os.replace(temporario, arquivo)


def guardar_ilegivel(arquivo: Path) -> Optional[Path]:
    """Copia um arquivo que não deu para ler para `<nome>.ilegivel` antes de
    ele ser sobrescrito: era a única cópia do estado, e sumia sem deixar prova."""
    if not arquivo.exists():
        return None
    copia = arquivo.with_name(arquivo.name + ".ilegivel")
    try:
        shutil.copy2(arquivo, copia)
    except OSError:
        return None
    return copia


# ---------- repositório ----------

def _sigiloso(arq: Path) -> bool:
    return arq.name == "contas.json"


def _cifrar(dados: bytes) -> bytes:
    return _cofre.encrypt(dados) if _cofre else dados


def _decifrar(dados: bytes) -> bytes:
    return _cofre.decrypt(dados) if _cofre else dados


_pendentes: set = set()          # mudou aqui e ainda não subiu
_apagados: set = set()           # sumiu daqui e ainda está lá
_tarefa: Optional[asyncio.Task] = None


def _caminho(arq: Path) -> str:
    """Onde o arquivo mora no repositório: os de estado na raiz da pasta, as
    imagens do estúdio na subpasta delas."""
    try:
        rel = arq.resolve().relative_to(ASSETS.resolve())
        return f"{PASTA}/assets/{rel.as_posix()}"
    except ValueError:
        return f"{PASTA}/{arq.name}"


def _requisitar(metodo: str, caminho: str, corpo: Optional[dict] = None, cru: str = ""):
    """Chamada à API do GitHub. `cru` permite falar com endpoints fora de /contents."""
    url = (f"https://api.github.com/repos/{REPO}/{cru}" if cru
           else f"https://api.github.com/repos/{REPO}/contents/{caminho}?ref={RAMO}"
           if metodo == "GET" else f"https://api.github.com/repos/{REPO}/contents/{caminho}")
    req = urllib.request.Request(
        url,
        method=metodo,
        data=json.dumps(corpo).encode() if corpo else None,
        headers={"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json",
                 "User-Agent": "escritorio-virtual"},
    )
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode())


def _baixar(caminho: str) -> bytes:
    dados = _requisitar("GET", caminho)
    if dados.get("encoding") == "none" or (not dados.get("content") and dados.get("size")):
        # a API de conteúdo só traz o corpo até 1 MB; acima disso vem vazio e
        # a cópia tem de vir pelo blob — uma imagem de peça pode ter 3 MB
        dados = _requisitar("GET", "", cru=f"git/blobs/{dados['sha']}")
    return base64.b64decode(dados["content"])


def restaurar(arquivos: List[Path]) -> None:
    """Baixa o estado do repositório por cima dos arquivos locais (na subida)."""
    if not ligado:
        return
    for arq in arquivos:
        if _sigiloso(arq) and not _cofre:
            continue
        try:
            conteudo = _decifrar(_baixar(_caminho(arq)))
            arq.parent.mkdir(parents=True, exist_ok=True)
            gravar_atomico(arq, conteudo)
            log.info("restaurado do repositório: %s (%d bytes)", arq.name, len(conteudo))
        except Exception as e:
            log.info("sem cópia de %s no repositório (%s)", arq.name, e.__class__.__name__)


def _garantir_ramo() -> None:
    """O estado vive num branch só dele — assim o `main` fica só com código."""
    try:
        _requisitar("GET", "", cru=f"git/ref/heads/{RAMO}")
        return
    except Exception:
        pass
    base = _requisitar("GET", "", cru="git/ref/heads/main")
    _requisitar("POST", "", {"ref": f"refs/heads/{RAMO}", "sha": base["object"]["sha"]},
                cru="git/refs")
    log.info("branch %s criado para o estado", RAMO)


def _enviar(arq: Path) -> None:
    if not arq.exists() or (_sigiloso(arq) and not _cofre):
        return
    _garantir_ramo()
    caminho = _caminho(arq)
    sha = None
    try:
        sha = _requisitar("GET", caminho).get("sha")
    except Exception:
        pass                                   # ainda não existe lá
    _requisitar("PUT", caminho, {
        "message": f"estado: {arq.name}",
        "branch": RAMO,
        "content": base64.b64encode(_cifrar(arq.read_bytes())).decode(),
        **({"sha": sha} if sha else {}),
    })
    log.info("estado enviado ao repositório: %s", arq.name)


def _apagar(arq: Path) -> None:
    """Tira do repositório o que foi apagado aqui. Sem isto a peça removida do
    estúdio voltava do espelho na subida seguinte."""
    caminho = _caminho(arq)
    try:
        sha = _requisitar("GET", caminho).get("sha")
    except Exception:
        return                                 # já não está lá
    _requisitar("DELETE", caminho, {"message": f"estado: remove {arq.name}",
                                    "branch": RAMO, "sha": sha})
    log.info("removido do repositório: %s", arq.name)


async def _laco():
    """Espera um pouco (agrupa), envia o que mudou e continua enquanto sobrar
    algo: o que falhou por rede e o que mudou DURANTE o envio.

    Antes ele esvaziava a lista, enviava e terminava. Uma mudança marcada no
    meio do envio ficava na lista sem tarefa nenhuma para levá-la — só a
    mudança seguinte a resgatava, e depois da última edição do dia isso é
    nunca. E falha da API (um 502, a rede piscando) jogava o arquivo fora sem
    nova tentativa."""
    global _tarefa
    espera = ESPERA
    laco = asyncio.get_running_loop()
    try:
        while True:
            await asyncio.sleep(espera)
            falhou = False
            for arq in list(_pendentes):
                _pendentes.discard(arq)
                try:
                    await laco.run_in_executor(None, _enviar, arq)
                except Exception:
                    log.exception("falhou ao enviar %s — tento de novo", arq.name)
                    _pendentes.add(arq)
                    falhou = True
            for arq in list(_apagados):
                _apagados.discard(arq)
                try:
                    await laco.run_in_executor(None, _apagar, arq)
                except Exception:
                    log.exception("falhou ao remover %s do repositório — tento de novo", arq.name)
                    _apagados.add(arq)
                    falhou = True
            if not _pendentes and not _apagados:
                return
            # com a API fora, a espera dobra até o teto; quando volta, normaliza
            espera = min(ESPERA_MAXIMA, espera * 2) if falhou else ESPERA
    finally:
        _tarefa = None


def _agendar() -> None:
    global _tarefa
    if _tarefa is None or _tarefa.done():
        try:
            _tarefa = asyncio.get_running_loop().create_task(_laco())
        except RuntimeError:
            pass                               # fora do laço de eventos: ignora


def marcar(arquivo: Path) -> None:
    """Avisa que um arquivo mudou; o envio acontece agrupado, alguns segundos depois."""
    if not ligado:
        return
    _pendentes.add(arquivo)
    _apagados.discard(arquivo)
    _agendar()


def marcar_apagado(arquivo: Path) -> None:
    """Avisa que um arquivo foi removido daqui, para sair do espelho também."""
    if not ligado:
        return
    _apagados.add(arquivo)
    _pendentes.discard(arquivo)
    _agendar()
