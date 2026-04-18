#!/bin/bash
# Tests des routes publiques /api/flow/*
# Usage: API_KEY=evak_xxx ./test-flow-routes.sh

set -e

BASE="http://localhost:3010/api/flow"
KEY="${API_KEY:-evak_c37d122bde441333913e02fdde0c9f9b360d523d}"
H="-H Content-Type:application/json -H X-Api-Key:$KEY"

echo "=== 1. GET projects (sans auth → 401) ==="
curl -sS -o /dev/null -w "Status: %{http_code}\n" "$BASE/projects?date=2026-04-18"

echo
echo "=== 2. GET projects (avec auth, vide) ==="
curl -sS $H "$BASE/projects?date=2026-04-18" | head -c 500
echo

echo
echo "=== 3. Régie invalide ==="
curl -sS $H "$BASE/projects?date=2026-04-18&regie=INVALID" | head -c 200
echo

echo
echo "=== Setup : créer un projet via admin (script TS) ==="
echo "Skipped — sera fait via le test runner TS"
