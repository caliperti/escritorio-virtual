"""A planta que vem de fábrica.

Desenho pedido (e desenhado na referência): escritório em anel, com

    - **2 Diretorias** grandes no topo, uma de cada lado do corredor central;
    - **4 salas padrão** na coluna da esquerda (Sala 1 a 4);
    - **4 salas padrão** na coluna da direita (Sala 5 a 8), do mesmo tamanho;
    - **Sala de Reunião** grande, exatamente no centro;
    - **Convivência / Copa** embaixo, área aberta de madeira, sem parede;
    - **corredores** ligando tudo: um encostado no jardim, um de cada lado do
      miolo, um sob as diretorias e um no rodapé do prédio.

As medidas ficam todas nas constantes abaixo. A regra que amarra a coluna
lateral: 4 salas de ALTURA_SALA dividindo parede ocupam `4*ALTURA_SALA - 3`
linhas — se mudar uma, refaça essa conta, senão a última sala estoura o prédio.

O que ocupa espaço e o que bloqueia passagem está em `mapa.py:CATALOGO`; como
cada peça é desenhada, em `static/objetos.js`. Aqui só se decide ONDE fica.
"""

# Suba este número sempre que a planta de fábrica mudar: o servidor compara com
# o que está gravado e, se for mais nova, remonta o escritório. Sem isso, o mapa
# salvo (ou restaurado do espelho) vence para sempre e a planta nova nunca
# aparece — foi exatamente o que aconteceu.
VERSAO = 12

LARGURA, ALTURA = 84, 48
JARDIM = 7                      # colunas de área externa antes da fachada

# ---- colunas ----
COR_OESTE = (8, 10)             # corredor colado no jardim, sobe o prédio inteiro
COL_ESQ = (11, 27)              # coluna das salas 1 a 4
COR_ESQ = (28, 30)              # corredor entre as salas da esquerda e o miolo
MIOLO = (31, 63)                # reunião e convivência
COR_DIR = (64, 66)
COL_DIR = (67, 83)              # coluna das salas 5 a 8

# ---- linhas ----
DIRETORIA_Y = (1, 10)           # faixa das duas diretorias
COR_TOPO = (11, 13)             # corredor sob as diretorias
SALAS_Y0 = 14                   # onde começa a coluna lateral
ALTURA_SALA = 8                 # 4 salas de 8 dividindo parede = 29 linhas
RODAPE_Y = 46                   # corredor no pé do prédio

# id, nome, x1, y1, x2, y2, cor da plaquinha, piso, lado da porta, posição
# 27x10 contra 17x8 das salas padrão: continuam sendo as maiores e as mais
# equipadas, mas na proporção da referência — antes estavam quase quatro vezes
# a área de uma sala comum, o que fazia o topo do prédio engolir o resto.
DIRETORIAS = [
    ("diretoria1", "Diretoria", 16, 1, 42, 10, "#c99a4a", "m", "baixo", 27),
    ("diretoria2", "Diretoria", 46, 1, 72, 10, "#c9a24a", "m", "baixo", 57),
]

# As oito salas padrão, todas 17x8. A cor do piso muda de sala para sala, em
# tom suave — é o que faz cada uma ter identidade sem virar arco-íris.
PISOS_SALA = ["z", "l", "v", "z", "v", "r", "l", "z"]
COR_PLACA = ["#6f9fd8", "#8b7fd0", "#4fae91", "#6f9fd8",
             "#4fae91", "#d9789e", "#8b7fd0", "#6f9fd8"]

