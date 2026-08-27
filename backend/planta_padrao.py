"""A planta que vem de fábrica — o escritório da primeira vez que sobe.

Desenhada no formato da referência do Gather: uma faixa de jardim na entrada,
o prédio com salas fechadas em volta e, no miolo, área aberta onde cada time
tem seu carpete. Depois que alguém edita, quem manda é o `mapa.json`; isto aqui
só existe para o primeiro boot e para o botão "restaurar planta padrão".
"""

LARGURA, ALTURA = 60, 36
JARDIM = 8              # colunas de área externa antes da fachada


def montar_padrao(esc) -> None:
    esc.largura, esc.altura = LARGURA, ALTURA
    esc.piso = [["c"] * LARGURA for _ in range(ALTURA)]
    esc.paredes = [[0] * LARGURA for _ in range(ALTURA)]
    esc.objetos = []
    esc.zonas = []
    esc.proximo_id = 1

    def por(tipo: str, x: int, y: int) -> None:
        esc.objetos.append({"id": esc.proximo_id, "tipo": tipo, "x": x, "y": y})
        esc.proximo_id += 1

    def fileira(tipo: str, x: int, y: int, quantos: int, passo: int = 1) -> None:
        for i in range(quantos):
            por(tipo, x + i * passo, y)

    def piso(x1, y1, x2, y2, tipo):
        for y in range(y1, y2 + 1):
            for x in range(x1, x2 + 1):
                if 0 <= y < ALTURA and 0 <= x < LARGURA:
                    esc.piso[y][x] = tipo

    def parede(x1, y1, x2, y2, valor=1):
        for y in range(y1, y2 + 1):
            for x in range(x1, x2 + 1):
                if 0 <= y < ALTURA and 0 <= x < LARGURA:
                    esc.paredes[y][x] = valor

    def zona(id_, nome, x1, y1, x2, y2, privada, cor):
        esc.zonas.append({"id": id_, "nome": nome, "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                          "privada": privada, "cor": cor})

    def sala(id_, nome, x1, y1, x2, y2, privada, cor, tipo_piso, porta):
        """Sala fechada: parede em volta, porta de 2 tiles e piso próprio."""
        parede(x1, y1, x2, y1); parede(x1, y2, x2, y2)
        parede(x1, y1, x1, y2); parede(x2, y1, x2, y2)
        piso(x1 + 1, y1 + 1, x2 - 1, y2 - 1, tipo_piso)
        mx, my = (x1 + x2) // 2, (y1 + y2) // 2
        vaos = {"baixo": [(mx, y2), (mx + 1, y2)], "cima": [(mx, y1), (mx + 1, y1)],
                "esquerda": [(x1, my), (x1, my + 1)], "direita": [(x2, my), (x2, my + 1)]}[porta]
        for px, py in vaos:
            esc.paredes[py][px] = 0
            esc.piso[py][px] = tipo_piso
        zona(id_, nome, x1 + 1, y1 + 1, x2 - 1, y2 - 1, privada, cor)

    # ---------------- jardim e fachada ----------------
    piso(0, 0, JARDIM, ALTURA - 1, "g")
    for x in range(LARGURA):
        esc.paredes[0][x] = esc.paredes[ALTURA - 1][x] = 1
    for y in range(ALTURA):
        esc.paredes[y][0] = esc.paredes[y][LARGURA - 1] = 1
    parede(JARDIM, 1, JARDIM, ALTURA - 2)                 # fachada
    esc.paredes[17][JARDIM] = esc.paredes[18][JARDIM] = 0  # portaria
    piso(JARDIM - 3, 16, JARDIM, 19, "p")                  # calçada até a porta

    for x, y in [(2, 3), (5, 8), (2, 13), (5, 20), (2, 26), (5, 30)]:
        por("arvore", x, y)
    for x, y in [(4, 5), (1, 10), (6, 15), (3, 23), (6, 27), (1, 32)]:
        por("arbusto", x, y)
    por("banco", 4, 17); por("banco", 4, 12)

    # ---------------- salas de cima ----------------
    sala("reuniao", "Sala de Reunião", 9, 1, 21, 10, True, "#8b7fd0", "l", "baixo")
    sala("foco", "Sala de Foco", 23, 1, 34, 10, True, "#4fae91", "v", "baixo")
    sala("diretoria", "Diretoria", 36, 1, 47, 10, True, "#c99a4a", "m", "baixo")
    sala("cafe", "Café", 49, 1, 58, 10, True, "#d9776a", "a", "baixo")

    # ---------------- salas de baixo ----------------
    sala("auditorio", "Auditório", 9, 25, 22, 34, True, "#d9789e", "r", "cima")
    sala("jogos", "Sala de Jogos", 24, 25, 36, 34, True, "#5aa86e", "v", "cima")
    sala("copa", "Copa", 38, 25, 47, 34, True, "#c98a5a", "a", "cima")
    sala("descanso", "Descanso", 49, 25, 58, 34, True, "#7f9ec9", "m", "cima")

    # ---------------- miolo aberto ----------------
    piso(JARDIM + 1, 11, LARGURA - 2, 24, "c")
    zona("recepcao", "Recepção", 9, 11, 20, 24, False, "#6f9fd8")
    piso(9, 15, 20, 21, "a")
    zona("produto", "Time Produto", 22, 11, 35, 19, False, "#8b7fd0")
    piso(22, 11, 35, 19, "l")
    zona("cx", "Time CX", 37, 11, 50, 19, False, "#4f7fd9")
    piso(37, 11, 50, 19, "z")
    zona("lounge", "Lounge", 22, 20, 50, 24, False, "#a889cc")
    piso(22, 20, 50, 24, "m")

    # ---------------- móveis: recepção ----------------
    por("balcao", 12, 16); por("cadeira", 13, 17)
    por("telefone", 12, 16); por("papeis", 14, 16)
    por("tapete", 11, 19); por("sofa", 10, 13); por("poltrona", 14, 13)
    por("planta_alta", 9, 11); por("planta_alta", 19, 11)
    por("relogio", 16, 11); por("estante", 17, 13); por("planta", 19, 22)
    por("bebedouro", 10, 22)

    # ---------------- baias dos times ----------------
    # Cada posto ganha um setup diferente — é o que faz a baia parecer de gente
    # de verdade, e não a mesma mesa copiada oito vezes.
    SETUPS = [
        [("monitor", 0, 0), ("teclado", 0, 1), ("mouse", 1, 1)],
        [("monitor_duplo", 0, 0), ("teclado", 0, 1), ("caneca", 1, 1)],
        [("monitor_curvo", 0, 0), ("teclado", 0, 1), ("fone_mesa", 1, 1)],
        [("monitor_gamer", 0, 0), ("torre", 1, 0), ("teclado", 0, 1)],
        [("imac", 0, 0), ("tablet", 1, 0), ("teclado", 0, 1)],
        [("notebook", 0, 0), ("papeis", 1, 0), ("caneca", 0, 1)],
    ]
    contador = {"n": 0}

    def baia(x, y):
        por("mesa_grande", x, y)
        for lado in (0, 2):                       # dois postos por baia
            setup = SETUPS[contador["n"] % len(SETUPS)]
            contador["n"] += 1
            for tipo, dx, dy in setup:
                por(tipo, x + lado + dx, y + dy)
            por("cadeira", x + lado, y + 2)

    for x in (23, 30):
        baia(x, 13); baia(x, 17)
    for x in (38, 45):
        baia(x, 13); baia(x, 17)
    for y in (13, 14, 17, 18):
        por("divisoria", 28, y); por("divisoria", 43, y)
    por("planta_alta", 35, 12); por("planta_alta", 50, 12)
    por("quadro", 24, 11); por("quadro", 39, 11)
    por("armario", 35, 18); por("armario", 50, 18)

    # ---------------- lounge central ----------------
    por("tapete", 26, 21); por("sofa", 25, 20); por("sofa", 25, 23)
    por("mesa_centro", 26, 22); por("livros", 26, 22)
    por("tv", 31, 20); por("poltrona", 31, 23); por("planta_alta", 23, 23)
    por("tapete_redondo", 40, 21); por("banqueta", 40, 22); por("banqueta", 41, 21)
    por("planta", 45, 20); por("luminaria", 48, 23); por("narguile", 44, 22)

    # ---------------- sala de reunião ----------------
    por("quadro", 12, 2); por("janela", 16, 1)
    por("mesa_reuniao", 12, 5)
    fileira("cadeira", 12, 4, 6); fileira("cadeira", 12, 7, 6)
    por("papeis", 13, 5); por("caneca", 15, 5); por("notebook", 16, 6)
    por("planta_alta", 20, 8); por("planta", 10, 8); por("tv", 18, 2)

    # ---------------- sala de foco ----------------
    for i, (x, y) in enumerate([(24, 3), (28, 3), (24, 7), (28, 7)]):
        por("mesa", x, y); por("monitor", x, y); por("teclado", x + 1, y)
        por("cadeira", x, y + 1)
    por("armario", 33, 2); por("estante", 32, 9); por("planta", 33, 7)
    por("janela", 27, 1); por("bebedouro", 23, 2)

    # ---------------- diretoria ----------------
    por("tapete", 40, 5); por("mesa_grande", 39, 3)
    por("monitor", 40, 3); por("teclado", 40, 4); por("papeis", 42, 3)
    por("poltrona", 38, 6); por("cadeira", 39, 5); por("cadeira", 42, 5)   # fora do vão de cima
    por("estante", 45, 2); por("planta_alta", 46, 8); por("tv", 37, 2)
    por("janela", 43, 1); por("luminaria", 37, 8)

    # ---------------- café ----------------
    por("pia", 50, 2); por("cafeteira", 52, 2); por("geladeira", 54, 2)
    for x, y in [(50, 5), (55, 5), (50, 8), (55, 8)]:
        por("mesa_redonda", x, y)
        por("cadeira", x - 1, y); por("cadeira", x + 2, y); por("caneca", x, y)
    por("bolo", 55, 5); por("planta", 57, 2); por("janela", 52, 1)

    # ---------------- auditório ----------------
    por("palco", 13, 31); por("tv", 15, 34); por("quadro", 17, 26)
    for y in (28, 29, 30):
        fileira("cadeira", 11, y, 9)
    por("planta_alta", 10, 33); por("planta_alta", 20, 33); por("luminaria", 10, 26)

    # ---------------- sala de jogos ----------------
    por("pebolim", 26, 27); por("tapete_redondo", 32, 27)
    por("sofa", 25, 32); por("poltrona", 31, 32); por("poltrona", 33, 32)
    por("tv", 31, 26); por("planta", 25, 26); por("luminaria", 35, 30)
    por("mesa_centro", 32, 31); por("bolo", 32, 31)

    # ---------------- copa ----------------
    por("pia", 39, 26); por("cafeteira", 41, 26); por("geladeira", 43, 26)
    for x, y in [(39, 29), (44, 29), (39, 32), (44, 32)]:
        por("mesa_redonda", x, y)
        por("cadeira", x - 1, y); por("cadeira", x + 2, y)
    por("caneca", 39, 29); por("bolo", 44, 32); por("planta", 46, 26)

    # ---------------- descanso ----------------
    por("tapete", 51, 28); por("sofa", 50, 27); por("sofa", 50, 31)
    por("mesa_centro", 51, 29); por("livros", 51, 29)
    por("planta_alta", 57, 26); por("luminaria", 57, 32); por("narguile", 55, 30)
    por("estante", 53, 33)

    esc.nascimento = (14, 20)
    esc._recalcular()
