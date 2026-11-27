"""Personagem 3D vinculado à conta (26/11).

Cada personagem pessoal (o Gustavo, o Christian…) tem um `dono` em
static/assets/personagens/lista.json: o nome da conta dele. Nome de membro é
único no escritório (nem visitante pode usar), então o nome basta.
    - o dono entra já com o seu personagem, se não escolheu um livre;
    - ninguém mais usa um personagem que tem dono: o servidor troca por
      'nenhum' (boneco de pixel). Personagem sem dono (o Barbudo) é livre.
"""
import json
from pathlib import Path
from typing import Dict, List, Tuple

from contas import _chave_nome

ARQUIVO = Path(__file__).parent / "static" / "assets" / "personagens" / "lista.json"
_cache = {"quando": 0.0, "lista": []}


def lista() -> List[Dict]:
    try:
        quando = ARQUIVO.stat().st_mtime
    except OSError:
        return []
    if quando != _cache["quando"]:
        try:
            _cache["lista"] = json.loads(ARQUIVO.read_text(encoding="utf-8")).get("personagens", [])
        except (OSError, ValueError):
            _cache["lista"] = []
        _cache["quando"] = quando
    return _cache["lista"]


def escolhiveis() -> Dict[str, Dict]:
    """Os personagens de um lugar (27/11, o Pingou): não têm dono fixo; quem
    cria a conta lá escolhe o seu, e cada um fica sendo de uma pessoa só."""
    return {p["id"]: p for p in lista() if p.get("lugar")}


def ocupados(contas_: Dict[str, Dict]) -> Dict[str, Tuple[str, str]]:
    """Qual personagem de lugar já tem dono: id -> (chave da conta, nome)."""
    esc = escolhiveis()
    saida = {}
    for chave, c in contas_.items():
        pid = (c.get("aparencia") or {}).get("personagem")
        if pid in esc:
            saida[pid] = (chave, c.get("nome", ""))
    return saida


def do_nome(nome: str):
    """O boneco de lugar que leva o nome desta conta (27/11: o "Lindson" da
    Arena 7). Quem cria a conta com esse nome e não pega o boneco na galeria
    (ou já tinha conta e entrou pela aba Entrar) recebe o dele ao entrar."""
    eu = _chave_nome(nome or "")
    for pid, p in escolhiveis().items():
        if eu and _chave_nome(p.get("nome", "")) == eu:
            return pid
    return None


def generico(pid) -> bool:
    """Nenhum boneco escolhido, ou um dos genéricos (o homem, a mulher)."""
    if pid in (None, "", "nenhum"):
        return True
    p = next((x for x in lista() if x["id"] == pid), None)
    return p is None or (not p.get("dono") and not p.get("lugar"))


def ajustar(aparencia: Dict, nome: str, visitante: bool) -> Dict:
    """Garante um personagem 3D válido (26/11: o boneco de pixel saiu):
    o escolhido, se for livre ou do próprio dono; senão o da conta; senão o
    genérico (a mulher para quem tinha corpo feminino, o homem para o resto)."""
    ap = dict(aparencia or {})
    eu = _chave_nome(nome or "")
    todos = lista()
    ids = {p["id"] for p in todos}
    donos = {p["id"]: _chave_nome(p["dono"]) for p in todos if p.get("dono")}
    escolhido = ap.get("personagem")
    if escolhido in donos and (visitante or donos[escolhido] != eu):
        escolhido = None                                   # é de outra pessoa
    if escolhido not in ids:
        escolhido = None                                   # 'nenhum', ou um que não existe
    if visitante and escolhido in escolhiveis():
        escolhido = None                                   # os do lugar são de quem tem conta
    if escolhido is None and not visitante:
        escolhido = next((i for i, d in donos.items() if d == eu), None)   # vinculado à conta
    if escolhido is None:
        livres = [p["id"] for p in todos if not p.get("dono") and not p.get("lugar")]
        if ap.get("corpo") == "f" and "mulher" in livres:
            escolhido = "mulher"
        elif "barbudo" in livres:
            escolhido = "barbudo"
        elif livres:
            escolhido = livres[0]
    if escolhido:
        ap["personagem"] = escolhido
    return ap
