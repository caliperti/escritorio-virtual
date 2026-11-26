"""A planta que vem de fábrica: a sede da Codara Labs, versão maior (26/11).

A arte (`static/assets/codara/fundo.png`) é a "Sede virtual Codara Labs em
corte" que o dono mandou, sem a faixa de título de cima. Um salão grande com:

    - as três diretorias no fundo (Gustavo, Christian, Felipe Vargas), cada
      uma com a mesa de trabalho, a cadeira do dono e duas poltronas de visita.
      A frente delas é aberta na arte (o desenho é "em corte"): a porta é a
      frente inteira, e trancada ela vira um vidro fumê de ponta a ponta;
    - a mesa oval de reunião para 8 no centro;
    - três fileiras de estações de trabalho à esquerda e a bancada comprida à
      direita;
    - o lounge com sofás no canto de baixo, a recepção na frente da entrada,
      o café no canto de cima à direita e jardineiras na parede da frente.

Como a planta funciona (igual à anterior):
    - 1 px da arte = 1 px do mundo. A arte tem 1672 x 891;
    - o que bloqueia são formas medidas em cima da arte (`BLOQUEIOS`): retângulo
      `r: [x1, y1, x2, y2]` e cápsula deitada `c: [xa, xb, cy, rx, ry]` (a mesa
      oval). A caixinha do avatar (22 px) não pode encostar nelas. Móvel bloqueia
      pelo PÉ (o que encosta no chão), não pelo desenho inteiro: quem passa
      atrás dele fica atrás do recorte;
    - o que fica NA FRENTE de quem passa atrás são recortes da própria arte
      (`FRENTES`, com a `base`: a linha do chão em que a peça encosta). Saem de
      `referencia-codara/gerar_recortes.py`, com as máscaras de `MASCARAS`;
    - os assentos (`ASSENTOS`) são pontos: a pessoa senta ali, virada para
      `dir`. `base` diz em que camada a pessoa sentada fica, e `saida` é onde
      ela aparece ao levantar (e de onde ela senta);
    - salas e regras de áudio são as zonas de sempre (em tiles de 32).

Ao mudar uma medida aqui, rode `gerar_recortes.py` de novo e confira com
`?depurar=1` no navegador (pinta as formas e as bases por cima da arte).
A planta anterior (o salão de 1264 x 848) está em
referencia-codara/backup/planta-codara-8-lugares.py.
"""

# Suba este número sempre que a planta de fábrica mudar: o servidor compara com
# o que está gravado e, se for mais nova, remonta o escritório.
VERSAO = 20

ARTE_L, ARTE_A = 1672, 891                  # tamanho da arte, em px do mundo
LARGURA, ALTURA = 53, 28                    # em tiles de 32 (cobre a arte)
PASTA = "/static/assets/codara/"

# ---------------------------------------------------------------- as diretorias
# id, nome do diretor, tiles da zona (x1, y1, x2, y2), a frente em px (x1, x2,
# y: a linha da frente na arte, onde o vidro assenta quando tranca), a plaquinha que já vem desenhada
# na arte (x, y, w, h — só para o clique), e o que tem dentro: mesa (x1, x2),
# vaso (x1, x2), as duas poltronas de visita (x1, x2), a cadeira do dono (x) e
# o corredor ao lado da mesa por onde o dono chega na cadeira (x).
# A linha 9 de tiles (288-319) é a soleira: conta como dentro da sala.
DIRETORIAS = [
    ("diretoria1", "Gustavo", (14, 4, 21, 9), (452, 705, 302), (470, 52, 112, 41),
     {"mesa": (510, 660), "vaso": (470, 499), "visitas": [(530, 577), (598, 646)],
      "dono": 590, "corredor": 683}),
    ("diretoria2", "Christian", (22, 4, 30, 9), (722, 975, 302), (734, 52, 112, 41),
     {"mesa": (777, 935), "vaso": (743, 770), "visitas": [(792, 840), (870, 918)],
      "dono": 857, "corredor": 955}),
    ("diretoria3", "Felipe Vargas", (31, 4, 38, 9), (995, 1237, 302), (1004, 52, 126, 41),
     {"mesa": (1050, 1197), "vaso": (1014, 1043), "visitas": [(1067, 1115), (1135, 1183)],
      "dono": 1119, "corredor": 1217}),
]

