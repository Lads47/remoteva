# Phase 2 — Progression

**Date début** : 17 mai 2026
**Cible** : Interface web complète de gestion et monitoring SRT LADS

## Vue d'ensemble

| Sous-phase | Contenu | Statut |
|------------|---------|--------|
| **2.1** | Backend Node.js + auth + structure | ✅ Validée |
| **2.2** | API REST gestion projets (CRUD) | ✅ Validée |
| **2.3** | Frontend HTML/CSS + pages projets | ⏳ À venir |
| **2.4** | WebSocket + Vue Live + PDF + finitions | ⏳ À venir |

---

## Phase 2.1 — Backend Node.js + Auth (✅ Validée)

**Date** : 17 mai 2026

### Réalisations

| # | Étape | Statut |
|---|-------|--------|
| 1 | Inspection serveur + install Node.js 20 LTS | OK |
| 2 | Structure projet `web/` (config, routes, middlewares, lib, public) | OK |
| 3 | `package.json` + npm install (Express, helmet, sessions, etc.) | OK |
| 4 | `server.js` (Express + sessions + helmet + bind loopback) | OK |
| 5 | Auth login/password contre `.env` + page login | OK |
| 6 | Page placeholder `/dashboard` | OK |
| 7 | Service systemd `srt-lads-web` (Restart=always, durci) | OK |
| 8 | Tests flow d'auth (HTTP loopback + HTTPS public) | OK |
| 9 | Commit + push + doc | OK |

### Stack technique

- **Node.js** 20.20.2 LTS (installé via NodeSource)
- **Express** 4.19
- **express-session** 1.18 (MemoryStore en V1, SQLite en V2)
- **helmet** 7.1 (CSP, HSTS, etc.)
- **compression**, **morgan**, **cors**, **bcrypt** (^6 pour fix vulns tar)
- **dotenv** (lecture `/opt/srt-lads/.env`)
- **0 vulnérabilité** `npm audit`

### Configuration

- **Bind** : `127.0.0.1:3000` (loopback uniquement, Nginx fait le reverse proxy HTTPS)
- **Trust proxy** : `loopback` (req.ip et cookies secure corrects)
- **Sessions** : cookie `srtlads.sid`, httpOnly, sameSite=lax, secure (prod), maxAge 8h, rolling
- **CSP** : default-src 'self', styleSrc 'self' + 'unsafe-inline' (à durcir en 2.3)
- **Logs** : console + `/var/lib/srt-lads/logs/web.log`

### Service systemd

`/etc/systemd/system/srt-lads-web.service` :
- `User=srtadmin`, `WorkingDirectory=/home/srtadmin/git/remoteva/srt-lads/web`
- `EnvironmentFile=/opt/srt-lads/.env`
- `Restart=always`, `RestartSec=5`
- Durcissement : `NoNewPrivileges`, `ProtectSystem=full`, `ProtectHome=read-only`,
  `PrivateTmp`, `ReadWritePaths=/var/lib/srt-lads`, `MemoryMax=512M`

### Routes implémentées

| Méthode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | `/` | non | Redirige vers `/auth/login` ou `/dashboard` |
| GET | `/auth/login` | non | Page HTML de connexion |
| POST | `/auth/login` | non | Vérifie credentials, crée la session |
| POST | `/auth/logout` | non | Détruit la session |
| GET | `/dashboard` | oui | Page placeholder |
| GET | `/api/health` | oui | Statut serveur (uptime, version, phase) |
| ALL  | `/api/*` autres | oui | 404 « non implémenté en Phase 2.1 » |

### Tests validés

