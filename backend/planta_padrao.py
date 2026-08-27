"""A planta que vem de fábrica.

Formato pedido: **uma sala por pessoa**. São 10 salas individuais em volta, uma
sala de reunião grande no meio para todo mundo, circulação ligando tudo e um
jardim na entrada. Cada sala tem porta, piso próprio e mobília variada — e é
editável: dá para renomear pela plaquinha e trocar tudo pelo editor.
"""

LARGURA, ALTURA = 64, 40
JARDIM = 6                      # colunas de área externa antes da fachada

# id, nome, x1, y1, x2, y2, cor, piso, lado da porta
SALAS_PESSOAIS = [
    ("recepcao", "Recepção", 7, 1, 17, 10, "#6f9fd8", "a", "baixo"),
    ("diretoria", "Diretoria", 18, 1, 28, 10, "#c99a4a", "m", "baixo"),
    ("comercial", "Comercial", 29, 1, 39, 10, "#4fae91", "v", "baixo"),
    ("marketing", "Marketing", 40, 1, 50, 10, "#8b7fd0", "l", "baixo"),
    ("financeiro", "Financeiro", 51, 1, 62, 10, "#d9789e", "r", "baixo"),
    ("trafego", "Tráfego", 7, 29, 17, 38, "#5aa86e", "v", "cima"),
    ("design", "Design", 18, 29, 28, 38, "#a889cc", "l", "cima"),
    ("suporte", "Suporte", 29, 29, 39, 38, "#d9776a", "a", "cima"),
    ("ti", "TI", 40, 29, 50, 38, "#4f7fd9", "z", "cima"),
    ("conteudo", "Conteúdo", 51, 29, 62, 38, "#c98a5a", "m", "cima"),
]

# Uma mesa ampla (6x2) por sala, cada uma com um posto de trabalho diferente.
# As coordenadas são relativas ao canto da mesa; a linha 0 é o tampo do fundo e
# a linha 1 é onde ficam teclado, caneca e companhia.
SETUPS = [
    # recepção: atendimento — duas telas, telefone e impressora
    [("monitor_duplo", 0, 0), ("telefone", 2, 0), ("impressora", 5, 0),
     ("teclado", 0, 1), ("mouse", 1, 1), ("papeis", 4, 1)],
    # diretoria: ultrawide, notebook de apoio e luminária
    [("monitor_curvo", 1, 0), ("notebook", 4, 0), ("luminaria_mesa", 0, 0),
     ("teclado", 2, 1), ("mouse", 3, 1), ("caneca", 5, 1)],
    # comercial: três telas para acompanhar tudo
    [("monitor_triplo", 1, 0), ("caneca", 0, 0), ("fone_mesa", 5, 0),
     ("teclado", 2, 1), ("mouse", 3, 1), ("papeis", 0, 1)],
    # marketing: setup gamer com gabinete de vidro ao lado
    [("monitor_gamer", 1, 0), ("monitor_vertical", 3, 0), ("luminaria_mesa", 5, 0),
     ("teclado", 1, 1), ("mouse", 2, 1), ("fone_mesa", 4, 1)],
    # financeiro: planilha em duas telas e muita papelada
    [("monitor_duplo", 1, 0), ("impressora", 4, 0), ("teclado", 1, 1),
     ("mouse", 2, 1), ("papeis", 3, 1), ("caneca", 5, 1)],
    # tráfego: painel de campanhas com tela em pé
    [("monitor", 1, 0), ("monitor_vertical", 2, 0), ("monitor", 3, 0),
     ("teclado", 1, 1), ("mouse", 2, 1), ("caneca", 4, 1)],
    # design: all-in-one, mesa digitalizadora e luminária
    [("imac", 2, 0), ("tablet", 4, 0), ("luminaria_mesa", 0, 0),
     ("teclado", 2, 1), ("mouse", 3, 1), ("vasinho", 5, 1)],
    # suporte: headset, telefone e duas telas
    [("monitor_duplo", 1, 0), ("telefone", 0, 0), ("fone_mesa", 4, 0),
     ("teclado", 1, 1), ("mouse", 2, 1), ("caneca", 4, 1)],
    # TI: três telas, microfone e o gabinete grande no chão
    [("monitor_triplo", 1, 0), ("microfone", 0, 0), ("teclado", 2, 1),
     ("mouse", 3, 1), ("papeis", 5, 1)],
    # conteúdo: edição de vídeo, microfone e notebook
    [("monitor_curvo", 1, 0), ("notebook", 4, 0), ("microfone", 0, 0),
     ("teclado", 2, 1), ("fone_mesa", 3, 1), ("caneca", 5, 1)],
]

