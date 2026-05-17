# Phase 2 — Progression

**Date début** : 17 mai 2026
**Cible** : Interface web complète de gestion et monitoring SRT LADS

## Vue d'ensemble

| Sous-phase | Contenu | Statut |
|------------|---------|--------|
| **2.1** | Backend Node.js + auth + structure | ✅ Validée |
| **2.2** | API REST gestion projets (CRUD) | ✅ Validée |
| **2.3** | Frontend HTML/CSS + pages projets | ✅ Validée |
| **2.4** | WebSocket + Vue Live + PDF + finitions | ✅ Validée |

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

---

## Phase 2.3 — Frontend complet (✅ Validée)

**Date** : 17 mai 2026

### Réalisations

| # | Étape | Statut |
|---|-------|--------|
| 1 | `common.css` design system + `common.js` utilitaires | OK |
| 2 | Routes pages (/projects, /project-edit, placeholders 2.4) | OK |
| 3 | Dashboard (état global + projet actif + 4 tuiles nav) | OK |
| 4 | Liste projets (filtres tabs, recherche, actions) | OK |
| 5 | Édition projet (2 colonnes + sites accordéon + URLs live) | OK |
| 6 | Vérif preview locale (création/édition/suppression via UI) | OK |
| 7 | Deploy serveur (pull + npm ci + restart, 7/7 pages + 7/7 statics → 200) | OK |

### Design system (`public/css/common.css`)

- Variables CSS centralisées : couleurs (fond `#0a0e1a`, panel `#131a2b`, accent `#3b82f6`, ok/warn/danger), espacements, radius, ombres
- Layout app : header sticky avec brand + breadcrumb + nav + user-zone
- Composants : boutons (primary/danger/ghost, tailles), inputs avec `aria-invalid` colorisé, cards, tableaux avec hover, badges (ok/warn/danger/info/draft), pastilles (dot, dot-xl), toasts, modals
- Responsive (breakpoint 640px)
- Font system + mono pour les URLs/IDs

### Utilitaires JS (`public/js/common.js`)

Exposés sur `window.SrtLads` :
- `apiCall(method, path, body)` — wrapper fetch, JSON, gestion 401 (redirect login)
- `notify(message, type)` — toast en haut à droite, auto-hide 4 s
- `confirmAction(message, opts)` — modal de confirmation, Promise, danger:true pour bouton rouge
- `promptText(message, opts)` — modal de saisie texte (utilisé pour le nom de duplication)
- `copyToClipboard(text)` — Clipboard API + fallback execCommand
- `fmtDate(iso)` — format `JJ/MM/AAAA HH:MM`
- `statusBadge(status)` — HTML d'un badge selon status
- `toggleFullscreen()` / `logout()`

### Pages

**`/dashboard`** (`dashboard.html` + `dashboard.css` + `dashboard.js`)
- En-tête avec pastille XL ok/warn/danger + titre + détail
- 4 compteurs : Projet actif (0/1), Projets, Sites configurés, Uptime
- Carte "Projet actif" avec lien direct vers édition
- Grille 4 tuiles : Vue Live, Projets, Système, Logs
- Boutons Plein écran (F11) + Déconnexion

**`/projects`** (`projects.html` + `projects.css` + `projects.js`)
- Tabs filtres : Tous / Actifs / Brouillons / Archivés avec compteurs
- Recherche full-text (nom projet, ID, noms de sites, streamIds)
- Tableau : Nom + ID slug, badge statut, nombre de sites, date modif
- Actions par ligne : Éditer, Dupliquer (modal saisie nom), Archiver/Activer, Supprimer (modal confirmation rouge)
- Bouton "+ Nouveau projet" → `/project-edit?new=1`

**`/project-edit`** (`project-edit.html` + `project-edit.js`)
- Mode création (`?new=1`) ou édition (`?id=xxx`)
- Layout 2 colonnes desktop (collapse vertical < 1024px)
- Colonne gauche : nom, statut, passphrase (bouton 🎲 → `GET /api/projects/_passphrase`), latence/overhead/bitrate
- Colonne droite : liste des sites en accordéon (premier site ouvert par défaut)
- Par site : nom, latence custom, streamId cam/retour, technicien (nom+tel), notes
- **Validation live** : regex `/^[a-z0-9\-_/]+$/` + détection doublons → hint vert ✓ ou rouge avec message, `aria-invalid` sur les inputs
- **URLs SRT générées en live côté client** (mirroring `lib/srtUrl.js`) — 4 URLs/site avec bouton "Copier" individuel
- Boutons sticky en bas : Exporter PDF (disabled — Phase 2.4), Annuler, Sauvegarder

**`/placeholder.html`** : page « bientôt » pour `/live`, `/system`, `/logs`, `/runbook` (impl Phase 2.4)

### Sécurité

- Toutes les pages protégées par `requireAuth` (cf `routes/index.js`)
- CSP `script-src 'self'` respectée (zéro JS inline, zéro `onclick=` attribut)
- Boutons de déconnexion via `POST` form (`placeholder.html`) ou helper JS `SrtLads.logout()`
- Échappement HTML systématique des valeurs utilisateur (`escapeHtml()` dans `projects.js` et `project-edit.js`)

