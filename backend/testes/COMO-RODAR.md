# Como rodar os testes

Todos moram aqui. Os que falam com o servidor sobem um por conta própria numa
porta separada, e devolvem `contas.json` e `pecas.json` no fim — rodar teste não
mexe no escritório de verdade.

```bash
cd backend

# regras puras, sem servidor e sem navegador (rápidos)
python3 testes/salas.py          # reivindicar, trancar, bater na porta
python3 testes/permissoes.py     # quem edita o quê

# com servidor de verdade e dois WebSockets
.venv/bin/python testes/acesso.py             # login, teto de 10, visitante
.venv/bin/python testes/salas_ao_vivo.py      # o caminho completo da sala
.venv/bin/python testes/permissoes_ao_vivo.py # admin x membro
.venv/bin/python testes/estudio.py            # subir imagem e criar peça

# com navegador (precisa do Playwright e do servidor de pé na 8400)
ADMIN_SENHA=... .venv/bin/python testes/arsenal.py
.venv/bin/python testes/fumaca.py
.venv/bin/python testes/reconexao.py
CONVITE=... .venv/bin/python testes/ligacao_teimosa.py   # teto do sinal e troca de ligação
CONVITE=... .venv/bin/python testes/banda_da_roda.py     # banda por tamanho da roda
```

O teste do arsenal entra como administrador, porque membro comum só edita
dentro da sala dele — essa regra é conferida em `permissoes.py`.
