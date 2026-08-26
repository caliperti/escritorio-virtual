#!/bin/bash
# Abre um endereço público (https) para o escritório que está rodando aqui.
# Usa o túnel rápido da Cloudflare: não precisa de conta, e o https é o que
# libera câmera e microfone fora do localhost.
#
#   ./iniciar.sh &        # o escritório na porta 8400
#   ./publicar.sh         # o endereço público
#
# O link vale enquanto este processo estiver de pé. Para exigir senha, suba o
# servidor com SENHA=algumacoisa ./iniciar.sh
BIN="${CLOUDFLARED:-$HOME/bin/cloudflared}"
[ -x "$BIN" ] || BIN=$(command -v cloudflared)
[ -x "$BIN" ] || { echo "cloudflared não encontrado — veja https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"; exit 1; }
exec "$BIN" tunnel --url "http://localhost:${PORTA:-8400}" --no-autoupdate