# ---------------------------------------------------------------- estações (esquerda)
# Três fileiras: mesa comprida com divisória e monitores, cadeiras de frente
# para os monitores (de costas para nós), e do outro lado da divisória mais
# duas, de frente para nós (a divisória e os monitores cobrem a cintura).
# Cada fileira é uma BAIA: quem senta nela só ouve quem está sentado nela
# (como na mesa de reunião), e quem está de fora não ouve a baia.
#   mesa: pé da mesa (x1, x2, y1, y2); cadeiras: as da frente (x1, x2, y1, y2);
#   tras: os lugares do outro lado (x, y); saidas: onde se levanta, no corredor
#   entre as fileiras (as cadeiras de uma fileira ficam alinhadas com as da
#   outra, então a saída é no meio, entre elas)
FILEIRAS = [
    {"zona": "baia1", "mesa": (140, 380, 232, 300),
     "cadeiras": [(178, 218, 258, 318), (287, 327, 258, 318)],
     "saida_frente": [(238, 334), (262, 334)],
     "tras": [(207, 214), (312, 214)], "saida_tras": [(250, 206), (270, 206)]},
    {"zona": "baia2", "mesa": (117, 375, 360, 445),
     "cadeiras": [(160, 200, 395, 455), (275, 318, 395, 455)],
     "saida_frente": [(229, 468), (247, 468)],
     "tras": [(190, 345), (300, 345)], "saida_tras": [(238, 334), (262, 334)]},
    {"zona": "baia3", "mesa": (92, 360, 495, 585),
     "cadeiras": [(140, 185, 532, 600), (258, 305, 532, 600)],
     "saida_frente": [(162, 614), (282, 612)],
     "tras": [(171, 482), (287, 482)], "saida_tras": [(229, 468), (247, 468)]},
]
# as zonas de som das baias, em tiles (x1, y1, x2, y2); só contam para quem
# está SENTADO num lugar delas
ZONAS_BAIAS = [("baia1", "Baia 1", (4, 5, 11, 9)), ("baia2", "Baia 2", (3, 10, 11, 14)),
               ("baia3", "Baia 3", (2, 15, 11, 18)), ("bancada", "Bancada", (40, 9, 47, 17))]

# ---------------------------------------------------------------- bancada (direita)
# A mesa comprida vai em diagonal (de 1320,297 a 1495,612); bloqueia em degraus.
BANCADA = [[1325, 297, 1435, 380], [1340, 380, 1455, 465], [1360, 465, 1478, 540],
           [1375, 540, 1495, 612]]
# cadeiras: (x1, x2, y1, y2, para onde a pessoa olha)
BANCADA_CADEIRAS = [
    (1292, 1330, 300, 380, "direita"), (1310, 1345, 382, 457, "direita"),
    (1330, 1370, 465, 555, "direita"),
    (1430, 1467, 300, 382, "esquerda"), (1450, 1490, 392, 470, "esquerda"),
    (1475, 1515, 480, 565, "esquerda"),
]

