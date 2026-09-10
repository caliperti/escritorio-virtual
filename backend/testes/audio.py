"""Quem ouve quem: dentro da sala todo mundo se ouve, fora dela vale o raio.

Roda direto (`python3 backend/testes/audio.py`). Não sobe servidor: a decisão
mora em `sala.se_ouvem`, que é função pura.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from mapa import escritorio, TAMANHO_TILE      # noqa: E402
from planta_padrao import montar_padrao        # noqa: E402
from sala import Participante, se_ouvem, RAIO_CONVERSA   # noqa: E402

falhas = []
provas = 0


def conferir(nome, condicao):
    global provas
    provas += 1
    print(("  ok  " if condicao else "FALHOU") + "  " + nome)
    if not condicao:
        falhas.append(nome)


def em(x, y, quem="a"):
    return Participante(id=quem, nome=quem, cor="#fff", emoji="",
                        x=x * TAMANHO_TILE, y=y * TAMANHO_TILE)


def cantos(z):
    """Os dois cantos de dentro da sala, o mais longe um do outro possível."""
    return (em(z["x1"] + 0.5, z["y1"] + 0.5, "a"),
            em(z["x2"] + 0.5, z["y2"] + 0.5, "b"))


montar_padrao(escritorio)
reuniao = escritorio.zona_por_id("reuniao")
sala1 = escritorio.zona_por_id("sala1")
sala2 = escritorio.zona_por_id("sala2")

print("\n-- dentro da mesma sala --")
a, b = cantos(reuniao)
dist = ((a.x - b.x) ** 2 + (a.y - b.y) ** 2) ** 0.5
conferir("os dois cantos da sala de reunião estão fora do raio de conversa",
         dist > RAIO_CONVERSA)
conferir("mesmo assim os dois se ouvem", se_ouvem(a, b))

a, b = cantos(sala1)
conferir("nas pontas de uma sala pessoal também se ouvem", se_ouvem(a, b))

print("\n-- salão central (convivência): área aberta, vale o raio --")
# Aqui é de propósito: o salão é aberto, e duas rodas de conversa têm de caber
# nele sem uma atropelar a outra. Uma versão fez o salão inteiro se ouvir, e
# como a circulação cobre o prédio todo virou um bolo só de vozes.
copa = escritorio.zona_por_id("copa")
a, b = cantos(copa)
dist = ((a.x - b.x) ** 2 + (a.y - b.y) ** 2) ** 0.5
conferir("as pontas da convivência estão fora do raio de conversa", dist > RAIO_CONVERSA)
conferir("e de ponta a ponta na convivência NÃO se ouvem", not se_ouvem(a, b))
perto = em(copa["x1"] + 1.5, copa["y1"] + 0.5, "b")
conferir("mas perto um do outro, no mesmo salão, se ouvem",
         se_ouvem(em(copa["x1"] + 0.5, copa["y1"] + 0.5, "a"), perto))

print("\n-- salas diferentes --")
a = em(sala1["x1"] + 0.5, sala1["y1"] + 0.5, "a")
b = em(sala2["x1"] + 0.5, sala2["y1"] + 0.5, "b")
conferir("gente de salas diferentes NÃO se ouve", not se_ouvem(a, b))

print("\n-- área aberta --")
fora = [(x, y) for x in range(escritorio.largura)
        for y in range(escritorio.altura)
        if escritorio.zona_de(x * TAMANHO_TILE, y * TAMANHO_TILE) is None
        and not escritorio.paredes[y][x]]
assert fora, "o mapa não tem nenhum tile fora de sala"
x0, y0 = fora[0]
a = em(x0 + 0.5, y0 + 0.5, "a")
b = em(x0 + 0.5, y0 + 0.5, "b")
conferir("colados no corredor se ouvem", se_ouvem(a, b))
b = em(x0 + 0.5 + (RAIO_CONVERSA / TAMANHO_TILE) + 3, y0 + 0.5, "b")
conferir("longe no corredor NÃO se ouvem",
         escritorio.zona_de(b.x, b.y) is not None or not se_ouvem(a, b))

print("\n%d provas, %d falharam" % (provas, len(falhas)))
sys.exit(1 if falhas else 0)
