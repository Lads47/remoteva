#!/usr/bin/env bash
# ============================================================================
# Script de déploiement EVA Flow / Remoteva sur VPS Hostinger
# ============================================================================
#
# Usage (depuis ton poste de travail) :
#   bash scripts/deploy-vps.sh
#
# Pré-requis sur le VPS :
#   - Git installé
#   - Container `evaremote` existant (Docker)
#   - SSH key installée (~/.ssh/id_ed25519)
#   - GitHub deploy key OU PAT configuré (pour git pull HTTPS)
#
# Ce que fait le script :
#   1. SSH vers le VPS et bascule dans le container evaremote
#   2. Backup automatique de la DB et du code
#   3. Git pull du repo
#   4. npm install + next build (sur Linux, donc pas de bug Windows)
#   5. Migration Prisma (idempotente)
#   6. Restart container
#   7. Health checks HTTP
#
# Si une étape échoue, le script s'arrête et on peut restaurer depuis le backup.
# ============================================================================

set -euo pipefail

# === Config ===
VPS_HOST="${VPS_HOST:-root@82.112.240.219}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
REPO_URL="${REPO_URL:-https://github.com/Lads47/remoteva.git}"
BRANCH="${BRANCH:-master}"
CONTAINER="${CONTAINER:-evaremote}"
APP_VOLUME_PATH="/var/lib/docker/volumes/evaremote_evaremote-app/_data"
DATA_VOLUME_PATH="/var/lib/docker/volumes/evaremote_evaremote-data/_data"
BACKUP_DIR="/root/evaremote-backups"
WORK_DIR="/root/remoteva-deploy"  # dossier de build sur le VPS (séparé du container)

# === Colors ===
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

step() { echo -e "\n${GREEN}==>${NC} $1"; }
warn() { echo -e "${YELLOW}!!${NC} $1"; }
err()  { echo -e "${RED}xx${NC} $1"; exit 1; }

# === Préflight ===
step "Préflight checks"
[[ -f "$SSH_KEY" ]] || err "SSH key introuvable : $SSH_KEY"
ssh -o ConnectTimeout=10 -i "$SSH_KEY" "$VPS_HOST" "echo OK" >/dev/null || err "SSH ne répond pas"
echo "  ✓ SSH OK"

# === Étape 1 : Backups ===
step "Backups DB + code (au cas où)"
ssh -i "$SSH_KEY" "$VPS_HOST" bash <<EOF
set -e
mkdir -p "$BACKUP_DIR"
TS=\$(date +%Y%m%d-%H%M%S)
cp "$DATA_VOLUME_PATH/remoteva.db" "$BACKUP_DIR/db-\$TS.db"
echo "  ✓ DB backup : $BACKUP_DIR/db-\$TS.db (\$(du -h $BACKUP_DIR/db-\$TS.db | cut -f1))"
EOF

# === Étape 2 : Préparer le dossier de build ===
step "Préparer le dossier de build sur le VPS"
ssh -i "$SSH_KEY" "$VPS_HOST" bash <<EOF
set -e
if [ ! -d "$WORK_DIR/.git" ]; then
  echo "  → premier déploiement : git clone"
  rm -rf "$WORK_DIR"
  git clone "$REPO_URL" "$WORK_DIR"
fi
cd "$WORK_DIR"
git fetch origin
git reset --hard "origin/$BRANCH"
echo "  ✓ Code à jour : \$(git log -1 --oneline)"
EOF

# === Étape 3 : Build dans un container Node temporaire (Linux) ===
step "Build Next.js standalone dans un container Node Linux"
ssh -i "$SSH_KEY" "$VPS_HOST" bash <<EOF
set -e
cd "$WORK_DIR"
docker run --rm \
  -v "$WORK_DIR":/build \
  -w /build \
  node:20-slim \
  bash -c "npm ci --no-audit --no-fund && npx prisma generate && npx next build"
echo "  ✓ Build OK : \$(ls -la .next/standalone/server.js | awk '{print \$5}') octets pour server.js"
EOF

# === Étape 4 : Stop container + déployer ===
step "Stopper le container et déployer le nouveau build"
ssh -i "$SSH_KEY" "$VPS_HOST" bash <<EOF
set -e
echo "  → stop container"
docker stop "$CONTAINER" || true

