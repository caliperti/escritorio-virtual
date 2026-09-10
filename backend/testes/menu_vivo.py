"""O mapa muda embaixo do editor — e o editor tem de acompanhar.

O que dava errado antes:
  - o menu do móvel era HTML parado no pixel em que nasceu: zoom, andar com o
    teclado ou redimensionar a janela moviam o mapa e o cartão ficava
    apontando para o nada;
  - outra pessoa apagava o móvel do menu aberto e o menu continuava lá;
    "Mover" nele punha um fantasma na mão, e o clique voltava "Edição recusada";
  - outra pessoa apagava o móvel que eu estava ARRASTANDO e o desenho estourava
    — o laço de quadros morria e a tela congelava até o F5;
  - o menu da sala guardava uma cópia da sala de quando abriu: salvar o nome
    desfazia a área que alguém tinha acabado de redesenhar;
  - qualquer mexida no escritório remontava a ferramenta Salas inteira: o
    formulário com o nome já digitado sumia e o "redesenhar área" desligava;
  - peça criada ou apagada no estúdio não chegava ao arsenal aberto: a apagada
    continuava clicável e colocá-la voltava "Edição recusada".

Precisa de duas pessoas: o admin (edita em qualquer lugar) e um membro, que
reivindica uma sala e mexe só dentro dela — é o membro que faz o papel de
"outra pessoa".

    ENDERECO=http://127.0.0.1:8412 ADMIN_SENHA=... .venv/bin/python testes/menu_vivo.py
"""

import asyncio
import base64
import os
import struct
import zlib

from playwright.async_api import async_playwright

from comum import ENDERECO, SUFIXO, Sessao, andar_ate, conferir, fechar

ADMIN = os.environ.get("ADMIN_EMAIL", "gulisboa5@hotmail.com")
SENHA = os.environ.get("ADMIN_SENHA", "")

erros = []
falhas = 0
ESPERA = "() => typeof Jogo !== 'undefined' && !!Jogo.eu"


def c(rotulo, valor, esperado=True):
    global falhas
    if not conferir(rotulo, valor, esperado):
        falhas += 1


def png(lado=8):
    """Um PNG vermelho de 8x8, para o estúdio aceitar a peça."""
    def bloco(tipo, dados):
        return struct.pack(">I", len(dados)) + tipo + dados + struct.pack(">I", zlib.crc32(tipo + dados) & 0xffffffff)
    linhas = b"".join(b"\x00" + bytes([200, 60, 40, 255]) * lado for _ in range(lado))
    return (b"\x89PNG\r\n\x1a\n" + bloco(b"IHDR", struct.pack(">IIBBBBB", lado, lado, 8, 6, 0, 0, 0))
            + bloco(b"IDAT", zlib.compress(linhas)) + bloco(b"IEND", b""))


async def entrar_admin(nav):
    ctx = await nav.new_context(viewport={"width": 1280, "height": 800})
    pg = await ctx.new_page()
    pg.on("pageerror", lambda e: erros.append(("admin", str(e)[:160])))
    pg.on("console", lambda m: erros.append(("admin", m.text[:160])) if m.type == "error" else None)
    await pg.goto(ENDERECO)
    await asyncio.sleep(1.2)
    await pg.fill("#campo-email", ADMIN)
    await pg.fill("#campo-senha", SENHA)
    await pg.evaluate("() => entrar(false)")
    await pg.wait_for_function(ESPERA, timeout=40000)
    await asyncio.sleep(1.2)
    return pg


# Onde está o cartão do menu e onde deveria estar, pela âncora do móvel.
MEDIR_MENU = """(id) => {
  const m = document.querySelector('.menu-movel');
  if (!m) return null;
  const o = Jogo.mapa.objetos.find(x => x.id === id);
  const info = Jogo.mapa.catalogo[o.tipo];
  const med = Objetos.medida(o.tipo, info, o.g);
  const p = Editor._naTela(o.x + med.l / 2, o.y);
  const palco = document.querySelector('.palco').getBoundingClientRect();
  return { esquerda: m.offsetLeft, topo: m.offsetTop, esperadoX: Math.round(p.x - 96), esperadoY: Math.round(p.y - 12),
           dentro: m.offsetLeft >= 0 && m.offsetTop >= 0 && m.offsetLeft + m.offsetWidth <= palco.width + 1
                   && m.offsetTop + m.offsetHeight <= palco.height + 1 };
}"""


