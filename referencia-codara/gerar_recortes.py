"""Gera a arte do escritório da Codara a partir da referência limpa.

    python3 referencia-codara/gerar_recortes.py

Entra: referencia-codara/arte/sede-maior.png (a "Sede virtual Codara Labs em
corte" que o dono mandou em 26/11, sem a faixa de título: o original está em
sede-maior-original.png). A versão anterior, do salão de 1264 x 848, usava a
salao-8-com-3-portas.png e está em referencia-codara/backup/gerar_recortes-8-lugares.py.

Sai, em backend/static/assets/codara/:
    fundo.png          a arte inteira (piso, paredes, móveis)
    frente-<nome>.png  os recortes que ficam NA FRENTE de quem passa atrás
                       (posições e bases em backend/planta_padrao.py: FRENTES)
    marca-codara.png / logo-codara.png
E em referencia-codara/arte/conferir-recortes.png: os recortes sobre magenta e as
formas que bloqueiam riscadas por cima da arte, para conferir no olho.

Precisa do Pillow (o python3 do sistema tem).
"""
import colorsys
import importlib.util
import shutil
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

RAIZ = Path(__file__).resolve().parent.parent
ARTE = RAIZ / "referencia-codara" / "arte" / "sede-maior.png"
SAIDA = RAIZ / "backend" / "static" / "assets" / "codara"

spec = importlib.util.spec_from_file_location("planta", RAIZ / "backend" / "planta_padrao.py")
planta = importlib.util.module_from_spec(spec)
spec.loader.exec_module(planta)


def mascara_vazia(tam):
    return Image.new("L", tam, 0)


def por_cor(img, teste):
    """Máscara dos pixels em que teste(h, s, v) é verdadeiro (h em graus)."""
    m = Image.new("L", img.size, 0)
    px, mp = img.load(), m.load()
    for y in range(img.size[1]):
        for x in range(img.size[0]):
            r, g, b = px[x, y][:3]
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if teste(h * 360, s, v):
                mp[x, y] = 255
    return m


def fechar(m, n=5):
    """Fecha buraquinhos (reflexo no couro da cadeira, folha mais clara)."""
    return m.filter(ImageFilter.MaxFilter(n)).filter(ImageFilter.MinFilter(n))


def retangulos(tam, origem, rets, raio=0):
    m = mascara_vazia(tam)
    d = ImageDraw.Draw(m)
    ox, oy = origem
    for x1, y1, x2, y2 in rets:
        d.rounded_rectangle((x1 - ox, y1 - oy, x2 - ox, y2 - oy), radius=raio, fill=255)
    return m


def capsula(tam, origem, xa, xb, cy, rx, ry):
    m = mascara_vazia(tam)
    mp = m.load()
    ox, oy = origem
    for y in range(tam[1]):
        for x in range(tam[0]):
            wx, wy = x + ox, y + oy
            dx = wx - xa if wx < xa else (wx - xb if wx > xb else 0)
            if (dx / rx) ** 2 + ((wy - cy) / ry) ** 2 <= 1:
                mp[x, y] = 255
    return m


def folhas(pedaco):
    return fechar(por_cor(pedaco, lambda h, s, v: 38 <= h <= 115 and s > 0.28 and v > 0.06), 3)


def escuro(pedaco):
    # cadeira: grafite escuro e pouco saturado. Piso é mais claro, tampo é
    # saturado, sombra no chão fica entre os dois e fica de fora.
    return fechar(por_cor(pedaco, lambda h, s, v: v < 0.33 and s < 0.6), 5)


def eh_chao(h, s, v):
    # o piso da sede: mármore rosado (h 15-25, s 0.33-0.48, v 0.55-0.72)
    return 10 <= h <= 30 and 0.26 <= s <= 0.53 and v >= 0.5


def nao_chao(pedaco):
    m = por_cor(pedaco, lambda h, s, v: not eh_chao(h, s, v))
    # tira pontinhos soltos (veio do mármore) e fecha buraquinhos
    return fechar(m.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3)), 5)


M = planta.MASCARAS
DONO_DAS_VISITAS = {"visitas-gustavo": 0, "visitas-christian": 1, "visitas-felipe": 2}


def contorno(tam, origem):
    """O retângulo do próprio recorte, arredondado (o formato de uma cadeira)."""
    ox, oy = origem
    return retangulos(tam, origem, [(ox + 3, oy + 3, ox + tam[0] - 3, oy + tam[1] - 3)], 12)


