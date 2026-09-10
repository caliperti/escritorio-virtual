"""O estúdio do administrador: subir imagem e virar peça do escritório.

Duas famílias de peça, com regras bem diferentes:

**Móvel, decoração, acessório** — qualquer imagem serve. Ela é desenhada dentro
do retângulo que a peça ocupa no mapa, e quem manda no tamanho é o catálogo
(quantos quadradinhos), não os pixels do arquivo.

**Roupa do boneco** — aí não dá para ser qualquer imagem: tem de ser a folha do
LPC, 576x256 (nove quadros por quatro direções). Sem essa medida a roupa não
encaixa no corpo, e o certo é recusar na hora em vez de deixar entrar torto.

O que é criado aqui fica em `pecas.json` e as imagens em `static/assets/pecas/`.
O catálogo de fábrica (`mapa.py:CATALOGO`) não é tocado: as peças do estúdio são
somadas por cima na subida, então um erro aqui nunca derruba o escritório.
"""

import json
import logging
import re
import struct
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import mapa                      # só para ler os ids de fábrica (mapa.FABRICA)
import nuvem

log = logging.getLogger("escritorio.estudio")

ARQUIVO = Path(__file__).parent / "pecas.json"
PASTA_IMAGENS = Path(__file__).parent / "static" / "assets" / "pecas"
PASTA_ROUPAS = Path(__file__).parent / "static" / "assets" / "lpc"

MAX_BYTES = 3 * 1024 * 1024          # 3 MB por arquivo
FOLHA_ANDANDO = (576, 256)           # 9 quadros x 4 direções, 64px
FOLHA_SENTADO = (192, 256)           # 3 quadros x 4 direções

# Onde a peça pode morar. É a mesma ideia das camadas do desenho: piso embaixo
# de tudo, chão é o móvel, mesa é o que se apoia em cima dele.
CAMADAS = {"piso", "chao", "mesa"}
GRUPOS_ROUPA = {"camisaTipo", "calcaTipo", "sapatoTipo", "chapeuTipo"}

TIPOS = {b"\x89PNG\r\n\x1a\n": "png", b"RIFF": "webp", b"\xff\xd8\xff": "jpg", b"GIF8": "gif"}


def tipo_da_imagem(dados: bytes) -> Optional[str]:
    for magica, ext in TIPOS.items():
        if dados.startswith(magica):
            # "RIFF" também abre WAV e AVI: o WebP se anuncia nos bytes 8..12
            if ext == "webp" and dados[8:12] != b"WEBP":
                return None
            return ext
    return None


def medida_png(dados: bytes) -> Optional[Tuple[int, int]]:
    """Largura e altura lidas do cabeçalho IHDR. Sem biblioteca de imagem no
    servidor, é assim que dá para conferir a folha da roupa antes de aceitar."""
    if not dados.startswith(b"\x89PNG\r\n\x1a\n") or len(dados) < 24:
        return None
    if dados[12:16] != b"IHDR":
        return None
    largura, altura = struct.unpack(">II", dados[16:24])
    return int(largura), int(altura)


def texto_seguro(bruto: str, tamanho: int) -> str:
    """Nome e categoria escritos por gente vão parar no HTML do editor de todo
    mundo. Fora escapar na hora de desenhar, o que é gravado já sai limpo: sem
    `<`, `>`, aspas e sem caractere de controle. Uma peça chamada
    `<img src=1 onerror=...>` rodava script no navegador de qualquer membro."""
    limpo = "".join(c for c in (bruto or "") if c.isprintable() and c not in '<>"\'`')
    return limpo.strip()[:tamanho]


def limpar_id(bruto: str) -> str:
    """Id de arquivo e de catálogo: só letra sem acento, número e sublinhado."""
    base = re.sub(r"[^a-z0-9_]+", "_", (bruto or "").strip().lower()).strip("_")
    return base[:40]


