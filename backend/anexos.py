"""Anexos do chat (26/11): foto, documento, planilha — como no Meet e no WhatsApp.

O chat não fica guardado (vai de navegador para navegador pelo servidor), e os
anexos seguem a mesma ideia: ficam numa pasta temporária por 24 horas, no
máximo 15 MB cada e 300 MB no total (os mais velhos saem primeiro). No Render
a pasta some a cada publicação, e tudo bem.

Segurança: só imagem de verdade (png, jpeg, gif, webp) é servida para abrir
na página; qualquer outro arquivo vai como download (`application/octet-stream`
+ `attachment`), para um .html ou .svg enviado não rodar nada no navegador de
quem clica. O endereço tem um código aleatório: só quem recebeu a mensagem tem.
"""
import os
import re
import secrets
import time
from pathlib import Path
from typing import Dict, Optional

PASTA = Path(os.environ.get("DADOS_DIR") or Path(__file__).parent) / "anexos"
MAX_ARQUIVO = 15 * 1024 * 1024
MAX_TOTAL = 300 * 1024 * 1024
VALIDADE = 24 * 3600
IMAGENS = {"image/png", "image/jpeg", "image/gif", "image/webp"}

_registro: Dict[str, Dict] = {}


def _nome_limpo(nome: str) -> str:
    nome = os.path.basename(str(nome or "arquivo")).strip() or "arquivo"
    nome = re.sub(r"[\x00-\x1f\\/:*?\"<>|]", "_", nome)
    return nome[:120]


def _assinatura_de_imagem(inicio: bytes) -> Optional[str]:
    """O tipo pelo conteúdo, não pelo que o navegador disse."""
    if inicio.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if inicio.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if inicio[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if inicio[:4] == b"RIFF" and inicio[8:12] == b"WEBP":
        return "image/webp"
    return None


def limpar() -> None:
    agora = time.time()
    for id_, a in list(_registro.items()):
        if agora - a["quando"] > VALIDADE:
            _apagar(id_)
    total = sum(a["tamanho"] for a in _registro.values())
    for id_, a in sorted(_registro.items(), key=lambda x: x[1]["quando"]):
        if total <= MAX_TOTAL:
            break
        total -= a["tamanho"]
        _apagar(id_)


def _apagar(id_: str) -> None:
    a = _registro.pop(id_, None)
    if a:
        try:
            Path(a["caminho"]).unlink()
        except OSError:
            pass


def guardar(conteudo: bytes, nome: str) -> Dict:
    if not conteudo:
        raise ValueError("Arquivo vazio.")
    if len(conteudo) > MAX_ARQUIVO:
        raise ValueError("Arquivo grande demais (máximo 15 MB).")
    PASTA.mkdir(parents=True, exist_ok=True)
    id_ = secrets.token_urlsafe(16)
    caminho = PASTA / id_
    caminho.write_bytes(conteudo)
    tipo = _assinatura_de_imagem(conteudo[:16])
    a = {"id": id_, "nome": _nome_limpo(nome), "tamanho": len(conteudo),
         "imagem": tipo is not None, "tipo": tipo or "application/octet-stream",
         "quando": time.time(), "caminho": str(caminho)}
    _registro[id_] = a
    limpar()
    return publico(a)


def ler(id_: str) -> Optional[Dict]:
    a = _registro.get(str(id_ or ""))
    if not a or time.time() - a["quando"] > VALIDADE:
        return None
    return a


def publico(a: Dict) -> Dict:
    from urllib.parse import quote
    return {"id": a["id"], "nome": a["nome"], "tamanho": a["tamanho"], "imagem": a["imagem"],
            "url": "/anexo/%s/%s" % (a["id"], quote(a["nome"]))}
