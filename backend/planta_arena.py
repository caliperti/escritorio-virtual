"""A planta da Arena 7 (27/11).

A arte (`static/assets/arena/fundo.png`) é a "Três salas executivas na Arena7"
que o dono mandou (o original está em referencia-arena/arte/arena-original.png;
a primeira versão, com 4 salas, ficou ao lado como arena-4-salas.png). Ela não
tem faixa de título: vai inteira, 1672 x 941. O que ela tem:

    - três diretorias no fundo: a do Lindson ("Crônicas do Futebol"), a do
      Mota e a do Allan. A arte veio sem
      plaquinha; os nomes são pintados por referencia-arena/gerar_recortes.py
      nos cantos livres da parede. A sala fica de quem entra com o nome da
      conta (a do Mota é da conta "Mota Tipster");
    - a mesa oval de reunião para 8 no centro;
    - duas fileiras de estações à esquerda e uma à direita, embaixo do café
      e da vitrine do troféu. Cada fileira é uma BAIA;
    - o sofá curvo no canto de baixo, a recepção na frente da entrada, a
      jardineira grande e as jardineiras da parede da frente.

Formato igual ao da planta_pingou.py. Ao mudar uma medida aqui: rode o gerador
de novo, suba a VERSAO e confira com `?depurar=1` no navegador.
"""

VERSAO = 3

ARTE_L, ARTE_A = 1672, 941
LARGURA, ALTURA = 53, 30
PASTA = "/static/assets/arena/"

# id, nome, tiles da zona, a frente em px (x1, x2, y), a plaquinha (x, y, w, h:
# pintada na arte), e o que tem dentro (como na planta do Pingou), mais o
# aparador encostado na parede e o nome da CONTA que fica com a sala.
DIRETORIAS = [
    # a do Lindson é a sala do "Crônicas do Futebol": nome comprido, plaquinha
    # de uma linha só (acima do quadro tático, sem cobrir a planta)
    ("a-lindson", "Crônicas do Futebol", (3, 5, 17, 10), (90, 560, 345), (232, 52, 176, 27),
     {"mesa": (247, 460), "vaso": (118, 162), "aparador": (167, 277),
      "visitas": [(282, 342), (372, 430)], "dono": 350, "corredor": 510, "conta": "Lindson",
      "em_cima": [[282, 205, 298, 232], [317, 205, 360, 232], [410, 188, 442, 232]]}),
    ("a-mota", "Mota", (18, 5, 33, 10), (585, 1090, 345), (598, 52, 110, 40),
     {"mesa": (730, 945), "vaso": (1018, 1060), "aparador": (617, 732),
      "visitas": [(767, 825), (855, 912)], "dono": 838, "corredor": 985, "conta": "Mota Tipster",
      "em_cima": [[770, 205, 783, 232], [805, 205, 845, 232], [900, 188, 932, 232]]}),
    ("a-allan", "Allan", (34, 5, 49, 10), (1110, 1585, 345), (1302, 52, 84, 40),
     {"mesa": (1260, 1470), "vaso": (1160, 1200), "aparador": (1205, 1297),
      "visitas": [(1292, 1350), (1382, 1440)], "dono": 1360, "corredor": 1527, "conta": "Allan",
      "em_cima": [[1292, 205, 1306, 232], [1325, 205, 1367, 232], [1422, 188, 1455, 232]]}),
]

FILEIRAS = [
    {"zona": "baia1", "mesa": (127, 387, 417, 515),
     "cadeiras": [(167, 220, 455, 530), (287, 340, 455, 530)],
     "saida_frente": [(240, 538), (264, 538)],
     "tras": [(198, 412), (312, 412)], "saida_tras": [(198, 378), (312, 378)]},
    {"zona": "baia2", "mesa": (120, 385, 557, 657),
     "cadeiras": [(162, 215, 597, 675), (285, 337, 597, 675)],
     "saida_frente": [(188, 690), (311, 690)],
     "tras": [(186, 552), (310, 552)], "saida_tras": [(240, 538), (264, 538)]},
    # a da direita: os lugares de trás encostam no café; levantam na faixa
    # estreita entre o balcão e a divisória
    {"zona": "baia3", "mesa": (1282, 1550, 562, 662),
     "cadeiras": [(1330, 1385, 600, 680), (1450, 1505, 600, 680)],
     "saida_frente": [(1305, 694), (1418, 696)],
     "tras": [(1357, 557), (1478, 557)], "saida_tras": [(1357, 549), (1478, 549)]},
]
ZONAS_BAIAS = [("baia1", "Baia 1", (3, 12, 12, 15)), ("baia2", "Baia 2", (3, 17, 12, 19)),
               ("baia3", "Baia 3", (41, 17, 48, 19))]

