#!/usr/bin/env bash
# backup-data.sh — Sauvegarde quotidienne de /var/lib/srt-lads
# Lancée par systemd timer (srt-lads-backup.timer).
# Conserve les KEEP plus récents (7 par défaut).
#
# Pour le backup système complet (configs SLS/Mumble/Nginx), utiliser backup.sh.

set -euo pipefail

DATA_DIR="${DATA_DIR:-/var/lib/srt-lads}"
BACKUP_DIR="${BACKUP_DIR:-/var/lib/srt-lads/backups}"
KEEP="${KEEP:-7}"

mkdir -p "$BACKUP_DIR"

DATE="$(date +%Y%m%d-%H%M%S)"
TARGET="$BACKUP_DIR/data-$DATE.tar.gz"

# Exclut le dossier backups pour éviter la récursion, et les anciens logs gzippés.
tar --exclude="${DATA_DIR}/backups" \
    --exclude="${DATA_DIR}/logs/*.gz" \
    -czf "$TARGET" -C "$(dirname "$DATA_DIR")" "$(basename "$DATA_DIR")"

# Rotation : garde les KEEP plus récents
ls -1t "$BACKUP_DIR"/data-*.tar.gz 2>/dev/null \
  | tail -n +$((KEEP + 1)) \
  | xargs -r rm -f

SIZE=$(du -h "$TARGET" | cut -f1)
COUNT=$(ls -1 "$BACKUP_DIR"/data-*.tar.gz 2>/dev/null | wc -l)
echo "[$(date -Iseconds)] backup OK : $TARGET ($SIZE), $COUNT backups en stock"