async def main():
    async with async_playwright() as p:
        nav = await p.chromium.launch()
        s = Sessao(nav, erros)
        a = await entrar_admin(nav)
        m = await s.entrar("Outro")
        await asyncio.sleep(1.0)
        c("o admin entrou como admin", await a.evaluate("() => Jogo.admin"))

        # o membro pega uma sala livre e planta uma plantinha lá dentro
        sala = await m.evaluate("""() => {
            const z = Jogo.mapa.zonas.find(z => z.privada && z.id !== 'reuniao' && !z.dono_nome);
            return z ? { id: z.id, x: (z.x1 + z.x2 + 1) / 2 * Jogo.tile,
                         y: (z.y1 + z.y2 + 1) / 2 * Jogo.tile } : null; }""")
        c("o membro achou uma sala livre", sala is not None)
        await andar_ate(m, sala["x"], sala["y"])
        await m.evaluate("(id) => enviar({ tipo: 'sala', acao: 'reivindicar', id })", sala["id"])
        await asyncio.sleep(1.2)
        c("e virou dono dela", await m.evaluate("""(id) => {
            const z = Jogo.mapa.zonas.find(z => z.id === id); return !!z && z.dono_nome === Jogo.eu.nome; }""", sala["id"]))
        livres = await m.evaluate("""(id) => {
            const z = Jogo.mapa.zonas.find(z => z.id === id); const out = [];
            for (let y = z.y1; y <= z.y2; y++) for (let x = z.x1; x <= z.x2; x++)
              if (Jogo.mapa.paredes[y][x] != '1' && !Editor.objetoEm(x, y)) out.push([x, y]);
            return out; }""", sala["id"])
        c("tem chão livre na sala do membro", len(livres) >= 4)
        criados = []

        async def plantar(i):
            x, y = livres[i]
            await m.evaluate("([x, y]) => Editor.acao({ acao: 'objeto', tipo: 'planta', x, y, g: 0 })", [x, y])
            await asyncio.sleep(1.0)
            o = await a.evaluate("([x, y]) => Jogo.mapa.objetos.find(o => o.tipo === 'planta' && o.x === x && o.y === y) || null", [x, y])
            if o:
                criados.append(o["id"])
            return o

        # --- 1) o menu acompanha o zoom e a câmera ---
        planta = await plantar(0)
        c("a planta do membro entrou no mapa do admin", bool(planta))
        # o admin vai até perto dela, para o menu abrir no meio da tela
        await andar_ate(a, (planta["x"] + 0.5) * 32, (planta["y"] + 2.5) * 32)
        await a.evaluate("() => definirZoom(1.0)")
        await asyncio.sleep(0.4)
        await a.evaluate("(id) => Editor.abrirMenu(id)", planta["id"])
        await asyncio.sleep(0.3)
        med = await a.evaluate(MEDIR_MENU, planta["id"])
        c("o menu do móvel abre ancorado nele", med and (med["esquerda"], med["topo"]) == (med["esperadoX"], med["esperadoY"]))
        await a.evaluate("() => definirZoom(1.8)")
        await asyncio.sleep(0.4)
        med2 = await a.evaluate(MEDIR_MENU, planta["id"])
        c("depois do zoom o menu continua em cima do móvel",
          med2 and (med2["esquerda"], med2["topo"]) == (med2["esperadoX"], med2["esperadoY"]))
        c("e o cartão se moveu de verdade", med2 and med2["topo"] != med["topo"])
        await a.keyboard.down("a")
        await asyncio.sleep(0.4)
        await a.keyboard.up("a")
        await asyncio.sleep(0.3)
        med3 = await a.evaluate(MEDIR_MENU, planta["id"])
        c("andando com o teclado o menu segue o móvel",
          med3 and (med3["esquerda"], med3["topo"]) == (med3["esperadoX"], med3["esperadoY"]))
        c("e cabe no palco", bool(med3 and med3["dentro"]))

        # --- 2) o outro apaga o móvel do menu aberto ---
        await a.click('.menu-movel [data-fazer="mover"]')
        await asyncio.sleep(0.2)
        c("'Mover' põe o móvel na mão", await a.evaluate("() => !!Editor.movendo"))
        await m.evaluate("(id) => Editor.acao({ acao: 'remover', id })", planta["id"])
        await asyncio.sleep(1.0)
        c("o móvel sumiu do mapa do admin", await a.evaluate("(id) => !Jogo.mapa.objetos.some(o => o.id === id)", planta["id"]))
        c("a mão esvazia sozinha", await a.evaluate("() => Editor.movendo"), None)
        c("a faixa de 'na mão' some", await a.evaluate("() => !document.getElementById('na-mao')"))
        c("e o chat explica", await a.evaluate(
            "() => document.getElementById('mensagens').textContent.includes('removido por outra pessoa')"))
        planta = await plantar(1)
        await a.evaluate("(id) => Editor.abrirMenu(id)", planta["id"])
        await asyncio.sleep(0.3)
        c("menu aberto na segunda planta", await a.evaluate("() => !!document.querySelector('.menu-movel')"))
        await m.evaluate("(id) => Editor.acao({ acao: 'remover', id })", planta["id"])
        await asyncio.sleep(1.0)
        c("o menu de um móvel apagado fecha sozinho", await a.evaluate("() => !document.querySelector('.menu-movel')"))
        c("e nada fica selecionado", await a.evaluate("() => Editor.selecionado"), None)

        # --- 3) o outro apaga o móvel que eu estou ARRASTANDO ---
        planta = await plantar(2)
        await a.evaluate("() => { Editor.alternar(); Editor.usarFerramenta('mobilia'); Editor.tipoSel = 'mesa'; }")
        await asyncio.sleep(0.5)
        await a.evaluate("""(o) => { const t = Jogo.tile;
            Editor.aoApontar({ button: 0 }, { x: (o.x + .5) * t, y: (o.y + .5) * t });
            Editor.aoMover({ x: (o.x + 1.5) * t, y: (o.y + .5) * t }); }""", planta)
        c("o admin está arrastando a planta", await a.evaluate("() => !!Editor.arrasto"))
        await a.evaluate("() => { window.__quadros = 0; const orig = desenhar; desenhar = () => { window.__quadros++; orig(); }; }")
        await m.evaluate("(id) => Editor.acao({ acao: 'remover', id })", planta["id"])
        await asyncio.sleep(1.0)
        q1 = await a.evaluate("() => window.__quadros")
        await asyncio.sleep(1.0)
        q2 = await a.evaluate("() => window.__quadros")
        c("o arrasto é solto quando o móvel some", await a.evaluate("() => Editor.arrasto"), None)
        c("o desenho continua (quadros no último segundo: %d)" % (q2 - q1), q2 - q1 > 20)
        c("sem erro de página", [e for e in erros if e[0] == "admin"], [])
        await a.evaluate("() => Editor.aoSoltar()")

        # --- 4) menu da sala: o mapa muda, o salvar respeita a mudança ---
        z = await a.evaluate("() => Jogo.mapa.zonas.find(z => z.x2 - z.x1 > 3 && z.y2 - z.y1 > 3)")
        await a.evaluate("(id) => Editor.abrirMenuSala(id)", z["id"])
        await asyncio.sleep(0.3)
        c("o menu da sala abriu", await a.evaluate("() => !!document.querySelector('.menu-sala')"))
        # a área muda enquanto o menu está aberto (é o que outra pessoa faria)
        await a.evaluate("(z) => Editor.acao({ acao: 'zona', ...z, y2: z.y2 - 1 })", z)
        await asyncio.sleep(1.0)
        c("a área nova chegou", await a.evaluate("(id) => Jogo.mapa.zonas.find(x => x.id === id).y2", z["id"]), z["y2"] - 1)
        c("o menu continua aberto", await a.evaluate("() => !!document.querySelector('.menu-sala')"))
        await a.fill("#sala-menu-nome", z["nome"])
        await a.click('.menu-sala [data-fazer="salvar"]')
        await asyncio.sleep(1.0)
        c("salvar o nome NÃO desfaz a área nova",
          await a.evaluate("(id) => Jogo.mapa.zonas.find(x => x.id === id).y2", z["id"]), z["y2"] - 1)
        await a.evaluate("(z) => Editor.acao({ acao: 'zona', ...z })", z)     # devolve a área
        await asyncio.sleep(0.8)

        # --- 5) formulário de sala e "redesenhar" sobrevivem a uma mexida alheia ---
        await a.evaluate("() => Editor.usarFerramenta('sala')")
        await asyncio.sleep(0.4)
        await a.click("#editor .sala-item .nome")
        await asyncio.sleep(0.3)
        await a.fill("#sala-nome", "Digitando aqui")
        planta = await plantar(3)
        c("o membro mexeu no escritório nesse meio-tempo", bool(planta))
        c("o formulário de sala continua na tela", await a.evaluate("() => !!document.querySelector('.sala-form')"))
        c("com o que foi digitado", await a.evaluate("() => document.getElementById('sala-nome').value"), "Digitando aqui")
        await a.click("#sala-cancelar")
        await a.evaluate("(id) => { Editor.redesenhando = id; }", z["id"])
        await m.evaluate("(id) => Editor.acao({ acao: 'remover', id })", planta["id"])
        await asyncio.sleep(1.0)
        c("o 'redesenhar área' continua ligado", await a.evaluate("() => Editor.redesenhando"), z["id"])
        c("e a lista de salas foi atualizada por baixo", await a.evaluate("() => document.querySelectorAll('#editor .sala-item').length") > 0)

        # --- 6) estúdio: peça nova entra no arsenal aberto, apagada sai ---
        await a.evaluate("() => Editor.usarFerramenta('mobilia')")
        await asyncio.sleep(0.6)
        n0 = await a.evaluate("() => document.querySelectorAll('#arsenal-corpo .peca').length")
        nome = "Peça Prova " + SUFIXO
        r = await a.evaluate("""async ([b64, nome]) => {
            const bin = atob(b64); const arr = Uint8Array.from(bin, ch => ch.charCodeAt(0));
            const fd = new FormData();
            fd.append('token', localStorage.getItem('escritorio:token') || '');
            fd.append('imagem', new Blob([arr], { type: 'image/png' }), 'peca.png');
            fd.append('nome', nome); fd.append('grupo', 'Decoração'); fd.append('largura', '1');
            fd.append('altura', '1'); fd.append('bloqueia', '1'); fd.append('camada', 'chao');
            return await (await fetch('/estudio/peca', { method: 'POST', body: fd })).json(); }""",
            [base64.b64encode(png()).decode(), nome])
        c("o estúdio criou a peça", bool(r and r.get("peca")))
        await asyncio.sleep(1.2)
        c("a peça nova aparece no arsenal aberto (%d -> %d)" % (n0, n0 + 1),
          await a.evaluate("() => document.querySelectorAll('#arsenal-corpo .peca').length"), n0 + 1)
        await a.evaluate("(n) => [...document.querySelectorAll('#arsenal-corpo .peca .escolher')].find(b => b.textContent.includes(n)).click()", nome)
        tipo = await a.evaluate("() => Editor.tipoSel")
        c("dá para escolher a peça nova", tipo == r["peca"]["id"] if r and r.get("peca") else False)
        await a.evaluate("""async (id) => (await fetch('/estudio/remover', { method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: localStorage.getItem('escritorio:token') || '', id, roupa: 0 }) })).json()""", tipo)
        await asyncio.sleep(1.2)
        c("a peça apagada some do arsenal aberto",
          await a.evaluate("() => document.querySelectorAll('#arsenal-corpo .peca').length"), n0)
        c("e não continua escolhida", await a.evaluate("() => Editor.tipoSel") != tipo)
        await a.evaluate("() => Editor.alternar()")

        # limpeza: o membro tira o que plantou e solta a sala
        await m.evaluate("(ids) => { for (const id of ids) if (Jogo.mapa.objetos.some(o => o.id === id)) Editor.acao({ acao: 'remover', id }); }", criados)
        await asyncio.sleep(1.0)
        await m.evaluate("(id) => enviar({ tipo: 'sala', acao: 'liberar', id })", sala["id"])
        await asyncio.sleep(0.8)
        await nav.close()
    fechar("menu_vivo", falhas, erros)


asyncio.run(main())
