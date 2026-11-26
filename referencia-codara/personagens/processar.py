"""Transforma a folha de personagem gerada por IA (grade 4x3, fundo verde) no
formato que o escritório usa.

    python3 referencia-codara/personagens/processar.py gustavo "Gustavo" "Gustavo"
                                                    (id)    (nome)   (dono: nome da conta)
Sem o dono, o personagem é livre para qualquer um (o Barbudo).

Entra: referencia-codara/personagens/originais/<id>.png
    colunas: de frente, de costas, virado para a esquerda, virado para a direita
    linhas:  parado, andando, sentado
Sai, em backend/static/assets/personagens/:
    <id>.png          a folha limpa: 4x3 células de CEL_L x CEL_A, fundo
                      transparente, todas as poses na MESMA escala, centradas
                      no corpo e com os pés na linha BASE da célula
    <id>-retrato.png  o rosto (para a lista de pessoas, o chat e as câmeras)
    lista.json/.js    os personagens disponíveis (id, nome, e as medidas)

A IA não acerta a grade ao pixel: cada célula é recortada pelo conteúdo (o que
não é verde), e a escala é decidida pela altura da pose "parado de frente".
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageFilter

RAIZ = Path(__file__).resolve().parents[2]
ORIGEM = RAIZ / "referencia-codara" / "personagens" / "originais"
SAIDA = RAIZ / "backend" / "static" / "assets" / "personagens"

CEL_L, CEL_A = 220, 300          # célula de saída (2x o tamanho no mundo)
BASE = 288                       # linha dos pés dentro da célula
ALTURA_EM_PE = 262               # altura da pose parada de frente, em px da folha


def tirar_verde(img):
    """Fundo verde vira transparente; a borda esverdeada perde o verde."""
    img = img.convert("RGBA")
    px = img.load()
    for y in range(img.size[1]):
        for x in range(img.size[0]):
            r, g, b, _ = px[x, y]
            outro = max(r, b)
            verde = g - outro                     # quanto o verde passa dos outros
            if verde > 90 and g > 120:
                px[x, y] = (0, 0, 0, 0)
            elif verde > 25:
                # meio verde (a borda antialiasada): vai ficando transparente,
                # e o verde que sobra é puxado para o tom vizinho
                a = max(0, min(255, int(255 * (1 - (verde - 25) / 65))))
                px[x, y] = (r, outro, b, a)
    return img


def caixa(img):
    alfa = img.getchannel("A").point(lambda v: 255 if v > 40 else 0)
    return alfa.getbbox()


def main(id_, nome, dono=None):
    SAIDA.mkdir(parents=True, exist_ok=True)
    folha = tirar_verde(Image.open(ORIGEM / ("%s.png" % id_)))
    L, A = folha.size
    cl, ca = L / 4, A / 3
    poses = {}
    for lin in range(3):
        for col in range(4):
            cel = folha.crop((int(col * cl), int(lin * ca), int((col + 1) * cl), int((lin + 1) * ca)))
            bb = caixa(cel)
            if not bb:
                raise SystemExit("célula vazia: linha %d coluna %d" % (lin, col))
            poses[(lin, col)] = cel.crop(bb)

    escala = ALTURA_EM_PE / poses[(0, 0)].size[1]
    saida = Image.new("RGBA", (CEL_L * 4, CEL_A * 3), (0, 0, 0, 0))
    topos = {}
    for (lin, col), p in poses.items():
        w, h = max(1, round(p.size[0] * escala)), max(1, round(p.size[1] * escala))
        if w > CEL_L - 4 or h > BASE - 2:          # pose larga demais: encolhe só ela
            k = min((CEL_L - 4) / w, (BASE - 2) / h)
            w, h = int(w * k), int(h * k)
        p = p.resize((w, h), Image.LANCZOS)
        # centro horizontal: o meio da caixa (de lado, o corpo fica um pouco
        # deslocado da cabeça, mas o meio da caixa é o que parece "no lugar")
        x = col * CEL_L + (CEL_L - w) // 2
        y = lin * CEL_A + BASE - h
        saida.alpha_composite(p, (x, y))
        topos["%d,%d" % (lin, col)] = BASE - h
    saida.save(SAIDA / ("%s.png" % id_), optimize=True)

    # retrato: o rosto da pose parada de frente
    frente = poses[(0, 0)]
    lado = int(frente.size[0] * 0.95)
    rosto = frente.crop(((frente.size[0] - lado) // 2, 0, (frente.size[0] + lado) // 2, lado))
    rosto = rosto.resize((96, 96), Image.LANCZOS)
    fundo = Image.new("RGBA", (96, 96), (42, 36, 48, 255))
    fundo.alpha_composite(rosto)
    fundo.save(SAIDA / ("%s-retrato.png" % id_), optimize=True)

    arq = SAIDA / "lista.json"
    lista = json.loads(arq.read_text()) if arq.exists() else {"personagens": []}
    lista["celula"] = [CEL_L, CEL_A]
    lista["base"] = BASE
    lista["personagens"] = [x for x in lista["personagens"] if x["id"] != id_]
    # "v" muda a cada processamento: o navegador baixa a folha nova em vez de
    # mostrar a que guardou (trocar o boneco de alguém tem de aparecer na hora)
    import time
    item = {"id": id_, "nome": nome, "topos": topos, "v": int(time.time())}
    if dono:
        item["dono"] = dono            # só a conta com esse nome usa (backend/personagens.py)
    lista["personagens"].append(item)
    lista["personagens"].sort(key=lambda x: x["nome"])
    arq.write_text(json.dumps(lista, ensure_ascii=False, indent=1))
    # a mesma lista como script: a página precisa dela ANTES de ler a aparência
    # salva (senão a escolha do personagem some na primeira normalização)
    (SAIDA / "lista.js").write_text("window.PERSONAGENS = %s;\n" % json.dumps(lista, ensure_ascii=False))
    print("ok: %s (%s) — escala %.3f" % (id_, nome, escala))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else sys.argv[1].title(),
         sys.argv[3] if len(sys.argv) > 3 else None)