class Estudio:
    def __init__(self) -> None:
        self.pecas: Dict[str, Dict] = {}
        self.roupas: Dict[str, Dict] = {}

    # ---------- disco ----------

    def carregar(self) -> None:
        PASTA_IMAGENS.mkdir(parents=True, exist_ok=True)
        if not ARQUIVO.exists():
            return
        try:
            dados = json.loads(ARQUIVO.read_text(encoding="utf-8"))
            self.pecas = dados.get("pecas") or {}
            self.roupas = dados.get("roupas") or {}
            log.info("estúdio: %d peça(s) e %d roupa(s) criadas pelo admin",
                     len(self.pecas), len(self.roupas))
        except Exception:
            log.exception("pecas.json ilegível; começando vazio (cópia em %s)",
                          nuvem.guardar_ilegivel(ARQUIVO))
            self.pecas, self.roupas = {}, {}

    def salvar(self) -> None:
        nuvem.gravar_atomico(ARQUIVO, json.dumps({"pecas": self.pecas, "roupas": self.roupas},
                                                 ensure_ascii=False, indent=1))

    # ---------- as imagens, para o espelho na nuvem ----------

    def arquivo_da_peca(self, chave: str) -> Optional[Path]:
        peca = self.pecas.get(chave)
        if not peca:
            return None
        return PASTA_IMAGENS / Path(peca.get("imagem", "")).name

    @staticmethod
    def arquivos_da_roupa(chave: str, sem_sentado: bool = False) -> List[Path]:
        lista = []
        for sexo in ("m", "f"):
            lista.append(PASTA_ROUPAS / ("%s_%s.png" % (chave, sexo)))
            if not sem_sentado:
                lista.append(PASTA_ROUPAS / ("sit_%s_%s.png" % (chave, sexo)))
        return lista

    def arquivos_de_imagem(self) -> List[Path]:
        """Toda imagem que o estúdio criou. É o que o espelho na nuvem precisa
        guardar além do `pecas.json`: o catálogo restaurado sem as figuras
        apontava para arquivo nenhum, e o disco do plano gratuito some inteiro."""
        lista = [self.arquivo_da_peca(c) for c in self.pecas]
        for chave, roupa in self.roupas.items():
            lista += self.arquivos_da_roupa(chave, bool(roupa.get("sem_sentado")))
        return [a for a in lista if a is not None]

    @staticmethod
    def _id_livre(base: str, ocupado) -> str:
        """`base`, ou `base_2`, `base_3`… — o primeiro que não estiver em uso."""
        chave, n = base, 2
        while ocupado(chave):
            chave = "%s_%d" % (base, n)
            n += 1
        return chave

    @staticmethod
    def _tem_folha(chave: str) -> bool:
        """Já existe folha com esse nome na pasta do LPC (as de fábrica moram lá)?"""
        return any((PASTA_ROUPAS / ("%s%s_%s.png" % (p, chave, s))).exists()
                   for p in ("", "sit_") for s in ("m", "f"))

    # ---------- móveis e acessórios ----------

    def criar_peca(self, dados: bytes, nome: str, grupo: str, l: int, a: int,
                   bloqueia: bool, camada: str, id_bruto: str = "") -> Tuple[Optional[Dict], str]:
        if len(dados) > MAX_BYTES:
            return None, "Imagem grande demais (o limite é 3 MB)."
        ext = tipo_da_imagem(dados)
        if not ext:
            return None, "Isso não parece uma imagem (aceito PNG, WebP, JPG ou GIF)."
        nome = texto_seguro(nome, 40)
        if len(nome) < 2:
            return None, "Dê um nome à peça."
        if camada not in CAMADAS:
            return None, "Camada inválida."
        l, a = max(1, min(12, int(l))), max(1, min(12, int(a)))
        # O id não pode repetir nem o de outra peça do estúdio NEM o de fábrica:
        # uma "Mesa" do estúdio virava `mesa`, cobria a mesa de fábrica no
        # catálogo, e apagá-la depois levava junto todas as mesas do escritório.
        chave = self._id_livre(limpar_id(id_bruto or nome) or "peca",
                               lambda c: c in self.pecas or c in mapa.FABRICA)
        arquivo = "%s.%s" % (chave, ext)
        (PASTA_IMAGENS / arquivo).write_bytes(dados)
        self.pecas[chave] = {
            "grupo": texto_seguro(grupo, 24) or "Decoração",
            "nome": nome, "l": l, "a": a, "bloqueia": bool(bloqueia),
            "camada": camada, "imagem": "/static/assets/pecas/" + arquivo,
            "criada_em": time.time(),
        }
        self.salvar()
        return {"id": chave, **self.pecas[chave]}, ""

    def remover_peca(self, chave: str) -> Optional[List[Path]]:
        """Devolve os arquivos que saíram (para tirar do espelho também), ou
        None se a peça não existia."""
        alvo = self.arquivo_da_peca(chave)
        if self.pecas.pop(chave, None) is None:
            return None
        try:
            alvo.unlink(missing_ok=True)
        except OSError:
            pass
        self.salvar()
        return [alvo]

    # ---------- roupas do boneco ----------

    def criar_roupa(self, andando: bytes, sentado: Optional[bytes], nome: str,
                    grupo: str, id_bruto: str = "") -> Tuple[Optional[Dict], str]:
        if grupo not in GRUPOS_ROUPA:
            return None, "Escolha onde a roupa entra: cima, baixo, calçado ou cabeça."
        if len(andando) > MAX_BYTES or (sentado and len(sentado) > MAX_BYTES):
            return None, "Folha grande demais (o limite é 3 MB)."
        medida = medida_png(andando)
        if medida is None:
            return None, "A folha andando tem de ser PNG."
        if medida != FOLHA_ANDANDO:
            return None, ("A folha andando tem de ter %dx%d, e essa tem %dx%d. "
                          "É o formato do acervo LPC: 9 quadros por 4 direções, de 64 pixels."
                          % (*FOLHA_ANDANDO, *medida))
        if sentado:
            m2 = medida_png(sentado)
            if m2 != FOLHA_SENTADO:
                return None, ("A folha sentado tem de ter %dx%d, e essa tem %s."
                              % (*FOLHA_SENTADO, "x".join(map(str, m2)) if m2 else "outro formato"))
        nome = texto_seguro(nome, 28)
        if len(nome) < 2:
            return None, "Dê um nome à roupa."
        prefixo = {"camisaTipo": "camisa", "calcaTipo": "calca",
                   "sapatoTipo": "sapato", "chapeuTipo": "chapeu"}[grupo]
        # O id inteiro tem de caber no valor de aparência que o servidor guarda
        # (sala.py:MAX_VALOR_APARENCIA); comprido demais era cortado ao salvar e
        # a roupa escolhida nunca ficava gravada.
        base = "%s_%s" % (prefixo, limpar_id(id_bruto or nome)[:32] or "nova")
        # As folhas de fábrica moram na mesma pasta: "Blazer" virava
        # `camisa_blazer`, sobrescrevia o blazer do acervo e, ao apagar, o deletava.
        chave = self._id_livre(base, lambda c: c in self.roupas or self._tem_folha(c))
        # o boneco procura por corpo: `_m` e `_f`. Uma folha só serve para os dois.
        for sexo in ("m", "f"):
            (PASTA_ROUPAS / ("%s_%s.png" % (chave, sexo))).write_bytes(andando)
            if sentado:
                (PASTA_ROUPAS / ("sit_%s_%s.png" % (chave, sexo))).write_bytes(sentado)
        self.roupas[chave] = {"grupo": grupo, "nome": nome,
                              "sem_sentado": not sentado, "criada_em": time.time()}
        self.salvar()
        return {"id": chave, **self.roupas[chave]}, ""

    def remover_roupa(self, chave: str) -> Optional[List[Path]]:
        """Devolve as folhas que saíram, ou None se a roupa não existia."""
        if self.roupas.pop(chave, None) is None:
            return None
        folhas = self.arquivos_da_roupa(chave)
        for folha in folhas:
            try:
                folha.unlink(missing_ok=True)
            except OSError:
                pass
        self.salvar()
        return folhas


estudio = Estudio()
