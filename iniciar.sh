#!/bin/bash
# Sobe o escritório na porta 8400 (as outras portas já estão ocupadas pelos
# outros apps: 8100 gestor, 8200 área de membros, 8300 espião).
cd "$(dirname "$0")" || exit 1

# A senha da sala mora no .env para sobreviver a reinícios (sem ele, cada
# ./iniciar.sh subiria a sala aberta de novo).
if [ -f .env ]; then set -a; . ./.env; set +a; fi

cd backend || exit 1
[ -d .venv ] || { python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt; }
exec .venv/bin/uvicorn main:app --host 0.0.0.0 --port "${PORTA:-8400}" "$@"