# Cada sala tem um posto de trabalho diferente, para não parecerem copiadas.
SETUPS = [
    [("monitor_duplo", 2, 0), ("papeis", 0, 0), ("teclado", 2, 1), ("mouse", 3, 1), ("caneca", 5, 1)],
    [("monitor_curvo", 2, 0), ("livros", 0, 0), ("teclado", 2, 1), ("mouse", 3, 1), ("caneca", 0, 1)],
    [("monitor", 2, 0), ("notebook", 4, 0), ("teclado", 2, 1), ("mouse", 3, 1), ("papeis", 5, 1)],
    [("monitor_triplo", 1, 0), ("caneca", 5, 0), ("teclado", 2, 1), ("mouse", 3, 1), ("fone_mesa", 0, 1)],
    [("imac", 2, 0), ("tablet", 4, 0), ("teclado", 2, 1), ("mouse", 3, 1), ("vasinho", 0, 1)],
    [("monitor_gamer", 2, 0), ("monitor_vertical", 4, 0), ("teclado", 2, 1), ("mouse", 3, 1), ("fone_mesa", 5, 1)],
    [("monitor_duplo", 2, 0), ("microfone", 0, 0), ("teclado", 2, 1), ("mouse", 3, 1), ("caneca", 5, 1)],
    [("monitor_curvo", 2, 0), ("luminaria_mesa", 0, 0), ("teclado", 2, 1), ("mouse", 3, 1), ("papeis", 5, 1)],
]


