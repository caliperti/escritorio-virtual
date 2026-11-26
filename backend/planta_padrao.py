"""A planta que vem de fábrica: o escritório da Codara Labs (26/11).

Um salão só, com a entrada no meio da parede de baixo, a mesa oval de reunião
para 8 no centro e as três diretorias lado a lado no fundo (Gustavo, Christian,
Felipe Vargas), cada uma com a mesa de trabalho e duas poltronas de visita na
frente dela. O desenho é uma ARTE PRONTA (`static/assets/codara/fundo.png`,
gerada no Magnific a partir da referência que o dono mandou), e não piso e
parede de quadradinho:

    - 1 px da arte = 1 px do mundo. A arte tem 1264 x 848;
    - o que bloqueia são formas medidas em cima da arte (`BLOQUEIOS`): retângulo
      `r: [x1, y1, x2, y2]` e cápsula deitada `c: [xa, xb, cy, rx, ry]` (a mesa
      oval). A caixinha do avatar (22 px) não pode encostar nelas;
    - o que fica NA FRENTE de quem passa atrás (tampo da mesa, cadeiras, mesas
      das diretorias, vidro das salas, vasos e mureta da frente) são recortes da
      própria arte, desenhados na ordem da profundidade (`FRENTES`, campo `base`:
      a linha do chão em que a peça encosta). Quem tem os pés acima dessa linha
      fica atrás dela. Os recortes saem de `referencia-codara/gerar_recortes.py`,
      com as máscaras descritas em `MASCARAS`;
    - os assentos (`ASSENTOS`) são pontos: a pessoa senta ali, virada para `dir`.
      `base` diz em que camada a pessoa sentada fica, e `saida` é onde ela
      aparece ao levantar (e de onde ela senta);
    - salas, portas e regras de áudio continuam sendo as zonas de sempre (em
      tiles de 32), com a porta também medida em pixel (`porta_px`) para o
      desenho do estado da porta cair em cima da porta da arte.

Ao mudar uma medida aqui, rode `gerar_recortes.py` de novo e confira com
`?depurar=1` no navegador (pinta as formas e as bases por cima da arte).
A planta anterior (mesa de 6, salas rasas) está em
referencia-codara/backup/planta-codara-6-lugares.py.
"""

# Suba este número sempre que a planta de fábrica mudar: o servidor compara com
# o que está gravado e, se for mais nova, remonta o escritório. Sem isso, o mapa
# salvo (ou restaurado do espelho) vence para sempre e a planta nova nunca
# aparece — foi exatamente o que aconteceu.
VERSAO = 17

ARTE_L, ARTE_A = 1264, 848                  # tamanho da arte, em px do mundo
LARGURA, ALTURA = 40, 27                    # em tiles de 32 (cobre a arte)
PASTA = "/static/assets/codara/"

# ---------------------------------------------------------------- as diretorias
# id, nome do diretor, tiles da zona (x1, y1, x2, y2), porta em px (x1, x2, y),
# plaquinha em px, e o que tem dentro em px: mesa, vaso, as duas poltronas de
# visita (x1, x2) e a cadeira do dono (x)
# As linhas 5 a 10 contam como DENTRO da sala; a 10 é a do vão da porta: com a
# porta trancada, quem é de fora para do lado de fora do vidro, e não no vão.
DIRETORIAS = [
    ("diretoria1", "Gustavo", (3, 5, 14, 10), (425, 475, 340), (118, 44),
     {"mesa": (205, 405), "vaso": (160, 192), "visitas": [(212, 290), (315, 393)], "dono": 318}),
    ("diretoria2", "Christian", (16, 5, 26, 10), (814, 862, 340), (516, 44),
     {"mesa": (590, 800), "vaso": (534, 569), "visitas": [(605, 682), (712, 789)], "dono": 701}),
    ("diretoria3", "Felipe Vargas", (28, 5, 36, 10), (1133, 1179, 340), (904, 44),
     {"mesa": (959, 1152), "vaso": (914, 941), "visitas": [(985, 1060), (1081, 1150)], "dono": 1050}),
]

# ---------------------------------------------------------------- bloqueios
BLOQUEIOS = [
    # --- o fundo: parede de trás das diretorias e as paredes de cada lado
    {"r": [0, 0, ARTE_L, 192]},
    {"r": [0, 0, 105, 345]},                  # parede esquerda da sala do Gustavo
    {"r": [1179, 0, ARTE_L, 345]},            # parede direita da sala do Felipe (com o pilar roxo)
    {"r": [475, 0, 505, 345]},                # divisória Gustavo | Christian (com o pilar roxo)
    {"r": [862, 0, 893, 345]},                # divisória Christian | Felipe
    # --- frente de vidro das salas, com o vão das portas
    {"r": [105, 330, 425, 344]},              # porta do Gustavo: 425-475
    {"r": [505, 330, 814, 344]},              # porta do Christian: 814-862
    {"r": [893, 330, 1133, 344]},             # porta do Felipe: 1133-1179
]
for _id, _n, _z, _p, _l, d in DIRETORIAS:
    BLOQUEIOS.append({"r": [d["mesa"][0], 224, d["mesa"][1], 256]})       # mesa de trabalho
    BLOQUEIOS.append({"r": [d["vaso"][0], 205, d["vaso"][1], 240]})       # vaso
    for x1, x2 in d["visitas"]:
        BLOQUEIOS.append({"r": [x1, 262, x2, 302]})                       # poltronas de visita
