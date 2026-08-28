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
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from planta_padrao import VERSAO as VERSAO_PLANTA, montar_padrao

log = logging.getLogger("escritorio.mapa")

TAMANHO_TILE = 32
RAIO_AVATAR = 11
ARQUIVO = Path(__file__).parent / "mapa.json"

LIMITE_LARGURA = (20, 90)
LIMITE_ALTURA = (16, 70)
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


# Coisas que ficam em pé (monitor, gabinete, caneca): girar muda só para onde
# elas olham, não o espaço que ocupam — senão um gabinete 1x2 viraria uma caixa
# deitada 2x1. As fileiras de monitor são a exceção: elas se enfileiram no
# outro eixo quando a mesa está em pé. A mesma regra vale no cliente.
EM_PE = {
    "monitor", "monitor_duplo", "monitor_curvo", "monitor_gamer", "monitor_triplo",
    "monitor_vertical", "imac", "torre", "torre_grande", "notebook", "tablet",
    "microfone", "impressora", "luminaria_mesa", "fone_mesa", "teclado", "mouse",
    "caneca", "papeis", "telefone", "vasinho", "livros", "bolo",
}
FILEIRA = {"monitor_duplo", "monitor_curvo", "monitor_triplo"}


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
                log.exception("mapa.json ilegível — voltando para a planta padrão")
        montar_padrao(self)
        self.salvar()

    def salvar(self) -> None:
        ARQUIVO.write_text(json.dumps(self.para_json(), ensure_ascii=False), encoding="utf-8")

    def para_json(self) -> Dict:
        return {
            "largura": self.largura, "altura": self.altura,
            "piso": ["".join(linha) for linha in self.piso],
            "paredes": ["".join(str(v) for v in linha) for linha in self.paredes],
            "objetos": self.objetos,
            "zonas": self.zonas,
            "nascimento": list(self.nascimento),
            "versao_planta": self.versao_planta,
        }

    def de_json(self, dados: Dict) -> None:
        self.largura = int(dados["largura"])
        self.altura = int(dados["altura"])
        self.piso = [list(linha.ljust(self.largura, "c")[:self.largura]) for linha in dados["piso"]]
        self.paredes = [[1 if c == "1" else 0 for c in linha.ljust(self.largura, "0")[:self.largura]]
                        for linha in dados["paredes"]]
        self.objetos = [o for o in dados.get("objetos", []) if o.get("tipo") in CATALOGO]
        self.zonas = dados.get("zonas", [])
        self.nascimento = tuple(dados.get("nascimento", (2, 2)))
        self.versao_planta = int(dados.get("versao_planta", 0))
        self.proximo_id = max([o["id"] for o in self.objetos], default=0) + 1
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
        return {**self.para_json(), "tile": TAMANHO_TILE, "raio_avatar": RAIO_AVATAR,
                "catalogo": CATALOGO, "pisos": PISOS}

    # ---------- edição ----------

    def _guardar_historico(self) -> None:
        self._historico.append(json.dumps(self.para_json(), ensure_ascii=False))
        del self._historico[:-HISTORICO]

    def editar(self, acao: Dict) -> bool:
        """Aplica uma edição vinda do editor. Devolve False se for inválida —
        o cliente é quem desenha, mas quem decide o que é permitido é aqui."""
        tipo = acao.get("acao")
        try:
            if tipo == "desfazer":
                if not self._historico:
                    return False
                self.de_json(json.loads(self._historico.pop()))
                return True

            self._guardar_historico()

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
                    self._historico.pop()
                    return False
                giro = acao.get("g")
                giro = (int(alvo.get("g", 0)) + 1) % 4 if giro is None else int(giro) % 4
                candidato = {**alvo, "g": giro}
                lg, ag = medida(candidato)
                if not (alvo["x"] + lg <= self.largura and alvo["y"] + ag <= self.altura):
                    self._historico.pop()
                    return False                     # giraria para fora do mapa
                alvo["g"] = giro

            elif tipo == "trocar":
                alvo = next((o for o in self.objetos if o["id"] == int(acao["id"])), None)
                novo = acao.get("tipo")
                if not alvo or novo not in CATALOGO:
                    self._historico.pop()
                    return False
                lg, ag = medida({**alvo, "tipo": novo})
                if not (alvo["x"] + lg <= self.largura and alvo["y"] + ag <= self.altura):
                    self._historico.pop()
                    return False
                alvo["tipo"] = novo

            elif tipo == "remover":
                antes = len(self.objetos)
                self.objetos = [o for o in self.objetos if o["id"] != int(acao["id"])]
                if len(self.objetos) == antes:
                    return False

            elif tipo == "parede":
                valor = 1 if acao.get("valor") else 0
                for x, y in acao.get("tiles", []):
                    if 0 <= x < self.largura and 0 <= y < self.altura:
                        self.paredes[y][x] = valor

            elif tipo == "piso":
                novo = acao.get("piso")
                if novo not in PISOS:
                    return False
                for x, y in acao.get("tiles", []):
                    if 0 <= x < self.largura and 0 <= y < self.altura:
                        self.piso[y][x] = novo

            elif tipo == "montar_sala":
                # Uma sala pronta: parede em volta, porta, piso e a zona. É o
                # que transforma "desenhar um retângulo" em sala de verdade.
                x1, y1 = max(0, int(acao["x1"])), max(0, int(acao["y1"]))
                x2 = min(self.largura - 1, int(acao["x2"]))
                y2 = min(self.altura - 1, int(acao["y2"]))
                if x2 - x1 < 2 or y2 - y1 < 2:
                    self._historico.pop()
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
                        "id": f"z{self.proximo_id}", "nome": acao["nome"][:28],
                        "x1": x1 + 1, "y1": y1 + 1, "x2": x2 - 1, "y2": y2 - 1,
                        "privada": bool(acao.get("privada")),
                        "cor": acao.get("cor") if isinstance(acao.get("cor"), str) else "#8b7fd0",
                    })
                    self.proximo_id += 1

            elif tipo == "zona":
                if len(self.zonas) >= MAX_ZONAS:
                    return False
                z = {
                    "id": str(acao.get("id") or f"z{self.proximo_id}"),
                    "nome": (acao.get("nome") or "Sala")[:28],
                    "x1": max(0, int(acao["x1"])), "y1": max(0, int(acao["y1"])),
                    "x2": min(self.largura - 1, int(acao["x2"])),
                    "y2": min(self.altura - 1, int(acao["y2"])),
                    "privada": bool(acao.get("privada")),
                    "cor": acao.get("cor") if isinstance(acao.get("cor"), str) else "#6366f1",
                }
                if z["x2"] < z["x1"] or z["y2"] < z["y1"]:
                    return False
                self.proximo_id += 1
                # Editar uma sala mantém o lugar dela na lista: se fosse para o
                # fim, a linha pularia embaixo do olho de quem está editando.
                antigos = [i for i, x in enumerate(self.zonas) if x["id"] == z["id"]]
                if antigos:
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
                self._historico.pop()
                return False

        except (KeyError, TypeError, ValueError):
            log.warning("edição inválida: %s", acao)
            if self._historico:
                self._historico.pop()
            return False

        self._recalcular()
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
