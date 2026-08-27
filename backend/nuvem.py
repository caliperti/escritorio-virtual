"""Guardar o estado num lugar que sobreviva ao servidor reiniciar.

No plano gratuito do Render o disco é apagado toda vez que o serviço hiberna —
o que apagaria as contas e o escritório editado. Então, quando as variáveis
`GITHUB_TOKEN` e `GITHUB_REPO` existem, os arquivos de estado são espelhados no
próprio repositório do projeto: na subida a gente baixa, e a cada mudança
(agrupada, para não virar enxurrada de commits) a gente sobe.

Sem essas variáveis nada disso acontece e o app segue com os arquivos locais —
que é o certo para rodar na sua máquina.
"""

import asyncio
import base64
import json
import logging
import os
import urllib.request
from pathlib import Path
from typing import List, Optional

log = logging.getLogger("escritorio.nuvem")

TOKEN = os.environ.get("GITHUB_TOKEN", "").strip()
REPO = os.environ.get("GITHUB_REPO", "").strip()          # ex.: caliperti/escritorio-virtual
PASTA = os.environ.get("ESTADO_PASTA", "estado").strip()   # onde ficam no repositório
CHAVE = os.environ.get("ESTADO_CHAVE", "").strip()         # cifra o conteúdo
ESPERA = 20                                                # segundos de agrupamento

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


def _sigiloso(arq: Path) -> bool:
    return arq.name == "contas.json"


def _cifrar(dados: bytes) -> bytes:
    return _cofre.encrypt(dados) if _cofre else dados


def _decifrar(dados: bytes) -> bytes:
    return _cofre.decrypt(dados) if _cofre else dados
_pendentes: set = set()
_tarefa: Optional[asyncio.Task] = None


def _requisitar(metodo: str, caminho: str, corpo: Optional[dict] = None):
    req = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}/contents/{caminho}",
        method=metodo,
        data=json.dumps(corpo).encode() if corpo else None,
        headers={"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json",
                 "User-Agent": "escritorio-virtual"},
    )
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode())


def restaurar(arquivos: List[Path]) -> None:
    """Baixa o estado do repositório por cima dos arquivos locais (na subida)."""
    if not ligado:
        return
    for arq in arquivos:
        if _sigiloso(arq) and not _cofre:
            continue
        try:
            dados = _requisitar("GET", f"{PASTA}/{arq.name}")
            conteudo = _decifrar(base64.b64decode(dados["content"]))
            arq.write_bytes(conteudo)
            log.info("restaurado do repositório: %s (%d bytes)", arq.name, len(conteudo))
        except Exception as e:
            log.info("sem cópia de %s no repositório (%s)", arq.name, e.__class__.__name__)


def _enviar(arq: Path) -> None:
    if not arq.exists() or (_sigiloso(arq) and not _cofre):
        return
    caminho = f"{PASTA}/{arq.name}"
    sha = None
    try:
        sha = _requisitar("GET", caminho).get("sha")
    except Exception:
        pass                                   # ainda não existe lá
    _requisitar("PUT", caminho, {
        "message": f"estado: {arq.name}",
        "content": base64.b64encode(_cifrar(arq.read_bytes())).decode(),
        **({"sha": sha} if sha else {}),
    })
    log.info("estado enviado ao repositório: %s", arq.name)


async def _laco():
    global _tarefa
    await asyncio.sleep(ESPERA)                # agrupa as mudanças do período
    arquivos, _pendentes_copia = list(_pendentes), _pendentes.copy()
    _pendentes.clear()
    for arq in arquivos:
        try:
            await asyncio.get_running_loop().run_in_executor(None, _enviar, arq)
        except Exception:
            log.exception("falhou ao enviar %s", arq)
    _tarefa = None


def marcar(arquivo: Path) -> None:
    """Avisa que um arquivo mudou; o envio acontece agrupado, alguns segundos depois."""
    global _tarefa
    if not ligado:
        return
    _pendentes.add(arquivo)
    if _tarefa is None or _tarefa.done():
        try:
            _tarefa = asyncio.get_running_loop().create_task(_laco())
        except RuntimeError:
            pass                               # fora do laço de eventos: ignora
