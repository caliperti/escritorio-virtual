#!/bin/bash
# Põe no ar o que já está na branch main do GitHub.
#
#   ./subir.sh
#
# Por que existe: o repositório é público, e para repositório público o Render
# não cria webhook. Ou seja, `git push` sozinho NÃO publica nada — é preciso
# pedir o deploy pela API, que é o que este script faz. Ele espera a subida
# terminar e avisa se deu errado.
#
# Precisa da chave da API do Render em RENDER_KEY. Pegue a sua em
# https://dashboard.render.com/u/settings#api-keys (é pessoal, não compartilhe)
# e guarde no .env, que não vai para o repositório:
#
#   echo 'RENDER_KEY=rnd_suachave' >> .env
set -e

cd "$(dirname "$0")"
[ -f .env ] && { set -a; . ./.env; set +a; }

SERVICO="${RENDER_SERVICO:-srv-da87vhajnfac73d383u0}"
API="https://api.render.com/v1"
[ -n "$RENDER_KEY" ] || {
  echo "Faltou RENDER_KEY. Pegue em https://dashboard.render.com/u/settings#api-keys"
  echo "e rode:  echo 'RENDER_KEY=rnd_suachave' >> .env"
  exit 1
}
CAB=(-H "Authorization: Bearer $RENDER_KEY" -H "Content-Type: application/json")

# Avisa se o que está aqui ainda não foi para o GitHub — o Render publica o que
# está lá, não o que está na sua máquina.
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  há mudanças não commitadas — o Render vai publicar o que está no GitHub"
fi
LOCAL=$(git rev-parse HEAD)
git fetch -q github main 2>/dev/null || true
REMOTO=$(git rev-parse github/main 2>/dev/null || echo "$LOCAL")
[ "$LOCAL" = "$REMOTO" ] || echo "⚠️  seu commit não está no github/main — faça 'git push github main' antes"

echo "→ pedindo o deploy"
ID=$(curl -s -X POST "${CAB[@]}" -d '{"clearCache":"do_not_clear"}' "$API/services/$SERVICO/deploys" |
  python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id') or '')")
[ -n "$ID" ] || { echo "não consegui pedir o deploy — a chave está certa?"; exit 1; }
echo "→ deploy $ID"

ANTERIOR=""
for _ in $(seq 1 60); do
  # Nos primeiros segundos a consulta pode voltar vazia; nesse caso mantemos o
  # último status conhecido em vez de imprimir uma linha em branco.
  E=$(curl -s "${CAB[@]}" "$API/services/$SERVICO/deploys/$ID" |
      python3 -c "import json,sys
try: print(json.load(sys.stdin).get('status') or '')
except Exception: print('')")
  [ -n "$E" ] || E="${ANTERIOR:-começando}"
  case "$E" in
    live)  echo "✅ no ar: https://escritorio-virtual-3al4.onrender.com"; exit 0 ;;
    build_failed|update_failed|canceled|pre_deploy_failed)
      echo "❌ falhou ($E) — veja os logs em"
      echo "   https://dashboard.render.com/web/$SERVICO/deploys/$ID"
      exit 1 ;;
    *) [ "$E" = "$ANTERIOR" ] || echo "   $E..."; ANTERIOR="$E"; sleep 10 ;;
  esac
done
echo "⏱️  demorou demais; acompanhe em https://dashboard.render.com/web/$SERVICO"
exit 1