### Tests preview locaux (`http://127.0.0.1:3000`)

- Login → redirect `/dashboard` OK
- Dashboard rendu desktop : pastille warn + 4 compteurs + tuiles OK
- `/projects` page vide → état "Aucun projet" + bouton Créer
- Création "TF1 Factory - Test Preview" → id slug `tf1-factory-test-preview`, passphrase auto-générée 24 chars
- Ajout site Bordeaux + streamIds → validation ✓ verte live
- URLs SRT générées live cohérentes avec `lib/srtUrl.js` :
  - `srt://srt.evaremote.com:10000?streamid=publish/live/bordeaux-cam&latency=300&oheadbw=25&passphrase=…&pbkeylen=32`
  - `srt://srt.evaremote.com:10000?streamid=play/live/bordeaux-retour&latency=300&passphrase=…&pbkeylen=32`
  - + ports 443 pour les versions secours
- Sauvegarde → 201, redirect vers `/project-edit?id=…`
- Retour liste : projet affiché avec badge BROUILLON, 1 site, date

### Tests deploy prod (`https://gatesrt.evaremote.com`)

Toutes les pages renvoient `200` après login :

```
/dashboard     -> 200
/projects      -> 200
/project-edit  -> 200
/live          -> 200  (placeholder)
/system        -> 200  (placeholder)
/logs          -> 200  (placeholder)
/runbook       -> 200  (placeholder)
```

Tous les statics servis correctement :

```
/css/common.css     -> 200
/css/dashboard.css  -> 200
/css/projects.css   -> 200
/js/common.js       -> 200
/js/dashboard.js    -> 200
/js/projects.js     -> 200
/js/project-edit.js -> 200
```

### Fichiers ajoutés / modifiés

```
srt-lads/web/public/css/common.css         (NEW, ~340 l - design system)
srt-lads/web/public/css/dashboard.css      (NEW, ~85 l)
srt-lads/web/public/css/projects.css       (NEW, ~150 l)
srt-lads/web/public/js/common.js           (NEW, ~270 l)
srt-lads/web/public/js/dashboard.js        (NEW, ~95 l)
srt-lads/web/public/js/projects.js         (NEW, ~150 l)
srt-lads/web/public/js/project-edit.js     (NEW, ~340 l)
srt-lads/web/public/dashboard.html         (REFAIT)
srt-lads/web/public/projects.html          (NEW)
srt-lads/web/public/project-edit.html      (NEW)
srt-lads/web/public/placeholder.html       (NEW)
srt-lads/web/public/login.html             (cleanup CSP, footer Phase 2.3)
srt-lads/web/routes/index.js               (routes pages + placeholders 2.4)
srt-lads/web/package-lock.json             (NEW)
```

### Commit Phase 2.3

```
5ba1b46 feat(phase2.3): frontend complet projets + dashboard
```

### Écarts vs prompt 2.3 — à noter

- **Pas de fichier `js/dashboard.js` séparé pour le polling temps réel** — la mise à jour live des compteurs viendra en Phase 2.4 via WebSocket. Le dashboard 2.3 fait un seul chargement initial.
- **Le bouton "Exporter PDF" est présent mais disabled** (sera activé en Phase 2.4 avec génération PDFkit).
- **Validation des champs config (latence/overhead/bitrate) côté client** : les `<input type="number">` ont les attributs `min`/`max` HTML5. La vraie validation reste côté serveur (lib/projects.js).
- **Bouton "Activer" sur les projets archivés** (en plus du PUT générique) : ajouté côté liste pour symétrie avec Archiver.
- **Le générateur de passphrase** appelle `GET /api/projects/_passphrase?length=N` (endpoint Phase 2.2 bonus) plutôt que de générer côté client — garantit qualité de l'aléa via `crypto.randomBytes`.

### Mise à jour vue d'ensemble

| Sous-phase | Contenu | Statut |
|------------|---------|--------|
| **2.1** | Backend Node.js + auth + structure | ✅ Validée |
| **2.2** | API REST gestion projets (CRUD) | ✅ Validée |
| **2.3** | Frontend HTML/CSS + pages projets | ✅ Validée |
| **2.4** | WebSocket + Vue Live + PDF + finitions | ✅ Validée |

---

## Phase 2.4 - Monitoring Live + PDF + finitions (Validee, v1.0.0)

Date : 17 mai 2026

### Realisations

