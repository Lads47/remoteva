#!/usr/bin/env bash
# test-api.sh — Tests d'intégration de l'API REST SRT LADS (Phase 2.2)
#
# Utilisation :
#   ./test-api.sh                              # tests sur HTTPS prod (gatesrt.evaremote.com)
#   BASE=http://127.0.0.1:3000 ./test-api.sh   # tests loopback (utile pour dev)
#
# Lit ADMIN_WEB_USER / ADMIN_WEB_PASSWORD depuis /opt/srt-lads/.env (via sudo)
# ou depuis les variables d'env si fournies.

set -uo pipefail

BASE="${BASE:-https://gatesrt.evaremote.com}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

# -- Credentials --------------------------------------------------------------

if [ -z "${ADMIN_WEB_USER:-}" ] || [ -z "${ADMIN_WEB_PASSWORD:-}" ]; then
  if [ -r /opt/srt-lads/.env ]; then
    SRC=/opt/srt-lads/.env
  elif sudo -n test -r /opt/srt-lads/.env 2>/dev/null; then
    SRC=/opt/srt-lads/.env
    READ_CMD="sudo cat"
  else
    echo "ERREUR : impossible de lire les credentials. Fournissez ADMIN_WEB_USER / ADMIN_WEB_PASSWORD." >&2
    exit 1
  fi
  ADMIN_WEB_USER="$(${READ_CMD:-cat} "$SRC" | grep ^ADMIN_WEB_USER | cut -d= -f2-)"
  ADMIN_WEB_PASSWORD="$(${READ_CMD:-cat} "$SRC" | grep ^ADMIN_WEB_PASSWORD | cut -d= -f2-)"
fi

PASS_COUNT=0
FAIL_COUNT=0

ok()   { echo "  OK   $*"; PASS_COUNT=$((PASS_COUNT+1)); }
fail() { echo "  FAIL $*"; FAIL_COUNT=$((FAIL_COUNT+1)); }

# Wrappers curl
CURL="curl -sk -b $COOKIE_JAR -c $COOKIE_JAR"

http_code() {
  local method="$1"; shift
  local url="$1"; shift
  local data="${1:-}"
  if [ -n "$data" ]; then
    $CURL -o /tmp/api_body -w "%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "$url"
  else
    $CURL -o /tmp/api_body -w "%{http_code}" -X "$method" "$url"
  fi
}

api() {
  local method="$1"; shift
  local path="$1"; shift
  local data="${1:-}"
  http_code "$method" "$BASE$path" "$data"
}

show_body() { cat /tmp/api_body 2>/dev/null; echo; }

# -- 1. Authentification ------------------------------------------------------

echo "=== 1. Authentification ==="
code=$(http_code GET "$BASE/auth/login")
[ "$code" = "200" ] && ok "GET /auth/login -> 200" || fail "GET /auth/login -> $code"

code=$($CURL -o /dev/null -w "%{http_code}" -X POST \
  --data-urlencode "user=$ADMIN_WEB_USER" \
  --data-urlencode "password=$ADMIN_WEB_PASSWORD" \
  "$BASE/auth/login")
[ "$code" = "302" ] && ok "POST /auth/login -> 302 (login OK)" || { fail "POST /auth/login -> $code"; exit 1; }

code=$(api GET /api/health)
[ "$code" = "200" ] && ok "GET /api/health (authentifié) -> 200" || fail "GET /api/health -> $code"

# -- 2. Création projet -------------------------------------------------------

echo ""
echo "=== 2. Création projet ==="
TS=$(date +%s)
PROJECT_PAYLOAD=$(cat <<JSON
{
  "name": "Test API ${TS}",
  "status": "draft",
  "config": {
    "passphrase": "TestPassphrase123",
    "defaultLatency": 300,
    "defaultOverhead": 25,
    "defaultBitrate": 8000
  }
}
JSON
)
code=$(api POST /api/projects "$PROJECT_PAYLOAD")
if [ "$code" = "201" ]; then
  PROJECT_ID=$(grep -oE '"id":"[^"]+"' /tmp/api_body | head -1 | cut -d'"' -f4)
  ok "POST /api/projects -> 201 (id=$PROJECT_ID)"
else
  fail "POST /api/projects -> $code"; show_body; exit 1
fi

# -- 3. Liste -----------------------------------------------------------------

echo ""
echo "=== 3. Liste ==="
code=$(api GET /api/projects)
[ "$code" = "200" ] && ok "GET /api/projects -> 200" || fail "GET /api/projects -> $code"

# -- 4. Ajout site ------------------------------------------------------------

