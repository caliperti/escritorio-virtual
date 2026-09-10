"""O editor e o disco: pedido recusado não deixa rastro, desfazer não tira a
sala de ninguém, reiniciar não repete id de sala, e gravar é tudo ou nada.

Roda direto (`python3 backend/testes/edicao.py`). Não sobe servidor: mexe no
mapa e na sala em memória, que é onde a decisão acontece.
"""

import json
import os
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import mapa                                                # noqa: E402
import nuvem                                               # noqa: E402
from contas import nome_limpo                              # noqa: E402
from mapa import Escritorio, MAX_ZONAS, TAMANHO_TILE, escritorio   # noqa: E402
from planta_padrao import VERSAO, montar_padrao            # noqa: E402
from sala import Participante, Sala                        # noqa: E402

falhas, provas = [], 0


def conferir(nome, ok):
    global provas
    provas += 1
    print(("  ok  " if ok else "FALHOU") + "  " + nome)
    if not ok:
        falhas.append(nome)


def pessoa(id_, nome, x, y):
    return Participante(id=id_, nome=nome, cor="#fff", emoji="", x=x, y=y)


print("\n-- pedido recusado não deixa rastro --")
# Uma lista de tiles com um item torto no meio: os de antes ficavam aplicados
# em memória, sem colisão, sem gravar e sem avisar — parede fantasma.
montar_padrao(escritorio)
antes = json.dumps(escritorio.para_json(), sort_keys=True)
# um tile REALMENTE vazio: com móvel em cima, `tile_livre` já seria False por
# causa do móvel e a prova não diria nada sobre a parede fantasma
vx, vy = next((x, y) for y in range(escritorio.altura) for x in range(escritorio.largura)
              if not escritorio.paredes[y][x] and escritorio.tile_livre(x, y))
ok = escritorio.editar({"acao": "parede", "valor": 1, "tiles": [[vx, vy], [6, "x"]]})
conferir("parede com um tile torto no meio é recusada", not ok)
conferir("e o tile de antes NÃO ficou levantado", escritorio.paredes[vy][vx] == 0)
conferir("nem entrou na colisão", escritorio.tile_livre(vx, vy))
# um tile de corredor, achado no mapa: fixar coordenada quebra a cada mudança
# de planta (já quebrou quando o topo virou três diretorias)
cx, cy = next((x, y) for y in range(escritorio.altura) for x in range(escritorio.largura)
              if escritorio.piso[y][x] == "a" and not escritorio.paredes[y][x])
ok = escritorio.editar({"acao": "piso", "piso": "m", "tiles": [[cx, cy], [7, "x"]]})
conferir("piso com tile torto é recusado", not ok)
conferir("e o piso de antes continua", escritorio.piso[cy][cx] == "a")
conferir("o mapa ficou idêntico ao de antes",
         json.dumps(escritorio.para_json(), sort_keys=True) == antes)
ok = escritorio.editar({"acao": "piso", "piso": "m", "tiles": [[cx, cy], [cx + 0.5, cy]]})
conferir("tile com fração é aplicado como inteiro (x.5 vira x)",
         ok and escritorio.piso[cy][cx] == "m")

print("\n-- só edição de verdade entra no histórico --")
montar_padrao(escritorio)
escritorio._historico.clear()
escritorio.editar({"acao": "objeto", "tipo": "planta", "x": 9, "y": 3})
n = len(escritorio.objetos)
for _ in range(mapa.HISTORICO + 5):                # o que um membro conseguia mandar
    escritorio.editar({"acao": "piso", "piso": "NAO_EXISTE", "tiles": [[9, 6]]})
conferir("45 pedidos recusados não entram no histórico", len(escritorio._historico) == 1)
conferir("e o desfazer ainda desfaz a planta",
         escritorio.editar({"acao": "desfazer"}) and len(escritorio.objetos) == n - 1)
conferir("desfazer sem histórico é recusado", not escritorio.editar({"acao": "desfazer"}))

