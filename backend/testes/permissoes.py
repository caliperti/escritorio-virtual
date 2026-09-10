"""Quem pode editar o quê: admin, dono de sala e membro sem sala.

    ../.venv/bin/python testes/permissoes.py

Não sobe servidor: mexe direto no mapa, que é onde a decisão acontece.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from mapa import escritorio                       # noqa: E402
from planta_padrao import montar_padrao           # noqa: E402

falhas, provas = [], 0


def conferir(nome, ok):
    global provas
    provas += 1
    print(("  ok  " if ok else "FALHOU") + "  " + nome)
    if not ok:
        falhas.append(nome)


montar_padrao(escritorio)
minha = escritorio.zona_por_id("sala1")
outra = escritorio.zona_por_id("sala2")
escritorio.reivindicar("sala1", "dono", "Dono")

dentro = {"acao": "objeto", "tipo": "planta", "x": minha["x1"] + 1, "y": minha["y1"] + 1}
fora = {"acao": "objeto", "tipo": "planta", "x": outra["x1"] + 1, "y": outra["y1"] + 1}

print("\n-- membro dono da sala --")
conferir("coloca móvel DENTRO da sala dele", escritorio.pode_editar(dentro, "dono", False)[0])
conferir("NÃO coloca na sala do vizinho", not escritorio.pode_editar(fora, "dono", False)[0])
conferir("NÃO levanta parede", not escritorio.pode_editar(
    {"acao": "parede", "valor": 1, "tiles": [[minha["x1"] + 1, minha["y1"] + 1]]}, "dono", False)[0])
conferir("NÃO muda o tamanho do escritório",
         not escritorio.pode_editar({"acao": "tamanho", "largura": 90, "altura": 50}, "dono", False)[0])
conferir("NÃO desfaz o mapa inteiro", not escritorio.pode_editar({"acao": "desfazer"}, "dono", False)[0])
conferir("troca o piso da própria sala", escritorio.pode_editar(
    {"acao": "piso", "piso": "m", "tiles": [[minha["x1"] + 2, minha["y1"] + 2]]}, "dono", False)[0])
conferir("NÃO troca o piso do corredor", not escritorio.pode_editar(
    {"acao": "piso", "piso": "m", "tiles": [[1, 1]]}, "dono", False)[0])

print("\n-- membro sem sala --")
conferir("não coloca nada em lugar nenhum", not escritorio.pode_editar(dentro, "zezinho", False)[0])

print("\n-- admin --")
for acao, nome in [(dentro, "coloca na sala dos outros"), (fora, "coloca em qualquer sala"),
                   ({"acao": "parede", "valor": 1, "tiles": [[5, 5]]}, "levanta parede"),
                   ({"acao": "tamanho", "largura": 90, "altura": 50}, "muda o tamanho"),
                   ({"acao": "desfazer"}, "desfaz"),
                   ({"acao": "zona_remover", "id": "sala2"}, "remove sala")]:
    conferir("admin " + nome, escritorio.pode_editar(acao, "chefe", True)[0])

print("\n-- móvel que atravessa a fronteira --")
# uma mesa de 6 tiles encostada na borda direita da sala escapa para fora
grande = {"acao": "objeto", "tipo": "mesa_ampla", "x": minha["x2"] - 2, "y": minha["y1"] + 1}
conferir("móvel que passa da parede é recusado",
         not escritorio.pode_editar(grande, "dono", False)[0])

print("\n-- a medida bate com o cliente --")
# `medida()` decide em que tiles a edição cai; o cliente (objetos.js) faz a
# mesma conta, e as duas listas têm de ser iguais — senão a prévia mostra um
# lugar e o servidor cobra outro.
import re                                          # noqa: E402
from mapa import EM_PE, FILEIRA                    # noqa: E402
js = (Path(__file__).resolve().parent.parent / "static/objetos.js").read_text(encoding="utf-8")


def lista_js(nome):
    bloco = re.search(nome + r":\s*new Set\(\[(.*?)\]\)", js, re.S).group(1)
    return set(re.findall(r"'([a-z0-9_]+)'", bloco))


conferir("EM_PE igual no servidor e no cliente", lista_js("EM_PE") == EM_PE)
conferir("FILEIRA igual no servidor e no cliente", lista_js("FILEIRA") == FILEIRA)

print("\n-- soltar sala --")
conferir("estranho não solta a sala", not escritorio.liberar("sala1", "zezinho")[0])
conferir("o dono solta", escritorio.liberar("sala1", "dono")[0])

print("\n%d provas, %d falharam" % (provas, len(falhas)))
sys.exit(1 if falhas else 0)
