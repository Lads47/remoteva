# SRT LADS - Interface web

Backend Node.js + Express + interface web de gestion et monitoring du hub SRT.

## État

- **Phase 2.1** : Backend + auth + structure (en cours)
- **Phase 2.2** : API REST gestion projets (à venir)
- **Phase 2.3** : Frontend HTML/CSS complet (à venir)
- **Phase 2.4** : Monitoring live (WebSocket) + PDF (à venir)

## Démarrage local (dev)

```bash
# Depuis le serveur (ou en local avec un .env)
npm install
npm run dev
```

Le serveur écoute sur `127.0.0.1:WEB_PORT` (3000 par défaut). Nginx fait le reverse proxy HTTPS vers `https://gatesrt.evaremote.com`.

## Production (VPS)

Géré par systemd : `srt-lads-web.service`.

```bash
sudo systemctl status srt-lads-web
sudo systemctl restart srt-lads-web
sudo journalctl -u srt-lads-web -f
```

## Variables d'environnement

Lues depuis `/opt/srt-lads/.env` (chmod 600, jamais commit) :

| Variable | Rôle |
|----------|------|
| `WEB_PORT` | Port d'écoute Node.js (loopback uniquement) |
| `WEB_SESSION_SECRET` | Secret session Express |
| `ADMIN_WEB_USER` | Login admin |
| `ADMIN_WEB_PASSWORD` | Password admin (en clair en V1, hash en V2) |
| `DATA_PATH` | Racine données : `/var/lib/srt-lads` |
| `PROJECTS_PATH` | Projets : `/var/lib/srt-lads/projects` |
| `SLS_STATS_PORT` | Port stats SLS (8181) — utilisé en Phase 2.4 |

## Structure

```
web/
├── server.js              point d'entrée Express
├── config/index.js        chargement .env
├── middlewares/
│   ├── auth.js
│   └── errorHandler.js
├── routes/
│   ├── index.js           pages HTML
│   ├── auth.js            login/logout
│   └── api.js             (squelette - Phase 2.2)
├── lib/logger.js
├── public/
│   ├── login.html
│   ├── dashboard.html
│   └── css/
└── data/                  (placeholder)
```
