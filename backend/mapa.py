"""O escritório: piso, paredes, móveis e salas — e como isso é editado ao vivo.

Antes a planta era um desenho fixo em ASCII. Agora o mapa é um documento com
camadas, editável dentro do próprio app (como o Mapmaker do Gather) e salvo em
`mapa.json`:

    piso      grade de caracteres (tipo de piso por tile)
    paredes   grade de 0/1
    objetos   lista de móveis posicionados em tiles
    zonas     retângulos que viram salas (as 🔒 privadas fecham o áudio)

O CATALOGO manda no tamanho e no bloqueio de cada móvel; o desenho de cada um
vive no cliente (`static/objetos.js`). É de propósito: o servidor precisa saber
o que ocupa espaço, não o que é bonito.
"""

import json
import logging
import math
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import nuvem
from planta_padrao import VERSAO as VERSAO_PLANTA, montar_padrao

log = logging.getLogger("escritorio.mapa")

TAMANHO_TILE = 32
RAIO_AVATAR = 11
ARQUIVO = Path(__file__).parent / "mapa.json"

# Teto do escritório. A planta padrão já usa 94 de largura (três diretorias
# lado a lado, com jardim dos dois lados): com o teto em 90, qualquer
# redimensionar do admin ENCOLHIA o mapa e cortava a coluna leste.
LIMITE_LARGURA = (20, 120)
LIMITE_ALTURA = (16, 80)
MAX_OBJETOS = 1200
MAX_ZONAS = 40
HISTORICO = 40                      # quantos passos de desfazer guardamos

PISOS = {
    "m": "Madeira", "c": "Carpete", "a": "Azulejo", "p": "Concreto", "g": "Grama",
    "l": "Carpete lilás", "z": "Carpete azul", "v": "Carpete menta", "r": "Carpete rosa",
}

# grupo, nome, largura, altura, bloqueia, camada
CATALOGO: Dict[str, Dict] = {}


def _item(id_: str, grupo: str, nome: str, l: int, a: int, bloqueia: bool, camada: str = "chao"):
    CATALOGO[id_] = {"grupo": grupo, "nome": nome, "l": l, "a": a,
                     "bloqueia": bloqueia, "camada": camada}


# ---- mesas ----
_item("mesa", "Mesas", "Mesa", 2, 1, True)
_item("mesa_grande", "Mesas", "Mesa grande", 4, 2, True)
_item("mesa_ampla", "Mesas", "Mesa ampla", 6, 2, True)
_item("mesa_canto", "Mesas", "Mesa de canto", 2, 2, True)
_item("mesa_redonda", "Mesas", "Mesa redonda", 2, 2, True)
_item("mesa_reuniao", "Mesas", "Mesa de reunião", 6, 2, True)
_item("balcao", "Mesas", "Balcão", 3, 1, True)
_item("mesa_centro", "Mesas", "Mesa de centro", 2, 1, True)
# ---- assentos ----
_item("cadeira", "Assentos", "Cadeira de escritório", 1, 1, False)
_item("cadeira_gamer", "Assentos", "Cadeira gamer", 1, 1, False)
_item("poltrona", "Assentos", "Poltrona", 1, 1, True)
_item("sofa", "Assentos", "Sofá", 3, 1, True)
_item("banqueta", "Assentos", "Banqueta", 1, 1, False)
# ---- sala ----
_item("planta", "Sala", "Planta", 1, 1, True)
_item("planta_alta", "Sala", "Planta alta", 1, 2, True)
_item("estante", "Sala", "Estante", 2, 1, True)
_item("armario", "Sala", "Armário", 1, 1, True)
_item("aparador", "Sala", "Aparador", 2, 1, True)
_item("divisoria", "Sala", "Divisória", 1, 1, True)   # separa as baias
_item("quadro", "Sala", "Quadro branco", 3, 1, True)
_item("tv", "Sala", "TV", 2, 1, True)
_item("tapete", "Sala", "Tapete", 3, 2, False, "piso")
_item("tapete_redondo", "Sala", "Tapete redondo", 2, 2, False, "piso")
_item("luminaria", "Sala", "Luminária", 1, 1, True)
_item("narguile", "Sala", "Narguilé", 1, 2, True)      # alto: ocupa dois tiles
_item("arvore", "Externo", "Árvore", 2, 2, True)
_item("arbusto", "Externo", "Arbusto", 1, 1, True)
_item("banco", "Externo", "Banco de praça", 2, 1, True)
# janela vai na camada de cima para poder ficar em cima da parede
_item("janela", "Sala", "Janela", 2, 1, False, "mesa")
_item("relogio", "Sala", "Relógio", 1, 1, True)
_item("palco", "Sala", "Palco", 6, 2, True)
_item("pebolim", "Sala", "Pebolim", 3, 2, True)
# ---- café ----
_item("cafeteira", "Café", "Cafeteira", 1, 1, True)
_item("microondas", "Café", "Micro-ondas", 1, 1, False, "mesa")   # vai em cima da bancada
_item("frutas", "Café", "Fruteira", 1, 1, False, "mesa")
_item("geladeira", "Café", "Geladeira", 1, 2, True)
_item("bebedouro", "Café", "Bebedouro", 1, 1, True)
_item("pia", "Café", "Pia", 2, 1, True)
# ---- em cima da mesa (não bloqueiam) ----
_item("monitor", "Computadores", "Monitor", 1, 1, False, "mesa")
_item("monitor_duplo", "Computadores", "Dois monitores", 2, 1, False, "mesa")
_item("monitor_curvo", "Computadores", "Ultrawide curvo", 2, 1, False, "mesa")
_item("monitor_gamer", "Computadores", "Setup gamer", 1, 1, False, "mesa")
_item("imac", "Computadores", "All-in-one", 1, 1, False, "mesa")
_item("torre", "Computadores", "Gabinete", 1, 1, False, "mesa")
_item("torre_grande", "Computadores", "Gabinete grande", 1, 2, True)
_item("monitor_triplo", "Computadores", "Três monitores", 3, 1, False, "mesa")
_item("monitor_vertical", "Computadores", "Monitor em pé", 1, 1, False, "mesa")
_item("microfone", "Computadores", "Microfone", 1, 1, False, "mesa")
_item("impressora", "Computadores", "Impressora", 1, 1, False, "mesa")
_item("luminaria_mesa", "Computadores", "Luminária de mesa", 1, 1, False, "mesa")
_item("tablet", "Computadores", "Tablet", 1, 1, False, "mesa")
_item("fone_mesa", "Computadores", "Headset", 1, 1, False, "mesa")
_item("mouse", "Computadores", "Mouse", 1, 1, False, "mesa")
_item("teclado", "Computadores", "Teclado", 1, 1, False, "mesa")
_item("notebook", "Computadores", "Notebook", 1, 1, False, "mesa")
_item("caneca", "Na mesa", "Caneca", 1, 1, False, "mesa")
_item("papeis", "Na mesa", "Papéis", 1, 1, False, "mesa")
_item("telefone", "Na mesa", "Telefone", 1, 1, False, "mesa")
_item("vasinho", "Na mesa", "Vasinho", 1, 1, False, "mesa")
_item("livros", "Na mesa", "Livros", 1, 1, False, "mesa")
_item("bolo", "Na mesa", "Bolo", 1, 1, False, "mesa")

