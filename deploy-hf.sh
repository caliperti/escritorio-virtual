#!/bin/bash
# Publica o escritório num Space do Hugging Face (grátis, sem cartão).
#
#   HF_TOKEN=hf_xxx ./deploy-hf.sh [nome-do-space]
#
# O que faz: cria o Space (SDK docker), manda o código, grava a SENHA como
# secret do Space (não vai para o código) e espera a build subir.
set -e
[ -n "$HF_TOKEN" ] || { echo "Faltou HF_TOKEN"; exit 1; }
NOME="${1:-escritorio-virtual}"
RAIZ="$(cd "$(dirname "$0")" && pwd)"
API="https://huggingface.co/api"

USUARIO=$(curl -s -H "Authorization: Bearer $HF_TOKEN" "$API/whoami-v2" |
  python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('name',''))")
[ -n "$USUARIO" ] || { echo "Token inválido (whoami não respondeu com um usuário)"; exit 1; }
echo "→ conta: $USUARIO"

echo "→ criando o Space $USUARIO/$NOME"
curl -s -X POST "$API/repos/create" -H "Authorization: Bearer $HF_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"space\",\"name\":\"$NOME\",\"sdk\":\"docker\",\"private\":false}" |
  python3 -c "import json,sys; d=json.load(sys.stdin); print('  ', d.get('url') or d.get('error'))"

TRAB=$(mktemp -d)
git clone -q "https://$USUARIO:$HF_TOKEN@huggingface.co/spaces/$USUARIO/$NOME" "$TRAB/space"
git -C "$RAIZ" archive HEAD | tar -x -C "$TRAB/space"

# O Space precisa do cabeçalho YAML no topo do README, e é ele que diz em que
# porta o container escuta.
python3 - "$TRAB/space/README.md" <<'PY'
import sys, pathlib
p = pathlib.Path(sys.argv[1])
corpo = p.read_text(encoding="utf-8")
cabecalho = """---
title: Escritório Virtual
emoji: 🏢
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 8400
pinned: false
short_description: Escritório 2D com áudio e vídeo por proximidade
---

"""
p.write_text(cabecalho + corpo, encoding="utf-8")
PY

cd "$TRAB/space"
git config user.email "bebeualipertu@gmail.com"
git config user.name "Christian Aliperti"
git add -A
git commit -q -m "Escritório virtual" || true
echo "→ enviando o código"
git push -q origin main 2>&1 | tail -2 || git push -q origin master

if [ -n "$SENHA" ]; then
  echo "→ gravando a senha da sala como secret"
  curl -s -X POST "$API/spaces/$USUARIO/$NOME/secrets" -H "Authorization: Bearer $HF_TOKEN" \
    -H "Content-Type: application/json" -d "{\"key\":\"SENHA\",\"value\":\"$SENHA\"}" > /dev/null
fi

echo "→ esperando a build (leva alguns minutos na primeira vez)"
ENDERECO="https://$(echo "$USUARIO" | tr '[:upper:]' '[:lower:]')-$NOME.hf.space"
for i in $(seq 1 60); do
  ESTADO=$(curl -s -H "Authorization: Bearer $HF_TOKEN" "$API/spaces/$USUARIO/$NOME" |
    python3 -c "import json,sys; print(json.load(sys.stdin).get('runtime',{}).get('stage',''))")
  printf "\r   %-14s (%ds)" "$ESTADO" $((i*10))
  [ "$ESTADO" = "RUNNING" ] && break
  case "$ESTADO" in *ERROR*|*FAILED*) echo; echo "build falhou — veja os logs em https://huggingface.co/spaces/$USUARIO/$NOME"; exit 1;; esac
  sleep 10
done
echo
echo "→ conferindo o app"
curl -s -m 20 "$ENDERECO/saude" && echo
echo
echo "PRONTO: $ENDERECO"