def mascara_de(nome, pedaco, origem):
    """As máscaras vêm de planta_padrao.py (MASCARAS, DIRETORIAS e FILEIRAS)."""
    tam = pedaco.size
    ox, oy = origem
    if nome == "mesa":
        m = M["mesa"]
        xa, xb, cy, rx, ry = m["capsula"]
        tampo = capsula(tam, origem, xa, xb, cy, rx, ry)
        pe = retangulos(tam, origem, [m["pe"]], raio=26)
        forma = ImageChops.lighter(tampo, pe)
        # nas pontas a forma pega um pouco de chão
        chao = por_cor(pedaco, eh_chao)
        # o corte do chão vale só na beirada: o miolo do tampo fica inteiro (o
        # logo roxo e o caderno também são claros)
        miolo = capsula(tam, origem, xa, xb, cy, rx - 16, ry - 14)
        # o que é claro e cinza EM CIMA da mesa fica: o vaso, o notebook, o caderno
        objetos = retangulos(tam, origem, m["objetos"], 6)
        return ImageChops.lighter(ImageChops.lighter(ImageChops.subtract(forma, chao), miolo),
                                  ImageChops.multiply(forma, objetos))
    if nome.startswith("cadeira"):
        m = ImageChops.multiply(escuro(pedaco), contorno(tam, origem))
        if nome.startswith("cadeira-frente"):
            # a cadeira da frente encosta no pé da mesa (também escuro): o que
            # fica ACIMA do encosto é pé da mesa, não cadeira
            m = ImageChops.subtract(m, retangulos(tam, origem, [(ox, oy, ox + tam[0], 529)]))
        return m
    if nome.startswith("estacao-"):
        # a cadeira da estação fica na frente do painel da mesa, da mesma cor:
        # vale o contorno da cadeira (o que não é chão dentro dele)
        return ImageChops.multiply(nao_chao(pedaco), contorno(tam, origem))
    if nome.startswith("fileira-"):
        return nao_chao(pedaco)
    if nome in DONO_DAS_VISITAS:
        d = planta.DIRETORIAS[DONO_DAS_VISITAS[nome]][5]
        rets = [(x1 - 2, 228, x2 + 2, 287) for x1, x2 in d["visitas"]]
        return ImageChops.multiply(nao_chao(pedaco), retangulos(tam, origem, rets, 10))
    if nome.startswith("vaso-"):
        return ImageChops.lighter(folhas(pedaco), retangulos(tam, origem, M[nome]["vaso"], 4))
    if nome in ("recepcao", "jardineira"):
        m = M[nome]
        verde = ImageChops.multiply(folhas(pedaco), retangulos(tam, origem, [m["folhas"]]))
        return ImageChops.lighter(retangulos(tam, origem, m["rets"]), verde)
    if nome == "frente":
        m = retangulos(tam, origem, M["frente"]["rets"])
        # as folhas das jardineiras da parede (e não a planta da recepção)
        verde = ImageChops.subtract(folhas(pedaco), retangulos(tam, origem, [(640, 0, 1020, 790)]))
        entrada = retangulos(tam, origem, [M["frente"]["entrada"]])
        return ImageChops.subtract(ImageChops.lighter(m, verde), entrada)
    if isinstance(M.get(nome), list):
        return retangulos(tam, origem, M[nome])
    raise ValueError(nome)


def main():
    SAIDA.mkdir(parents=True, exist_ok=True)
    arte = Image.open(ARTE).convert("RGB")
    assert arte.size == (planta.ARTE_L, planta.ARTE_A), arte.size
    arte.save(SAIDA / "fundo.png", optimize=True)

    conferir = Image.new("RGB", arte.size, (255, 0, 255))
    for nome, (x1, y1, x2, y2), base, alfa in planta.FRENTES:
        pedaco = arte.crop((x1, y1, x2, y2))
        m = mascara_de(nome, pedaco, (x1, y1)).filter(ImageFilter.GaussianBlur(0.7))
        if alfa < 1:
            m = m.point(lambda v: int(v * alfa))
        rgba = pedaco.convert("RGBA")
        rgba.putalpha(m)
        rgba.save(SAIDA / ("frente-%s.png" % nome), optimize=True)
        conferir.paste(pedaco, (x1, y1), m)
        print("frente-%s.png  %dx%d  base %d" % (nome, x2 - x1, y2 - y1, base))

    # as formas que bloqueiam, riscadas por cima da arte
    riscos = arte.copy()
    d = ImageDraw.Draw(riscos)
    for f in planta.BLOQUEIOS:
        if "r" in f:
            d.rectangle(f["r"], outline=(0, 255, 255), width=2)
        else:
            xa, xb, cy, rx, ry = f["c"]
            d.ellipse((xa - rx, cy - ry, xa + rx, cy + ry), outline=(0, 255, 255), width=2)
            d.ellipse((xb - rx, cy - ry, xb + rx, cy + ry), outline=(0, 255, 255), width=2)
            d.line((xa, cy - ry, xb, cy - ry), fill=(0, 255, 255), width=2)
            d.line((xa, cy + ry, xb, cy + ry), fill=(0, 255, 255), width=2)
    for a in planta.ASSENTOS:
        d.ellipse((a["x"] - 5, a["y"] - 5, a["x"] + 5, a["y"] + 5), fill=(255, 220, 0))
        d.line((a["x"], a["y"], a["saida"][0], a["saida"][1]), fill=(255, 220, 0), width=1)
    ex, ey = planta.ARTE_L, planta.ARTE_A
    junto = Image.new("RGB", (ex, ey * 2), "black")
    junto.paste(conferir, (0, 0))
    junto.paste(riscos, (0, ey))
    junto.save(RAIZ / "referencia-codara" / "arte" / "conferir-recortes.png")

    for nome in ("marca-codara.png", "logo-codara.png"):
        shutil.copy(RAIZ / "referencia-codara" / nome, SAIDA / nome)
    print("ok:", SAIDA)


if __name__ == "__main__":
    main()
