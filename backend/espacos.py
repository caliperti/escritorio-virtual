"""Os lugares do Gather (27/11): o Escritório, o Pingou e a Arena 7.

Cada lugar tem o seu mapa (arte, colisão, salas), a sua roda de gente (quem
ouve quem, quem vê quem) e a sua chave de acesso. A conta é uma só. Para entrar
num lugar, vale qualquer um destes:
    - a conta já tem o lugar liberado (`conta["espacos"]`: quem criou a conta
      com a chave dele, ou digitou a chave uma vez);
    - a chave do lugar (visitante digita sempre; a conta, só na primeira vez);
    - alguém que está lá dentro deixou entrar (o passe, que vale o dia).

As chaves ficam fora do código (o repositório é público): SENHA é a do
Escritório, como sempre; SENHA_PINGOU, a do Pingou; SENHA_ARENA, a da Arena 7. Sem nenhuma chave definida
(rodando na própria máquina), os lugares são abertos. Com a do Escritório
definida e a do Pingou esquecida, o Pingou fica FECHADO, não aberto.
"""
import os
import time
from typing import Dict, Iterator, List, Optional, Tuple

import mapa
import planta_arena
import planta_pingou
from sala import Participante, Sala, chave_de_castigo, sala as sala_do_escritorio

PADRAO = "escritorio"
PASSE_VALIDADE = 12 * 3600          # quem foi deixado entrar volta no mesmo dia sem pedir
PEDIDO_VALIDADE = 60                # o pedido some se ninguém responder em 1 minuto


class Espaco:
    def __init__(self, id_: str, nome: str, var_chave: str, mapa_, sala_: Sala) -> None:
        self.id = id_
        self.nome = nome
        self.var_chave = var_chave
        self.mapa = mapa_
        self.sala = sala_

    @property
    def chave(self) -> str:
        return os.environ.get(self.var_chave, "").strip()

    def aberto(self) -> bool:
        return not any(e.chave for e in ESPACOS.values())

    def confere(self, texto) -> bool:
        """A chave digitada bate? Sem diferenciar maiúscula ("pingou" vale)."""
        c = self.chave
        return bool(c) and isinstance(texto, str) and texto.strip().casefold() == c.casefold()

    def resumo(self) -> Dict:
        return {"id": self.id, "nome": self.nome, "pessoas": len(self.sala.participantes)}


ESPACOS: Dict[str, Espaco] = {}


def _criar() -> None:
    ESPACOS["escritorio"] = Espaco("escritorio", "Escritório", "SENHA",
                                   mapa.escritorio, sala_do_escritorio)
    pasta = mapa.ARQUIVO.parent
    m = mapa.Escritorio(pasta / "mapa-pingou.json", planta_pingou)
    ESPACOS["pingou"] = Espaco("pingou", "Pingou", "SENHA_PINGOU", m, Sala(m, "pingou"))
    a = mapa.Escritorio(pasta / "mapa-arena.json", planta_arena)
    ESPACOS["arena"] = Espaco("arena", "Arena 7", "SENHA_ARENA", a, Sala(a, "arena"))


_criar()


def pegar(id_) -> Optional[Espaco]:
    return ESPACOS.get(id_) if isinstance(id_, str) else None


def todos() -> List[Espaco]:
    return list(ESPACOS.values())


def participantes() -> Iterator[Participante]:
    for e in ESPACOS.values():
        yield from list(e.sala.participantes.values())


def achar(id_: str) -> Optional[Tuple[Espaco, Participante]]:
    for e in ESPACOS.values():
        p = e.sala.participantes.get(id_)
        if p is not None:
            return e, p
    return None


def nome_em_uso(nome: str, exceto: str = "") -> bool:
    return any(e.sala.nome_em_uso(nome, exceto) for e in ESPACOS.values())


def lugares() -> List[Dict]:
    """Quem está em cada lugar: a lista de pessoas mostra os dois."""
    return [{"id": p.id, "nome": p.nome, "espaco": e.id, "situacao": p.situacao,
             "aparencia": p.aparencia, "cor": p.cor, "visitante": p.visitante}
            for e in ESPACOS.values() for p in list(e.sala.participantes.values())]


async def avisar_lugares() -> None:
    """Alguém entrou, saiu, trocou de lugar ou de situação: todo mundo, nos dois
    lugares, recebe a lista nova (é pequena, e muda pouco)."""
    pacote = {"tipo": "lugares", "lista": lugares(),
              "espacos": [e.resumo() for e in ESPACOS.values()]}
    for e in ESPACOS.values():
        await e.sala.publicar(pacote)


# ---------- quem pode entrar ----------

def espacos_da_conta(conta: Optional[Dict]) -> List[str]:
    """Conta antiga (de antes do Pingou) é do Escritório."""
    if not conta:
        return []
    lista = conta.get("espacos")
    return list(lista) if isinstance(lista, list) else [PADRAO]


def pode_entrar(esp: Espaco, conta: Optional[Dict], admin: bool, pessoa: str) -> bool:
    """Sem precisar de chave nem de pedido."""
    if esp.aberto() or admin:
        return True
    if esp.id in espacos_da_conta(conta):
        return True
    return tem_passe(pessoa, esp.id)


def acessos(conta: Optional[Dict], admin: bool, pessoa: str) -> Dict[str, bool]:
    return {e.id: pode_entrar(e, conta, admin, pessoa) for e in ESPACOS.values()}


# ---------- o passe de quem foi deixado entrar ----------

_passes: Dict[Tuple[str, str], float] = {}


def dar_passe(pessoa: str, espaco: str) -> None:
    _passes[(pessoa, espaco)] = time.time() + PASSE_VALIDADE


def tem_passe(pessoa: str, espaco: str) -> bool:
    ate = _passes.get((pessoa, espaco), 0)
    if ate and ate < time.time():
        _passes.pop((pessoa, espaco), None)
        return False
    return ate > 0


def pessoa_de(p: Participante) -> str:
    """Por quem o passe pega: a conta, ou o nome do visitante (como o castigo)."""
    return chave_de_castigo(p.conta, p.nome)


# ---------- pedidos para entrar ----------

_pedidos: Dict[str, Tuple[str, float]] = {}     # id de quem pediu -> (lugar, até quando)


def pedir(id_: str, espaco: str) -> None:
    _pedidos[id_] = (espaco, time.time() + PEDIDO_VALIDADE)


def pedido_aberto(id_: str, espaco: Optional[str] = None) -> bool:
    pedido = _pedidos.get(id_)
    if not pedido:
        return False
    if pedido[1] < time.time():
        _pedidos.pop(id_, None)
        return False
    return espaco is None or pedido[0] == espaco


def esquecer_pedido(id_: str) -> None:
    _pedidos.pop(id_, None)
