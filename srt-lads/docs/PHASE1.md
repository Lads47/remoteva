# Phase 1 - Compte rendu d'installation

**Date** : 17 mai 2026
**Cible** : VPS-3 OVH Ubuntu 24.04.4 LTS, 193.70.43.0 (vps-8c26538c)
**Etat** : Validee

## Resume

Toutes les sous-phases (1.0 -> 1.10) sont terminees et validees.

| # | Phase | Statut |
|---|-------|--------|
| 1.0 | Verification repo GitHub | OK |
| 1.1 | Securisation serveur | OK |
| 1.2 | Structure srt-lads/ | OK |
| 1.3 | SLS (libsrt 1.5.5 + sls patche) | OK |
| 1.4 | Mumble | OK |
| 1.5 | Nginx + Let's Encrypt | OK |
| 1.6 | Netdata | OK |
| 1.7 | .env (chmod 600) | OK |
| 1.8 | /var/lib/srt-lads | OK |
| 1.9 | Commit + push | OK |
| 1.10 | Tests de validation | OK |

## Securite

- SSH key-only (PermitRootLogin no, PasswordAuthentication no)
- User srtadmin (uid 1001) sudo NOPASSWD
- AllowUsers : srtadmin ubuntu
- Fail2ban actif (jail sshd, maxretry 5, bantime 1h)
- UFW : 7 regles, default deny incoming
- unattended-upgrades : security patches automatiques

## Services actifs

| Service              | Etat   | Port           |
|----------------------|--------|----------------|
| ssh                  | active | 22/tcp         |
| sls                  | active | 10000+443/udp  |
| mumble-server        | active | 64738 tcp+udp  |
| nginx                | active | 80+443/tcp     |
| netdata              | active | 127.0.0.1:19999|
| fail2ban             | active | -              |
| unattended-upgrades  | active | -              |

## Tests realises

- **SSH** : connexion srtadmin par cle OK, sudo -n root OK
- **UFW** : 14 regles actives (IPv4+IPv6)
- **Fail2ban** : 8 IPs bannies depuis le debut de la session (brute force SSH)
- **SLS** : ss -ulnp confirme listen 10000+443
- **Mumble** : ss confirme listen 64738 TCP+UDP
- **Nginx** : ss confirme listen 80+443 TCP
- **Netdata** : bind 127.0.0.1 uniquement, accessible via /netdata/ avec auth
- **HTTPS** : certificat valide jusqu'au 15/08/2026, auto-renouvellement OK
- **SRT push test** : ffmpeg testsrc -> SLS sur port 10000 et 443 : OK
  - Logs SLS : `new pub=..., key_stream_name=publish/live/testXXX`

## Convention stream-ids SLS

Pattern : `<domain>/<app>/<stream>` (3 segments)
- Publisher : `publish/live/<nom>` (ex: `publish/live/bordeaux-cam`)
- Player : `play/live/<nom>` (ex: `play/live/bordeaux-cam`)

## Acces

| Service       | URL / Endpoint                          |
|---------------|-----------------------------------------|
| SSH           | srtadmin@193.70.43.0 (cle SSH dediee)  |
| Web public    | https://gatesrt.evaremote.com           |
| Netdata       | https://gatesrt.evaremote.com/netdata/  |
| SRT main      | srt.evaremote.com:10000/UDP             |
| SRT backup    | srt.evaremote.com:443/UDP               |
| Mumble        | mumble.evaremote.com:64738              |

## Secrets

Tous dans `/opt/srt-lads/.env` (chmod 600, owner srtadmin) :
- GITHUB_TOKEN
- ADMIN_WEB_PASSWORD (Netdata + interface Phase 2)
- WEB_SESSION_SECRET
- MUMBLE_SUPERUSER_PASSWORD

Le fichier `.env` n'est jamais commit (gitignore racine + srt-lads/.gitignore).

## Notes techniques

- SLS upstream a un bug de compilation avec GCC 13 (header ctime manquant), patche dans slscore/common.cpp.
- SLS upstream limite listen=1024-10000 et latency=1-300ms ; patche pour 1-65535 et 1-2000ms (conforme CDC).
- Netdata a deux installs paralleles (apt + kickstart static), seul /opt/netdata est actif. Config dans /opt/netdata/etc/netdata/netdata.conf.