ENFEITES = ["estante", "armario", "quadro", "tv", "planta_alta", "luminaria"]


def montar_padrao(esc) -> None:
    esc.largura, esc.altura = LARGURA, ALTURA
    esc.piso = [["c"] * LARGURA for _ in range(ALTURA)]
    esc.paredes = [[0] * LARGURA for _ in range(ALTURA)]
    esc.objetos = []
    esc.zonas = []
    esc.proximo_id = 1

    def por(tipo, x, y):
        esc.objetos.append({"id": esc.proximo_id, "tipo": tipo, "x": x, "y": y})
        esc.proximo_id += 1

    def fileira(tipo, x, y, quantos, passo=1):
        for i in range(quantos):
            por(tipo, x + i * passo, y)

    def piso(x1, y1, x2, y2, tipo):
        for y in range(max(0, y1), min(ALTURA, y2 + 1)):
            for x in range(max(0, x1), min(LARGURA, x2 + 1)):
                esc.piso[y][x] = tipo

    def parede(x1, y1, x2, y2, valor=1):
        for y in range(max(0, y1), min(ALTURA, y2 + 1)):
            for x in range(max(0, x1), min(LARGURA, x2 + 1)):
                esc.paredes[y][x] = valor

    def zona(id_, nome, x1, y1, x2, y2, privada, cor):
        esc.zonas.append({"id": id_, "nome": nome, "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                          "privada": privada, "cor": cor})

    def sala(id_, nome, x1, y1, x2, y2, cor, tipo_piso, porta, privada=True):
        """Sala fechada: parede em volta, porta de 2 tiles, piso e zona."""
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
    parede(JARDIM, 1, JARDIM, ALTURA - 2)
    esc.paredes[19][JARDIM] = esc.paredes[20][JARDIM] = 0        # portaria
    piso(JARDIM - 3, 18, JARDIM, 21, "p")

    for x, y in [(1, 3), (4, 9), (1, 15), (4, 24), (1, 30), (4, 34)]:
        por("arvore", x, y)
    for x, y in [(3, 6), (1, 12), (4, 19), (2, 27), (4, 31), (1, 36)]:
        por("arbusto", x, y)
    por("banco", 3, 17); por("banco", 3, 22)

    # ---------------- as 10 salas individuais ----------------
    for i, (id_, nome, x1, y1, x2, y2, cor, tp, porta) in enumerate(SALAS_PESSOAIS):
        sala(id_, nome, x1, y1, x2, y2, cor, tp, porta)
        # Uma mesa só, ampla, encostada na parede do fundo e olhando para a porta.
        fundo = y1 + 2 if porta == "baixo" else y2 - 3
        mx = x1 + 2
        por("mesa_ampla", mx, fundo)
        for tipo, dx, dy in SETUPS[i % len(SETUPS)]:
            por(tipo, mx + dx, fundo + dy)
        por("cadeira", mx + 2, fundo + 2 if porta == "baixo" else fundo - 1)
        if i in (3, 8):                      # gabinete grande no chão, ao lado
            por("torre_grande", x1 + 1, fundo)   # ao lado da mesa, sem fechar canto
        # enfeites: cada sala com uma combinação diferente, sem outra mesa
        # enfeites encostados na parede do fundo: no meio da sala eles fecham
        # canto e deixam pedaço da sala inalcançável
        por(ENFEITES[i % len(ENFEITES)], x1 + 1, y1 + 1)
        por(ENFEITES[(i + 2) % len(ENFEITES)], x2 - 3, y1 + 1)
        por("planta_alta", x2 - 1, y1 + 1)
        por("tapete", x1 + 2, (y1 + y2) // 2 + 1)
        por("janela", (x1 + x2) // 2, y1 if porta == "baixo" else y2)

    # ---------------- sala de reunião de todo mundo ----------------
    sala("reuniao", "Sala de Reunião", 40, 13, 62, 26, "#8b7fd0", "m", "esquerda", privada=True)
    # mesa comprida no meio, cadeiras dos dois lados e um canto de espera
    por("mesa_reuniao", 45, 17); por("mesa_reuniao", 51, 17)
    por("mesa_reuniao", 45, 21); por("mesa_reuniao", 51, 21)
    for y in (16, 19, 20, 23):
        fileira("cadeira", 45, y, 12)
    por("quadro", 48, 14); por("tv", 53, 14)
    por("papeis", 46, 17); por("caneca", 49, 17); por("notebook", 52, 21)
    por("caneca", 55, 17); por("papeis", 54, 21)
    por("planta_alta", 41, 14); por("planta_alta", 61, 14)
    por("planta_alta", 41, 25); por("planta_alta", 61, 25)
    por("estante", 43, 14); por("luminaria", 60, 24)
    por("sofa", 58, 19); por("mesa_centro", 59, 21); por("bebedouro", 57, 25)

    # ---------------- circulação, café e convivência ----------------
    zona("circulacao", "Circulação", 7, 11, 39, 28, False, "#8a8f9c")
    piso(7, 11, 39, 28, "c")
    piso(9, 13, 20, 20, "z")                    # tapete de área do café
    zona("cafe", "Café", 9, 13, 20, 20, False, "#d9776a")

    por("pia", 10, 13); por("cafeteira", 12, 13); por("geladeira", 14, 13)
    por("bebedouro", 16, 13)
    for x, y in [(10, 16), (15, 16), (10, 19), (15, 19)]:
        por("mesa_redonda", x, y)
        por("cadeira", x - 1, y); por("cadeira", x + 2, y); por("caneca", x, y)
    por("bolo", 15, 16); por("planta_alta", 19, 13)

    zona("convivencia", "Convivência", 23, 13, 38, 27, False, "#a889cc")
    piso(23, 13, 38, 27, "m")
    por("tapete", 26, 15); por("sofa", 25, 14); por("sofa", 25, 18)
    por("mesa_centro", 26, 16); por("livros", 26, 16)
    por("tv", 31, 14); por("poltrona", 31, 17); por("planta_alta", 23, 20)
    por("pebolim", 25, 22); por("tapete_redondo", 31, 22)
    por("narguile", 34, 22); por("banqueta", 33, 23); por("banqueta", 35, 23)
    por("luminaria", 37, 14); por("estante", 36, 27); por("planta", 22, 27)

    # plantas soltas na circulação, para não ficar um corredor pelado
    for x, y in [(8, 11), (21, 11), (38, 11), (8, 28), (21, 28), (38, 28)]:
        por("planta", x, y)

    esc.nascimento = (12, 24)
    esc._recalcular()
    _desobstruir(esc)


def _desobstruir(esc) -> None:
    """Tira o enfeite que fechar um pedaço de sala.

    A planta é montada por regra, e uma peça alta num canto errado isola tiles
    sem ninguém perceber. Em vez de caçar caso a caso, aqui a gente varre: o que
    ficou inalcançável a pé perde o móvel que o bloqueia. Mesas e cadeiras ficam
    — se o problema for uma mesa, é erro de desenho da planta, não de enfeite.
    """
    from collections import deque
    intocaveis = {"mesa", "mesa_grande", "mesa_ampla", "mesa_reuniao", "mesa_canto",
                  "mesa_redonda", "balcao", "cadeira", "palco"}
    for _ in range(12):
        vistos = {esc.nascimento}
        fila = deque([esc.nascimento])
        while fila:
            x, y = fila.popleft()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                viz = (x + dx, y + dy)
                if viz not in vistos and esc.tile_livre(*viz):
                    vistos.add(viz)
                    fila.append(viz)
        presos = [(x, y) for y in range(esc.altura) for x in range(esc.largura)
                  if esc.tile_livre(x, y) and (x, y) not in vistos]
        if not presos:
            return
        # remove o primeiro móvel removível que faz fronteira com o trecho preso
        alvo = None
        for (x, y) in presos:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                for o in esc.objetos:
                    from mapa import CATALOGO
                    info = CATALOGO[o["tipo"]]
                    if not info["bloqueia"] or o["tipo"] in intocaveis:
                        continue
                    if o["x"] <= x + dx < o["x"] + info["l"] and o["y"] <= y + dy < o["y"] + info["a"]:
                        alvo = o
                        break
                if alvo:
                    break
            if alvo:
                break
        if not alvo:
            return
        esc.objetos.remove(alvo)
        esc._recalcular()
