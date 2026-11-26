"""Personagem 3D e diretoria vinculados à conta (26/11).

    - a conta "Gustavo" entra já com o personagem dela; ninguém mais usa;
    - ninguém fica sem personagem (o boneco de pixel saiu): quem não tem o seu
      fica com um livre (o homem ou a mulher genéricos);
    - a conta "Christian" vira dona da diretoria "Christian" e tranca a porta.

    cd backend
    DADOS_DIR=/pasta/vazia SENHA=teste123 .venv/bin/python -m uvicorn main:app --port 8411 &
    ENDERECO=http://127.0.0.1:8411 CONVITE=teste123 .venv/bin/python testes/personagens.py
"""
import asyncio
import sys

from playwright.async_api import async_playwright

import codara

VIRAR = "(id) => enviar({ tipo: 'perfil', nome: Jogo.eu.nome, cor: Jogo.eu.cor, aparencia: { ...Jogo.eu.aparencia, personagem: id } })"
ok = codara.ok


async def main():
    async with async_playwright() as p:
        nav = await p.chromium.launch()
        g = await codara.entrar(nav, "Gustavo", conta=True)
        ok("a conta Gustavo já entra com o personagem dela",
           await g.evaluate("() => Jogo.eu.aparencia.personagem") == "gustavo")
        v = await codara.entrar(nav, "Fulano", conta=False)
        ok("o visitante entra com um personagem 3D livre",
           await v.evaluate("() => !!Personagens.info(Jogo.eu.aparencia.personagem) && !Personagens.info(Jogo.eu.aparencia.personagem).dono"))
        await v.evaluate(VIRAR, "gustavo")
        await asyncio.sleep(1)
        ok("visitante não consegue usar o personagem do Gustavo",
           await v.evaluate("() => Jogo.eu.aparencia.personagem") != "gustavo")
        vista = await g.evaluate("() => [...Jogo.pessoas.values()].find(p => p.nome === 'Fulano').aparencia.personagem")
        ok("e os outros também não o veem como Gustavo", vista != "gustavo", vista)
        await v.evaluate("() => abrirEditor()")
        await asyncio.sleep(0.4)
        livres = await v.evaluate("() => Personagens.dados.personagens.filter(p => !p.dono).map(p => p.id)")
        ok("na escolha do visitante só aparecem os livres",
           sorted(await v.evaluate("() => Boneco.CATALOGO.personagem")) == sorted(livres))
        await g.evaluate(VIRAR, "barbudo")
        await asyncio.sleep(1)
        ok("o Gustavo pode trocar por um livre", await g.evaluate("() => Jogo.eu.aparencia.personagem") == "barbudo")
        await g.evaluate(VIRAR, "nenhum")
        await asyncio.sleep(1)
        ok("pedir 'nenhum' (o boneco de pixel antigo) volta para o personagem dele",
           await g.evaluate("() => Jogo.eu.aparencia.personagem") == "gustavo")

        c = await codara.entrar(nav, "Christian", conta=True)
        await asyncio.sleep(1)
        dono = await g.evaluate("() => (Jogo.mapa.zonas.find(z => z.id === 'diretoria2') || {}).dono_nome")
        ok("a conta Christian vira dona da diretoria Christian", dono == "Christian", dono)
        await c.evaluate("() => enviar({ tipo: 'sala', acao: 'trancar', id: 'diretoria2' })")
        await asyncio.sleep(1)
        ok("e consegue trancar a porta dela",
           await g.evaluate("() => !!Jogo.mapa.zonas.find(z => z.id === 'diretoria2').trancada"))
        await c.evaluate("() => enviar({ tipo: 'sala', acao: 'trancar', id: 'diretoria1' })")
        await asyncio.sleep(1)
        ok("mas não a do Gustavo", not await g.evaluate("() => !!Jogo.mapa.zonas.find(z => z.id === 'diretoria1').trancada"))
        await nav.close()


if __name__ == "__main__":
    asyncio.run(main())
    print("\n%d provas, %d falharam" % (len(codara.provas), len(codara.falhas)))
    sys.exit(1 if codara.falhas else 0)