| # | Etape | Statut |
|---|-------|--------|
| 1 | Audit SLS v1.4.x (pas d endpoint HTTP stats, fallback log tail) | OK |
| 2 | lib/slsLogTail.js (tail /var/log/sls/error.log + parse) | OK |
| 3 | lib/eventsLog.js (journal append-only + recherche + CSV) | OK |
| 4 | lib/pdfGenerator.js (vMix + IT + ZIP + runbook via pdfkit + archiver) | OK |
| 5 | lib/systemControl.js (statut + restart whitelist) | OK |
| 6 | server.js : WebSocket /ws/live + auth session + broadcast 1s | OK |
| 7 | routes/api.js : 11 nouveaux endpoints | OK |
| 8 | public/live.{html,css,js} : Vue Live WS + pulse + animation | OK |
| 9 | public/system.{html,js} : statut systemd + restart | OK |
| 10 | public/logs.{html,js} : journal + tabs + recherche + CSV | OK |
| 11 | public/runbook.{html,js} + docs/runbook.md (10 sections ops) | OK |
| 12 | Boutons PDF (vMix/IT/ZIP) dans project-edit | OK |
| 13 | server/sudoers.d/srt-lads-web (restart NOPASSWD whitelist) | OK |
| 14 | Deploy serveur + tests bout-en-bout (push SRT reel) | OK |
| 15 | Tag v1.0.0 | OK |

### WebSocket /ws/live

- Authentification : cookie session (handshake refuse 401 si non auth)
- Broadcast : snapshot complet toutes les 1 s
- Push immediat sur evenement SLS (connect/disconnect)
- Ping/pong toutes les 30 s, terminate des sockets morts
- Format : { type: "snapshot", data: { stats, health, t } }
- Nginx deja configure Phase 1 (Upgrade + Connection + read_timeout 86400s)

### Endpoints API ajoutes

- GET /api/stats : Snapshot SLS + health + projet actif
- GET /api/system/status : 4 services + ressources
- POST /api/system/:service/restart : Whitelist (sls/mumble/nginx/srt-lads-web)
- GET /api/logs : Evenements (connect/disconnect/restart)
- GET /api/logs.csv : Export
- GET /api/runbook : Markdown + HTML rendu via marked
- GET /api/runbook/pdf : Runbook PDF
- GET /api/projects/:id/sites/:siteId/pdf/vmix : Fiche vMix
- GET /api/projects/:id/sites/:siteId/pdf/it : Fiche IT
- GET /api/projects/:id/pdf/all : ZIP de toutes les fiches
- POST /api/streams/:streamId/kick : 501 (non supporte par SLS v1.4.x)

### Monitoring SLS - choix d architecture

SLS v1.4.x N expose PAS d endpoint HTTP de statistiques. Trois options evaluees :

1. Recompiler SLS avec un fork
2. Bindings SRT en Node (peu maintenu)
3. Tail du log SLS (retenu)

Couverture suffisante pour la V1 : detection connect/disconnect, stream-id, IP, port, fd, duree de session.
Limitations : pas de bitrate / RTT / pertes / latence (non ecrits par SLS dans le log). Latence d apparition possible selon le flush du buffer log SLS.
Banner d avertissement visible sur la Vue Live.

### Securite

- WebSocket auth = cookie session
- CSP connectSrc 'self' ws: wss:
- Restart whitelist double : Node + sudoers (4 lignes NOPASSWD)
- sudo -n non interactif uniquement pour ces 4 commandes
- visudo -c valide sur le fragment deploye
- Aucun JS inline (CSP script-src 'self')

### Tests prod (https://gatesrt.evaremote.com)

- GET /api/health -> 200 phase 2.4 version 1.0.0
- GET /api/stats -> 200 publishers=[] players=[] tailRunning=true
- GET /api/system/status -> 200 4 services active
- GET /api/runbook /api/logs -> 200
- GET /live /system /logs /runbook -> 200
- PDFs verifies via `file` : vMix 3270B PDF 1.3, IT 3119B PDF 1.3, ZIP 5305B, Runbook 5771B PDF 1.3 2p

### Test SRT reel

ffmpeg push vers srt://127.0.0.1:10000?streamid=publish/live/e2e-nopass
Resultat /api/logs : connect + disconnect avec durationSec=10 traces.

### Fichiers ajoutes

- srt-lads/web/lib/slsLogTail.js
- srt-lads/web/lib/eventsLog.js
- srt-lads/web/lib/pdfGenerator.js
- srt-lads/web/lib/systemControl.js
- srt-lads/web/public/{live,system,logs,runbook}.html
- srt-lads/web/public/css/live.css
- srt-lads/web/public/js/{live,system,logs,runbook}.js
- srt-lads/docs/runbook.md
- srt-lads/server/sudoers.d/srt-lads-web

Modifies : server.js, routes/api.js, routes/index.js, project-edit.{html,js}, projects.css, package.json (v1.0.0).

### Commits Phase 2.4

- 2272b8c fix(phase2.4): restrict streamId regex
- d1257d6 feat(phase2.4): monitoring live + PDF + system + logs + runbook

### Limitations connues

1. Pas de bitrate/RTT/pertes en temps reel (SLS v1.4.x)
2. Kick non supporte (utiliser restart sls)
3. Sessions MemoryStore (perdues a chaque restart)
4. Passphrase SLS refusee ("ERROR:UNSECURE") - a investiguer

---

## Bilan Phase 2 (complete)

Tag v1.0.0 - premiere version stable de l interface SRT LADS.