print("\n-- desfazer não tira a sala de ninguém --")
montar_padrao(escritorio)
escritorio._historico.clear()
escritorio.editar({"acao": "objeto", "tipo": "planta", "x": 9, "y": 3})   # foto: sala2 sem dono
escritorio.reivindicar("sala2", "membro", "Membro")
escritorio.trancar("sala2", "membro", True)
escritorio.editar({"acao": "desfazer"})
z = escritorio.zona_por_id("sala2")
conferir("a planta foi desfeita", not any(o["x"] == 9 and o["y"] == 3 for o in escritorio.objetos))
conferir("mas a sala 2 continua do membro", z.get("dono") == "membro" and z.get("dono_nome") == "Membro")
conferir("e continua trancada", z.get("trancada") is True)
escritorio.editar({"acao": "objeto", "tipo": "planta", "x": 9, "y": 3})   # foto: sala2 do membro
escritorio.liberar("sala2", "membro")
escritorio.editar({"acao": "desfazer"})
conferir("sala solta depois da foto continua solta", not escritorio.zona_por_id("sala2").get("dono"))

print("\n-- reiniciar não repete id de sala --")
montar_padrao(escritorio)
escritorio.editar({"acao": "zona", "nome": "Nova A", "x1": 2, "y1": 2, "x2": 4, "y2": 4, "privada": True})
id_a = escritorio.zonas[-1]["id"]
gravado = json.dumps(escritorio.para_json())
conferir("o contador de ids vai para o disco", "proximo_id" in json.loads(gravado))
outro = Escritorio()
outro.de_json(json.loads(gravado))                 # é o que a subida faz
outro.editar({"acao": "zona", "nome": "Nova B", "x1": 10, "y1": 10, "x2": 12, "y2": 12, "privada": True})
conferir("a sala criada depois de reiniciar tem id próprio",
         outro.zonas[-1]["id"] != id_a and len({z["id"] for z in outro.zonas}) == len(outro.zonas))
conferir("e a Nova A continua lá, intacta", outro.zona_por_id(id_a)["nome"] == "Nova A")
velho = json.loads(gravado)
velho.pop("proximo_id")                            # mapa gravado por uma versão sem o contador
outro = Escritorio()
outro.de_json(velho)
outro.editar({"acao": "zona", "nome": "Nova C", "x1": 10, "y1": 10, "x2": 12, "y2": 12})
outro.editar({"acao": "montar_sala", "nome": "Montada", "x1": 1, "y1": 1, "x2": 6, "y2": 6})
conferir("mapa antigo (sem contador) também não repete id, nem pelo montar_sala",
         len({z["id"] for z in outro.zonas}) == len(outro.zonas))

print("\n-- o teto de salas vale para montar_sala --")
montar_padrao(escritorio)
while len(escritorio.zonas) < MAX_ZONAS:
    escritorio.editar({"acao": "zona", "nome": "Z", "x1": 2, "y1": 2, "x2": 3, "y2": 3})
conferir("montar_sala com o teto cheio é recusado", not escritorio.editar(
    {"acao": "montar_sala", "nome": "Extra", "x1": 2, "y1": 2, "x2": 6, "y2": 6}))
conferir("e as paredes dela não ficaram no mapa", escritorio.paredes[2][2] == 0)
s1 = escritorio.zona_por_id("sala1")
conferir("renomear uma sala com o teto cheio continua podendo", escritorio.editar(
    {"acao": "zona", "id": "sala1", "nome": "Sala Um", "x1": s1["x1"], "y1": s1["y1"],
     "x2": s1["x2"], "y2": s1["y2"], "privada": True}) and escritorio.zona_por_id("sala1")["nome"] == "Sala Um")

print("\n-- a planta padrão cabe no que o admin pode pedir --")
# A planta cresceu para 94 colunas e o teto era 90: qualquer redimensionar
# encolhia o escritório e cortava a coluna de salas do leste.
from mapa import LIMITE_LARGURA, LIMITE_ALTURA                  # noqa: E402
from planta_padrao import LARGURA as PL, ALTURA as PA           # noqa: E402
conferir("a planta padrão cabe nos limites do mapa",
         LIMITE_LARGURA[0] <= PL <= LIMITE_LARGURA[1]
         and LIMITE_ALTURA[0] <= PA <= LIMITE_ALTURA[1])