BLOQUEIOS = [
    # --- o fundo, as paredes das diretorias e os pilares
    {"r": [0, 0, ARTE_L, 212]},
    {"r": [0, 0, 90, 345]},
    {"r": [560, 0, 585, 345]},
    {"r": [1090, 0, 1110, 345]},
    {"r": [1585, 0, ARTE_L, 360]},
    # --- paredes de vidro dos lados
    {"r": [0, 345, 45, ARTE_A]},
    {"r": [1605, 360, ARTE_L, 600]}, {"r": [1622, 600, ARTE_L, ARTE_A]},
    # --- parede da frente, com a entrada aberta entre os pilares (675-971)
    {"r": [0, 878, 675, ARTE_A]},
    {"r": [971, 878, ARTE_L, ARTE_A]},
    # --- o café e a vitrine do troféu
    {"r": [1262, 380, 1510, 537]},
    {"r": [1522, 370, 1597, 545]},
]
for _id, _n, _z, _p, _l, d in DIRETORIAS:
    BLOQUEIOS.append({"r": [d["mesa"][0], 228, d["mesa"][1], 292]})     # mesa de trabalho
    BLOQUEIOS.append({"r": [d["vaso"][0], 212, d["vaso"][1], 248]})     # vaso
    BLOQUEIOS.append({"r": [d["aparador"][0], 212, d["aparador"][1], 245]})
    BLOQUEIOS.append({"r": [d["dono"] - 22, 212, d["dono"] + 22, 226]})  # cadeira do dono
    for x1, x2 in d["visitas"]:
        BLOQUEIOS.append({"r": [x1, 260, x2, 318]})                     # poltronas de visita
for f in FILEIRAS:
    x1, x2, y1, y2 = f["mesa"]
    BLOQUEIOS.append({"r": [x1, y1, x2, y2]})
    for cx1, cx2, cy1, cy2 in f["cadeiras"]:
        BLOQUEIOS.append({"r": [cx1, cy1 + 12, cx2, cy2 - 10]})
BLOQUEIOS += [
    {"r": [73, 445, 119, 486]},                # vaso da baia 1
    {"r": [1362, 722, 1615, 776]},             # jardineira grande da direita
    # --- o canto do sofá: o painel com o estádio, o vaso, o sofá, a mesinha e o pufe
    {"r": [140, 705, 362, 760]},
    {"r": [58, 760, 110, 805]},
    {"r": [105, 772, 392, 833]},
    {"r": [220, 812, 260, 846]},               # a mesinha (o pé dela, não o tampo)
    {"r": [312, 812, 352, 846]},               # o pufe
    # --- recepção
    {"r": [592, 760, 1070, 842]},
    # --- a mesa oval (o chão debaixo do tampo) e as oito cadeiras
    {"c": [636, 1026, 532, 66, 62]},
    {"r": [658, 430, 720, 460]}, {"r": [798, 430, 860, 460]}, {"r": [943, 430, 1007, 460]},
    {"r": [651, 610, 718, 664]}, {"r": [801, 610, 868, 664]}, {"r": [954, 610, 1021, 664]},
    {"r": [504, 500, 563, 586]}, {"r": [1099, 500, 1158, 586]},
]