# ---------------------------------------------------------------- bloqueios
BLOQUEIOS = [
    # --- o fundo: parede de trás (salão de cima, diretorias, café)
    {"r": [0, 0, ARTE_L, 185]},
    {"r": [452, 0, 1237, 188]},               # fundo das diretorias (a cadeira do dono encosta)
    {"r": [1237, 0, ARTE_L, 205]},            # balcão do café
    # --- pilares entre as salas (vão do chão até a frente aberta)
    {"r": [420, 0, 452, 300]},
    {"r": [705, 0, 722, 300]},
    {"r": [975, 0, 995, 300]},
    {"r": [1237, 0, 1268, 300]},
    # --- parede de vidro da esquerda (em diagonal: degraus)
    {"r": [0, 0, 112, 260]}, {"r": [0, 260, 62, 400]}, {"r": [0, 400, 42, 560]},
    {"r": [0, 560, 30, ARTE_A]},
    # --- parede de vidro da direita e o painel com a tela (degraus)
    {"r": [1545, 0, ARTE_L, 330]}, {"r": [1552, 330, ARTE_L, 420]},
    {"r": [1572, 420, ARTE_L, 520]}, {"r": [1592, 520, ARTE_L, 620]},
    {"r": [1612, 620, ARTE_L, ARTE_A]},
    # --- parede da frente, com a entrada aberta entre os pilares (727-935)
    {"r": [0, 796, 727, ARTE_A]},
    {"r": [935, 796, ARTE_L, ARTE_A]},
    {"r": [727, 866, 935, ARTE_A]},
]
for _id, _n, _z, _p, _l, d in DIRETORIAS:
    BLOQUEIOS.append({"r": [d["mesa"][0], 198, d["mesa"][1], 258]})      # mesa de trabalho
    BLOQUEIOS.append({"r": [d["vaso"][0], 194, d["vaso"][1], 224]})      # vaso
    BLOQUEIOS.append({"r": [d["dono"] - 22, 186, d["dono"] + 22, 200]})  # cadeira do dono
    for x1, x2 in d["visitas"]:
        BLOQUEIOS.append({"r": [x1, 236, x2, 290]})                      # poltronas de visita
for f in FILEIRAS:
    x1, x2, y1, y2 = f["mesa"]
    BLOQUEIOS.append({"r": [x1, y1, x2, y2]})
    for cx1, cx2, cy1, cy2 in f["cadeiras"]:
        BLOQUEIOS.append({"r": [cx1, cy1 + 12, cx2, cy2 - 10]})
for r in BANCADA:
    BLOQUEIOS.append({"r": r})
for x1, x2, y1, y2, _dir in BANCADA_CADEIRAS:
    BLOQUEIOS.append({"r": [x1, y1 + 20, x2, y2 - 4]})
BLOQUEIOS += [
    # --- vasos e plantas do salão
    {"r": [168, 150, 198, 186]},               # vaso do canto de cima (encosta na parede)
    {"r": [355, 210, 390, 246]},               # vaso da ponta da fileira 1
    {"r": [345, 338, 382, 372]},               # vaso da ponta da fileira 2
    {"r": [338, 475, 366, 497]},               # vaso da ponta da fileira 3
    {"r": [66, 332, 106, 370]},                # vaso da parede esquerda
    {"r": [30, 596, 80, 640]},                 # vaso de baixo, à esquerda
    {"r": [1508, 262, 1542, 300]},             # vaso do café
    {"r": [1310, 280, 1355, 305]},             # vaso da ponta da bancada
    {"r": [1397, 646, 1625, 712]},             # jardineira grande da direita
    # --- lounge: sofá encostado na parede, sofá de cima, luminária, mesa de centro
    {"r": [40, 640, 132, 790]},
    {"r": [208, 628, 387, 700]},
    {"r": [137, 645, 182, 720]},
    {"r": [222, 716, 340, 786]},
    # --- recepção (o pé do balcão)
    {"r": [650, 700, 1012, 766]},
    # --- a mesa oval (o chão debaixo do tampo) e as oito cadeiras
    {"c": [673, 1012, 481, 70, 67]},
    # (as de trás bloqueiam a partir do pé, não do encosto: entre elas e a frente
    # das diretorias sobra o corredor por onde se passa)
    {"r": [684, 384, 748, 414]}, {"r": [811, 384, 876, 414]}, {"r": [938, 384, 1002, 414]},
    {"r": [672, 552, 752, 612]}, {"r": [807, 552, 888, 612]}, {"r": [941, 552, 1021, 612]},
    {"r": [540, 448, 602, 532]}, {"r": [1083, 448, 1146, 532]},
]

