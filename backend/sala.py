"""Estado da sala: quem está dentro, onde cada um está e quem escuta quem.

Tudo em memória e de propósito: a sala é efêmera, ninguém "salva" um escritório.
Se um dia precisar de histórico de chat, aí sim entra SQLite como nos outros apps.
"""

import asyncio
import re
import secrets
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import mapa
from mapa import escritorio

# Raio (em pixels) em que duas pessoas passam a se ouvir. A histerese evita que
# a chamada fique conectando/desconectando quando alguém anda na fronteira.
RAIO_CONVERSA = 150
RAIO_SILENCIO = 210

# Paleta dos avatares — sorteada na entrada, o usuário pode trocar.
CORES = ["#f97316", "#22c55e", "#3b82f6", "#e11d48", "#a855f7",
         "#14b8a6", "#eab308", "#8b5cf6", "#06b6d4", "#f43f5e"]

# A cor vem da roupa escolhida no editor (boneco.js), então não dá para validar
# contra uma lista fixa — basta ser um hex de verdade.
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def cor_valida(valor: Any) -> bool:
    return isinstance(valor, str) and bool(HEX.match(valor))


def limpar_aparencia(bruto: Any) -> Dict[str, str]:
    """O catálogo de peles, cabelos e roupas vive no cliente (boneco.js) — aqui
    o servidor só garante que é um dicionário pequeno de texto curto. Valor
    desconhecido não quebra nada: o cliente cai no padrão sozinho."""
    if not isinstance(bruto, dict):
        return {}
    return {str(c)[:16]: str(v)[:24] for i, (c, v) in enumerate(bruto.items()) if i < 10}


@dataclass
class Participante:
    id: str
    nome: str
    cor: str
    emoji: str
    x: float
    y: float
    direcao: str = "baixo"
    mudo: bool = False
    sem_camera: bool = False
    tela: bool = False
    reacao: str = ""
    aparencia: Dict[str, str] = field(default_factory=dict)
    token: str = ""
    ws: Any = field(default=None, repr=False)

    def publico(self) -> Dict:
        zona = mapa.zona_de(self.x, self.y)
        return {
            "id": self.id, "nome": self.nome, "cor": self.cor, "emoji": self.emoji,
            "x": round(self.x, 1), "y": round(self.y, 1), "direcao": self.direcao,
            "mudo": self.mudo, "sem_camera": self.sem_camera, "tela": self.tela,
            "aparencia": self.aparencia,
            "zona": zona["id"] if zona else None,
        }


def se_ouvem(a: Participante, b: Participante) -> bool:
    """Mesma regra do frontend (app.js) — se mudar aqui, mude lá.

    Sala privada é bolha: quem está dentro só fala com quem está dentro, mesmo
    que alguém esteja encostado na parede do lado de fora.
    """
    za, zb = mapa.zona_de(a.x, a.y), mapa.zona_de(b.x, b.y)
    priv_a = bool(za and za["privada"])
    priv_b = bool(zb and zb["privada"])
    if priv_a or priv_b:
        return priv_a and priv_b and za["id"] == zb["id"]
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= RAIO_CONVERSA ** 2


class Sala:
    def __init__(self) -> None:
        self.participantes: Dict[str, Participante] = {}
        self._trava = asyncio.Lock()

    # ---------- entrada e saída ----------

    async def entrar(self, ws, dados: Dict) -> Participante:
        nome = (dados.get("nome") or "Convidado").strip()[:24] or "Convidado"
        p = Participante(
            id=secrets.token_hex(6),
            nome=nome,
            cor=dados.get("cor") if cor_valida(dados.get("cor")) else secrets.choice(CORES),
            token=dados.get("token") or "",
            emoji=(dados.get("emoji") or "")[:4],
            aparencia=limpar_aparencia(dados.get("aparencia")),
            x=escritorio.ponto_de_nascimento()[0],
            y=escritorio.ponto_de_nascimento()[1],
            ws=ws,
        )
        # Espalha um pouco quem chega junto, para ninguém nascer em cima do outro.
        for _ in range(24):
            if not any(o.id != p.id and abs(o.x - p.x) < 24 and abs(o.y - p.y) < 24
                       for o in self.participantes.values()):
                break
            p.x += mapa.TAMANHO_TILE
            if not mapa.livre(p.x, p.y):
                p.x -= mapa.TAMANHO_TILE * 3
                p.y += mapa.TAMANHO_TILE
        async with self._trava:
            self.participantes[p.id] = p
        return p

    async def sair(self, id_: str) -> None:
        async with self._trava:
            self.participantes.pop(id_, None)

    # ---------- envio ----------

    async def enviar(self, destino: Participante, mensagem: Dict) -> None:
        try:
            await destino.ws.send_json(mensagem)
        except Exception:
            pass  # a desconexão é tratada no laço do WebSocket

    async def publicar(self, mensagem: Dict, exceto: Optional[str] = None) -> None:
        alvos = [p for p in list(self.participantes.values()) if p.id != exceto]
        await asyncio.gather(*(self.enviar(p, mensagem) for p in alvos))

    async def publicar_perto(self, origem: Participante, mensagem: Dict) -> List[str]:
        alvos = [p for p in list(self.participantes.values())
                 if p.id != origem.id and se_ouvem(origem, p)]
        await asyncio.gather(*(self.enviar(p, mensagem) for p in alvos))
        return [p.id for p in alvos]

    # ---------- movimento ----------

    def mover(self, p: Participante, x: float, y: float, direcao: str) -> bool:
        """O cliente é a autoridade do movimento (é ele que roda a 60 fps); aqui
        só recusamos posição fora do mapa ou dentro de parede. Recusa devolve
        False para o servidor mandar o cliente de volta ao lugar certo — sem
        isso, uma divergência de mapa deixaria os dois lados dessincronizados
        para sempre, e o chat "perto" passaria a mirar no lugar errado."""
        try:
            x, y = float(x), float(y)
        except (TypeError, ValueError):
            return False
        if not (0 <= x <= escritorio.largura * mapa.TAMANHO_TILE
                and 0 <= y <= escritorio.altura * mapa.TAMANHO_TILE):
            return False
        # Quem ficou preso porque alguém colocou uma mesa em cima dele pode sair
        # andando; senão a única saída seria recarregar a página.
        if not mapa.livre(x, y) and mapa.livre(p.x, p.y):
            return False
        p.x, p.y = x, y
        if direcao in ("cima", "baixo", "esquerda", "direita"):
            p.direcao = direcao
        return True


sala = Sala()
