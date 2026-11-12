#!/usr/bin/env bash
# EVA Stat — envoie à evaremote les nouvelles lignes du journal des téléchargements
# du canal evadif (installeurs EVAPILOT), sur l'hôte du VPS. Toutes les 10 minutes :
#   */10 * * * * CRON_SECRET=… bash /root/remoteva-deploy/scripts/stat-collect-downloads.sh >> /var/log/evaremote-cron.log 2>&1
#
# Le journal (format « telechargement », sans IP) est écrit par nginx dans
# /docker/evadif/canal/logs/. On n'envoie que ce qui suit la dernière position
# envoyée avec succès ; rejouer des lignes ne compte rien deux fois côté evaremote.

set -euo pipefail

LOG="${STAT_DOWNLOADS_LOG:-/docker/evadif/canal/logs/telechargements.log}"
STATE="${STAT_DOWNLOADS_STATE:-/root/.stat-telechargements.position}"
URL="${STAT_DOWNLOADS_URL:-https://evaremote.com/api/cron/stat-downloads}"

[ -n "${CRON_SECRET:-}" ] || { echo "[stat-downloads] CRON_SECRET manquant"; exit 1; }
[ -f "$LOG" ] || exit 0

taille=$(stat -c %s "$LOG")
position=$(cat "$STATE" 2>/dev/null || echo 0)
# Journal recréé ou vidé : on repart du début.
[ "$position" -le "$taille" ] || position=0
[ "$position" -lt "$taille" ] || exit 0

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
tail -c +"$((position + 1))" "$LOG" | head -c "$((taille - position))" > "$TMP"

if curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: text/plain; charset=utf-8" \
     --data-binary @"$TMP" "$URL" > /dev/null; then
  echo "$taille" > "$STATE"
else
  echo "[stat-downloads] envoi échoué, nouvel essai au prochain passage"
  exit 1
fi