# ---------------------------------------------------------------- recortes da frente
# nome, retângulo do recorte na arte (x1, y1, x2, y2), base, opacidade
FRENTES = [
    # mesa de reunião
    ("mesa", (598, 388, 1088, 552), 548, 1),
    ("cadeira-tras-1", (676, 340, 756, 412), 404, 1),
    ("cadeira-tras-2", (803, 340, 884, 412), 404, 1),
    ("cadeira-tras-3", (929, 340, 1010, 412), 404, 1),
    ("cadeira-frente-1", (663, 522, 761, 620), 612, 1),
    ("cadeira-frente-2", (798, 522, 897, 620), 612, 1),
    ("cadeira-frente-3", (932, 522, 1030, 620), 612, 1),
    ("cadeira-ponta-esq", (533, 414, 607, 540), 533, 1),
    ("cadeira-ponta-dir", (1078, 414, 1152, 540), 533, 1),
    # diretorias
    ("mesa-gustavo", (505, 150, 665, 262), 258, 1),
    ("mesa-christian", (772, 150, 940, 262), 258, 1),
    ("mesa-felipe", (1045, 150, 1202, 262), 258, 1),
    ("visitas-gustavo", (525, 226, 651, 294), 292, 1),
    ("visitas-christian", (787, 226, 923, 294), 292, 1),
    ("visitas-felipe", (1062, 226, 1188, 294), 292, 1),
    # baias da esquerda: a mesa de cada fileira, da divisória para baixo (cobre
    # a cintura de quem senta do outro lado e as pernas de quem passa atrás),
    # e as cadeiras da frente
    ("fileira-1", (135, 218, 395, 302), 300, 1),
    ("fileira-2", (110, 349, 392, 448), 445, 1),
    ("fileira-3", (86, 484, 378, 588), 586, 1),
    ("estacao-1a", (172, 250, 224, 322), 318, 1),
    ("estacao-1b", (281, 250, 333, 322), 318, 1),
    ("estacao-2a", (154, 387, 206, 459), 455, 1),
    ("estacao-2b", (269, 387, 324, 459), 455, 1),
    ("estacao-3a", (134, 524, 191, 604), 600, 1),
    ("estacao-3b", (252, 524, 311, 604), 600, 1),
    # vasos com gente passando atrás
    ("vaso-bancada", (1298, 240, 1366, 308), 305, 1),
    ("vaso-cafe", (1484, 190, 1552, 302), 300, 1),
    ("vaso-esquerda", (56, 286, 112, 372), 370, 1),
    # recepção, jardineira grande e a parede da frente com as jardineiras
    ("recepcao", (646, 652, 1016, 774), 766, 1),
    ("jardineira", (1392, 588, 1630, 716), 712, 1),
    ("frente", (0, 712, ARTE_L, ARTE_A), 5000, 1),
]

# Como cada recorte é separado do chão (lido por gerar_recortes.py).
MASCARAS = {
    "mesa": {"capsula": [673, 1012, 460, 70, 67], "pe": [630, 496, 1058, 550],
             "objetos": [[925, 400, 1000, 462], [965, 476, 1020, 500], [675, 445, 730, 478]]},
    # a mesa e o que está em cima dela (abajur, monitor, notebook); a cadeira do
    # dono fica de fora, senão a mesa cobriria quem está sentado nela
    "mesa-gustavo": [[510, 186, 660, 260], [520, 160, 552, 200], [606, 167, 651, 207]],
    "mesa-christian": [[777, 186, 935, 260], [795, 165, 838, 207], [895, 158, 932, 202]],
    "mesa-felipe": [[1050, 186, 1197, 260], [1105, 172, 1152, 210], [1163, 165, 1195, 200]],
    "vaso-esquerda": {"vaso": [[66, 332, 106, 370]]},
    "vaso-bancada": {"vaso": [[1310, 280, 1355, 305]]},
    "vaso-cafe": {"vaso": [[1508, 262, 1542, 300]]},
    "recepcao": {"rets": [[650, 688, 1012, 772], [785, 660, 853, 696]], "folhas": [915, 652, 1005, 770]},
    "jardineira": {"rets": [[1397, 646, 1625, 714]], "folhas": [1392, 588, 1630, 680]},
    "frente": {"rets": [[0, 792, ARTE_L, ARTE_A], [697, 780, 727, 866], [935, 780, 965, 866],
                        [0, 620, 30, ARTE_A], [1612, 600, ARTE_L, ARTE_A]],
               "entrada": [727, 0, 935, 866]},
}

