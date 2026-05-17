# Phase 2 — Progression

**Date début** : 17 mai 2026
**Cible** : Interface web complète de gestion et monitoring SRT LADS

## Vue d'ensemble

| Sous-phase | Contenu | Statut |
|------------|---------|--------|
| **2.1** | Backend Node.js + auth + structure | ✅ Validée |
| **2.2** | API REST gestion projets (CRUD) | ⏳ À venir |
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