# ---------------------------------------------------------------------------
# ARSENAL: a biblioteca de peças que o editor oferece.
#
# Os grupos abaixo são as categorias que aparecem no painel. Peça nova entra
# aqui (tamanho, se bloqueia passagem e em que camada mora) e ganha um desenho
# de mesmo id em `static/objetos.js` — se faltar o desenho, ela vira um bloco
# genérico, o que é feio mas não quebra nada.
# ---------------------------------------------------------------------------

# ---- mesas ----
_item("mesa_branca", "Mesas", "Mesa branca", 4, 2, True)
_item("mesa_madeira", "Mesas", "Mesa de madeira", 4, 2, True)
_item("mesa_preta", "Mesas", "Mesa preta", 4, 2, True)
_item("mesa_l", "Mesas", "Mesa em L", 4, 3, True)
_item("mesa_gamer", "Mesas", "Mesa gamer", 6, 2, True)
_item("mesa_curva", "Mesas", "Mesa curva", 6, 2, True)
_item("mesa_dupla", "Mesas", "Mesa para dois", 6, 3, True)
_item("bancada_trabalho", "Mesas", "Bancada de trabalho", 8, 1, True)
_item("mesa_quadrada", "Mesas", "Mesa quadrada", 2, 2, True)
# ---- mesas de reunião ----
_item("mesa_reuniao_p", "Mesas de Reunião", "Mesa de reunião pequena", 4, 2, True)
_item("mesa_reuniao_oval", "Mesas de Reunião", "Mesa de reunião oval", 6, 3, True)
# ---- mesas de centro ----
_item("mesa_centro_redonda", "Mesas de Centro", "Mesa de centro redonda", 2, 2, True)
# ---- cadeiras ----
_item("cadeira_branca", "Cadeiras", "Cadeira branca", 1, 1, False)
_item("cadeira_cinza", "Cadeiras", "Cadeira cinza", 1, 1, False)
_item("cadeira_bege", "Cadeiras", "Cadeira bege", 1, 1, False)
_item("cadeira_azul", "Cadeiras", "Cadeira azul", 1, 1, False)
_item("cadeira_verde", "Cadeiras", "Cadeira verde", 1, 1, False)
_item("cadeira_laranja", "Cadeiras", "Cadeira laranja", 1, 1, False)
_item("cadeira_executiva", "Cadeiras", "Cadeira executiva", 1, 1, False)
_item("cadeira_couro", "Cadeiras", "Cadeira de couro", 1, 1, False)
_item("cadeira_visita", "Cadeiras", "Cadeira de visitante", 1, 1, False)
_item("banco_espera", "Cadeiras", "Banco de espera", 3, 1, True)
# ---- cadeiras gamer ----
_item("gamer_azul", "Cadeiras Gamer", "Gamer azul", 1, 1, False)
_item("gamer_preta", "Cadeiras Gamer", "Gamer toda preta", 1, 1, False)
_item("gamer_branca", "Cadeiras Gamer", "Gamer branca", 1, 1, False)
_item("gamer_rosa", "Cadeiras Gamer", "Gamer rosa", 1, 1, False)
_item("gamer_verde", "Cadeiras Gamer", "Gamer verde", 1, 1, False)
# ---- sofás ----
_item("sofa_2", "Sofás", "Sofá de 2 lugares", 2, 1, True)
_item("sofa_bege", "Sofás", "Sofá bege", 3, 1, True)
_item("sofa_azul", "Sofás", "Sofá azul", 3, 1, True)
_item("sofa_verde", "Sofás", "Sofá verde", 3, 1, True)
_item("sofa_caramelo", "Sofás", "Sofá caramelo", 3, 1, True)
# ---- poltronas ----
_item("poltrona_caramelo", "Poltronas", "Poltrona caramelo", 1, 1, True)
_item("poltrona_preta", "Poltronas", "Poltrona preta", 1, 1, True)
_item("poltrona_verde", "Poltronas", "Poltrona verde", 1, 1, True)
_item("poltrona_redonda", "Poltronas", "Poltrona redonda", 2, 2, True)
_item("puff", "Poltronas", "Puff", 1, 1, True)
# ---- monitores ----
_item("monitor_ultra", "Monitores", "Ultrawide grande", 3, 1, False, "mesa")
_item("monitor_branco", "Monitores", "Monitor branco", 1, 1, False, "mesa")
_item("braco_monitor", "Monitores", "Braço articulado", 1, 1, False, "mesa")
# ---- computadores ----
_item("notebook_fechado", "Computadores", "Notebook fechado", 1, 1, False, "mesa")
_item("torre_gamer", "Computadores", "Gabinete gamer", 1, 1, False, "mesa")
_item("dock", "Computadores", "Docking station", 1, 1, False, "mesa")
# ---- eletrônicos ----
_item("tv_grande", "Eletrônicos", "TV grande", 3, 1, True)
_item("webcam", "Eletrônicos", "Webcam", 1, 1, False, "mesa")
_item("caixa_som", "Eletrônicos", "Caixa de som", 1, 1, False, "mesa")
# ---- acessórios ----
_item("teclado_gamer", "Acessórios", "Teclado gamer", 1, 1, False, "mesa")
_item("teclado_branco", "Acessórios", "Teclado branco", 1, 1, False, "mesa")
_item("mouse_gamer", "Acessórios", "Mouse gamer", 1, 1, False, "mesa")
_item("mousepad", "Acessórios", "Mousepad", 2, 1, False, "mesa")
_item("fone_branco", "Acessórios", "Headset branco", 1, 1, False, "mesa")
_item("bloco_notas", "Acessórios", "Bloco de notas", 1, 1, False, "mesa")
_item("canetas", "Acessórios", "Porta-canetas", 1, 1, False, "mesa")
_item("copo", "Acessórios", "Copo", 1, 1, False, "mesa")
# ---- decoração ----
_item("quadro_abstrato", "Decoração", "Quadro abstrato", 2, 1, True)
_item("mural", "Decoração", "Mural de recados", 3, 1, True)
_item("porta_documentos", "Decoração", "Porta-documentos", 1, 1, False, "mesa")
_item("aromatizador", "Decoração", "Aromatizador", 1, 1, False, "mesa")
# ---- plantas ----
_item("monstera", "Plantas", "Monstera", 1, 2, True)
_item("espada", "Plantas", "Espada-de-são-jorge", 1, 1, True)
_item("bonsai", "Plantas", "Bonsai", 1, 1, False, "mesa")
_item("palmeira", "Plantas", "Palmeira", 2, 2, True)
_item("jardineira", "Plantas", "Jardineira", 3, 1, True)
# ---- iluminação ----
_item("pendente", "Iluminação", "Pendente", 1, 1, False, "mesa")
_item("luminaria_comprida", "Iluminação", "Luminária comprida", 3, 1, False, "mesa")
_item("fita_led", "Iluminação", "Fita de LED", 3, 1, False, "mesa")
# ---- escritório ----
_item("arquivo", "Escritório", "Arquivo de gavetas", 1, 1, True)
_item("estante_alta", "Escritório", "Estante alta", 2, 1, True)
# ---- portas ----
_item("porta_madeira", "Portas", "Porta de madeira", 2, 1, False, "mesa")
_item("porta_branca", "Portas", "Porta branca", 2, 1, False, "mesa")
_item("porta_vidro", "Portas", "Porta de vidro", 2, 1, False, "mesa")
_item("porta_dupla", "Portas", "Porta dupla", 4, 1, False, "mesa")
# ---- paredes e divisórias ----
_item("meia_parede", "Paredes", "Meia parede", 3, 1, True)
_item("painel_vidro", "Paredes", "Painel de vidro", 3, 1, True)
_item("painel_madeira", "Paredes", "Painel de madeira", 3, 1, True)
_item("janela_grande", "Paredes", "Janela grande", 4, 1, False, "mesa")
# ---- copa ----
_item("frigobar", "Café", "Frigobar", 1, 1, True)
_item("armario_aereo", "Café", "Armário aéreo", 3, 1, True)
_item("maquina_cafe", "Café", "Máquina de café", 1, 1, True)
_item("copos", "Café", "Copos", 1, 1, False, "mesa")
# ---- convivência ----
_item("tapete_azul", "Convivência", "Tapete azul", 3, 2, False, "piso")
_item("tapete_verde", "Convivência", "Tapete verde", 3, 2, False, "piso")
_item("tapete_cinza", "Convivência", "Tapete cinza", 3, 2, False, "piso")
_item("tapete_grande", "Convivência", "Tapete grande", 5, 3, False, "piso")
# ---- narguilés ----
_item("narguile_azul", "Narguilés", "Narguilé azul e dourado", 1, 2, True)
_item("narguile_preto", "Narguilés", "Narguilé preto e dourado", 1, 2, True)
_item("narguile_moderno", "Narguilés", "Narguilé moderno", 1, 2, True)
_item("narguile_pequeno", "Narguilés", "Narguilé pequeno", 1, 1, True)
_item("narguile_premium", "Narguilés", "Narguilé premium", 1, 2, True)

