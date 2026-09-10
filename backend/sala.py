"""Estado da sala: quem está dentro, onde cada um está e quem escuta quem.

Tudo em memória e de propósito: a sala é efêmera, ninguém "salva" um escritório.
Se um dia precisar de histórico de chat, aí sim entra SQLite como nos outros apps.
"""

import asyncio
import time
import re
import secrets
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import mapa
from mapa import escritorio

# Raio (em pixels) em que duas pessoas passam a se ouvir. A histerese evita que
# a chamada fique conectando/desconectando quando alguém anda na fronteira.
RAIO_CONVERSA = 150
# Quanto a pessoa pode andar em UMA mensagem de posição. Andando normal são
# ~13 px a cada 66 ms; o resto é engasgo de rede ou mensagem forjada.
PASSO_LIVRE = 64          # dois tiles: passa sem perguntar nada
PASSO_MAXIMO = 256        # oito tiles: acima disso é sempre recusado
RAIO_SILENCIO = 210

# Paleta dos avatares — sorteada na entrada, o usuário pode trocar.
CORES = ["#f97316", "#22c55e", "#3b82f6", "#e11d48", "#a855f7",
         "#14b8a6", "#eab308", "#8b5cf6", "#06b6d4", "#f43f5e"]

# A cor vem da roupa escolhida no editor (boneco.js), então não dá para validar
# contra uma lista fixa — basta ser um hex de verdade.
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


def cor_valida(valor: Any) -> bool:
    return isinstance(valor, str) and bool(HEX.match(valor))


# O boneco tem 12 escolhas (corpo, pele, cabelo, barba, 4 peças de roupa e 4
# cores) e o estúdio pode criar roupa com id comprido. O teto era 10 chaves de
# 24 letras: cortava `corCalca` e `barba` de TODO mundo — a calça voltava na
# cor padrão e a barba sumia, tanto para os outros quanto na conta salva.
MAX_CHAVES_APARENCIA = 20
MAX_VALOR_APARENCIA = 48


def limpar_aparencia(bruto: Any) -> Dict[str, str]:
    """O catálogo de peles, cabelos e roupas vive no cliente (boneco.js) — aqui
    o servidor só garante que é um dicionário pequeno de texto curto. Valor
    desconhecido não quebra nada: o cliente cai no padrão sozinho."""
    if not isinstance(bruto, dict):
        return {}
    return {str(c)[:16]: str(v)[:MAX_VALOR_APARENCIA]
            for i, (c, v) in enumerate(bruto.items()) if i < MAX_CHAVES_APARENCIA}


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
    conta: str = ""                      # chave da conta: é ela que possui a sala
    visitante: bool = False              # entrou sem cadastro: olha, anda e conversa
    admin: bool = False                  # manda no escritório inteiro
    silenciado: bool = False             # calado pelo admin: não conecta áudio
    ws: Any = field(default=None, repr=False)

    def publico(self) -> Dict:
        zona = mapa.zona_de(self.x, self.y)
        return {
            "id": self.id, "nome": self.nome, "cor": self.cor, "emoji": self.emoji,
            "x": round(self.x, 1), "y": round(self.y, 1), "direcao": self.direcao,
            "mudo": self.mudo, "sem_camera": self.sem_camera, "tela": self.tela,
            "aparencia": self.aparencia,
            "visitante": self.visitante,
            "admin": self.admin,
            "silenciado": self.silenciado,
            "zona": zona["id"] if zona else None,
        }


