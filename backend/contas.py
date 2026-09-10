"""Contas das pessoas do escritório.

Cada um se cadastra uma vez (com o código da sala), põe **e-mail, senha e o
nome que os outros vão ver**, escolhe o personagem e pronto: nas próximas vezes
entra com e-mail e senha, e o boneco volta do jeito que ficou.

E-mail e nome são coisas diferentes de propósito. O e-mail é a identidade: é
por ele que se entra, é ele que diz quem é administrador e é ele que segura a
sala reivindicada. O nome é o que fica escrito em cima do boneco, e pode ser
trocado quando a pessoa quiser sem nada disso se perder. Antes o nome era o
login, e por isso quem entrava como administrador andava pelo escritório com o
próprio e-mail escrito na cabeça.

O arquivo `contas.json` guarda tudo — é pequeno e legível, não vale um banco.
Senha nunca é guardada: fica só o hash PBKDF2 com sal por conta.
"""

import hashlib
import os
import re
import json
import logging
import secrets
import time
import unicodedata
from pathlib import Path
from typing import Dict, Optional

log = logging.getLogger("escritorio.contas")

ARQUIVO = Path(__file__).parent / "contas.json"
# Quantas contas de MEMBRO a sala aceita. **0 quer dizer sem limite**, que é o
# padrão: quem tem o código da sala se cadastra. Pondo um número em MAX_CONTAS
# (variável de ambiente), quem chega depois de esgotar entra como visitante —
# anda, vê e conversa, mas não mexe no escritório.
try:
    MAX_CONTAS = max(0, int(os.environ.get("MAX_CONTAS", "0")))
except ValueError:
    MAX_CONTAS = 0

# Quem manda no escritório, pelo E-MAIL. Fica no código de propósito:
# administrador não se ganha por cadastro, se ganha por decisão de quem é dono
# da sala. Dá para acrescentar outros pela variável de ambiente ADMINS.
ADMINS = {"gulisboa5@hotmail.com"}

# E-mail de gente, não de RFC: o que importa é ter um arroba com coisa dos dois
# lados e um ponto no domínio. Validação apertada demais recusa e-mail válido e
# não impede ninguém de digitar errado.
EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s.]+(\.[^@\s.]+)+$")

ITERACOES = 120_000
VALIDADE_TOKEN = 60 * 60 * 24 * 30          # 30 dias logado
ERROS_ATE_ESPERAR = 5                       # senhas erradas antes de o relógio começar


def eh_admin(email: str) -> bool:
    chave = _chave(email or "")
    extras = {_chave(n) for n in os.environ.get("ADMINS", "").split(",") if n.strip()}
    return chave in ADMINS or chave in extras


def email_valido(email: str) -> bool:
    return bool(EMAIL.match((email or "").strip()))


def _chave(nome: str) -> str:
    """Nome sem acento, minúsculo — para 'José' e 'jose' serem a mesma conta."""
    limpo = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
    return " ".join(limpo.lower().split())


# Letras de outro alfabeto que na tela são iguais às nossas. Sem esta tabela,
# "Сhefao" com C cirílico passava pela trava de nome repetido e aparecia na
# lista idêntico ao "Chefao" de verdade — o `encode("ascii","ignore")` do
# `_chave` simplesmente JOGAVA FORA a letra estrangeira em vez de comparar.
CONFUNDIVEIS = str.maketrans({
    # cirílico
    "а": "a", "в": "b", "е": "e", "к": "k", "м": "m", "н": "h", "о": "o",
    "р": "p", "с": "c", "т": "t", "у": "y", "х": "x", "і": "i", "ј": "j",
    "ѕ": "s", "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H",
    "О": "O", "Р": "P", "С": "C", "Т": "T", "У": "Y", "Х": "X", "І": "I",
    "Ј": "J", "Ѕ": "S",
    # grego
    "α": "a", "β": "b", "ε": "e", "ι": "i", "κ": "k", "ν": "v", "ο": "o",
    "ρ": "p", "τ": "t", "υ": "u", "χ": "x", "Α": "A", "Β": "B", "Ε": "E",
    "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K", "Μ": "M", "Ν": "N", "Ο": "O",
    "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X",
})