# ---------------------------------------------------------------- assentos
# x, y: onde a pessoa sentada fica (o centro da caixinha); dir: para onde olha
ASSENTOS = []
for x in (716, 844, 970):                    # fila de trás da mesa: de frente para nós
    ASSENTOS.append({"x": x, "y": 385, "dir": "baixo", "zona": "reuniao",
                     "base": 406, "saida": [x, 342]})
for x in (712, 847, 981):                    # fila da frente: de costas, olhando a mesa
    ASSENTOS.append({"x": x, "y": 566, "dir": "cima", "zona": "reuniao",
                     "base": 596, "saida": [x, 640]})
ASSENTOS.append({"x": 572, "y": 478, "dir": "direita", "zona": "reuniao",   # pontas da mesa
                 "base": 535, "saida": [514, 478]})
ASSENTOS.append({"x": 1114, "y": 478, "dir": "esquerda", "zona": "reuniao",
                 "base": 535, "saida": [1172, 478]})
for _id, _n, _z, _p, _l, d in DIRETORIAS:
    # a cadeira do dono, atrás da mesa de trabalho, de frente para a sala
    ASSENTOS.append({"x": d["dono"], "y": 193, "dir": "baixo", "base": 202,
                     "saida": [d["corredor"], 212]})
    # as duas poltronas de visita, de costas para nós, olhando a mesa
    for x1, x2 in d["visitas"]:
        meio = (x1 + x2) // 2
        ASSENTOS.append({"x": meio, "y": 273, "dir": "cima", "base": 289, "saida": [meio, 310]})
for f in FILEIRAS:
    # as da frente: de costas para nós, olhando o monitor; a cadeira cobre a
    # cintura (a base fica entre a mesa e a cadeira)
    for (cx1, cx2, cy1, cy2), saida in zip(f["cadeiras"], f["saida_frente"]):
        ASSENTOS.append({"x": (cx1 + cx2) // 2, "y": cy1 + 38, "dir": "cima", "zona": f["zona"],
                         "base": cy2 - 4, "saida": list(saida)})
    # as do outro lado: de frente para nós, atrás da divisória
    for (x, y), saida in zip(f["tras"], f["saida_tras"]):
        ASSENTOS.append({"x": x, "y": y, "dir": "baixo", "zona": f["zona"],
                         "base": y + 10, "saida": list(saida)})
for x1, x2, y1, y2, dir_ in BANCADA_CADEIRAS:  # bancada: de lado, olhando a mesa
    meio_y = (y1 + y2) // 2 + 4
    if dir_ == "direita":
        ASSENTOS.append({"x": x1 + 18, "y": meio_y, "dir": "direita", "zona": "bancada",
                         "base": y2 - 2, "saida": [x1 - 26, meio_y]})
    else:
        ASSENTOS.append({"x": x2 - 18, "y": meio_y, "dir": "esquerda", "zona": "bancada",
                         "base": y2 - 2, "saida": [x2 + 26, meio_y]})
for x in (262, 335):                         # sofá de cima do lounge, de frente para nós
    ASSENTOS.append({"x": x, "y": 664, "dir": "baixo", "base": 702, "saida": [408, 714]})
