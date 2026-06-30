# ⚠️ LEGACY — Ne plus utiliser

> **Ce dossier est archivé. Il décrit l'architecture V1 du projet, basée sur SLS (SRT Live Server). En production depuis mai 2026, la stack a été migrée vers MediaMTX et le projet a été remplacé par EVA STREAM.**
>
> **Pour la prod actuelle, voir le repo dédié :** https://github.com/Lads47/eva-stream
>
> - Serveur média : MediaMTX (Go, bluenviron/mediamtx) — pas SLS
> - Backend web : `eva-stream-web` (Fastify) — pas `srt-lads-web` (Node.js Express)
> - Monitoring temps réel : API REST MediaMTX (`/v3/srtconns/list`) — pas parsing de `/var/log/sls/error.log`
> - Sur le VPS OVH (193.70.43.0), `sls.service` et `srt-lads-web.service` sont `inactive`. Seuls `mediamtx.service` et `eva-stream-web.service` tournent.
>
> Ce dossier est conservé uniquement pour référence historique (cahier des charges originaux, choix d'archi V1, runbook SLS). Aucun de ses fichiers de config / scripts / code n'est plus déployé.

---

# SRT LADS (archivé)

Infrastructure SRT multi-sites pour TF1 Factory - Evaremote / Lads47.

## Vue d'ensemble

Hub SRT centralise (SLS) + intercom audio (Mumble) + interface web de gestion sur VPS-3 OVH Ubuntu 24.04 LTS.

- **Domaine** : evaremote.com
- **Interface web** : https://gatesrt.evaremote.com
- **SRT endpoint** : srt.evaremote.com:10000/UDP (principal), :443/UDP (secours)
- **Mumble** : mumble.evaremote.com:64738 TCP+UDP

## Documentation

- [CAHIER_DES_CHARGES.md](./CAHIER_DES_CHARGES.md) - Specs detaillees v1.1
- [docs/PHASE1.md](./docs/PHASE1.md) - Compte rendu installation Phase 1

## Scripts

- `install.sh` - Installation reproductible idempotente du serveur
- `update.sh` - Mises a jour du systeme et des services
- `backup.sh` - Sauvegarde des projets et configurations

## Structure

```
srt-lads/
|-- README.md
|-- CAHIER_DES_CHARGES.md
|-- install.sh, update.sh, backup.sh
|-- .env.example (template sans valeurs)
|-- .gitignore
|-- server/      (configurations SLS, Mumble, Nginx, systemd)
|-- web/         (interface web - Phase 2)
`-- docs/       (runbook, guides)
```

## Secrets

Le fichier `.env` est uniquement present sur le serveur (`/opt/srt-lads/.env`).
Il n'est **JAMAIS** commit dans git. Voir `.env.example` pour la liste des variables.

## Ports utilises

| Port      | Protocole | Service           |
|-----------|-----------|-------------------|
| 22        | TCP       | SSH (key only)    |
| 80        | TCP       | HTTP redirect     |
| 443       | TCP       | HTTPS web         |
| 443       | UDP       | SRT secours       |
| 10000     | UDP       | SRT principal     |
| 64738     | TCP+UDP   | Mumble intercom   |

## Acces serveur

- SSH : `ssh srtadmin@193.70.43.0` (cle uniquement)
- Pas d'acces root direct, pas d'auth par mot de passe

## Etat actuel

- **Phase 1** : Infrastructure de base (en cours / valide)
- **Phase 2** : Interface web complete (a venir)

