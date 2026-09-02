"""Peças que todo teste usa.

Os testes moravam em /tmp e sumiam na primeira faxina do sistema. Agora moram
aqui, junto do código que eles testam.

Como rodar (precisa do Playwright; o venv do espião de anúncios já tem):

    ~/espiao-ads/backend/.venv/bin/python backend/testes/fumaca.py
    ~/espiao-ads/backend/.venv/bin/python backend/testes/reconexao.py

Cada um sobe contra o servidor que já estiver de pé (`ENDERECO`, por padrão
o local). Cada execução cria contas novas, com sufixo do relógio, para não
esbarrar em nome repetido.
"""

import asyncio
import os
import time

ENDERECO = os.environ.get("ENDERECO", "http://localhost:8400")
CONVITE = os.environ.get("CONVITE", "escritorio2026")
SUFIXO = str(int(time.time() * 1000) % 1000000)


class Sessao:
    """Um navegador com alguém dentro da sala."""

    def __init__(self, nav, erros):
        self.nav = nav
        self.erros = erros

    async def entrar(self, nome, largura=1200, altura=820):
        ctx = await self.nav.new_context(viewport={"width": largura, "height": altura})
        pg = await ctx.new_page()
        pg.on("pageerror", lambda e: self.erros.append((nome, str(e)[:160])))
        pg.on("console", lambda m: self.erros.append((nome, m.text[:160]))
              if m.type == "error" else None)
        await pg.goto(ENDERECO)
        await asyncio.sleep(1.2)
        await pg.click("#aba-criar")
        await pg.fill("#campo-nome", nome + SUFIXO)
        await pg.fill("#campo-senha", "teste1234")
        await pg.fill("#campo-convite", CONVITE)
        await pg.click("#btn-entrar-mudo")
        await pg.wait_for_function(
            "() => typeof Jogo !== 'undefined' && !!Jogo.eu", timeout=40000)
        await asyncio.sleep(1.2)
        return pg


def conferir(rotulo, valor, esperado=True):
    ok = valor == esperado
    print(("  ok  " if ok else "FALHA ") + rotulo + ":", valor)
    return ok


def fechar(nome, falhas, erros):
    print()
    if erros:
        print("ERROS DE CONSOLE:", erros)
    if falhas or erros:
        print(nome.upper(), "FALHOU —", falhas, "conferência(s) fora do esperado")
        raise SystemExit(1)
    print(nome, "passou")