# Os ids de fábrica. O estúdio soma peças POR CIMA deste catálogo e precisa
# saber quais ids já são da casa para não atropelar nenhum.
FABRICA = frozenset(CATALOGO)


# Coisas que ficam em pé (monitor, gabinete, caneca): girar muda só para onde
# elas olham, não o espaço que ocupam — senão um gabinete 1x2 viraria uma caixa
# deitada 2x1. As fileiras de monitor são a exceção: elas se enfileiram no
# outro eixo quando a mesa está em pé. A mesma regra vale no cliente.
EM_PE = {
    "monitor", "monitor_duplo", "monitor_curvo", "monitor_gamer", "monitor_triplo",
    "monitor_vertical", "imac", "torre", "torre_grande", "notebook", "tablet",
    "microfone", "impressora", "luminaria_mesa", "fone_mesa", "teclado", "mouse",
    "caneca", "papeis", "telefone", "vasinho", "livros", "bolo",
    # arsenal — a mesma lista vive em `static/objetos.js:EM_PE`, os dois têm de bater
    "monitor_ultra", "monitor_branco", "braco_monitor", "notebook_fechado", "torre_gamer",
    "dock", "webcam", "caixa_som", "teclado_gamer", "teclado_branco", "mouse_gamer",
    "fone_branco", "bloco_notas", "canetas", "copo", "copos", "porta_documentos",
    "aromatizador", "bonsai",
}
FILEIRA = {"monitor_duplo", "monitor_curvo", "monitor_triplo", "monitor_ultra"}