BLOQUEIOS += [
    # --- salão: lado esquerdo (vaso, sofá, luminária) e direito (vaso alto)
    {"r": [0, 344, 100, 392]},
    {"r": [100, 373, 163, 425]},
    {"r": [30, 388, 142, 590]},
    {"r": [55, 560, 125, 668]},
    {"r": [0, 390, 40, 700]},
    {"r": [1159, 385, 1230, 475]},
    {"r": [1232, 344, ARTE_L, 700]},
    # --- parede da frente, com a entrada aberta entre os pilares (569-777)
    {"r": [0, 698, 569, ARTE_A]},
    {"r": [777, 698, ARTE_L, ARTE_A]},
    {"r": [569, 760, 777, ARTE_A]},
    # --- a mesa oval (o chão debaixo do tampo) e as oito cadeiras
    {"c": [471, 875, 521, 68, 69]},
    # (as de trás bloqueiam a partir do pé, não do encosto: entre elas e o vidro
    # das salas sobra o corredor por onde se passa)
    {"r": [500, 380, 578, 420]}, {"r": [632, 380, 713, 418]}, {"r": [766, 380, 845, 418]},
    {"r": [463, 575, 565, 650]}, {"r": [620, 575, 721, 650]}, {"r": [783, 575, 882, 650]},
    {"r": [322, 455, 405, 563]}, {"r": [939, 455, 1022, 563]},
]

# ---------------------------------------------------------------- recortes da frente
# nome, retângulo do recorte na arte (x1, y1, x2, y2), base, opacidade
FRENTES = [
    ("mesa", (398, 405, 950, 596), 592, 1),
    ("cadeira-tras-1", (495, 360, 584, 424), 421, 1),
    ("cadeira-tras-2", (626, 358, 719, 422), 421, 1),
    ("cadeira-tras-3", (760, 358, 851, 422), 421, 1),
    ("cadeira-frente-1", (457, 545, 571, 656), 652, 1),
    ("cadeira-frente-2", (614, 545, 728, 656), 652, 1),
    ("cadeira-frente-3", (777, 545, 889, 656), 652, 1),
    ("cadeira-ponta-esq", (316, 440, 410, 568), 566, 1),
    ("cadeira-ponta-dir", (933, 440, 1028, 568), 566, 1),
    ("mesa-gustavo", (200, 158, 410, 258), 256, 1),
    ("mesa-christian", (585, 150, 805, 258), 256, 1),
    ("mesa-felipe", (955, 158, 1157, 258), 256, 1),
    ("visitas-gustavo", (204, 236, 400, 306), 303, 1),
    ("visitas-christian", (597, 236, 796, 306), 303, 1),
    ("visitas-felipe", (977, 236, 1158, 306), 303, 1),
    ("vidro", (103, 256, 1188, 346), 343, 0.5),
    ("vaso-esquerda", (94, 322, 170, 430), 425, 1),
    ("vaso-direita", (1126, 268, 1240, 480), 475, 1),
    ("frente", (0, 626, ARTE_L, ARTE_A), 5000, 1),
]

# Como cada recorte é separado do chão (lido por gerar_recortes.py).
MASCARAS = {
    "mesa": {"capsula": [471, 875, 482.5, 70, 69], "pe": [440, 530, 910, 592],
             "objetos": [[772, 408, 850, 484], [796, 494, 868, 528]]},
    "mesa-gustavo": [[205, 192, 405, 256], [228, 163, 262, 195], [330, 170, 385, 195], [260, 186, 292, 195]],
    "mesa-christian": [[590, 192, 800, 256], [617, 166, 668, 195], [753, 155, 800, 195], [670, 185, 740, 195]],
    "mesa-felipe": [[959, 192, 1152, 256], [963, 168, 998, 195], [1036, 170, 1100, 195], [1105, 162, 1142, 195]],
    "vidro": [[105, 258, 1186, 344]],
    "vaso-esquerda": {"vaso": [[142, 373, 162, 425], [100, 373, 162, 390]]},   # o sofá fica na frente do pé do vaso
    "vaso-direita": {"vaso": [[1161, 387, 1227, 475]]},
    "frente": {"rets": [[0, 770, ARTE_L, ARTE_A], [325, 698, 569, 778], [777, 698, 1003, 778],
                        [541, 686, 569, 778], [777, 686, 805, 778], [5, 700, 335, 778],
                        [999, 700, ARTE_L, 778], [0, 690, 30, ARTE_A], [1240, 660, ARTE_L, ARTE_A]],
               "entrada": [569, 0, 777, 770]},
}