def nome_de_pessoa(nome: str) -> bool:
    """O nome que aparece em cima do boneco não pode ter cara de e-mail: dava
    para se cadastrar com o nome `gulisboa5@hotmail.com` e andar por aí com o
    e-mail do administrador escrito na cabeça. Não é escalada de poder — quem
    manda é o campo `email` —, mas na tela ninguém distingue."""
    return not EMAIL.match((nome or "").strip())


def _chave_nome(nome: str) -> str:
    """Como `_chave`, mas para NOME DE EXIBIÇÃO: antes de tirar o acento,
    troca letra estrangeira parecida pela nossa. Só aqui — mudar `_chave`
    mudaria a chave das contas que já existem."""
    return _chave((nome or "").translate(CONFUNDIVEIS))


def _hash(senha: str, sal: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", senha.encode(), bytes.fromhex(sal), ITERACOES).hex()


class Contas:
    def __init__(self) -> None:
        self.contas: Dict[str, Dict] = {}       # chave do e-mail -> conta
        self.tokens: Dict[str, Dict] = {}       # token -> {conta, criado_em}
        self._erros_login: Dict[str, int] = {}   # senha errada seguida, por conta
        self._espera_login: Dict[str, float] = {}  # até quando a conta espera

    # ---------- disco ----------

    def carregar(self) -> None:
        if not ARQUIVO.exists():
            return
        try:
            dados = json.loads(ARQUIVO.read_text(encoding="utf-8"))
            self.contas = dados.get("contas", {})
            self._migrar()
            # Formato antigo: o valor era só a chave da conta, sem data. Ele
            # ganha a data de AGORA — se ficasse sem data, todo mundo que já
            # estava logado seria deslogado na primeira subida desta versão.
            agora = time.time()
            self.tokens = {}
            for t, dado in dados.get("tokens", {}).items():
                chave = dado.get("conta", "") if isinstance(dado, dict) else dado
                if chave not in self.contas:
                    continue
                nascimento = dado.get("criado_em", agora) if isinstance(dado, dict) else agora
                self.tokens[t] = {"conta": chave, "criado_em": nascimento}
            self._limpar_tokens()
            log.info("%d contas carregadas", len(self.contas))
        except Exception:
            log.exception("contas.json ilegível — começando vazio")

    def _migrar(self) -> None:
        """Conta antiga não tinha e-mail: o login era o nome. Quem cadastrou o
        próprio e-mail como nome vira conta de e-mail; quem cadastrou apelido
        continua entrando pelo apelido, e o campo fica vazio até a pessoa
        preencher. Assim ninguém perde a conta na virada."""
        mexeu = False
        for chave, c in self.contas.items():
            if "email" in c:
                continue
            c["email"] = chave if EMAIL.match(chave) else ""
            mexeu = True
        if mexeu:
            log.info("contas antigas migradas para o formato com e-mail")
            self.salvar()

    def salvar(self) -> None:
        ARQUIVO.write_text(json.dumps({"contas": self.contas, "tokens": self.tokens},
                                      ensure_ascii=False), encoding="utf-8")

    # ---------- cadastro e entrada ----------

    def existe(self, email_ou_nome: str) -> bool:
        return _chave(email_ou_nome) in self.contas

    def nome_em_uso(self, nome: str, menos: str = "") -> bool:
        """Dois bonecos com o mesmo nome na tela é confusão garantida."""
        alvo = _chave_nome(nome)
        return any(_chave_nome(c.get("nome", "")) == alvo and k != menos
                   for k, c in self.contas.items())

    def cheio(self) -> bool:
        return MAX_CONTAS > 0 and len(self.contas) >= MAX_CONTAS

    def vagas(self) -> Optional[int]:
        """Quantas sobram, ou None quando não há limite."""
        return None if MAX_CONTAS == 0 else max(0, MAX_CONTAS - len(self.contas))

    def registrar(self, email: str, nome: str, senha: str,
                  aparencia: Dict, cor: str) -> Optional[str]:
        email = (email or "").strip()[:120]
        nome = (nome or "").strip()[:24]
        # A chave do nome também precisa de 2 letras: nome só de emoji ou de
        # ideograma virava chave vazia, e duas contas assim eram a mesma conta.
        if (not email_valido(email) or len(nome) < 2 or len(_chave(nome)) < 2
                or not nome_de_pessoa(nome)
                or len(senha) < 4 or self.existe(email) or self.nome_em_uso(nome)
                or self.cheio()):
            return None
        sal = secrets.token_hex(16)
        self.contas[_chave(email)] = {
            "email": email, "nome": nome, "sal": sal, "hash": _hash(senha, sal),
            "aparencia": aparencia, "cor": cor,
            "criada_em": time.time(), "visto_em": time.time(),
        }
        return self._novo_token(_chave(email))

    def entrar(self, email: str, senha: str) -> Optional[str]:
        """Devolve o token, ou None se e-mail/senha não batem ou se a conta está
        de castigo por tentativa demais. Sem o castigo dava para testar senha à
        vontade — e cada tentativa custa 120 mil voltas de PBKDF2, ou seja,
        também servia para derrubar o servidor, que é de um núcleo só."""
        chave = _chave(email)
        castigo = self._espera_login.get(chave, 0)
        if castigo > time.time():
            return None
        conta = self.contas.get(chave)
        if not conta or _hash(senha, conta["sal"]) != conta["hash"]:
            n = self._erros_login.get(chave, 0) + 1
            self._erros_login[chave] = n
            if n >= ERROS_ATE_ESPERAR:
                # dobra a cada nova rodada de erros, com teto de 5 minutos
                espera = min(300, 2 ** (n - ERROS_ATE_ESPERAR))
                self._espera_login[chave] = time.time() + espera
            return None
        self._erros_login.pop(chave, None)
        self._espera_login.pop(chave, None)
        conta["visto_em"] = time.time()
        return self._novo_token(_chave(email))

    def _novo_token(self, chave: str) -> str:
        # Um token por sessão; os antigos continuam valendo (a pessoa pode ter
        # deixado aberto no celular e no computador), mas agora ELES VENCEM.
        # Antes VALIDADE_TOKEN existia e ninguém lia: um token vazado valia para
        # sempre, e a lista era cortada pelos 100 mais antigos, deslogando gente
        # de verdade sem motivo.
        token = secrets.token_urlsafe(24)
        self.tokens[token] = {"conta": chave, "criado_em": time.time()}
        self._limpar_tokens()
        self.salvar()
        return token

    def _limpar_tokens(self) -> None:
        limite = time.time() - VALIDADE_TOKEN
        for t, dado in list(self.tokens.items()):
            if self._nascimento(dado) < limite:
                self.tokens.pop(t, None)

    @staticmethod
    def _nascimento(dado) -> float:
        # formato antigo: o valor era só a chave da conta, sem data
        return dado.get("criado_em", 0) if isinstance(dado, dict) else 0

    @staticmethod
    def _conta_do_token(dado) -> str:
        return dado.get("conta", "") if isinstance(dado, dict) else (dado or "")

    def chave_do_token(self, token: str) -> str:
        """A conta de um token, ou '' se ele não existe mais ou já venceu."""
        dado = self.tokens.get(token or "")
        if dado is None:
            return ""
        if self._nascimento(dado) < time.time() - VALIDADE_TOKEN:
            self.tokens.pop(token, None)
            self.salvar()
            return ""
        return self._conta_do_token(dado)

    def por_token(self, token: str) -> Optional[Dict]:
        chave = self.chave_do_token(token)
        conta = self.contas.get(chave) if chave else None
        if conta:
            conta["visto_em"] = time.time()
        return conta

    def atualizar(self, token: str, nome: Optional[str] = None,
                  aparencia: Optional[Dict] = None, cor: Optional[str] = None) -> bool:
        chave = self.chave_do_token(token)
        conta = self.contas.get(chave) if chave else None
        if not conta:
            return False
        if nome:
            # A conta é do E-MAIL: trocar o nome mexe só no que aparece em cima
            # do boneco. A chave não muda, então nem a sala reivindicada nem o
            # selo de administrador se perdem — e renomear-se para um nome de
            # administrador deixou de dar poder nenhum, porque poder vem do
            # e-mail. O que ainda vale é não repetir nome de outro membro.
            novo = nome.strip()[:24]
            if novo and len(_chave(novo)) >= 2 and not self.nome_em_uso(novo, chave):
                conta["nome"] = novo
        if aparencia:
            conta["aparencia"] = aparencia
        if cor:
            conta["cor"] = cor
        self.salvar()
        return True


contas = Contas()
