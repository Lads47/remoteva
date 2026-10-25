#!/usr/bin/env bash
# EVA Stat — télécharge les bases DB-IP Lite du mois (City + ASN, CC BY 4.0).
#
# Sur le VPS (hôte, pas dans le container) :
#   bash scripts/stat-update-geo.sh
# En local :
#   bash scripts/stat-update-geo.sh data/stat/geo
#
# Le serveur relit les fichiers tout seul (vérification toutes les 10 min) :
# aucun redémarrage nécessaire. Mensuel en crontab, par exemple le 3 à 4 h :
#   0 4 3 * * bash /root/remoteva-deploy/scripts/stat-update-geo.sh >> /var/log/stat-geo.log 2>&1

set -euo pipefail

DEST="${1:-/var/lib/docker/volumes/evaremote_evaremote-data/_data/stat/geo}"
mkdir -p "$DEST"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fetch() {
  local kind="$1" out="$2" month
  # DB-IP publie la base du mois dans les premiers jours : on retombe sur le mois précédent.
  for month in "$(date -u +%Y-%m)" "$(date -u -d "$(date -u +%Y-%m-15) -1 month" +%Y-%m)"; do
    local url="https://download.db-ip.com/free/dbip-${kind}-lite-${month}.mmdb.gz"
    if curl -fsSL --retry 2 -o "$TMP/$kind.mmdb.gz" "$url"; then
      gunzip -f "$TMP/$kind.mmdb.gz"
      [ -s "$TMP/$kind.mmdb" ] || { echo "xx $kind : fichier vide"; return 1; }
      # Copie puis renommage dans le même dossier : le serveur ne lit jamais un fichier à moitié écrit.
      cp "$TMP/$kind.mmdb" "$DEST/.$out.tmp"
      mv -f "$DEST/.$out.tmp" "$DEST/$out"
      echo "  ✓ $kind ($month) → $DEST/$out ($(du -h "$DEST/$out" | cut -f1))"
      return 0
    fi
  done
  echo "xx $kind : aucune base trouvée chez DB-IP"
  return 1
}

fetch city dbip-city-lite.mmdb
fetch asn dbip-asn-lite.mmdb