FRENTES = [
    ("mesa", (565, 440, 1097, 615), 610, 1),
    ("cadeira-tras-1", (646, 386, 731, 462), 449, 1),
    ("cadeira-tras-2", (786, 386, 871, 462), 449, 1),
    ("cadeira-tras-3", (931, 386, 1019, 462), 449, 1),
    ("cadeira-frente-1", (638, 576, 731, 676), 670, 1),
    ("cadeira-frente-2", (788, 576, 881, 676), 670, 1),
    ("cadeira-frente-3", (941, 576, 1034, 676), 670, 1),
    ("cadeira-ponta-esq", (493, 466, 574, 594), 588, 1),
    ("cadeira-ponta-dir", (1088, 466, 1169, 594), 588, 1),
]
for _id, _n, _z, _p, _l, d in DIRETORIAS:
    x1, x2 = d["mesa"]
    FRENTES.append(("mesa-" + _id, (x1 - 5, 160, x2 + 5, 300), 296, 1))
    v = d["visitas"]
    FRENTES.append(("visitas-" + _id, (v[0][0] - 4, 245, v[1][1] + 4, 324), 318, 1))
for i, f in enumerate(FILEIRAS, 1):
    x1, x2, y1, y2 = f["mesa"]
    base = min(y2 + 3, min(c[3] for c in f["cadeiras"]) - 10)
    FRENTES.append(("fileira-%d" % i, (x1 - 5, y1 - 6, x2 + 5, y2 + 5), base, 1))
    for letra, (cx1, cx2, cy1, cy2) in zip("ab", f["cadeiras"]):
        FRENTES.append(("estacao-%d%s" % (i, letra), (cx1 - 4, cy1 - 4, cx2 + 4, cy2 + 4), cy2, 1))
FRENTES += [
    ("vaso-baia1", (55, 400, 140, 490), 486, 1),
    ("recepcao", (588, 700, 1074, 846), 842, 1),
    ("jardineira", (1355, 660, 1620, 780), 776, 1),
    ("frente", (0, 830, ARTE_L, ARTE_A), 5000, 1),
]

MASCARAS = {
    "mesa": {"capsula": [636, 1026, 511, 66, 66], "pe": [595, 568, 1070, 612]},
    "vaso-baia1": {"vaso": [[73, 445, 119, 486]]},
    "recepcao": {"rets": [[592, 734, 1070, 844], [792, 706, 870, 740], [630, 705, 676, 752]],
                 "folhas": [955, 705, 1040, 832]},
    "jardineira": {"rets": [[1362, 722, 1615, 778]], "folhas": [1355, 660, 1620, 735]},
    "frente": {"rets": [[0, 878, 675, ARTE_A], [971, 878, ARTE_L, ARTE_A],
                        [649, 860, 675, 930], [971, 860, 996, 930],
                        [0, 600, 45, ARTE_A], [1622, 600, ARTE_L, ARTE_A]],
               "entrada": [675, 0, 971, ARTE_A]},
}
for _id, _n, _z, _p, _l, d in DIRETORIAS:
    x1, x2 = d["mesa"]
    MASCARAS["mesa-" + _id] = [[x1, 215, x2, 296]] + d["em_cima"]
    MASCARAS["visitas-" + _id] = [[a, 248, b, 320] for a, b in d["visitas"]]
for i, f in enumerate(FILEIRAS, 1):
    x1, x2, y1, y2 = f["mesa"]
    MASCARAS["fileira-%d" % i] = [[x1, y1, x2, y2 + 2]]

ASSENTOS = []
for x in (688, 828, 975):                    # mesa de reunião: fila de trás, de frente para nós
    ASSENTOS.append({"x": x, "y": 430, "dir": "baixo", "zona": "reuniao",
                     "base": 451, "saida": [x, 378]})
for x in (685, 835, 988):                    # fila da frente: de costas, olhando a mesa
    ASSENTOS.append({"x": x, "y": 624, "dir": "cima", "zona": "reuniao",
                     "base": 654, "saida": [x, 698]})
ASSENTOS.append({"x": 533, "y": 530, "dir": "direita", "zona": "reuniao",
                 "base": 590, "saida": [478, 530]})
ASSENTOS.append({"x": 1128, "y": 530, "dir": "esquerda", "zona": "reuniao",
                 "base": 590, "saida": [1186, 530]})
