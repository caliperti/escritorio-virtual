"""Contas das pessoas do escritório.

Cada um se cadastra uma vez (com o código de convite da sala), escolhe o
personagem e pronto: nas próximas vezes é só entrar com nome e senha, e o
boneco volta do jeito que ficou. O arquivo `contas.json` guarda tudo — é
pequeno e legível, não vale um banco aqui.

Senha nunca é guardada: fica só o hash PBKDF2 com sal por conta.
"""

import hashlib
import json
import logging
import secrets
import time
import unicodedata
from pathlib import Path
from typing import Dict, Optional

log = logging.getLogger("escritorio.contas")

ARQUIVO = Path(__file__).parent / "contas.json"
ITERACOES = 120_000
VALIDADE_TOKEN = 60 * 60 * 24 * 30          # 30 dias logado


def _chave(nome: str) -> str:
    """Nome sem acento, minúsculo — para 'José' e 'jose' serem a mesma conta."""
    limpo = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
    return " ".join(limpo.lower().split())


def _hash(senha: str, sal: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", senha.encode(), bytes.fromhex(sal), ITERACOES).hex()


class Contas:
    def __init__(self) -> None:
        self.contas: Dict[str, Dict] = {}       # chave do nome -> conta
        self.tokens: Dict[str, str] = {}        # token -> chave do nome

    # ---------- disco ----------

    def carregar(self) -> None:
        if not ARQUIVO.exists():
            return
        try:
            dados = json.loads(ARQUIVO.read_text(encoding="utf-8"))
            self.contas = dados.get("contas", {})
            self.tokens = {t: c for t, c in dados.get("tokens", {}).items() if c in self.contas}
            log.info("%d contas carregadas", len(self.contas))
        except Exception:
            log.exception("contas.json ilegível — começando vazio")

    def salvar(self) -> None:
        ARQUIVO.write_text(json.dumps({"contas": self.contas, "tokens": self.tokens},
                                      ensure_ascii=False), encoding="utf-8")

    # ---------- cadastro e entrada ----------

    def existe(self, nome: str) -> bool:
        return _chave(nome) in self.contas

    def registrar(self, nome: str, senha: str, aparencia: Dict, cor: str) -> Optional[str]:
        nome = nome.strip()[:24]
        if len(nome) < 2 or len(senha) < 4 or self.existe(nome):
            return None
        sal = secrets.token_hex(16)
        self.contas[_chave(nome)] = {
            "nome": nome, "sal": sal, "hash": _hash(senha, sal),
            "aparencia": aparencia, "cor": cor,
            "criada_em": time.time(), "visto_em": time.time(),
        }
        return self._novo_token(_chave(nome))

    def entrar(self, nome: str, senha: str) -> Optional[str]:
        conta = self.contas.get(_chave(nome))
        if not conta or _hash(senha, conta["sal"]) != conta["hash"]:
            return None
        conta["visto_em"] = time.time()
        return self._novo_token(_chave(nome))

    def _novo_token(self, chave: str) -> str:
        # um token por sessão; os antigos continuam valendo (a pessoa pode ter
        # deixado aberto no celular e no computador)
        token = secrets.token_urlsafe(24)
        self.tokens[token] = chave
        if len(self.tokens) > 400:              # não deixar a lista crescer sem fim
            for t in list(self.tokens)[:100]:
                self.tokens.pop(t, None)
        self.salvar()
        return token

    def por_token(self, token: str) -> Optional[Dict]:
        chave = self.tokens.get(token or "")
        conta = self.contas.get(chave) if chave else None
        if conta:
            conta["visto_em"] = time.time()
        return conta

    def atualizar(self, token: str, nome: Optional[str] = None,
                  aparencia: Optional[Dict] = None, cor: Optional[str] = None) -> bool:
        chave = self.tokens.get(token or "")
        conta = self.contas.get(chave) if chave else None
        if not conta:
            return False
        if nome:
            novo = nome.strip()[:24]
            outra = _chave(novo)
            if novo and (outra == chave or outra not in self.contas):
                if outra != chave:                    # mudou de nome: muda a chave
                    self.contas[outra] = self.contas.pop(chave)
                    for t, c in list(self.tokens.items()):
                        if c == chave:
                            self.tokens[t] = outra
                    chave = outra
                self.contas[chave]["nome"] = novo
                conta = self.contas[chave]
        if aparencia:
            conta["aparencia"] = aparencia
        if cor:
            conta["cor"] = cor
        self.salvar()
        return True


contas = Contas()
