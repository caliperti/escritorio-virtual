"""Gera a arte do Pingou a partir da referência (27/11).

    python3 referencia-pingou/gerar_recortes.py

Entra: referencia-pingou/arte/pingou.png (a "Sede tech brasileira em
verde-petróleo e pedra", sem a faixa de título: o original está ao lado, em
pingou-original.png).

Sai, em backend/static/assets/pingou/: fundo.png e os frente-<nome>.png (posições
e bases em backend/planta_pingou.py: FRENTES). E em
referencia-pingou/arte/conferir-recortes.png: os recortes sobre magenta e as
formas que bloqueiam riscadas por cima da arte.

As ferramentas (cor, retângulo, cápsula, folhas) são as do gerador do
Escritório (referencia-codara/gerar_recortes.py). A diferença: aqui o chão é
cinza claro e as cadeiras da mesa e das diretorias também, então elas são
recortadas pela FORMA; as das estações (verde-escuro) vão pela cor.
Precisa do Pillow (o python3 do sistema tem).
"""
import importlib.util
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

RAIZ = Path(__file__).resolve().parent.parent
ARTE = RAIZ / "referencia-pingou" / "arte" / "pingou.png"
SAIDA = RAIZ / "backend" / "static" / "assets" / "pingou"


def _carregar(nome, arquivo):
    spec = importlib.util.spec_from_file_location(nome, arquivo)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


planta = _carregar("planta_pingou", RAIZ / "backend" / "planta_pingou.py")
cod = _carregar("recortes_codara", RAIZ / "referencia-codara" / "gerar_recortes.py")
M = planta.MASCARAS


def eh_chao(h, s, v):
    # o piso do Pingou: granilite cinza claro, quase sem cor
    return s < 0.10 and v > 0.58


def nao_chao(pedaco):
    m = cod.por_cor(pedaco, lambda h, s, v: not eh_chao(h, s, v))
    return cod.fechar(m.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3)), 5)


def forma(tam, origem, rets, raio):
    return cod.retangulos(tam, origem, rets, raio)


def mascara_de(nome, pedaco, origem):
    tam = pedaco.size
    ox, oy = origem
    if nome == "mesa":
        xa, xb, cy, rx, ry = M["mesa"]["capsula"]
        return ImageChops.lighter(cod.capsula(tam, origem, xa, xb, cy, rx, ry),
                                  forma(tam, origem, [M["mesa"]["pe"]], 26))
    if nome.startswith("cadeira"):
        # a poltrona clara: o contorno arredondado do recorte, um pouco para dentro
        return forma(tam, origem, [(ox + 5, oy + 4, ox + tam[0] - 5, oy + tam[1] - 4)], 18)
    if nome.startswith("estacao-"):
        return ImageChops.multiply(nao_chao(pedaco), cod.contorno(tam, origem))
    if nome.startswith("visitas-"):
        return forma(tam, origem, M[nome], 14)
    if nome.startswith("mesa-") or nome.startswith("fileira-"):
        return forma(tam, origem, M[nome], 3)
    if nome.startswith("vaso-"):
        return ImageChops.lighter(cod.folhas(pedaco), forma(tam, origem, M[nome]["vaso"], 4))
    if nome in ("recepcao", "jardineira"):
        m = M[nome]
        verde = ImageChops.multiply(cod.folhas(pedaco), forma(tam, origem, [m["folhas"]], 0))
        return ImageChops.lighter(forma(tam, origem, m["rets"], 0), verde)
    if nome == "frente":
        m = forma(tam, origem, M["frente"]["rets"], 0)
        # as folhas das jardineiras da parede (e não a planta da recepção)
        verde = ImageChops.subtract(cod.folhas(pedaco), forma(tam, origem, [(640, 0, 1020, 790)], 0))
        entrada = forma(tam, origem, [M["frente"]["entrada"]], 0)
        return ImageChops.subtract(ImageChops.lighter(m, verde), entrada)
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
    junto = Image.new("RGB", (planta.ARTE_L, planta.ARTE_A * 2), "black")
    junto.paste(conferir, (0, 0))
    junto.paste(riscos, (0, planta.ARTE_A))
    junto.save(RAIZ / "referencia-pingou" / "arte" / "conferir-recortes.png")
    print("ok:", SAIDA)


if __name__ == "__main__":
    main()
