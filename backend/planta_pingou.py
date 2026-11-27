"""A planta do Pingou (27/11).

A arte (`static/assets/pingou/fundo.png`) é a "Sede tech brasileira em
verde-petróleo e pedra" que o dono mandou, sem a faixa de título de cima
(o original está em referencia-pingou/arte/pingou-original.png). Ela segue o
mesmo molde da sede do Escritório (planta_padrao.py), então o jeito de medir é
o mesmo e muita medida coincide (a mesa de reunião, a recepção, o lounge, a
parede da frente). O que ela tem:

    - quatro diretorias no fundo (Gustavo, Christian, Felipe Vargas e a
      Diretoria 4, sem dono), com a frente aberta: a porta é a frente inteira,
      e trancada ela vira o vidro fumê;
    - a mesa oval de reunião para 8 no centro;
    - duas fileiras de estações à esquerda e uma à direita, embaixo do café.
      Cada fileira é uma BAIA (bolha de som de quem está sentado nela);
    - o lounge no canto de baixo, a recepção na frente da entrada, o café à
      direita, a jardineira grande e as jardineiras da parede da frente.

Formato igual ao da planta_padrao.py (BLOQUEIOS, FRENTES, MASCARAS, ASSENTOS,
zonas em tiles de 32). Os recortes saem de referencia-pingou/gerar_recortes.py.
Ao mudar uma medida aqui: rode o gerador de novo, suba a VERSAO e confira com
`?depurar=1` no navegador.
"""

VERSAO = 2

ARTE_L, ARTE_A = 1672, 891
LARGURA, ALTURA = 53, 28
PASTA = "/static/assets/pingou/"

# ---------------------------------------------------------------- as diretorias
# id, nome, tiles da zona, a frente em px (x1, x2, y), a plaquinha da arte
# (x, y, w, h) e o que tem dentro: mesa (x1, x2), vaso (x1, x2), poltronas de
# visita (x1, x2), cadeira do dono (x), corredor ao lado da mesa (x), e as
# coisas em cima da mesa que ficam na frente de quem senta atrás dela.
DIRETORIAS = [
    ("diretoria1", "Gustavo", (3, 4, 14, 9), (105, 468, 300), (212, 50, 113, 40),
     {"mesa": (210, 410), "vaso": (165, 195), "visitas": [(239, 292), (327, 382)],
      "dono": 305, "corredor": 440,
      "em_cima": [[250, 182, 287, 205], [315, 170, 362, 208], [375, 163, 405, 200]]}),
    ("diretoria2", "Christian", (15, 4, 25, 9), (497, 830, 300), (540, 50, 109, 40),
     {"mesa": (567, 765), "vaso": (524, 552), "visitas": [(597, 652), (682, 737)],
      "dono": 663, "corredor": 798,
      "em_cima": [[602, 182, 640, 205], [667, 170, 717, 208], [732, 163, 762, 200]]}),
    ("diretoria3", "Felipe Vargas", (26, 4, 37, 9), (855, 1188, 300), (905, 50, 125, 40),
     {"mesa": (932, 1122), "vaso": (882, 912), "visitas": [(960, 1015), (1045, 1100)],
      "dono": 1021, "corredor": 1155,
      "em_cima": [[962, 182, 997, 205], [1022, 170, 1070, 208], [1080, 163, 1114, 200]]}),
    # a quarta não tem diretor: fica livre para quem reivindicar
    ("diretoria4", "Diretoria 4", (38, 4, 48, 9), (1212, 1545, 300), (1252, 50, 114, 40),
     {"mesa": (1290, 1487), "vaso": (1242, 1272), "visitas": [(1321, 1377), (1405, 1461)],
      "dono": 1375, "corredor": 1516, "sem_diretor": True,
      "em_cima": [[1321, 182, 1358, 205], [1385, 170, 1433, 208], [1450, 163, 1479, 200]]}),
]