# sofá encostado na parede, olhando para dentro. O de cima não fica colado na
# mesinha do abajur (era de lá que a pessoa "pulava" para o sofá); cada lugar
# tem a sua saída logo à frente, entre o sofá e a mesa de centro.
for y, sy in ((718, 742), (762, 770)):
    ASSENTOS.append({"x": 88, "y": y, "dir": "direita", "base": y + 14, "saida": [162, sy]})


def montar_padrao(esc) -> None:
    esc.largura, esc.altura = LARGURA, ALTURA
    esc.piso = [["p"] * LARGURA for _ in range(ALTURA)]
    esc.paredes = [[0] * LARGURA for _ in range(ALTURA)]
    esc.objetos = []
    esc.zonas = []
    esc.proximo_id = 1

    for id_, nome, (x1, y1, x2, y2), (px1, px2, py), (lx, ly, lw, lh), _d in DIRETORIAS:
        esc.zonas.append({
            "id": id_, "nome": nome, "sub": "Diretoria",
            "x1": x1, "y1": y1, "x2": x2, "y2": y2, "privada": True, "cor": "#8b5cf6",
            # a porta continua gravada na zona (o servidor usa): o tile do salão
            # bem na frente do meio da sala, o primeiro passo fora
            "porta": {"lado": "baixo", "x": (px1 + px2) // 2 // 32, "y": y2 + 1},
            "porta_px": {"x1": px1, "x2": px2, "y": py},
            # o nome já está desenhado na arte: a plaquinha só responde ao clique
            "placa_px": {"x": lx, "y": ly, "w": lw, "h": lh, "na_arte": True},
            "dono_nome_fixo": nome,
        })

    # A mesa oval é a sala de reunião: só quem SENTA entra nela (bolha fechada,
    # câmera e microfone abrem sozinhos, é da casa). Quem passa pela mesa
    # continua no salão, andando normalmente.
    esc.zonas.append({"id": "reuniao", "nome": "Mesa de reunião", "x1": 16, "y1": 10,
                      "x2": 36, "y2": 19, "privada": True, "cor": "#8b5cf6",
                      "so_sentado": True, "sem_dono": True, "abre_midia": True,
                      "sem_placa": True})
    # As baias: a mesma bolha fechada de quem está sentado, mas sem abrir
    # câmera, microfone nem a tela de chamada sozinhos (é lugar de trabalho)
    for id_, nome, (x1, y1, x2, y2) in ZONAS_BAIAS:
        esc.zonas.append({"id": id_, "nome": nome, "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                          "privada": True, "cor": "#8b5cf6", "so_sentado": True,
                          "sem_dono": True, "sem_placa": True})
    # O salão é área aberta: vale o raio de conversa, como sempre. Cobre tudo;
    # as salas vêm antes na lista e ganham dele.
    esc.zonas.append({"id": "salao", "nome": "Salão", "x1": 0, "y1": 0,
                      "x2": LARGURA - 1, "y2": ALTURA - 1,
                      "privada": False, "cor": "#8b5cf6", "sem_placa": True})

    esc.cenario = {
        "nome": "codara",
        # "?v=" muda com a planta: quem está com o escritório aberto na hora
        # da troca baixa a arte nova, em vez de misturar a velha com a planta nova
        "fundo": PASTA + "fundo.png?v=%d" % VERSAO,
        "largura": ARTE_L, "altura": ARTE_A,
        "cor_fora": "#121014",
        "boneco": 5.0,                         # escala do boneco (2 era a de antes)
        "raio_conversa": 250, "raio_silencio": 330,
        "entrada": [831, 834],
        "bloqueios": BLOQUEIOS,
        "frentes": [{"nome": n, "img": PASTA + "frente-%s.png?v=%d" % (n, VERSAO),
                     "x": r[0], "y": r[1], "w": r[2] - r[0], "h": r[3] - r[1],
                     "base": b, "alfa": a} for n, r, b, a in FRENTES],
        "assentos": ASSENTOS,
    }
    esc.nascimento = (831 // 32, 834 // 32)
    esc.versao_planta = VERSAO
    esc._recalcular()