for _id, _n, _z, _p, _l, d in DIRETORIAS:
    ASSENTOS.append({"x": d["dono"], "y": 222, "dir": "baixo", "base": 231,
                     "saida": [d["corredor"], 240]})
    for x1, x2 in d["visitas"]:
        meio = (x1 + x2) // 2
        ASSENTOS.append({"x": meio, "y": 293, "dir": "cima", "base": 309, "saida": [meio, 333]})
for f in FILEIRAS:
    for (cx1, cx2, cy1, cy2), saida in zip(f["cadeiras"], f["saida_frente"]):
        ASSENTOS.append({"x": (cx1 + cx2) // 2, "y": cy1 + 38, "dir": "cima", "zona": f["zona"],
                         "base": cy2 - 4, "saida": list(saida)})
    for (x, y), saida in zip(f["tras"], f["saida_tras"]):
        ASSENTOS.append({"x": x, "y": y, "dir": "baixo", "zona": f["zona"],
                         "base": y + 10, "saida": list(saida)})
# o sofá curvo, de frente para nós
ASSENTOS.append({"x": 165, "y": 795, "dir": "baixo", "base": 830, "saida": [165, 852]})
ASSENTOS.append({"x": 330, "y": 792, "dir": "baixo", "base": 830, "saida": [380, 852]})


def montar_padrao(esc) -> None:
    esc.largura, esc.altura = LARGURA, ALTURA
    esc.piso = [["p"] * LARGURA for _ in range(ALTURA)]
    esc.paredes = [[0] * LARGURA for _ in range(ALTURA)]
    esc.objetos = []
    esc.zonas = []
    esc.proximo_id = 1
    for id_, nome, (x1, y1, x2, y2), (px1, px2, py), (lx, ly, lw, lh), d in DIRETORIAS:
        esc.zonas.append({
            "id": id_, "nome": nome, "sub": "Diretoria",
            "x1": x1, "y1": y1, "x2": x2, "y2": y2, "privada": True, "cor": "#f97316",
            "porta": {"lado": "baixo", "x": (px1 + px2) // 2 // 32, "y": y2 + 1},
            "porta_px": {"x1": px1, "x2": px2, "y": py},
            "placa_px": {"x": lx, "y": ly, "w": lw, "h": lh, "na_arte": True},
            "dono_nome_fixo": d["conta"],
        })
    esc.zonas.append({"id": "reuniao", "nome": "Mesa de reunião", "x1": 16, "y1": 13,
                      "x2": 35, "y2": 19, "privada": True, "cor": "#f97316",
                      "so_sentado": True, "sem_dono": True, "abre_midia": True,
                      "sem_placa": True})
    for id_, nome, (x1, y1, x2, y2) in ZONAS_BAIAS:
        esc.zonas.append({"id": id_, "nome": nome, "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                          "privada": True, "cor": "#f97316", "so_sentado": True,
                          "sem_dono": True, "sem_placa": True})
    esc.zonas.append({"id": "salao", "nome": "Salão", "x1": 0, "y1": 0,
                      "x2": LARGURA - 1, "y2": ALTURA - 1,
                      "privada": False, "cor": "#f97316", "sem_placa": True})
    esc.cenario = {
        "nome": "arena",
        "fundo": PASTA + "fundo.png?v=%d" % VERSAO,
        "largura": ARTE_L, "altura": ARTE_A,
        "cor_fora": "#14110f",
        "boneco": 5.0,
        "raio_conversa": 250, "raio_silencio": 330,
        "entrada": [823, 900],
        # a porta de saída: pisar aqui abre "Para onde você quer ir?"
        "saida": [690, 918, 955, ARTE_A],
        "bloqueios": BLOQUEIOS,
        "frentes": [{"nome": n, "img": PASTA + "frente-%s.png?v=%d" % (n, VERSAO),
                     "x": r[0], "y": r[1], "w": r[2] - r[0], "h": r[3] - r[1],
                     "base": b, "alfa": a} for n, r, b, a in FRENTES],
        "assentos": ASSENTOS,
    }
    esc.nascimento = (823 // 32, 900 // 32)
    esc.versao_planta = VERSAO
    esc._recalcular()