def montar_padrao(esc) -> None:
    esc.largura, esc.altura = LARGURA, ALTURA
    esc.piso = [["a"] * LARGURA for _ in range(ALTURA)]      # corredor: azulejo claro
    esc.paredes = [[0] * LARGURA for _ in range(ALTURA)]
    esc.objetos = []
    esc.zonas = []
    esc.proximo_id = 1

    def por(tipo, x, y, g=0):
        o = {"id": esc.proximo_id, "tipo": tipo, "x": x, "y": y}
        if g:
            o["g"] = g
        esc.objetos.append(o)
        esc.proximo_id += 1

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

    def sala(id_, nome, x1, y1, x2, y2, cor, tipo_piso, porta, pos=None, privada=True):
        """Sala fechada: parede em volta, porta de 2 tiles, piso e zona.

        A porta fica **gravada na zona** (`porta`), e não só como buraco na
        parede: é assim que o cliente sabe onde desenhar a folha e o cadeado.
        `pos` escolhe onde ela cai — numa sala larga, o meio do lado pode dar
        longe do corredor.
        """
        parede(x1, y1, x2, y1); parede(x1, y2, x2, y2)
        parede(x1, y1, x1, y2); parede(x2, y1, x2, y2)
        piso(x1 + 1, y1 + 1, x2 - 1, y2 - 1, tipo_piso)
        mx = pos if pos is not None else (x1 + x2) // 2
        my = pos if pos is not None else (y1 + y2) // 2
        vaos = {"baixo": [(mx, y2), (mx + 1, y2)], "cima": [(mx, y1), (mx + 1, y1)],
                "esquerda": [(x1, my), (x1, my + 1)], "direita": [(x2, my), (x2, my + 1)]}[porta]
        for px, py in vaos:
            esc.paredes[py][px] = 0
            esc.piso[py][px] = tipo_piso
        zona(id_, nome, x1 + 1, y1 + 1, x2 - 1, y2 - 1, privada, cor)
        esc.zonas[-1]["porta"] = {"lado": porta, "x": vaos[0][0], "y": vaos[0][1]}

    # ---------------- jardim, fachada e casca do prédio ----------------
    piso(0, 0, JARDIM, ALTURA - 1, "g")
    for x in range(LARGURA):
        esc.paredes[0][x] = esc.paredes[ALTURA - 1][x] = 1
    for y in range(ALTURA):
        esc.paredes[y][0] = esc.paredes[y][LARGURA - 1] = 1
    parede(JARDIM, 1, JARDIM, ALTURA - 2)
    esc.paredes[19][JARDIM] = esc.paredes[20][JARDIM] = 0        # portaria
    piso(JARDIM - 3, 18, JARDIM, 21, "p")                        # calçada da entrada

    for x, y in [(1, 3), (4, 10), (1, 17), (4, 26), (1, 33), (4, 40), (1, 43)]:
        por("arvore", x, y)
    for x, y in [(3, 7), (1, 13), (4, 20), (2, 30), (5, 36), (1, 39), (3, 45)]:
        por("arbusto", x, y)
    por("banco", 3, 15); por("banco", 3, 25); por("banco", 3, 34)

    # ---------------- as duas diretorias ----------------
    for n, (id_, nome, x1, y1, x2, y2, cor, tp, porta, pos) in enumerate(DIRETORIAS):
        sala(id_, nome, x1, y1, x2, y2, cor, tp, porta, pos)
        ix, iy = x1 + 1, y1 + 1
        # posto de trabalho executivo: mesa ampla, cadeira atrás e duas de visita
        por("mesa_ampla", ix + 4, iy + 2)
        por("monitor_curvo", ix + 6, iy + 2); por("papeis", ix + 4, iy + 2)
        por("teclado", ix + 6, iy + 3); por("mouse", ix + 7, iy + 3)
        por("caneca", ix + 9, iy + 3); por("luminaria_mesa", ix + 4, iy + 3)
        por("cadeira", ix + 6, iy + 1)
        por("cadeira", ix + 5, iy + 4); por("cadeira", ix + 8, iy + 4)
        por("tapete", ix + 4, iy + 5)
        # parede do fundo: estante, quadro e armário
        por("estante", ix, iy); por("quadro", ix + 11, iy); por("armario", ix + 14, iy)
        por("planta_alta", ix + 2, iy + 4); por("planta_alta", ix + 16, iy + 1)
        # canto de recepção da diretoria
        if n == 0:
            por("sofa", ix + 18, iy + 3); por("poltrona", ix + 22, iy + 4)
            por("mesa_centro", ix + 19, iy + 5); por("livros", ix + 19, iy + 5)
        else:
            por("poltrona", ix + 18, iy + 3); por("poltrona", ix + 21, iy + 3)
            por("mesa_centro", ix + 19, iy + 5); por("vasinho", ix + 19, iy + 5)
        por("tapete", ix + 18, iy + 4)
        por("tv", ix + 19, iy); por("luminaria", ix + 24, iy + 2)
        por("planta_alta", ix + 24, iy + 5)

    # ---------------- as oito salas padrão ----------------
    def sala_padrao(n, id_, nome, x1, y1, lado):
        x2, y2 = x1 + 16, y1 + ALTURA_SALA - 1
        sala(id_, nome, x1, y1, x2, y2, COR_PLACA[n], PISOS_SALA[n], lado)
        ix, iy = x1 + 1, y1 + 1
        por("estante", ix, iy)
        por("quadro", ix + 11, iy)
        por("mesa_ampla", ix + 4, iy + 1)
        for tipo, dx, dy in SETUPS[n]:
            por(tipo, ix + 4 + dx, iy + 1 + dy)
        por("cadeira", ix + 6, iy + 3)
        por("cadeira", ix + 4, iy + 4); por("cadeira", ix + 8, iy + 4)
        por("planta_alta", ix + 1, iy + 2)
        por("planta_alta", ix + 13, iy + 2)
        por("armario", ix + 13, iy + 4)

    for n in range(4):
        y = SALAS_Y0 + n * (ALTURA_SALA - 1)
        sala_padrao(n, "sala%d" % (n + 1), "Sala %d" % (n + 1), COL_ESQ[0], y, "direita")
    for n in range(4):
        y = SALAS_Y0 + n * (ALTURA_SALA - 1)
        sala_padrao(4 + n, "sala%d" % (n + 5), "Sala %d" % (n + 5), COL_DIR[0], y, "esquerda")

    # ---------------- sala de reunião, no centro ----------------
    RX1, RY1, RX2, RY2 = 38, 16, 56, 29
    sala("reuniao", "Sala de Reunião", RX1, RY1, RX2, RY2, "#8b7fd0", "z", "cima", 46)
    for py in (22, 23):                                          # segunda porta, a oeste
        esc.paredes[py][RX1] = 0
        esc.piso[py][RX1] = "z"
    ix, iy = RX1 + 1, RY1 + 1
    por("mesa_reuniao", ix + 3, iy + 5); por("mesa_reuniao", ix + 9, iy + 5)
    for k in range(6):                                           # 12 lugares
        por("cadeira", ix + 3 + k * 2, iy + 4)
        por("cadeira", ix + 3 + k * 2, iy + 7)
    por("tv", ix + 7, iy); por("quadro", ix + 1, iy + 2)
    por("aparador", ix + 14, iy + 3)
    por("papeis", ix + 4, iy + 5); por("notebook", ix + 10, iy + 5)
    por("caneca", ix + 7, iy + 6); por("caneca", ix + 12, iy + 6)
    por("planta_alta", ix, iy + 1); por("planta_alta", ix + 16, iy + 1)
    por("planta_alta", ix, iy + 9); por("planta_alta", ix + 16, iy + 9)
    por("luminaria", ix + 15, iy + 10)

    # ---------------- convivência / copa, embaixo ----------------
    # Área aberta de propósito: é o lugar em que a conversa nasce do caminho, e
    # parede aqui só atrapalharia. O piso de madeira é o que a separa das salas.
    CX1, CY1, CX2, CY2 = 32, 32, 62, 43
    piso(CX1, CY1, CX2, CY2, "m")
    zona("copa", "Convivência / Copa", CX1, CY1, CX2, CY2, False, "#c98a5a")

    # copa, do lado direito: bancada corrida, pia, cafeteira, micro-ondas, geladeira
    por("armario", 46, CY1 + 1)
    por("pia", 47, CY1 + 1)
    por("balcao", 49, CY1 + 1); por("balcao", 52, CY1 + 1); por("balcao", 55, CY1 + 1)
    por("microondas", 50, CY1 + 1); por("frutas", 53, CY1 + 1); por("caneca", 56, CY1 + 1)
    por("cafeteira", 58, CY1 + 1); por("geladeira", 59, CY1 + 1)
    for x in (49, 51, 53, 55):
        por("banqueta", x, CY1 + 3)
    por("mesa_redonda", 50, CY1 + 5)
    por("cadeira", 49, CY1 + 5); por("cadeira", 52, CY1 + 5)
    por("cadeira", 50, CY1 + 4); por("cadeira", 50, CY1 + 7)
    por("caneca", 50, CY1 + 5)
    por("luminaria", 57, CY1 + 5); por("estante", 60, CY1 + 8)

    # convivência, do lado esquerdo: sofá em L, poltrona, mesa de centro, TV
    por("tapete", 35, CY1 + 4)
    por("sofa", 34, CY1 + 2)
    por("sofa", 33, CY1 + 3, 1)                                  # girado: fecha o L
    por("mesa_centro", 36, CY1 + 5)
    por("livros", 36, CY1 + 5)
    por("poltrona", 40, CY1 + 6)
    por("tv", 36, CY1)
    por("planta_alta", 32, CY1 + 8); por("planta", 39, CY1 + 1)
    por("arbusto", 42, CY1 + 9); por("arbusto", 44, CY1 + 9)
    por("luminaria", 43, CY1 + 2)
    por("tapete_redondo", 38, CY1 + 8)

    # ---------------- circulação ----------------
    zona("circulacao", "Circulação", JARDIM + 1, 1, LARGURA - 2, ALTURA - 2, False, "#8a8f9c")
    for x, y in [(9, 5), (9, 28), (9, 44), (29, 18), (29, 38), (65, 18), (65, 38),
                 (34, 12), (60, 12), (34, 45), (60, 45)]:
        por("planta", x, y)

    esc.nascimento = (9, 19)      # logo dentro da portaria
    esc.versao_planta = VERSAO
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
        alvo = None
        for (x, y) in presos:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                for o in esc.objetos:
                    from mapa import CATALOGO, medida
                    if not CATALOGO[o["tipo"]]["bloqueia"] or o["tipo"] in intocaveis:
                        continue
                    lg, ag = medida(o)
                    if o["x"] <= x + dx < o["x"] + lg and o["y"] <= y + dy < o["y"] + ag:
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
