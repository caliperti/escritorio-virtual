#!/bin/bash
# Câmera e microfone só liberam em https (ou em localhost). Para abrir o
# escritório para outra máquina da rede, gere um certificado e suba com ele:
#
#   ./gerar-certificado.sh
#   PORTA=8400 ./iniciar.sh --ssl-keyfile backend/certificado/chave.pem \
#                           --ssl-certfile backend/certificado/certificado.pem
#
# O navegador vai reclamar que o certificado é auto-assinado — é só aceitar.
cd "$(dirname "$0")/backend" || exit 1
mkdir -p certificado
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout certificado/chave.pem -out certificado/certificado.pem \
  -subj "/CN=escritorio.local" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:$(ipconfig getifaddr en0 2>/dev/null || echo 127.0.0.1)"
echo "Certificado em backend/certificado/"