# ---------------------------------------------------------------- assentos
# x, y: onde a pessoa sentada fica (o centro da caixinha); dir: para onde olha
ASSENTOS = []
for x in (539, 672, 805):                    # fila de trás da mesa: de frente para nós
    ASSENTOS.append({"x": x, "y": 398, "dir": "baixo", "zona": "reuniao",
                     "base": 422, "saida": [x, 356]})
for x in (513, 670, 832):                    # fila da frente: de costas, olhando a mesa
    ASSENTOS.append({"x": x, "y": 590, "dir": "cima", "zona": "reuniao",
                     "base": 625, "saida": [x, 668]})
ASSENTOS.append({"x": 366, "y": 494, "dir": "direita", "zona": "reuniao",   # pontas da mesa
                 "base": 567, "saida": [298, 494]})
ASSENTOS.append({"x": 978, "y": 494, "dir": "esquerda", "zona": "reuniao",
                 "base": 567, "saida": [1048, 494]})
for _id, _n, _z, _p, _l, d in DIRETORIAS:
    # a cadeira do dono, atrás da mesa de trabalho, de frente para a sala
    ASSENTOS.append({"x": d["dono"], "y": 208, "dir": "baixo", "base": 222,
                     "saida": [d["dono"] + 44, 208]})
    # as duas poltronas de visita, de costas para nós, olhando a mesa
    for x1, x2 in d["visitas"]:
        meio = (x1 + x2) // 2
        ASSENTOS.append({"x": meio, "y": 270, "dir": "cima", "base": 290, "saida": [meio, 318]})
for y in (440, 500, 558):                    # o sofá encostado na parede esquerda
    ASSENTOS.append({"x": 102, "y": y, "dir": "direita", "base": y + 14, "saida": [164, y]})


def montar_padrao(esc) -> None:
    esc.largura, esc.altura = LARGURA, ALTURA
    esc.piso = [["p"] * LARGURA for _ in range(ALTURA)]
    esc.paredes = [[0] * LARGURA for _ in range(ALTURA)]
    esc.objetos = []
    esc.zonas = []
    esc.proximo_id = 1

    for id_, nome, (x1, y1, x2, y2), (px1, px2, py), (lx, ly), _d in DIRETORIAS:
        esc.zonas.append({
            "id": id_, "nome": nome, "sub": "Diretoria",
            "x1": x1, "y1": y1, "x2": x2, "y2": y2, "privada": True, "cor": "#8b5cf6",
            # a porta continua gravada na zona (o servidor e o editor usam): é o
            # tile do salão bem na frente do meio do vão, o primeiro passo fora
            "porta": {"lado": "baixo", "x": (px1 + px2) // 2 // 32, "y": y2 + 1},
            "porta_px": {"x1": px1, "x2": px2, "y": py},
            "placa_px": {"x": lx, "y": ly},
            "dono_nome_fixo": nome,
        })

    # O salão é área aberta: vale o raio de conversa, como sempre.
    esc.zonas.append({"id": "salao", "nome": "Salão", "x1": 1, "y1": 11, "x2": 38, "y2": 25,
                      "privada": False, "cor": "#8b5cf6", "sem_placa": True})
    # A mesa oval é a sala de reunião: só quem SENTA entra nela (bolha fechada,
    # câmera e microfone abrem sozinhos, é da casa). Quem passa pela mesa
    # continua no salão, andando normalmente.
    esc.zonas.append({"id": "reuniao", "nome": "Mesa de reunião", "x1": 9, "y1": 11,
                      "x2": 32, "y2": 20, "privada": True, "cor": "#8b5cf6",
                      "so_sentado": True, "sem_dono": True, "abre_midia": True,
                      "sem_placa": True})

    esc.cenario = {
        "nome": "codara",
        "fundo": PASTA + "fundo.png",
        "largura": ARTE_L, "altura": ARTE_A,
        "cor_fora": "#121014",
        "boneco": 5.6,                         # escala do boneco (2 era a de antes)
        "raio_conversa": 250, "raio_silencio": 330,
        "entrada": [673, 735],
        "bloqueios": BLOQUEIOS,
        "frentes": [{"nome": n, "img": PASTA + "frente-%s.png" % n,
                     "x": r[0], "y": r[1], "w": r[2] - r[0], "h": r[3] - r[1],
                     "base": b, "alfa": a} for n, r, b, a in FRENTES],
        "assentos": ASSENTOS,
    }
    esc.nascimento = (673 // 32, 735 // 32)
    esc.versao_planta = VERSAO
    esc._recalcular()
