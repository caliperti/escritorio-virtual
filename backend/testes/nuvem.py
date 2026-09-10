"""O espelho na nuvem: nada se perde no meio do envio, falha tenta de novo, e
o estúdio (catálogo + figuras) vai e volta inteiro.

    ../.venv/bin/python testes/nuvem.py

Não fala com o GitHub: a API é um dicionário de mentira, com as manias da de
verdade (arquivo acima de 1 MB volta sem corpo e precisa do blob).
"""

import asyncio
import base64
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import nuvem                                   # noqa: E402
import estudio as mod_estudio                  # noqa: E402
from estudio import Estudio                    # noqa: E402

falhas, provas = [], 0


def conferir(nome, ok):
    global provas
    provas += 1
    print(("  ok  " if ok else "FALHOU") + "  " + nome)
    if not ok:
        falhas.append(nome)


pasta = Path(__file__).resolve().parent / ".nuvem-tmp"
shutil.rmtree(pasta, ignore_errors=True)
pasta.mkdir()

nuvem.ligado = True
nuvem.TOKEN, nuvem.REPO = "t", "x/y"
nuvem.ESPERA = 0.05
nuvem.ASSETS = pasta / "assets"
mod_estudio.ARQUIVO = pasta / "pecas.json"
mod_estudio.PASTA_IMAGENS = pasta / "assets" / "pecas"
mod_estudio.PASTA_ROUPAS = pasta / "assets" / "lpc"
mod_estudio.PASTA_ROUPAS.mkdir(parents=True)

repo, blobs = {}, {}
lento = {"s": 0.0}
falhar = {"put": 0}
chamadas = []


def api_de_mentira(metodo, caminho, corpo=None, cru=""):
    chamadas.append((metodo, caminho or cru))
    if cru.startswith("git/blobs/"):
        return {"content": base64.b64encode(blobs[cru[len("git/blobs/"):]]).decode(),
                "encoding": "base64"}
    if cru:
        return {"object": {"sha": "abc"}}
    if metodo == "GET":
        if caminho not in repo:
            raise Exception("404")
        conteudo = repo[caminho]
        if len(conteudo) > 1024 * 1024:       # a API de verdade: acima de 1 MB o corpo vem vazio
            blobs[caminho] = conteudo
            return {"content": "", "encoding": "none", "size": len(conteudo), "sha": caminho}
        return {"content": base64.b64encode(conteudo).decode(), "sha": "s"}
    if metodo == "PUT":
        time.sleep(lento["s"])
        if falhar["put"] > 0:
            falhar["put"] -= 1
            raise Exception("502 Bad Gateway")
        repo[caminho] = base64.b64decode(corpo["content"])
        return {"content": {"sha": "s"}}
    if metodo == "DELETE":
        repo.pop(caminho, None)
        return {}
    raise Exception("método desconhecido " + metodo)


nuvem._requisitar = api_de_mentira
A = pasta / "mapa.json"


async def esperar_sossegar(limite=5):
    fim = time.time() + limite
    while time.time() < fim and (nuvem._pendentes or nuvem._apagados or
                                 (nuvem._tarefa and not nuvem._tarefa.done())):
        await asyncio.sleep(0.05)


async def principal():
    print("\n-- mudança feita DURANTE o envio --")
    A.write_text("v1")
    nuvem.marcar(A)
    await esperar_sossegar()
    conferir("a primeira versão sobe", repo.get("estado/mapa.json") == b"v1")
    lento["s"] = 0.4
    A.write_text("v2")
    nuvem.marcar(A)
    await asyncio.sleep(0.2)                  # o laço acordou e está no meio do PUT lento
    A.write_text("v3")
    nuvem.marcar(A)                           # muda de novo enquanto envia
    lento["s"] = 0
    await esperar_sossegar()
    conferir("a mudança feita durante o envio também sobe, sozinha",
             repo.get("estado/mapa.json") == b"v3")
    conferir("e não fica nada pendente sem tarefa",
             not nuvem._pendentes and (nuvem._tarefa is None or nuvem._tarefa.done()))

    print("\n-- a API falha e volta --")
    falhar["put"] = 2
    A.write_text("v4")
    nuvem.marcar(A)
    await esperar_sossegar(8)
    conferir("depois de duas falhas seguidas, a mudança chega mesmo assim",
             repo.get("estado/mapa.json") == b"v4")

    print("\n-- o estúdio vai inteiro: catálogo e figuras --")
    est = Estudio()
    est.carregar()
    png = b"\x89PNG\r\n\x1a\n" + b"\0" * 100
    peca, _ = est.criar_peca(png, "Quadro da firma", "Decoração", 2, 1, False, "chao")
    grande = b"\x89PNG\r\n\x1a\n" + b"\1" * (1024 * 1024 + 10)      # acima do que a API devolve inline
    peca2, _ = est.criar_peca(grande, "Painel enorme", "Decoração", 3, 2, True, "chao")
    for arq in [mod_estudio.ARQUIVO] + est.arquivos_de_imagem():   # o que main.py marca
        nuvem.marcar(arq)
    await esperar_sossegar()
    conferir("o catálogo do estúdio sobe", "estado/pecas.json" in repo)
    figura = "estado/assets/pecas/%s.png" % peca["id"]
    conferir("a figura da peça sobe numa subpasta própria", repo.get(figura) == png)
    # o disco some (Render hibernou): apaga tudo e restaura como a subida faz
    shutil.rmtree(pasta / "assets")
    mod_estudio.ARQUIVO.unlink()
    nuvem.restaurar([mod_estudio.ARQUIVO])
    de_volta = Estudio()
    de_volta.carregar()
    conferir("o catálogo volta do espelho", set(de_volta.pecas) == {peca["id"], peca2["id"]})
    nuvem.restaurar([a for a in de_volta.arquivos_de_imagem() if not a.exists()])
    conferir("a figura volta com os mesmos bytes",
             de_volta.arquivo_da_peca(peca["id"]).read_bytes() == png)
    conferir("figura acima de 1 MB volta pelo blob, inteira",
             de_volta.arquivo_da_peca(peca2["id"]).read_bytes() == grande)

    print("\n-- remover também chega ao espelho --")
    removidos = de_volta.remover_peca(peca["id"])
    nuvem.marcar(mod_estudio.ARQUIVO)
    for arq in removidos:
        nuvem.marcar_apagado(arq)
    await esperar_sossegar()
    conferir("a figura da peça removida sai do repositório", figura not in repo)
    conferir("e o catálogo lá em cima já não tem a peça",
             peca["id"] not in repo["estado/pecas.json"].decode())


asyncio.run(principal())

print("\n-- a subida restaura o estúdio --")
fonte = (Path(__file__).resolve().parent.parent / "main.py").read_text(encoding="utf-8")
conferir("main.py pede o pecas.json na subida", "mod_estudio.ARQUIVO]" in fonte.split("contas.carregar()")[0])
conferir("e as figuras que faltarem", "estudio.arquivos_de_imagem()" in fonte)

shutil.rmtree(pasta, ignore_errors=True)
print("\n%d provas, %d falharam" % (provas, len(falhas)))
sys.exit(1 if falhas else 0)
