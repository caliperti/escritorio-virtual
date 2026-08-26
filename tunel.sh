#!/bin/bash
# Mantém o túnel público de pé e anota o endereço atual em endereco.txt.
#
# Por que não é só "rodar o cloudflared": quando a conexão com a Cloudflare
# morre, o processo às vezes fica vivo tentando reconectar para sempre — foi o
# que derrubou o acesso. Aqui um vigia confere o endereço de fora em fora; se
# ele parar de responder, o túnel é morto e o launchd sobe outro.
RAIZ="$(cd "$(dirname "$0")" && pwd)"
PORTA="${PORTA:-8400}"
LOG=/tmp/tunel.log
BIN="${CLOUDFLARED:-$HOME/bin/cloudflared}"
[ -x "$BIN" ] || BIN=$(command -v cloudflared)

: > "$LOG"
"$BIN" tunnel --url "http://localhost:$PORTA" --no-autoupdate >> "$LOG" 2>&1 &
TUNEL=$!
trap 'kill $TUNEL 2>/dev/null' EXIT

ENDERECO=""
for _ in $(seq 1 40); do
  ENDERECO=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1)
  [ -n "$ENDERECO" ] && break
  sleep 2
done
[ -n "$ENDERECO" ] || { echo "não consegui abrir o túnel"; exit 1; }
echo "$ENDERECO" > "$RAIZ/endereco.txt"
echo "$(date '+%F %T') no ar: $ENDERECO" >> "$RAIZ/endereco.log"

FALHAS=0
while kill -0 $TUNEL 2>/dev/null; do
  sleep 60
  if curl -s -o /dev/null -m 25 "$ENDERECO/saude"; then
    FALHAS=0
  else
    FALHAS=$((FALHAS + 1))
    echo "$(date '+%F %T') sem resposta ($FALHAS/3)" >> "$RAIZ/endereco.log"
    [ $FALHAS -ge 3 ] && { echo "$(date '+%F %T') derrubando o túnel para o launchd subir outro" >> "$RAIZ/endereco.log"; exit 1; }
  fi
done