print("\n-- coordenada que não é número --")
conferir("NaN não é chão livre", not escritorio.livre(float("nan"), 100))
conferir("infinito não é chão livre", not escritorio.livre(100, float("inf")))

print("\n-- grade sempre do tamanho declarado --")
montar_padrao(escritorio)
dados = escritorio.para_json()
dados["piso"], dados["paredes"] = dados["piso"][:10], dados["paredes"][:10]
outro = Escritorio()
outro.de_json(dados)
conferir("linhas que faltam no arquivo são completadas",
         len(outro.piso) == outro.altura and len(outro.paredes) == outro.altura)
conferir("e editar a linha que faltava não estoura",
         outro.editar({"acao": "piso", "piso": "m", "tiles": [[5, 30]]}))

print("\n-- o mapa encolheu embaixo de alguém --")
montar_padrao(escritorio)
s = Sala()
longe = pessoa("a", "Longe", 40 * TAMANHO_TILE, 38 * TAMANHO_TILE)
perto = pessoa("b", "Perto", 9 * TAMANHO_TILE, 5 * TAMANHO_TILE)
s.participantes = {"a": longe, "b": perto}
escritorio.editar({"acao": "tamanho", "largura": 20, "altura": 16})
movidos = s.reacomodar()
conferir("quem ficou fora do mapa volta para a entrada",
         movidos == [longe] and s.dentro_do_mapa(longe.x, longe.y))
conferir("quem estava dentro não é mexido", perto.x == 9 * TAMANHO_TILE)
conferir("e de lá consegue andar", s.mover(longe, longe.x + 16, longe.y, "direita"))

print("\n-- nome de gente, uma regra só --")
conferir("e-mail não é nome", nome_limpo("gulisboa5@hotmail.com") == "")
conferir("só espaço invisível não é nome", nome_limpo("​​") == "")
conferir("quebra de linha e tabulação viram espaço", nome_limpo("A\nB\tC") == "A B C")
conferir("número no lugar do texto não é nome", nome_limpo(123) == "")
conferir("nome comum passa inteiro", nome_limpo("  Ana   Paula ") == "Ana Paula")
conferir("corta em 24", len(nome_limpo("A" * 40)) == 24)
s = Sala()
s.participantes = {"a": pessoa("a", "Ana", 0, 0)}
conferir("nome de quem está na sala está em uso", s.nome_em_uso("ana"))
conferir("com letra estrangeira parecida também", s.nome_em_uso("Аna"))     # A cirílico
conferir("a própria pessoa não conta", not s.nome_em_uso("Ana", exceto="a"))

print("\n-- gravar é tudo ou nada --")
pasta = Path(__file__).resolve().parent / ".edicao-tmp"
shutil.rmtree(pasta, ignore_errors=True)
pasta.mkdir()
arq = pasta / "x.json"
nuvem.gravar_atomico(arq, "primeiro")
troca = os.replace


def caiu(*a, **k):
    raise OSError("o processo morreu no meio da gravação")


os.replace = caiu
try:
    nuvem.gravar_atomico(arq, "segundo" * 1000)
except OSError:
    pass
os.replace = troca
conferir("cair no meio da gravação deixa o arquivo de antes inteiro", arq.read_text() == "primeiro")
nuvem.gravar_atomico(arq, "segundo")
conferir("gravação completa troca o conteúdo", arq.read_text() == "segundo")
conferir("e não deixa arquivo temporário para trás", not (pasta / "x.json.novo").exists())

mapa.ARQUIVO = pasta / "mapa.json"
montar_padrao(escritorio)
escritorio.salvar()
inteiro = mapa.ARQUIVO.read_bytes()
mapa.ARQUIVO.write_bytes(inteiro[:len(inteiro) // 2])      # como fica depois de um kill no meio
outro = Escritorio()
outro.carregar()
conferir("mapa cortado na subida vira planta de fábrica", outro.versao_planta == VERSAO)
conferir("e o arquivo cortado fica guardado ao lado, não é apagado",
         (pasta / "mapa.json.ilegivel").read_bytes() == inteiro[:len(inteiro) // 2])
shutil.rmtree(pasta, ignore_errors=True)

print("\n%d provas, %d falharam" % (provas, len(falhas)))
sys.exit(1 if falhas else 0)