def medida(objeto: Dict) -> Tuple[int, int]:
    """Espaço que o móvel ocupa no mapa. Deitado (90° ou 270°), largura e altura
    trocam de lugar — a não ser que seja um móvel de ficar em pé."""
    tipo = objeto["tipo"]
    info = CATALOGO[tipo]
    deita = tipo not in EM_PE or tipo in FILEIRA
    if deita and int(objeto.get("g", 0)) % 2:
        return info["a"], info["l"]
    return info["l"], info["a"]


class Escritorio:
    def __init__(self) -> None:
        self.largura = 52
        self.altura = 32
        self.piso: List[List[str]] = []
        self.paredes: List[List[int]] = []
        self.objetos: List[Dict] = []
        self.zonas: List[Dict] = []
        self.nascimento: Tuple[int, int] = (20, 5)
        self.versao_planta = 0
        self.proximo_id = 1
        self._bloqueados: set = set()
        self._historico: List[str] = []

    # ---------- carga e gravação ----------

    def carregar(self) -> None:
        if ARQUIVO.exists():
            try:
                self.de_json(json.loads(ARQUIVO.read_text(encoding="utf-8")))
                if self.versao_planta >= VERSAO_PLANTA:
                    log.info("mapa carregado de %s", ARQUIVO.name)
                    return
                log.info("planta de fábrica é mais nova (%d > %d) — remontando o escritório",
                         VERSAO_PLANTA, self.versao_planta)
            except Exception:
                # O arquivo ruim não pode ser só sobrescrito pela planta de
                # fábrica: era a única cópia do escritório editado, e a linha
                # de baixo apagava a prova. Fica uma cópia ao lado dele.
                log.exception("mapa.json ilegível — voltando para a planta padrão (cópia em %s)",
                              nuvem.guardar_ilegivel(ARQUIVO))
        montar_padrao(self)
        self.salvar()

    def salvar(self) -> None:
        # Gravação atômica: um leitor (o envio para a nuvem) nunca vê o arquivo
        # vazio, e o processo morrer no meio não deixa JSON cortado — que na
        # subida seguinte virava planta de fábrica em silêncio.
        nuvem.gravar_atomico(ARQUIVO, json.dumps(self.para_json(), ensure_ascii=False))

    def para_json(self) -> Dict:
        return {
            "largura": self.largura, "altura": self.altura,
            "piso": ["".join(linha) for linha in self.piso],
            "paredes": ["".join(str(v) for v in linha) for linha in self.paredes],
            "objetos": self.objetos,
            "zonas": self.zonas,
            "nascimento": list(self.nascimento),
            "versao_planta": self.versao_planta,
            # O contador de ids vai junto. Sem ele, a subida recalculava só
            # pelos móveis, e a próxima sala criada ganhava o id de uma que já
            # existia — e a substituía, com o dono e tudo.
            "proximo_id": self.proximo_id,
        }

    def de_json(self, dados: Dict) -> None:
        self.largura = int(dados["largura"])
        self.altura = int(dados["altura"])
        # A grade tem sempre o tamanho declarado: linha faltando no arquivo
        # virava IndexError na primeira edição que encostasse nela.
        self.piso = [list(linha.ljust(self.largura, "c")[:self.largura])
                     for linha in dados["piso"]][:self.altura]
        self.paredes = [[1 if c == "1" else 0 for c in linha.ljust(self.largura, "0")[:self.largura]]
                        for linha in dados["paredes"]][:self.altura]
        while len(self.piso) < self.altura:
            self.piso.append(["c"] * self.largura)
        while len(self.paredes) < self.altura:
            self.paredes.append([0] * self.largura)
        self.objetos = [o for o in dados.get("objetos", []) if o.get("tipo") in CATALOGO]
        self.zonas = dados.get("zonas", [])
        self.nascimento = tuple(dados.get("nascimento", (2, 2)))
        self.versao_planta = int(dados.get("versao_planta", 0))
        # O id nunca anda para trás: vale o maior entre o contador gravado, os
        # móveis e as salas `z<n>` (mapa gravado antes de o contador existir).
        maior_objeto = max([int(o["id"]) for o in self.objetos], default=0)
        maior_zona = max([int(str(z["id"])[1:]) for z in self.zonas
                          if re.fullmatch(r"z\d+", str(z.get("id")))], default=0)
        self.proximo_id = max(int(dados.get("proximo_id", 0)), maior_objeto + 1, maior_zona + 1)
        self._recalcular()

    # ---------- colisão ----------

    def _recalcular(self) -> None:
        bloq = set()
        for y, linha in enumerate(self.paredes):
            for x, v in enumerate(linha):
                if v:
                    bloq.add((x, y))
        for o in self.objetos:
            if not CATALOGO[o["tipo"]]["bloqueia"]:
                continue
            largura, altura = medida(o)
            for dy in range(altura):
                for dx in range(largura):
                    bloq.add((o["x"] + dx, o["y"] + dy))
        self._bloqueados = bloq

    def tile_livre(self, x: int, y: int) -> bool:
        if not (0 <= x < self.largura and 0 <= y < self.altura):
            return False
        return (x, y) not in self._bloqueados

    def livre(self, px: float, py: float) -> bool:
        """O avatar é uma caixinha: os quatro cantos precisam cair em chão livre."""
        # NaN e infinito não são lugar nenhum. `int(nan // 32)` estourava, e um
        # `voltando` com "nan" na entrada derrubava o WebSocket sem resposta.
        if not (math.isfinite(px) and math.isfinite(py)):
            return False
        r = RAIO_AVATAR
        for cx, cy in ((px - r, py - r), (px + r, py - r), (px - r, py + r), (px + r, py + r)):
            if not self.tile_livre(int(cx // TAMANHO_TILE), int(cy // TAMANHO_TILE)):
                return False
        return True

    def zona_de(self, px: float, py: float) -> Optional[Dict]:
        """Salas podem se sobrepor (uma salinha fechada dentro do coworking, por
        exemplo). Vence a menor: é a que a pessoa entende como "onde eu estou"."""
        tx, ty = px / TAMANHO_TILE, py / TAMANHO_TILE
        achadas = [z for z in self.zonas
                   if z["x1"] <= tx < z["x2"] + 1 and z["y1"] <= ty < z["y2"] + 1]
        if not achadas:
            return None
        return min(achadas, key=lambda z: (z["x2"] - z["x1"] + 1) * (z["y2"] - z["y1"] + 1))

    # ---------- dono da sala ----------
    # Cada pessoa pode reivindicar UMA sala individual, como no Gather. A sala
    # reivindicada fica trancada: quem chega na porta bate, e o dono decide.
    # O dono é guardado pela CHAVE da conta (nome sem acento, minúsculo), não
    # pelo nome mostrado — senão trocar o nome no perfil soltaria a sala.

    # ---------- quem pode editar o quê ----------
    # Regra do Gather, e a que o dono pediu: membro mexe só DENTRO da sala que
    # reivindicou; admin mexe em tudo. O que muda a planta (parede, zona,
    # tamanho, entrada, desfazer, restaurar) é só de admin, porque uma parede
    # movida do lado de fora muda a sala do vizinho.
    ACOES_SO_ADMIN = {"desfazer", "parede", "montar_sala", "zona", "zona_remover",
                      "nascimento", "padrao", "tamanho"}

    def _tiles_do_objeto(self, o: Dict, tipo: Optional[str] = None,
                         giro: Optional[int] = None) -> List[Tuple[int, int]]:
        alvo = dict(o)
        if tipo is not None:
            alvo["tipo"] = tipo
        if giro is not None:
            alvo["g"] = giro
        lg, ag = medida(alvo)
        return [(alvo["x"] + dx, alvo["y"] + dy) for dy in range(ag) for dx in range(lg)]

    def tiles_da_acao(self, acao: Dict) -> Optional[List[Tuple[int, int]]]:
        """Os tiles que a edição encosta. `None` quer dizer "não dá para saber",
        e nesse caso a edição vira coisa de admin — nunca o contrário."""
        tipo = acao.get("acao")
        try:
            if tipo == "objeto":
                if acao.get("tipo") not in CATALOGO:
                    return None
                falso = {"tipo": acao["tipo"], "x": int(acao["x"]), "y": int(acao["y"]),
                         "g": int(acao.get("g", 0)) % 4}
                return self._tiles_do_objeto(falso)
            if tipo in ("mover", "girar", "trocar", "remover"):
                alvo = next((o for o in self.objetos if o["id"] == int(acao["id"])), None)
                if not alvo:
                    return None
                tiles = self._tiles_do_objeto(alvo)
                if tipo == "mover":                       # origem E destino contam
                    destino = {**alvo, "x": int(acao["x"]), "y": int(acao["y"])}
                    tiles += self._tiles_do_objeto(destino)
                elif tipo == "girar":
                    g = acao.get("g")
                    g = (int(alvo.get("g", 0)) + 1) % 4 if g is None else int(g) % 4
                    tiles += self._tiles_do_objeto(alvo, giro=g)
                elif tipo == "trocar":
                    if acao.get("tipo") not in CATALOGO:
                        return None
                    tiles += self._tiles_do_objeto(alvo, tipo=acao["tipo"])
                return tiles
            if tipo == "piso":
                return [(int(x), int(y)) for x, y in acao.get("tiles", [])]
        except (KeyError, TypeError, ValueError):
            return None
        return None

    def pode_editar(self, acao: Dict, chave: str, admin: bool) -> Tuple[bool, str]:
        if admin:
            return True, ""
        tipo = acao.get("acao")
        if tipo in self.ACOES_SO_ADMIN:
            return False, "Só o administrador muda a planta do escritório."
        minha = self.sala_do_dono(chave)
        if minha is None:
            return False, "Reivindique uma sala para poder decorar."
        tiles = self.tiles_da_acao(acao)
        if tiles is None:
            return False, "Não consegui saber onde essa mudança cai."
        for x, y in tiles:
            if not (minha["x1"] <= x <= minha["x2"] and minha["y1"] <= y <= minha["y2"]):
                return False, "Isso está fora da %s, que é a sua sala." % minha["nome"]
        return True, ""

    def zona_por_id(self, id_: str) -> Optional[Dict]:
        return next((z for z in self.zonas if z["id"] == id_), None)

    def sala_do_dono(self, chave: str) -> Optional[Dict]:
        if not chave:
            return None
        return next((z for z in self.zonas if z.get("dono") == chave), None)

    def reivindicar(self, id_: str, chave: str, nome: str) -> Tuple[bool, str]:
        z = self.zona_por_id(id_)
        if not z or not z.get("privada"):
            return False, "Essa área não é uma sala fechada."
        if z.get("dono") and z["dono"] != chave:
            return False, "Essa sala já é de %s." % z.get("dono_nome", "outra pessoa")
        outra = self.sala_do_dono(chave)
        if outra is not None and outra["id"] != id_:
            return False, "Você já é dono da %s. Solte ela primeiro." % outra["nome"]
        z["dono"] = chave
        z["dono_nome"] = nome
        return True, ""

    def liberar(self, id_: str, chave: str) -> Tuple[bool, str]:
        z = self.zona_por_id(id_)
        if not z:
            return False, "Sala não encontrada."
        if z.get("dono") != chave:
            return False, "Essa sala não é sua."
        z.pop("dono", None)
        z.pop("dono_nome", None)
        z.pop("trancada", None)              # solta a sala, solta a porta junto
        return True, ""

    def trancar(self, id_: str, chave: str, fechar: bool) -> Tuple[bool, str]:
        """Trancar por dentro. Ter a sala e trancar a sala são coisas diferentes:
        a sala continua sua com a porta aberta, e aí qualquer um entra. Só com a
        porta trancada é que o visitante precisa bater."""
        z = self.zona_por_id(id_)
        if not z:
            return False, "Sala não encontrada."
        if z.get("dono") != chave:
            return False, "Só o dono da sala tranca a porta."
        if fechar:
            z["trancada"] = True
        else:
            z.pop("trancada", None)
        return True, ""

    def ponto_de_nascimento(self) -> Tuple[float, float]:
        """Se puserem um móvel em cima da entrada, quem chega nasce dentro dele e
        fica preso — então procuramos o chão livre mais perto."""
        x, y = self.nascimento
        if not self._cabe(x, y):
            for raio in range(1, 12):
                achou = None
                for dy in range(-raio, raio + 1):
                    for dx in range(-raio, raio + 1):
                        if max(abs(dx), abs(dy)) != raio:
                            continue
                        if self._cabe(x + dx, y + dy):
                            achou = (x + dx, y + dy)
                            break
                    if achou:
                        break
                if achou:
                    x, y = achou
                    break
        return (x + 0.5) * TAMANHO_TILE, (y + 0.5) * TAMANHO_TILE

    def _cabe(self, x: int, y: int) -> bool:
        """O avatar é uma caixinha: precisa do tile e das bordas dele livres."""
        return self.livre((x + 0.5) * TAMANHO_TILE, (y + 0.5) * TAMANHO_TILE)

    def para_cliente(self) -> Dict:
        """O mapa como o navegador recebe. O campo `dono` da zona é a CHAVE da
        conta, ou seja, o e-mail: ele fica no servidor. A tela só precisa de
        `dono_nome`, e o mapa vai inteiro para todo mundo — inclusive visitante,
        que entra só com o código da sala. Mandar o `dono` era entregar a lista
        de e-mails de quem tem sala."""
        dados = self.para_json()
        dados["zonas"] = [{k: v for k, v in z.items() if k != "dono"} for z in dados["zonas"]]
        return {**dados, "tile": TAMANHO_TILE, "raio_avatar": RAIO_AVATAR,
                "catalogo": CATALOGO, "pisos": PISOS}

    # ---------- edição ----------

    def _foto(self) -> str:
        return json.dumps(self.para_json(), ensure_ascii=False)

    def _guardar_historico(self, foto: str) -> None:
        self._historico.append(foto)
        del self._historico[:-HISTORICO]

    def _novo_id_zona(self) -> str:
        """Um id de sala que ninguém usa. O contador vai para o disco, mas o
        mapa pode ter vindo de uma versão que não o gravava — então confere."""
        usados = {str(z.get("id")) for z in self.zonas}
        while f"z{self.proximo_id}" in usados:
            self.proximo_id += 1
        zid = f"z{self.proximo_id}"
        self.proximo_id += 1
        return zid

    @staticmethod
    def _tiles(acao: Dict) -> List[Tuple[int, int]]:
        """Os tiles do pedido, todos inteiros — ou ValueError/TypeError ANTES
        de qualquer um deles ser aplicado."""
        return [(int(x), int(y)) for x, y in acao.get("tiles", [])]

    def _desfazer(self) -> bool:
        if not self._historico:
            return False
        # A posse da sala não é desenho. Reivindicar e trancar não passam pelo
        # histórico, mas a foto guardava `dono` e `trancada` de cada zona: o
        # administrador desfazia uma planta que tinha colocado e, sem querer,
        # devolvia a sala de alguém ao estado de antes — sem dono, destrancada.
        posse = {z["id"]: {k: z[k] for k in ("dono", "dono_nome", "trancada") if k in z}
                 for z in self.zonas}
        self.de_json(json.loads(self._historico.pop()))
        for z in self.zonas:
            for k in ("dono", "dono_nome", "trancada"):
                z.pop(k, None)
            z.update(posse.get(z["id"], {}))
        return True

    def editar(self, acao: Dict) -> bool:
        """Aplica uma edição vinda do editor. Devolve False se for inválida —
        o cliente é quem desenha, mas quem decide o que é permitido é aqui.

        Recusada é recusada: nada do pedido fica no mapa e o histórico não
        ganha passo. Antes, uma lista de tiles com um item torto no meio
        deixava os de antes aplicados em memória — sem recalcular colisão, sem
        gravar e sem avisar ninguém: uma parede fantasma que só aparecia na
        edição seguinte. E cada recusa empurrava uma foto para o histórico, então
        40 pedidos inválidos de um membro apagavam o desfazer do administrador.
        """
        tipo = acao.get("acao")
        if tipo == "desfazer":
            return self._desfazer()
        foto = self._foto()
        try:
            ok = self._aplicar(tipo, acao)
        except (KeyError, TypeError, ValueError, IndexError):
            log.warning("edição inválida: %s", str(acao)[:200])
            ok = False
        if not ok:
            self.de_json(json.loads(foto))     # volta ao que era, tile por tile
            return False
        self._guardar_historico(foto)
        self._recalcular()
        return True

    def _aplicar(self, tipo: Optional[str], acao: Dict) -> bool:
        """Mexe no mapa. Devolve False (ou levanta) para `editar` desfazer tudo."""
        if tipo == "objeto":
            if len(self.objetos) >= MAX_OBJETOS or acao["tipo"] not in CATALOGO:
                return False
            x, y = int(acao["x"]), int(acao["y"])
            novo = {"id": self.proximo_id, "tipo": acao["tipo"], "x": x, "y": y,
                    "g": int(acao.get("g", 0)) % 4}
            lg, ag = medida(novo)
            if not (0 <= x and x + lg <= self.largura
                    and 0 <= y and y + ag <= self.altura):
                return False
            self.objetos.append(novo)
            self.proximo_id += 1

        elif tipo == "mover":
            alvo = next((o for o in self.objetos if o["id"] == int(acao["id"])), None)
            if not alvo:
                return False
            lg, ag = medida(alvo)
            x, y = int(acao["x"]), int(acao["y"])
            if not (0 <= x and x + lg <= self.largura
                    and 0 <= y and y + ag <= self.altura):
                return False
            alvo["x"], alvo["y"] = x, y

        elif tipo == "girar":
            alvo = next((o for o in self.objetos if o["id"] == int(acao["id"])), None)
            if not alvo:
                return False
            giro = acao.get("g")
            giro = (int(alvo.get("g", 0)) + 1) % 4 if giro is None else int(giro) % 4
            candidato = {**alvo, "g": giro}
            lg, ag = medida(candidato)
            if not (alvo["x"] + lg <= self.largura and alvo["y"] + ag <= self.altura):
                return False                     # giraria para fora do mapa
            alvo["g"] = giro

        elif tipo == "trocar":
            alvo = next((o for o in self.objetos if o["id"] == int(acao["id"])), None)
            novo = acao.get("tipo")
            if not alvo or novo not in CATALOGO:
                return False
            lg, ag = medida({**alvo, "tipo": novo})
            if not (alvo["x"] + lg <= self.largura and alvo["y"] + ag <= self.altura):
                return False
            alvo["tipo"] = novo

        elif tipo == "remover":
            antes = len(self.objetos)
            self.objetos = [o for o in self.objetos if o["id"] != int(acao["id"])]
            if len(self.objetos) == antes:
                return False

        elif tipo == "parede":
            valor = 1 if acao.get("valor") else 0
            for x, y in self._tiles(acao):
                if 0 <= x < self.largura and 0 <= y < self.altura:
                    self.paredes[y][x] = valor

        elif tipo == "piso":
            novo = acao.get("piso")
            if novo not in PISOS:
                return False
            for x, y in self._tiles(acao):
                if 0 <= x < self.largura and 0 <= y < self.altura:
                    self.piso[y][x] = novo

        elif tipo == "montar_sala":
            # Uma sala pronta: parede em volta, porta, piso e a zona. É o
            # que transforma "desenhar um retângulo" em sala de verdade.
            x1, y1 = max(0, int(acao["x1"])), max(0, int(acao["y1"]))
            x2 = min(self.largura - 1, int(acao["x2"]))
            y2 = min(self.altura - 1, int(acao["y2"]))
            if x2 - x1 < 2 or y2 - y1 < 2:
                return False
            # O teto de salas vale aqui também: só a ação `zona` conferia, e
            # por esta porta o mapa passava de MAX_ZONAS sem ninguém barrar.
            if acao.get("nome") and len(self.zonas) >= MAX_ZONAS:
                return False
            piso = acao.get("piso") if acao.get("piso") in PISOS else "c"
            for y in range(y1, y2 + 1):
                for x in range(x1, x2 + 1):
                    borda = x in (x1, x2) or y in (y1, y2)
                    self.paredes[y][x] = 1 if borda else 0
                    if not borda:
                        self.piso[y][x] = piso
            # porta de 2 tiles no meio do lado escolhido
            lado = acao.get("porta", "baixo")
            meio_x, meio_y = (x1 + x2) // 2, (y1 + y2) // 2
            portas = {
                "baixo": [(meio_x, y2), (meio_x + 1, y2)],
                "cima": [(meio_x, y1), (meio_x + 1, y1)],
                "esquerda": [(x1, meio_y), (x1, meio_y + 1)],
                "direita": [(x2, meio_y), (x2, meio_y + 1)],
            }.get(lado, [])
            for px, py in portas:
                if 0 <= px < self.largura and 0 <= py < self.altura:
                    self.paredes[py][px] = 0
                    self.piso[py][px] = piso
            if acao.get("nome"):
                self.zonas.append({
                    "id": self._novo_id_zona(), "nome": str(acao["nome"])[:28],
                    "x1": x1 + 1, "y1": y1 + 1, "x2": x2 - 1, "y2": y2 - 1,
                    "privada": bool(acao.get("privada")),
                    "cor": acao.get("cor") if isinstance(acao.get("cor"), str) else "#8b7fd0",
                })

        elif tipo == "zona":
            zid = str(acao.get("id") or "")
            antigos = [i for i, x in enumerate(self.zonas) if x["id"] == zid] if zid else []
            # O teto é de salas NOVAS: com 40 salas, renomear uma delas
            # continua podendo.
            if not antigos and len(self.zonas) >= MAX_ZONAS:
                return False
            z = {
                "id": zid or self._novo_id_zona(),
                "nome": str(acao.get("nome") or "Sala")[:28],
                "x1": max(0, int(acao["x1"])), "y1": max(0, int(acao["y1"])),
                "x2": min(self.largura - 1, int(acao["x2"])),
                "y2": min(self.altura - 1, int(acao["y2"])),
                "privada": bool(acao.get("privada")),
                "cor": acao.get("cor") if isinstance(acao.get("cor"), str) else "#6366f1",
            }
            if z["x2"] < z["x1"] or z["y2"] < z["y1"]:
                return False
            # Editar uma sala mantém o lugar dela na lista: se fosse para o
            # fim, a linha pularia embaixo do olho de quem está editando.
            if antigos:
                # renomear ou redesenhar a sala NÃO solta o dono dela: o
                # editor reescreve a zona inteira, e sem isto quem mexesse
                # na plaquinha tirava a sala de alguém sem querer
                velha = self.zonas[antigos[0]]
                if velha.get("dono"):
                    z["dono"] = velha["dono"]
                    z["dono_nome"] = velha.get("dono_nome", "")
                    if velha.get("trancada"):
                        z["trancada"] = True
                if velha.get("porta"):
                    z["porta"] = velha["porta"]
                self.zonas[antigos[0]] = z
            else:
                self.zonas.append(z)

        elif tipo == "zona_remover":
            self.zonas = [z for z in self.zonas if z["id"] != acao.get("id")]

        elif tipo == "nascimento":
            x, y = int(acao["x"]), int(acao["y"])
            if not self.tile_livre(x, y):
                return False
            self.nascimento = (x, y)

        elif tipo == "padrao":
            montar_padrao(self)

        elif tipo == "tamanho":
            self._redimensionar(int(acao["largura"]), int(acao["altura"]))

        else:
            return False
        return True

    def _redimensionar(self, largura: int, altura: int) -> None:
        largura = max(LIMITE_LARGURA[0], min(LIMITE_LARGURA[1], largura))
        altura = max(LIMITE_ALTURA[0], min(LIMITE_ALTURA[1], altura))

        # A borda antiga deixa de ser borda quando o mapa cresce: derruba a
        # parede da direita/baixo antes de esticar, senão fica um muro no meio.
        if largura > self.largura or altura > self.altura:
            for y in range(self.altura):
                self.paredes[y][self.largura - 1] = 0
            for x in range(self.largura):
                self.paredes[self.altura - 1][x] = 0

        for linha, parede in zip(self.piso, self.paredes):
            del linha[largura:]
            del parede[largura:]
            while len(linha) < largura:
                linha.append("c")
                parede.append(0)
        del self.piso[altura:]
        del self.paredes[altura:]
        while len(self.piso) < altura:
            self.piso.append(["c"] * largura)
            self.paredes.append([0] * largura)

        self.largura, self.altura = largura, altura
        for y in range(altura):                       # fecha a nova borda
            self.paredes[y][0] = self.paredes[y][largura - 1] = 1
        for x in range(largura):
            self.paredes[0][x] = self.paredes[altura - 1][x] = 1

        self.objetos = [o for o in self.objetos
                        if o["x"] + medida(o)[0] <= largura
                        and o["y"] + medida(o)[1] <= altura]
        self.zonas = [z for z in self.zonas if z["x1"] < largura and z["y1"] < altura]
        for z in self.zonas:
            z["x2"] = min(z["x2"], largura - 1)
            z["y2"] = min(z["y2"], altura - 1)
        x, y = self.nascimento
        self.nascimento = (min(x, largura - 2), min(y, altura - 2))


escritorio = Escritorio()


# ---------- compatibilidade com o resto do código ----------

def livre(px: float, py: float) -> bool:
    return escritorio.livre(px, py)


def zona_de(px: float, py: float) -> Optional[Dict]:
    return escritorio.zona_de(px, py)