def se_ouvem(a: Participante, b: Participante) -> bool:
    """Mesma regra do frontend (app.js) — se mudar aqui, mude lá.

    Sala privada é bolha: quem está dentro só fala com quem está dentro, mesmo
    que alguém esteja encostado na parede do lado de fora.

    Dentro de QUALQUER sala todo mundo se ouve, por mais longe que esteja: numa
    reunião ninguém pode ficar mudo só porque sentou na outra ponta da mesa. O
    raio só vale em área aberta (corredor, convivência, jardim).
    """
    za, zb = mapa.zona_de(a.x, a.y), mapa.zona_de(b.x, b.y)
    priv_a = bool(za and za["privada"])
    priv_b = bool(zb and zb["privada"])
    if priv_a or priv_b:
        return priv_a and priv_b and za["id"] == zb["id"]
    if za and zb and za["id"] == zb["id"]:
        return True
    return (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= RAIO_CONVERSA ** 2


def chave_de_castigo(conta: str, nome: str) -> str:
    """Por quem o castigo de expulsão pega. Membro é pela CONTA (trocar o nome
    não desfaz). Visitante não tem conta, então vai pelo nome — não é à prova de
    esperto, mas obriga a escolher outro nome em vez de voltar num clique."""
    return conta if conta else "visitante:" + (nome or "").strip().lower()


class Sala:
    def __init__(self) -> None:
        self.participantes: Dict[str, Participante] = {}
        # convite para entrar na sala de alguém, por sala: {zona_id: {id, ...}}
        self._convidados: Dict[str, set] = {}
        # quem o admin expulsou: {chave: momento em que pode voltar}
        self._castigo: Dict[str, float] = {}
        # quem o admin calou: fica pela CONTA, não pela conexão — senão bastava
        # recarregar a página para voltar a falar
        self._calados: set = set()
        self._trava = asyncio.Lock()

    # ---------- expulsão ----------
    # Fechar o WebSocket não expulsa ninguém: a pessoa reconecta no segundo
    # seguinte com o mesmo login. O castigo é o que faz "expulsar" significar
    # alguma coisa.

    def expulsar(self, p: Participante, segundos: float) -> None:
        self._castigo[chave_de_castigo(p.conta, p.nome)] = time.time() + segundos

    def readmitir(self, chave: str) -> None:
        self._castigo.pop(chave, None)

    def castigo_de(self, conta: str, nome: str) -> float:
        """Quantos segundos ainda faltam para essa pessoa poder voltar (0 = pode)."""
        chave = chave_de_castigo(conta, nome)
        falta = self._castigo.get(chave, 0) - time.time()
        if falta <= 0:
            self._castigo.pop(chave, None)
            return 0
        return falta

    # ---------- silêncio ----------

    def calar(self, p: Participante, calado: bool) -> None:
        chave = chave_de_castigo(p.conta, p.nome)
        if calado:
            self._calados.add(chave)
        else:
            self._calados.discard(chave)
        p.silenciado = calado
        if calado:
            p.mudo = True

    def esta_calado(self, conta: str, nome: str) -> bool:
        return chave_de_castigo(conta, nome) in self._calados

    def expulsos(self) -> List[Dict]:
        agora = time.time()
        fora = [k for k, ate in self._castigo.items() if ate <= agora]
        for k in fora:
            self._castigo.pop(k, None)
        return [{"chave": k, "minutos": max(1, int((ate - agora) / 60) + 1)}
                for k, ate in sorted(self._castigo.items(), key=lambda kv: kv[1])]

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
        # Quem está voltando de uma queda de conexão volta para onde estava —
        # senão cair a internet por um segundo teleportava a pessoa para a
        # recepção no meio de uma conversa.
        voltando = dados.get("voltando")
        if isinstance(voltando, dict):
            try:
                vx, vy = float(voltando["x"]), float(voltando["y"])
            except (KeyError, TypeError, ValueError):
                vx = vy = None
            # A sala trancada tem de barrar aqui também: mandar a coordenada de
            # dentro na hora de conectar era um jeito de nascer dentro da sala
            # dos outros sem passar pela porta — inclusive sendo visitante.
            if vx is not None and mapa.livre(vx, vy) and not self.zona_trancada_para(p, vx, vy):
                p.x, p.y = vx, vy
                async with self._trava:
                    self.participantes[p.id] = p
                return p
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
        for convidados in self._convidados.values():   # o convite morre com a sessão
            convidados.discard(id_)

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

    # ---------- quem pode entrar na sala de alguém ----------
    # O convite vale só enquanto a pessoa está conectada: some quando ela sai,
    # e some quando o dono solta a sala. Não vira lista de permissões guardada
    # em disco de propósito — bater na porta de novo custa um clique.

    def convidados_da(self, zona_id: str) -> set:
        return self._convidados.setdefault(zona_id, set())

    def convidar(self, zona_id: str, id_participante: str) -> None:
        self.convidados_da(zona_id).add(id_participante)

    def esquecer_convite(self, zona_id: str, id_participante: str) -> None:
        self.convidados_da(zona_id).discard(id_participante)

    def zona_trancada_para(self, p: Participante, x: float, y: float) -> Optional[Dict]:
        """A sala em (x, y) barra esta pessoa? Devolve a zona, ou None se pode
        entrar. O que barra é a PORTA TRANCADA, não o fato de ter dono: sala com
        dono e porta aberta é como uma sala de verdade com a porta encostada —
        entra quem quiser."""
        z = escritorio.zona_de(x, y)
        if not z or not z.get("privada") or not z.get("dono") or not z.get("trancada"):
            return None
        if z["dono"] == p.conta:
            return None
        if p.id in self.convidados_da(z["id"]):
            return None
        return z

    # ---------- movimento ----------

    def _linha_livre(self, p: Participante, x: float, y: float) -> bool:
        """Confere de meio em meio tile se dá para ir de onde a pessoa está até
        (x, y) em linha reta, sem furar parede nem cair dentro de sala trancada."""
        passos = max(1, int(((x - p.x) ** 2 + (y - p.y) ** 2) ** 0.5 / (mapa.TAMANHO_TILE / 2)))
        for i in range(1, passos + 1):
            px = p.x + (x - p.x) * i / passos
            py = p.y + (y - p.y) * i / passos
            if not mapa.livre(px, py):
                return False
            if self.zona_trancada_para(p, px, py):
                return False
        return True

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
        # Sala reivindicada é trancada: quem não é dono nem convidado esbarra na
        # porta. Quem JÁ está dentro pode sair andando — senão o dono soltando o
        # convite prenderia a visita lá dentro para sempre.
        if self.zona_trancada_para(p, x, y) and not self.zona_trancada_para(p, p.x, p.y):
            return False
        # Um `mover` sozinho não pode atravessar o escritório. O cliente manda a
        # posição a cada 66 ms andando ~13 px, então um salto grande é sempre
        # mensagem forjada — e servia para cair dentro de qualquer sala e entrar
        # na bolha de áudio dela. Até dois tiles passa direto (engasgo de rede);
        # acima disso o caminho em linha reta precisa estar livre; acima do teto
        # não passa de jeito nenhum.
        salto = ((x - p.x) ** 2 + (y - p.y) ** 2) ** 0.5
        if salto > PASSO_LIVRE:
            if salto > PASSO_MAXIMO or not self._linha_livre(p, x, y):
                return False
        p.x, p.y = x, y
        if direcao in ("cima", "baixo", "esquerda", "direita"):
            p.direcao = direcao
        return True


sala = Sala()
