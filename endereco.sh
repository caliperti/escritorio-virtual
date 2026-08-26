#!/bin/bash
# Mostra o endereço público de agora (ele muda a cada vez que o túnel reinicia).
RAIZ="$(cd "$(dirname "$0")" && pwd)"
[ -f "$RAIZ/endereco.txt" ] || { echo "sem endereço ainda — o túnel está subindo?"; exit 1; }
E=$(cat "$RAIZ/endereco.txt")
printf "%s  " "$E"
curl -s -o /dev/null -m 15 "$E/saude" && echo "(no ar)" || echo "(NÃO responde)"
