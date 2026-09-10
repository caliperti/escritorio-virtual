"""Reivindicar sala: as regras, sem navegador nenhum.

Roda direto (`python3 backend/testes/salas.py`). Não sobe servidor: mexe no
mapa e na sala em memória, que é onde a decisão realmente acontece.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import mapa                                   # noqa: E402
from mapa import escritorio, TAMANHO_TILE     # noqa: E402
from planta_padrao import montar_padrao       # noqa: E402
from sala import Participante, Sala           # noqa: E402

falhas = []
provas = 0


def conferir(nome, condicao):
    global provas
    provas += 1
    print(("  ok  " if condicao else "FALHOU") + "  " + nome)
    if not condicao:
        falhas.append(nome)


def no_meio(z):
    """Pixel no centro da sala."""
    return ((z["x1"] + z["x2"] + 1) / 2 * TAMANHO_TILE,
            (z["y1"] + z["y2"] + 1) / 2 * TAMANHO_TILE)


montar_padrao(escritorio)
s = Sala()
z1 = escritorio.zona_por_id("sala1")
z2 = escritorio.zona_por_id("sala2")
reuniao = escritorio.zona_por_id("reuniao")

dono = Participante(id="a", nome="Christian", cor="#fff", emoji="", x=0, y=0, conta="christian")
visita = Participante(id="b", nome="Gustavo", cor="#fff", emoji="", x=0, y=0, conta="gustavo")
s.participantes = {"a": dono, "b": visita}

print("\n-- reivindicar --")
ok, _ = escritorio.reivindicar("sala1", "christian", "Christian")
conferir("o primeiro reivindica a sala", ok)
ok, porque = escritorio.reivindicar("sala1", "gustavo", "Gustavo")
conferir("outra pessoa NÃO toma a sala ocupada", not ok)
ok, _ = escritorio.reivindicar("sala2", "christian", "Christian")
conferir("ninguém fica com duas salas", not ok)
ok, _ = escritorio.reivindicar("circulacao", "gustavo", "Gustavo")
conferir("área aberta não é reivindicável", not ok)

print("\n-- porta aberta: ter a sala não fecha a porta --")
px, py = no_meio(z1)
conferir("com a porta aberta, qualquer um entra", s.zona_trancada_para(visita, px, py) is None)
ok, _ = escritorio.trancar("sala1", "gustavo", True)
conferir("quem não é dono não tranca", not ok)
ok, _ = escritorio.trancar("sala1", "christian", True)
conferir("o dono tranca por dentro", ok and escritorio.zona_por_id("sala1").get("trancada"))

print("\n-- porta trancada --")
conferir("o dono entra na própria sala", s.zona_trancada_para(dono, px, py) is None)
conferir("estranho é barrado", s.zona_trancada_para(visita, px, py) is not None)
conferir("sala sem dono não tranca", s.zona_trancada_para(visita, *no_meio(z2)) is None)
conferir("a reunião de todos não tranca", s.zona_trancada_para(visita, *no_meio(reuniao)) is None)

print("\n-- bater e ser aceito --")
s.convidar("sala1", "b")
conferir("convidado entra", s.zona_trancada_para(visita, px, py) is None)
s.esquecer_convite("sala1", "b")
conferir("convite retirado barra de novo", s.zona_trancada_para(visita, px, py) is not None)

print("\n-- andar de verdade --")
# Um passo de verdade: da porta para o tile de dentro colado nela. Antes o
# teste "andava" do corredor até o meio da sala numa mensagem só, o que agora
# é recusado como teleporte — e com razão, porque atravessava a parede.
porta = z1["porta"]
dentro_x = (z1["x2"] + 0.5) * TAMANHO_TILE if porta["lado"] == "direita" else (z1["x1"] + 0.5) * TAMANHO_TILE
dentro_y = (porta["y"] + 0.5) * TAMANHO_TILE
if porta["lado"] in ("cima", "baixo"):
    dentro_x = (porta["x"] + 0.5) * TAMANHO_TILE
    dentro_y = (z1["y1"] + 0.5) * TAMANHO_TILE if porta["lado"] == "cima" else (z1["y2"] + 0.5) * TAMANHO_TILE
fora = ((porta["x"] + 0.5) * TAMANHO_TILE, (porta["y"] + 0.5) * TAMANHO_TILE)
visita.x, visita.y = fora
conferir("estranho não anda para dentro", not s.mover(visita, dentro_x, dentro_y, "direita"))
s.convidar("sala1", "b")
conferir("depois de aceito, anda para dentro", s.mover(visita, dentro_x, dentro_y, "direita"))

print("\n-- teleporte --")
visita.x, visita.y = fora
longe = ((z1["x1"] + 1.5) * TAMANHO_TILE, (z1["y1"] + 1.5) * TAMANHO_TILE)
conferir("um pulo de vários tiles atravessando parede é recusado",
         not s.mover(visita, *longe, "esquerda"))
s.esquecer_convite("sala1", "b")
# põe a visita DENTRO e deixa ela sair pela porta, um passo, sem convite nenhum
visita.x, visita.y = dentro_x, dentro_y
conferir("quem já está dentro consegue SAIR mesmo sem convite",
         s.mover(visita, *fora, "direita"))

print("\n-- o editor não pode tirar a sala de alguém --")
escritorio.editar({"acao": "zona", "id": "sala1", "nome": "Sala do Christian",
                   "x1": z1["x1"], "y1": z1["y1"], "x2": z1["x2"], "y2": z1["y2"],
                   "privada": True, "cor": "#6f9fd8"})
conferir("renomear mantém o dono", escritorio.zona_por_id("sala1").get("dono") == "christian")
conferir("renomear mantém a porta trancada", escritorio.zona_por_id("sala1").get("trancada") is True)
conferir("renomear não perde a porta da sala", bool(escritorio.zona_por_id("sala1").get("porta")))

print("\n-- soltar --")
ok, _ = escritorio.liberar("sala1", "gustavo")
conferir("quem não é dono não solta", not ok)
ok, _ = escritorio.liberar("sala1", "christian")
conferir("o dono solta", ok and not escritorio.zona_por_id("sala1").get("dono"))
conferir("soltar destranca a porta junto", not escritorio.zona_por_id("sala1").get("trancada"))
conferir("solta e todo mundo entra", s.zona_trancada_para(visita, px, py) is None)
ok, _ = escritorio.reivindicar("sala2", "christian", "Christian")
conferir("depois de soltar, pode pegar outra", ok)

print("\n%d provas, %d falharam" % (provas, len(falhas)))
sys.exit(1 if falhas else 0)
