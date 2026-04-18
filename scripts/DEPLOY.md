# Déploiement Remoteva / EVA Flow sur VPS Hostinger

## Workflow recommandé pour les futures MAJ

### TL;DR

```bash
cd D:/01.PROJETS/Remoteva
git add -A && git commit -m "ma modif" && git push
bash scripts/deploy-vps.sh
```

C'est tout. Le script s'occupe de :
1. Backup automatique de la DB de prod
2. `git pull` du repo sur le VPS
3. Build Next.js standalone **dans un container Docker Linux** (évite les problèmes de noms de fichiers Windows)
4. Migration Prisma idempotente
5. Restart container + health checks HTTP

---

## Pré-requis (à faire UNE SEULE FOIS)

### 1. SSH key VPS

Le script utilise `~/.ssh/id_ed25519`. Si tu utilises une autre clé, lance avec :
```bash
SSH_KEY=~/.ssh/autre_cle bash scripts/deploy-vps.sh
```

### 2. Repo public OU deploy key sur le VPS

Le script clone le repo via HTTPS. Si le repo redevient privé, il faudra :

```bash
# Sur le VPS, créer une clé SSH dédiée et l'ajouter à GitHub comme deploy key
ssh-keygen -t ed25519 -f /root/.ssh/github_deploy -N ""
cat /root/.ssh/github_deploy.pub  # à ajouter sur https://github.com/Lads47/remoteva/settings/keys

# Configurer git pour utiliser cette clé
cat >> /root/.ssh/config <<EOF
Host github.com
  IdentityFile /root/.ssh/github_deploy
  StrictHostKeyChecking no
EOF

# Cloner via SSH au lieu de HTTPS
REPO_URL="git@github.com:Lads47/remoteva.git" bash scripts/deploy-vps.sh
```

---

## Variables d'environnement

Définies dans `docker-compose.yml` du VPS (`/docker/evaremote/docker-compose.yml`) :

| Variable | Valeur prod | Description |
|---|---|---|
| `JWT_SECRET` | `eva-remote-secret-2026-change-me` | Signature des cookies admin |
| `NODE_ENV` | `production` | Mode prod Next.js |
| `HOSTNAME` | `0.0.0.0` | Bind sur toutes les interfaces |

À ajouter si jamais besoin :

```yaml
environment:
  - JWT_SECRET=...
  - N8N_BASE_URL=https://n8n.srv950180.hstgr.cloud/webhook  # défaut OK
  - PUBLIC_BASE_URL=https://evaremote.com                    # défaut OK
```

---

## Récupération en cas de problème

### Le container ne démarre pas après déploiement

```bash
ssh root@82.112.240.219 'docker logs evaremote --tail 50'
```

### Restaurer la DB depuis le dernier backup

```bash
ssh root@82.112.240.219 bash <<'EOF'
LATEST=$(ls -t /root/evaremote-backups/db-*.db | head -1)
docker stop evaremote
cp "$LATEST" /var/lib/docker/volumes/evaremote_evaremote-data/_data/remoteva.db
docker start evaremote
EOF
```

### Restauration complète via Hostinger

Si vraiment le serveur est cassé :
1. Hostinger panel → VPS → Snapshots & Sauvegardes
2. Restaurer la sauvegarde la plus récente (~10 min)
3. Relancer `bash scripts/deploy-vps.sh` après la restauration

---

## Architecture du déploiement

```
Local (Windows)
└── git push origin master
                    │
                    ▼
              GitHub repo
                    │
                    ▼  bash scripts/deploy-vps.sh
              VPS Linux (root@82.112.240.219)
              │
              ├── /root/remoteva-deploy/           ← git clone du repo, dossier de build
              │   └── docker run node:20-slim     ← build dans un container Linux propre
              │       npm ci && npx next build
              │
              ├── /var/lib/docker/volumes/evaremote_evaremote-app/_data/
              │   └── (code de production)         ← cible du déploiement
              │
              ├── /var/lib/docker/volumes/evaremote_evaremote-data/_data/
              │   └── remoteva.db                   ← DB SQLite prod (volume séparé)
              │
              └── /root/evaremote-backups/
                  └── db-YYYYMMDD-HHMMSS.db         ← snapshots auto avant chaque deploy
```

---

## Points d'attention

### ⚠️ Le piège du dossier `data/` dans le standalone

Le build `next build` inclut le dossier `data/` du projet (où vit la DB locale dev) dans le standalone. Lors du déploiement, **ne pas écraser** le `data/` du volume prod (qui est un symlink vers le volume DATA séparé).

Le script gère ce cas en supprimant tout sauf `data/` avant la copie, et en re-supprimant un éventuel sous-dossier `data/` non-symlink créé par cp -r.

### ⚠️ Build Windows incompatible

Les chunks Next.js générés sur Windows contiennent parfois des noms avec `:` (ex `[externals]_node:buffer_*.js`) que NTFS refuse de créer, ce qui casse le build au runtime sur Linux. **Toujours builder sur Linux** (le script utilise un container Docker Node Linux pour ça).

### ⚠️ Migration Prisma sur prod

`prisma migrate deploy` ne fonctionne pas dans le standalone (les binaires Prisma manquent).
Solution : le script applique manuellement chaque migration SQL via `sqlite3` dans le container, en lisant la table `_prisma_migrations` pour ne pas réappliquer ce qui est déjà fait.
