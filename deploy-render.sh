#!/bin/bash
# Cria o serviço no Render a partir do repositório público, pela API.
#
#   RENDER_KEY=rnd_xxx SENHA=algumacoisa ./deploy-render.sh
#
# O Render aceita "Public Git Repository" como fonte, então não precisa ligar
# conta do GitHub: apontamos direto para o repositório no Hugging Face.
set -e
[ -n "$RENDER_KEY" ] || { echo "Faltou RENDER_KEY"; exit 1; }
REPO="${REPO:-https://huggingface.co/Caliperti/escritorio-virtual}"
NOME="${NOME:-escritorio-virtual}"
API="https://api.render.com/v1"
CAB=(-H "Authorization: Bearer $RENDER_KEY" -H "Content-Type: application/json" -H "Accept: application/json")

DONO=$(curl -s "${CAB[@]}" "$API/owners?limit=1" |
  python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['owner']['id'] if d else '')")
[ -n "$DONO" ] || { echo "Chave inválida (não consegui listar a conta)"; exit 1; }
echo "→ conta: $DONO"

CORPO=$(python3 - "$DONO" "$NOME" "$REPO" "${SENHA:-}" <<'PY'
import json, sys
dono, nome, repo, senha = sys.argv[1:5]
print(json.dumps({
    "type": "web_service", "name": nome, "ownerId": dono, "repo": repo,
    "branch": "main", "autoDeploy": "yes",
    "envVars": ([{"key": "SENHA", "value": senha}] if senha else []),
    "serviceDetails": {
        "env": "docker", "plan": "free", "region": "ohio",
        "healthCheckPath": "/saude",
        "envSpecificDetails": {"dockerfilePath": "./Dockerfile", "dockerContext": "."},
    },
}))
PY
)

echo "→ criando o serviço"
RESP=$(curl -s -X POST "${CAB[@]}" -d "$CORPO" "$API/services")
ID=$(echo "$RESP" | python3 -c "
import json,sys
d = json.load(sys.stdin)
s = d.get('service') or d
print(s.get('id') or '')
")
if [ -z "$ID" ]; then echo "$RESP" | head -c 600; echo; exit 1; fi
URL=$(echo "$RESP" | python3 -c "
import json,sys
d=json.load(sys.stdin); s=d.get('service') or d
print((s.get('serviceDetails') or {}).get('url',''))")
echo "   serviço $ID"

echo "→ esperando a build (a primeira leva alguns minutos)"
for i in $(seq 1 90); do
  EST=$(curl -s "${CAB[@]}" "$API/services/$ID/deploys?limit=1" |
    python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['deploy']['status'] if d else '')")
  printf "\r   %-20s (%ds)" "$EST" $((i*10))
  case "$EST" in live) break;; build_failed|update_failed|canceled) echo; echo "falhou — logs em https://dashboard.render.com/web/$ID"; exit 1;; esac
  sleep 10
done
echo
[ -n "$URL" ] && { echo "→ conferindo"; curl -s -m 30 "$URL/saude"; echo; echo; echo "PRONTO: $URL"; }