# ---------------------------------------------------------------- estações
# mesa (x1, x2, y1, y2), cadeiras da frente (x1, x2, y1, y2), os lugares do
# outro lado da divisória (x, y) e onde cada um se levanta
FILEIRAS = [
    {"zona": "baia1", "mesa": (118, 382, 346, 440),
     "cadeiras": [(159, 206, 392, 455), (274, 320, 392, 455)],
     "saida_frente": [(229, 468), (247, 468)],
     "tras": [(190, 345), (301, 345)], "saida_tras": [(238, 318), (262, 318)]},
    {"zona": "baia2", "mesa": (95, 365, 490, 595),
     "cadeiras": [(140, 183, 535, 597), (260, 305, 535, 597)],
     "saida_frente": [(162, 614), (282, 612)],
     "tras": [(171, 482), (288, 482)], "saida_tras": [(229, 468), (247, 468)]},
    {"zona": "baia3", "mesa": (1312, 1580, 500, 595),
     "cadeiras": [(1367, 1415, 547, 620), (1482, 1530, 547, 620)],
     "saida_frente": [(1345, 624), (1452, 630)],
     "tras": [(1388, 495), (1498, 495)], "saida_tras": [(1388, 480), (1498, 480)]},
]
ZONAS_BAIAS = [("baia1", "Baia 1", (3, 10, 11, 14)), ("baia2", "Baia 2", (2, 15, 11, 18)),
               ("baia3", "Baia 3", (41, 14, 49, 19))]