echo ""
echo "=== 4. Ajout site ==="
SITE_PAYLOAD='{
  "name": "Bordeaux Test",
  "streamIdCam": "bordeaux-test-cam",
  "streamIdReturn": "bordeaux-test-retour",
  "technician": {"name": "Jean Dupont", "phone": "0612345678"},
  "notes": "Salle Pierre Mendès"
}'
code=$(api POST "/api/projects/$PROJECT_ID/sites" "$SITE_PAYLOAD")
if [ "$code" = "201" ]; then
  SITE_ID=$(grep -oE '"id":"[^"]+"' /tmp/api_body | head -1 | cut -d'"' -f4)
  ok "POST /api/projects/$PROJECT_ID/sites -> 201 (siteId=$SITE_ID)"
else
  fail "POST sites -> $code"; show_body
fi

# -- 5. URLs générées ---------------------------------------------------------

echo ""
echo "=== 5. URLs SRT générées ==="
code=$(api GET "/api/projects/$PROJECT_ID/sites/$SITE_ID/urls")
if [ "$code" = "200" ]; then
  ok "GET /sites/$SITE_ID/urls -> 200"
  echo "  Contenu :"
  show_body | sed 's/^/    /'
else
  fail "GET urls -> $code"; show_body
fi

# -- 6. Validation : streamId invalide ----------------------------------------

echo ""
echo "=== 6. Validation (rejet d'un streamId invalide) ==="
BAD_PAYLOAD='{"name":"Bad","streamIdCam":"BAD ID!!","streamIdReturn":"ok-return"}'
code=$(api POST "/api/projects/$PROJECT_ID/sites" "$BAD_PAYLOAD")
[ "$code" = "400" ] && ok "POST site avec streamId invalide -> 400" || fail "POST site invalide -> $code"

# -- 7. Validation : doublon streamId -----------------------------------------

echo ""
echo "=== 7. Validation (doublon streamId rejeté) ==="
DUP_PAYLOAD='{"name":"Dup","streamIdCam":"bordeaux-test-cam","streamIdReturn":"autre-return"}'
code=$(api POST "/api/projects/$PROJECT_ID/sites" "$DUP_PAYLOAD")
[ "$code" = "400" ] && ok "POST site avec streamId dupliqué -> 400" || fail "POST doublon -> $code"

# -- 8. Modif projet ----------------------------------------------------------

echo ""
echo "=== 8. Modification projet ==="
UPDATE_PAYLOAD='{"status":"active"}'
code=$(api PUT "/api/projects/$PROJECT_ID" "$UPDATE_PAYLOAD")
[ "$code" = "200" ] && ok "PUT /api/projects/$PROJECT_ID -> 200" || fail "PUT -> $code"

# -- 9. Active project -------------------------------------------------------

echo ""
echo "=== 9. Projet actif ==="
code=$(api GET /api/active-project)
[ "$code" = "200" ] && ok "GET /api/active-project -> 200" || fail "$code"

# -- 10. Duplication ---------------------------------------------------------

echo ""
echo "=== 10. Duplication ==="
DUP=$(cat <<JSON
{"newName": "Test Dup ${TS}"}
JSON
)
code=$(api POST "/api/projects/$PROJECT_ID/duplicate" "$DUP")
if [ "$code" = "201" ]; then
  DUP_ID=$(grep -oE '"id":"[^"]+"' /tmp/api_body | head -1 | cut -d'"' -f4)
  ok "POST duplicate -> 201 (id=$DUP_ID)"
else
  fail "duplicate -> $code"; show_body
fi

# -- 11. Suppression site ----------------------------------------------------

echo ""
echo "=== 11. Suppression site ==="
code=$(api DELETE "/api/projects/$PROJECT_ID/sites/$SITE_ID")
[ "$code" = "200" ] && ok "DELETE site -> 200" || fail "DELETE site -> $code"

# -- 12. Suppression projets --------------------------------------------------

echo ""
echo "=== 12. Suppression projets ==="
code=$(api DELETE "/api/projects/$PROJECT_ID")
[ "$code" = "200" ] && ok "DELETE projet -> 200" || fail "$code"

if [ -n "${DUP_ID:-}" ]; then
  code=$(api DELETE "/api/projects/$DUP_ID")
  [ "$code" = "200" ] && ok "DELETE projet dupliqué -> 200" || fail "$code"
fi

# -- 13. 404 ------------------------------------------------------------------

echo ""
echo "=== 13. 404 ==="
code=$(api GET "/api/projects/$PROJECT_ID")
[ "$code" = "404" ] && ok "GET projet supprimé -> 404" || fail "$code"

# -- Bilan --------------------------------------------------------------------

echo ""
echo "============================="
echo "  PASS : $PASS_COUNT"
echo "  FAIL : $FAIL_COUNT"
echo "============================="

[ "$FAIL_COUNT" -eq 0 ]