Loopback (HTTP, 127.0.0.1:3000) et public (HTTPS, https://gatesrt.evaremote.com) :

- ✅ `GET /` → 302 vers `/auth/login`
- ✅ `GET /auth/login` → 200 page HTML
- ✅ `GET /api/health` sans cookie → 401 JSON `{"success":false,"error":"Non authentifié"}`
- ✅ `POST /auth/login` bonnes creds → 302 vers `/dashboard`
- ✅ `GET /dashboard` avec cookie → 200 HTML
- ✅ `GET /api/health` avec cookie → 200 JSON avec uptime/phase
- ✅ `POST /auth/login` mauvaises creds → 302 vers `/auth/login?error=1`
- ✅ `POST /auth/logout` → 302 vers `/auth/login`, cookie effacé

### Fichiers créés

```
srt-lads/server/systemd/srt-lads-web.service
srt-lads/web/
├── .gitignore
├── README.md
├── package.json
├── server.js
├── config/index.js
├── middlewares/auth.js
├── middlewares/errorHandler.js
├── routes/auth.js
├── routes/api.js
├── routes/index.js
├── lib/logger.js
├── public/login.html
├── public/dashboard.html
├── public/css/login.css
├── public/js/login.js
└── data/.gitkeep
```

### Commits Phase 2.1

```
e932cd6 feat(phase2.1): backend node.js + auth + structure
8770739 chore(phase2.1): bump bcrypt to ^6 (fix transitive tar vulns)
eeb31ec feat(phase2.1): systemd service srt-lads-web
cd614a4 fix(phase2.1): use req.originalUrl for /api detection (mount-relative path bug)
```

### Points d'attention pour la suite

- **MemoryStore** : à remplacer par SQLite (connect-sqlite3) en V2 pour persistance
  entre redémarrages et scaling éventuel.
- **bcrypt** : présent dans les dépendances, pas encore utilisé (auth en clair via .env en V1).
- **CSP `unsafe-inline`** sur styleSrc : à durcir en Phase 2.3 (déplacer le `<style>`
  inline du dashboard placeholder vers un fichier CSS dédié).
- **Nginx** : déjà prêt pour Phase 2.4 (WebSocket upgrade headers présents).

---

## Phase 2.2 — API REST projets (✅ Validée)

**Date** : 17 mai 2026

### Réalisations

| # | Étape | Statut |
|---|-------|--------|
| 1 | Vérification serveur + `/var/lib/srt-lads/projects` writable | OK |
| 2 | `lib/projects.js` : CRUD JSON file-based + validation stricte | OK |
| 3 | `lib/srtUrl.js` : génération URLs SRT (4 par site) | OK |
| 4 | `routes/api.js` : 16 endpoints REST | OK |
| 5 | `test-api.sh` : 16/16 PASS sur HTTPS prod | OK |
| 6 | `backup-data.sh` + timer systemd quotidien (03:30 +0-15min) | OK |
| 7 | Commit + push + doc | OK |

### Endpoints REST implémentés

Toutes les routes sont protégées par auth de session.

**Health & projet actif**
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/health` | Statut serveur (phase 2.2) |
| GET | `/api/active-project` | Projet `status=active` (ou `null`) |

**Projets (collection)**
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/projects` | Liste, triée actifs → date desc |
| POST | `/api/projects` | Création (id auto-slug, unicité) |
| GET | `/api/projects/_passphrase?length=N` | Génère une passphrase aléatoire 8-79 |

**Projets (instance)**
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/projects/:id` | Récupère |
| PUT | `/api/projects/:id` | Mise à jour partielle |
| DELETE | `/api/projects/:id` | Suppression |
| POST | `/api/projects/:id/archive` | Passe en `archived` |
| POST | `/api/projects/:id/duplicate` | Body `{newName}` → nouveau projet `draft` |

**Sites**
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/projects/:id/sites` | Ajout (id auto-slug si absent) |
| PUT | `/api/projects/:id/sites/:siteId` | Modif (id préservé) |
| DELETE | `/api/projects/:id/sites/:siteId` | Suppression |

**URLs SRT**
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/projects/:id/sites/:siteId/urls` | Les 4 URLs (publish/play × principal/secours) |

### Validation (renvoie 400 + message clair)

- `name` : 1-100 chars
- `status` : `active` \| `archived` \| `draft`
- `config.passphrase` : 8-79 chars (limite SRT)
- `config.defaultLatency` : entier 80-2000
- `config.defaultOverhead` : entier 10-100
- `config.defaultBitrate` : entier 500-50000
- `streamIdCam`, `streamIdReturn` : regex `^[a-z0-9\-_/]+$`, max 100 chars
- Pas de doublon de streamId dans un projet
- `customLatency` : `null` ou entier 80-2000

### Convention URLs SRT générées

Alignée sur `server/sls/sls.conf` (3 segments : `<domain>/<app>/<stream>`) :

```
publish principal : srt://srt.evaremote.com:10000?streamid=publish/live/<streamIdCam>&latency=<X>&oheadbw=<X>&passphrase=<X>&pbkeylen=32
publish secours   : srt://srt.evaremote.com:443?streamid=publish/live/<streamIdCam>&latency=<X>&oheadbw=<X>&passphrase=<X>&pbkeylen=32
play principal    : srt://srt.evaremote.com:10000?streamid=play/live/<streamIdReturn>&latency=<X>&passphrase=<X>&pbkeylen=32
play secours      : srt://srt.evaremote.com:443?streamid=play/live/<streamIdReturn>&latency=<X>&passphrase=<X>&pbkeylen=32
```

La latence appliquée = `site.customLatency` si défini, sinon `project.config.defaultLatency`.

> **Note** : le format diffère du prompt initial 2.2 (qui omettait `/live/`) car SLS
> est configuré avec `domain_publisher=publish` / `app_publisher=live` (idem `play/live`).
> Sans le segment `live/` les flux étaient rejetés au handshake.

### Stockage

- 1 fichier JSON par projet : `/var/lib/srt-lads/projects/<id>.json`
- Écriture atomique (`tmp` + `rename`), mode `0640`
- Lecture/parse en mémoire à chaque requête (pas de cache en V1, OK pour les volumes attendus)

### Backup automatique

- **Script** : `srt-lads/backup-data.sh`
- **Cible** : `/var/lib/srt-lads/backups/data-YYYYMMDD-HHMMSS.tar.gz` (exclut le dossier `backups/`)
- **Rotation** : garde les 7 plus récents
- **Timer** : `srt-lads-backup.timer` → tous les jours 03:30 + délai aléatoire 0-15 min, `Persistent=true`
- **Service** : `srt-lads-backup.service` (oneshot, durci `ProtectSystem=full`, `Nice=10`, `IOSchedulingClass=idle`)
- Premier run test exécuté avec succès le 17 mai 2026 à 13:59 (1.6 KB)

### Tests d'intégration (`web/test-api.sh`)

**16/16 PASS** sur `https://gatesrt.evaremote.com` :

```
1. Authentification (login GET, login POST, health authentifié)
2. POST /api/projects (création)
3. GET /api/projects (liste)
4. POST /api/projects/:id/sites (ajout site)
5. GET /api/projects/:id/sites/:siteId/urls (génération URLs)
6. POST site avec streamId invalide → 400 (validation regex)
7. POST site avec doublon de streamId → 400 (unicité)
8. PUT /api/projects/:id (passage en active)
9. GET /api/active-project
10. POST /api/projects/:id/duplicate
11. DELETE /api/projects/:id/sites/:siteId
12. DELETE projets (original + dupliqué)
13. GET projet supprimé → 404
```

### Fichiers ajoutés

```
srt-lads/backup-data.sh
srt-lads/server/systemd/srt-lads-backup.service
srt-lads/server/systemd/srt-lads-backup.timer
srt-lads/web/lib/projects.js        (320 l)
srt-lads/web/lib/srtUrl.js          (115 l)
srt-lads/web/test-api.sh
srt-lads/web/routes/api.js          (réécrit, 165 l)
```

### Commit Phase 2.2

```
649623a feat(phase2.2): API REST projets + URLs SRT + backup quotidien
```

### Écarts vs prompt 2.2 (à noter)

- **Format des URLs** : ajout du segment `/live/` (cf note ci-dessus) — conforme à `sls.conf`.
- **Endpoint bonus** `GET /api/projects/_passphrase` (générateur prêt pour le bouton 🎲 de la Phase 2.3).
- **Backup** : implémenté en `backup-data.sh` séparé (le `backup.sh` racine reste pour backup système complet incluant configs).
- **Tests** : exécutés via HTTPS public (pas loopback) — le cookie `secure` ne passe pas en HTTP nu.
