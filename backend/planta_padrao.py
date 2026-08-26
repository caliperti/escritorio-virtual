"""A planta que vem de fábrica — o escritório da primeira vez que sobe.

Depois que alguém edita, quem manda é o `mapa.json`; isto aqui só existe para
o primeiro boot (e para o botão "restaurar planta padrão").
"""

from typing import List, Tuple

# (x1, y1, x2, y2) de cada sala, em tiles
SALAS = [
    ("reuniao", "Sala de Reunião", 1, 1, 13, 9, True, "#6366f1", "c"),
    ("recepcao", "Recepção", 15, 1, 25, 9, False, "#0ea5e9", "a"),
    ("foco", "Sala de Foco", 27, 1, 37, 9, True, "#14b8a6", "c"),
    ("diretoria", "Diretoria", 39, 1, 50, 9, True, "#f59e0b", "m"),
    ("coworking", "Coworking", 1, 11, 50, 20, False, "#64748b", "c"),
    ("cafe", "Café", 1, 22, 12, 30, True, "#f97316", "a"),
    ("lounge", "Lounge", 14, 22, 26, 30, False, "#a855f7", "m"),
    ("auditorio", "Auditório", 28, 22, 38, 30, True, "#ec4899", "c"),
    ("jogos", "Sala de Jogos", 40, 22, 50, 30, True, "#22c55e", "m"),
]

# paredes internas: (x1, y1, x2, y2)
PAREDES = [
    (0, 10, 51, 10), (0, 21, 51, 21),          # os dois corredores
    (14, 1, 14, 9), (26, 1, 26, 9), (38, 1, 38, 9),
    (13, 22, 13, 30), (27, 22, 27, 30), (39, 22, 39, 30),
]

PORTAS = [(7, 10), (20, 10), (32, 10), (44, 10),
          (6, 21), (20, 21), (33, 21), (45, 21)]


def montar_padrao(esc) -> None:
    esc.largura, esc.altura = 52, 32
    esc.piso = [["c"] * esc.largura for _ in range(esc.altura)]
    esc.paredes = [[0] * esc.largura for _ in range(esc.altura)]
    esc.objetos = []
    esc.zonas = []
    esc.proximo_id = 1

    for x in range(esc.largura):                       # borda
        esc.paredes[0][x] = esc.paredes[esc.altura - 1][x] = 1
    for y in range(esc.altura):
        esc.paredes[y][0] = esc.paredes[y][esc.largura - 1] = 1

    for x1, y1, x2, y2 in PAREDES:
        for y in range(y1, y2 + 1):
            for x in range(x1, x2 + 1):
                esc.paredes[y][x] = 1
    for x, y in PORTAS:
        esc.paredes[y][x] = 0
        esc.paredes[y][x + 1] = 0                      # portas de 2 tiles

    for id_, nome, x1, y1, x2, y2, privada, cor, piso in SALAS:
        esc.zonas.append({"id": id_, "nome": nome, "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                          "privada": privada, "cor": cor})
        for y in range(y1, y2 + 1):
            for x in range(x1, x2 + 1):
                esc.piso[y][x] = piso

    def por(tipo: str, x: int, y: int) -> None:
        esc.objetos.append({"id": esc.proximo_id, "tipo": tipo, "x": x, "y": y})
        esc.proximo_id += 1

    def fileira(tipo: str, x: int, y: int, quantos: int, passo: int = 1) -> None:
        for i in range(quantos):
            por(tipo, x + i * passo, y)

    # ---------------- Sala de Reunião ----------------
    por("quadro", 3, 1)
    por("mesa_reuniao", 4, 4)
    fileira("cadeira", 4, 3, 6)
    fileira("cadeira", 4, 6, 6)
    por("papeis", 5, 4); por("caneca", 7, 4); por("notebook", 8, 5)
    por("planta_alta", 12, 7); por("planta", 1, 8)

    # ---------------- Recepção ----------------
    por("balcao", 19, 3); por("cadeira", 20, 4)
    por("telefone", 19, 3); por("papeis", 21, 3)
    por("tapete", 18, 6)
    por("sofa", 16, 7); por("planta", 15, 1); por("planta", 25, 1)
    por("relogio", 20, 1); por("luminaria", 24, 7)

    # ---------------- Sala de Foco ----------------
    for i, (x, y) in enumerate([(28, 2), (32, 2), (28, 6), (32, 6)]):
        por("mesa", x, y); por("monitor", x, y); por("caneca", x + 1, y)
        por("cadeira", x, y + 1)
    por("armario", 36, 2); por("estante", 35, 8); por("planta", 36, 6)

    # ---------------- Diretoria ----------------
    por("tapete", 43, 5)
    por("mesa_grande", 42, 3); por("monitor", 43, 3); por("papeis", 45, 3)
    por("poltrona", 44, 2); por("cadeira", 42, 5); por("cadeira", 45, 5)
    por("estante", 48, 2); por("planta_alta", 49, 7); por("tv", 40, 1)

    # ---------------- Coworking: baias de trabalho ----------------
    for y in (13, 17):
        for x in (4, 14, 26, 38):
            por("mesa_grande", x, y)
            por("monitor", x, y); por("monitor", x + 2, y)
            por("notebook", x + 1, y + 1); por("caneca", x + 3, y + 1)
            fileira("cadeira", x, y - 1, 4)
            fileira("cadeira", x, y + 2, 4)
    por("bebedouro", 22, 12); por("planta_alta", 23, 18)
    por("planta", 1, 11); por("planta", 50, 11); por("planta", 1, 20); por("planta", 50, 20)
    por("quadro", 9, 11); por("estante", 34, 11)

    # ---------------- Café ----------------
    por("pia", 2, 23); por("cafeteira", 4, 23); por("geladeira", 6, 23)
    for x, y in [(2, 26), (7, 26), (2, 29), (7, 29)]:
        por("mesa_redonda", x, y)
        por("cadeira", x - 1, y); por("cadeira", x + 2, y)
        por("caneca", x, y)
    por("bolo", 7, 26); por("planta", 11, 23)

    # ---------------- Lounge ----------------
    por("tapete", 18, 25)
    por("sofa", 17, 24); por("sofa", 17, 28)
    por("mesa_centro", 18, 26); por("livros", 18, 26)
    por("tv", 24, 24); por("poltrona", 24, 27)
    por("planta_alta", 15, 29); por("luminaria", 25, 29)
    por("narguile", 21, 28)

    # ---------------- Auditório ----------------
    por("palco", 30, 23)
    por("tv", 30, 22)          # fora da linha da porta (33-34)
    for y in (26, 27, 29):
        fileira("cadeira", 29, y, 8)
    por("planta", 28, 23); por("planta", 37, 23)

    # ---------------- Sala de Jogos ----------------
    por("pebolim", 42, 24)
    por("tapete_redondo", 47, 24)
    por("sofa", 41, 28); por("poltrona", 46, 28); por("poltrona", 48, 28)
    por("tv", 46, 22); por("planta", 40, 22); por("luminaria", 49, 26)
    por("narguile", 44, 27)

    esc.nascimento = (20, 6)
    esc._recalcular()
