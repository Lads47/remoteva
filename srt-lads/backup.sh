#!/bin/bash
# SRT LADS - Backup script
# Snapshots projects, configurations, and logs to /var/lib/srt-lads/backups/
set -euo pipefail

DATA_PATH="${DATA_PATH:-/var/lib/srt-lads}"
BACKUP_DIR="$DATA_PATH/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
ARCHIVE="$BACKUP_DIR/srtlads-$TIMESTAMP.tar.gz"

sudo mkdir -p "$BACKUP_DIR"
sudo tar -czf "$ARCHIVE"   -C /   etc/sls   etc/mumble-server.ini   etc/nginx/sites-available   etc/fail2ban/jail.d   "${DATA_PATH#/}/projects"   2>/dev/null || true

# Rotation: keep last 14 archives
sudo find "$BACKUP_DIR" -name 'srtlads-*.tar.gz' -type f | sort | head -n -14 | xargs -r sudo rm -f

echo "Backup created: $ARCHIVE"
ls -lh "$ARCHIVE"