# ---------------------------------------------------------------- bloqueios
BLOQUEIOS = [
    # --- o fundo e as paredes das diretorias
    {"r": [0, 0, ARTE_L, 186]},
    {"r": [0, 0, 105, 302]},                  # parede de vidro da esquerda, na altura da diretoria 1
    {"r": [468, 0, 497, 300]},                # pilares entre as salas
    {"r": [830, 0, 855, 300]},
    {"r": [1188, 0, 1212, 300]},
    {"r": [1545, 0, ARTE_L, 315]},            # parede da direita da diretoria 4
    # --- parede de vidro da esquerda, embaixo (degraus)
    {"r": [0, 302, 50, 420]}, {"r": [0, 420, 42, 560]}, {"r": [0, 560, 32, ARTE_A]},
    # --- painel verde e parede da direita (degraus)
    {"r": [1570, 315, ARTE_L, 420]}, {"r": [1590, 420, ARTE_L, 520]},
    {"r": [1610, 520, ARTE_L, 620]}, {"r": [1628, 620, ARTE_L, ARTE_A]},
    # --- parede da frente, com a entrada aberta entre os pilares (720-935)
    {"r": [0, 796, 720, ARTE_A]},
    {"r": [935, 796, ARTE_L, ARTE_A]},
    # --- o café (o balcão inteiro, encostado na frente da diretoria 4)
    # (começa um pouco abaixo do topo dele: a faixa entre a diretoria 4 e o
    # balcão é a passagem para ela, e quem passa ali fica acima do balcão)
    {"r": [1302, 330, 1570, 467]},
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
BLOQUEIOS += [
    # --- vasos e plantas do salão
    {"r": [68, 340, 106, 376]},                # vaso da parede esquerda
    {"r": [340, 328, 385, 348]},               # planta da ponta da baia 1
    {"r": [335, 478, 368, 492]},               # planta da ponta da baia 2 (o vaso, atrás da divisória)
    {"r": [30, 588, 80, 625]},                 # vaso de baixo, à esquerda
    {"r": [1395, 646, 1626, 712]},             # jardineira grande da direita
    # --- lounge: sofá encostado na parede, sofá de cima, luminária, mesa de centro
    {"r": [40, 640, 132, 790]},
    {"r": [208, 628, 387, 700]},
    {"r": [137, 645, 182, 720]},
    {"r": [222, 716, 340, 786]},
    # --- recepção (o pé do balcão)
    {"r": [650, 700, 1012, 768]},
    # --- a mesa oval (o chão debaixo do tampo) e as oito cadeiras
    {"c": [673, 1012, 481, 70, 67]},
    {"r": [684, 384, 748, 414]}, {"r": [811, 384, 876, 414]}, {"r": [938, 384, 1002, 414]},
    {"r": [672, 552, 752, 612]}, {"r": [807, 552, 888, 612]}, {"r": [941, 552, 1021, 612]},
    {"r": [540, 448, 602, 532]}, {"r": [1083, 448, 1146, 532]},
]

# ---------------------------------------------------------------- recortes da frente
# nome, retângulo do recorte (x1, y1, x2, y2), base, opacidade
FRENTES = [
    ("mesa", (598, 388, 1088, 558), 548, 1),
    ("cadeira-tras-1", (676, 340, 756, 412), 404, 1),
    ("cadeira-tras-2", (803, 340, 884, 412), 404, 1),
    ("cadeira-tras-3", (929, 340, 1010, 412), 404, 1),
    ("cadeira-frente-1", (663, 522, 761, 620), 612, 1),
    ("cadeira-frente-2", (798, 522, 897, 620), 612, 1),
    ("cadeira-frente-3", (932, 522, 1030, 620), 612, 1),
    ("cadeira-ponta-esq", (533, 414, 607, 540), 533, 1),
    ("cadeira-ponta-dir", (1078, 414, 1152, 540), 533, 1),
]
for _id, _n, _z, _p, _l, d in DIRETORIAS:
    x1, x2 = d["mesa"]
    FRENTES.append(("mesa-" + _id, (x1 - 5, 150, x2 + 5, 262), 258, 1))
    v = d["visitas"]
    FRENTES.append(("visitas-" + _id, (v[0][0] - 4, 222, v[1][1] + 4, 296), 292, 1))
for i, f in enumerate(FILEIRAS, 1):
    x1, x2, y1, y2 = f["mesa"]
    FRENTES.append(("fileira-%d" % i, (x1 - 5, y1 - 6, x2 + 5, y2 + 5), y2 + 3, 1))
    for letra, (cx1, cx2, cy1, cy2) in zip("ab", f["cadeiras"]):
        FRENTES.append(("estacao-%d%s" % (i, letra), (cx1 - 4, cy1 - 4, cx2 + 4, cy2 + 4), cy2, 1))
FRENTES += [
    ("vaso-esquerda", (56, 286, 118, 378), 376, 1),
    ("vaso-baixo", (15, 525, 92, 625), 622, 1),
    ("vaso-baia1", (328, 300, 390, 352), 348, 1),
    ("vaso-baia2", (310, 438, 378, 494), 492, 1),
    ("recepcao", (646, 652, 1016, 776), 770, 1),
    ("jardineira", (1390, 565, 1630, 716), 712, 1),
    ("frente", (0, 712, ARTE_L, ARTE_A), 5000, 1),
]

# Como cada recorte é separado do chão (lido por referencia-pingou/gerar_recortes.py).
# Aqui as cadeiras e o chão são claros e cinza: o recorte delas é pela FORMA
# (retângulo arredondado), não pela cor. As das estações (escuras) vão pela cor.
MASCARAS = {
    "mesa": {"capsula": [673, 1012, 460, 70, 67], "pe": [632, 500, 1056, 556]},
    "vaso-esquerda": {"vaso": [[68, 336, 106, 376]]},
    "vaso-baixo": {"vaso": [[33, 588, 78, 622]]},
    "vaso-baia1": {"vaso": []},
    "vaso-baia2": {"vaso": []},
    "recepcao": {"rets": [[650, 676, 1012, 772], [782, 660, 855, 694]], "folhas": [910, 655, 990, 770]},
    "jardineira": {"rets": [[1395, 646, 1626, 714]], "folhas": [1390, 565, 1630, 680]},
    "frente": {"rets": [[0, 796, 720, ARTE_A], [935, 796, ARTE_L, ARTE_A],
                        [698, 782, 720, 866], [935, 782, 962, 866],
                        [0, 600, 32, ARTE_A], [1628, 600, ARTE_L, ARTE_A]],
               "entrada": [720, 0, 935, ARTE_A]},
}
for _id, _n, _z, _p, _l, d in DIRETORIAS:
    x1, x2 = d["mesa"]
    MASCARAS["mesa-" + _id] = [[x1, 186, x2, 260]] + d["em_cima"]
    MASCARAS["visitas-" + _id] = [[a, 226, b, 291] for a, b in d["visitas"]]
for i, f in enumerate(FILEIRAS, 1):
    x1, x2, y1, y2 = f["mesa"]
    MASCARAS["fileira-%d" % i] = [[x1, y1, x2, y2 + 2]]

# ---------------------------------------------------------------- assentos
ASSENTOS = []
for x in (716, 844, 970):                    # mesa de reunião: fila de trás, de frente para nós
    ASSENTOS.append({"x": x, "y": 385, "dir": "baixo", "zona": "reuniao",
                     "base": 406, "saida": [x, 342]})
for x in (712, 847, 981):                    # fila da frente: de costas, olhando a mesa
    ASSENTOS.append({"x": x, "y": 566, "dir": "cima", "zona": "reuniao",
                     "base": 596, "saida": [x, 640]})
ASSENTOS.append({"x": 572, "y": 478, "dir": "direita", "zona": "reuniao",
                 "base": 535, "saida": [514, 478]})
ASSENTOS.append({"x": 1114, "y": 478, "dir": "esquerda", "zona": "reuniao",
                 "base": 535, "saida": [1172, 478]})
for _id, _n, _z, _p, _l, d in DIRETORIAS:
    ASSENTOS.append({"x": d["dono"], "y": 193, "dir": "baixo", "base": 202,
                     "saida": [d["corredor"], 212]})
    # a da diretoria 4 se levanta mais perto da cadeira: logo abaixo vem o café
    saida_y = 302 if d.get("sem_diretor") else 310
    for x1, x2 in d["visitas"]:
        meio = (x1 + x2) // 2
        ASSENTOS.append({"x": meio, "y": 273, "dir": "cima", "base": 289, "saida": [meio, saida_y]})
for f in FILEIRAS:
    for (cx1, cx2, cy1, cy2), saida in zip(f["cadeiras"], f["saida_frente"]):
        ASSENTOS.append({"x": (cx1 + cx2) // 2, "y": cy1 + 38, "dir": "cima", "zona": f["zona"],
                         "base": cy2 - 4, "saida": list(saida)})
    for (x, y), saida in zip(f["tras"], f["saida_tras"]):
        ASSENTOS.append({"x": x, "y": y, "dir": "baixo", "zona": f["zona"],
                         "base": y + 10, "saida": list(saida)})
for x in (262, 335):                         # sofá de cima do lounge
    ASSENTOS.append({"x": x, "y": 664, "dir": "baixo", "base": 702, "saida": [408, 714]})
for y, sy in ((718, 742), (762, 770)):       # sofá encostado na parede
    ASSENTOS.append({"x": 88, "y": y, "dir": "direita", "base": y + 14, "saida": [162, sy]})


def montar_padrao(esc) -> None:
    esc.largura, esc.altura = LARGURA, ALTURA
    esc.piso = [["p"] * LARGURA for _ in range(ALTURA)]
    esc.paredes = [[0] * LARGURA for _ in range(ALTURA)]
    esc.objetos = []
    esc.zonas = []
    esc.proximo_id = 1

    for id_, nome, (x1, y1, x2, y2), (px1, px2, py), (lx, ly, lw, lh), d in DIRETORIAS:
        z = {"id": id_, "nome": nome, "sub": "" if d.get("sem_diretor") else "Diretoria",
             "x1": x1, "y1": y1, "x2": x2, "y2": y2, "privada": True, "cor": "#22c55e",
             "porta": {"lado": "baixo", "x": (px1 + px2) // 2 // 32, "y": y2 + 1},
             "porta_px": {"x1": px1, "x2": px2, "y": py},
             "placa_px": {"x": lx, "y": ly, "w": lw, "h": lh, "na_arte": True}}
        if not d.get("sem_diretor"):
            z["dono_nome_fixo"] = nome
        esc.zonas.append(z)
    esc.zonas.append({"id": "reuniao", "nome": "Mesa de reunião", "x1": 16, "y1": 10,
                      "x2": 36, "y2": 19, "privada": True, "cor": "#22c55e",
                      "so_sentado": True, "sem_dono": True, "abre_midia": True,
                      "sem_placa": True})
    for id_, nome, (x1, y1, x2, y2) in ZONAS_BAIAS:
        esc.zonas.append({"id": id_, "nome": nome, "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                          "privada": True, "cor": "#22c55e", "so_sentado": True,
                          "sem_dono": True, "sem_placa": True})
    esc.zonas.append({"id": "salao", "nome": "Salão", "x1": 0, "y1": 0,
                      "x2": LARGURA - 1, "y2": ALTURA - 1,
                      "privada": False, "cor": "#22c55e", "sem_placa": True})

    esc.cenario = {
        "nome": "pingou",
        "fundo": PASTA + "fundo.png?v=%d" % VERSAO,
        "largura": ARTE_L, "altura": ARTE_A,
        "cor_fora": "#0f1412",
        "boneco": 5.0,
        "raio_conversa": 250, "raio_silencio": 330,
        "entrada": [828, 830],
        # a porta de saída: pisar aqui abre "Para onde você quer ir?"
        "saida": [740, 852, 915, ARTE_A],
        "bloqueios": BLOQUEIOS,
        "frentes": [{"nome": n, "img": PASTA + "frente-%s.png?v=%d" % (n, VERSAO),
                     "x": r[0], "y": r[1], "w": r[2] - r[0], "h": r[3] - r[1],
                     "base": b, "alfa": a} for n, r, b, a in FRENTES],
        "assentos": ASSENTOS,
    }
    esc.nascimento = (828 // 32, 830 // 32)
    esc.versao_planta = VERSAO
    esc._recalcular()