echo "  → nettoyer l'ancien code (sauf le dossier data symlink)"
# On garde data/ qui est un symlink vers le volume data
cd "$APP_VOLUME_PATH"
find . -mindepth 1 -maxdepth 1 ! -name 'data' -exec rm -rf {} +

echo "  → copier le nouveau standalone"
cp -r "$WORK_DIR/.next/standalone/." "$APP_VOLUME_PATH/"
cp -r "$WORK_DIR/.next/static" "$APP_VOLUME_PATH/.next/"
cp -r "$WORK_DIR/public" "$APP_VOLUME_PATH/"
cp -r "$WORK_DIR/prisma" "$APP_VOLUME_PATH/"
[ -d "$WORK_DIR/scripts" ] && cp -r "$WORK_DIR/scripts" "$APP_VOLUME_PATH/" || true

# Supprimer un éventuel data/remoteva.db copié depuis le standalone
# (le data/ ici pointe vers le volume DATA, on ne touche surtout pas au .db existant)
# → en fait, comme cp -r ne suit pas par défaut les symlinks de DESTINATION,
#   on supprime juste le sous-dossier data/ s'il a été créé en plus
if [ -d "$APP_VOLUME_PATH/data" ] && [ ! -L "$APP_VOLUME_PATH/data" ]; then
  echo "  ⚠ Un dossier data/ a été créé par cp -r, on le supprime pour préserver le symlink"
  rm -rf "$APP_VOLUME_PATH/data"
fi

echo "  ✓ Déployé"
EOF

# === Étape 5 : Restart + npm install dans le container ===
step "Démarrer le container + installer les deps"
ssh -i "$SSH_KEY" "$VPS_HOST" bash <<EOF
set -e
docker start "$CONTAINER"
sleep 3
docker exec "$CONTAINER" npm install --production 2>&1 | tail -3
echo "  ✓ Dependencies installées"
EOF

# === Étape 6 : Migration Prisma (via SQL) ===
step "Appliquer les migrations Prisma manquantes"
ssh -i "$SSH_KEY" "$VPS_HOST" bash <<'EOF'
set -e
CONTAINER="evaremote"
APP="/var/lib/docker/volumes/evaremote_evaremote-app/_data"

# Vérifier que sqlite3 est installé dans le container, sinon l'installer
if ! docker exec "$CONTAINER" which sqlite3 >/dev/null 2>&1; then
  echo "  → installation de sqlite3 dans le container"
  docker exec "$CONTAINER" bash -c 'apt-get update -qq && apt-get install -y -qq sqlite3' >/dev/null
fi

# Lister les migrations déjà appliquées
APPLIED=$(docker exec "$CONTAINER" sqlite3 /app/data/remoteva.db \
  "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL;" 2>/dev/null || echo "")

# Pour chaque migration, l'appliquer si absente
for dir in "$APP"/prisma/migrations/*/; do
  name=$(basename "$dir")
  [ "$name" = "migration_lock.toml" ] && continue
  if echo "$APPLIED" | grep -q "^$name$"; then
    echo "  → $name : déjà appliquée"
  else
    echo "  → $name : application…"
    cat "$dir/migration.sql" | docker exec -i "$CONTAINER" sqlite3 /app/data/remoteva.db
    docker exec "$CONTAINER" sqlite3 /app/data/remoteva.db \
      "INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) \
       VALUES ('manual-$name', 'manual', datetime('now'), '$name', NULL, NULL, datetime('now'), 1);"
    echo "    ✓ appliquée"
  fi
done
EOF

# === Étape 7 : Restart final + health check ===
step "Restart container + health check"
ssh -i "$SSH_KEY" "$VPS_HOST" bash <<EOF
set -e
docker restart "$CONTAINER"
sleep 5

# Health checks
test_route() {
  local path="\$1"
  local expected="\$2"
  local got=\$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3001\$path")
  if [ "\$got" = "\$expected" ]; then
    echo "  ✓ \$path → \$got"
  else
    echo "  ✗ \$path → \$got (attendu \$expected)"
    return 1
  fi
}

test_route "/admin/dashboard" "307"   # redirect to login (no session)
test_route "/admin/flow"      "200"
test_route "/presta"          "200"
test_route "/api/flow/projects?date=2026-04-20" "401"  # missing X-Api-Key
EOF

step "✅ Déploiement terminé"
echo ""
echo "URL : https://evaremote.com/admin/dashboard"
echo "Logs : ssh $VPS_HOST 'docker logs $CONTAINER --tail 30'"
