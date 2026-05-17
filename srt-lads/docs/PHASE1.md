# Phase 1 - Compte rendu d'installation

**Date** : 17 mai 2026
**Cible** : VPS-3 OVH Ubuntu 24.04.4 LTS, 193.70.43.0 (vps-8c26538c)
**Operateur** : Claude Code + Lads47

## 1.0 Repo GitHub

- Repo : github.com/Lads47/remoteva (prive)
- Sous-dossier cree : srt-lads/
- L'existant (Next.js, n8n-workflows, prisma...) n'est pas modifie

## 1.1 Securisation serveur

- OS mis a jour (apt update + upgrade)
- Timezone : Europe/Paris (CEST)
- Outils installes : git curl wget htop vim build-essential cmake tcl-dev libssl-dev pkg-config
- Utilisateur `srtadmin` cree (uid 1001) avec sudo NOPASSWD
- Cle SSH copiee dans /home/srtadmin/.ssh/authorized_keys
- SSH durci via /etc/ssh/sshd_config.d/99-srtlads.conf :
  - PermitRootLogin no
  - PasswordAuthentication no
  - PubkeyAuthentication yes
  - AllowUsers srtadmin ubuntu
  - MaxAuthTries 3, LoginGraceTime 30
- Fail2ban actif (jail sshd, maxretry 5, findtime 600s, bantime 3600s)
- UFW actif (default deny incoming) :
  - 22/tcp SSH
  - 80/tcp HTTP redirect
  - 443/tcp HTTPS web
  - 443/udp SRT backup
  - 10000/udp SRT main
  - 64738/tcp+udp Mumble
- unattended-upgrades active pour les patchs de securite

## 1.2 Structure repo

```
srt-lads/
|-- README.md
|-- CAHIER_DES_CHARGES.md
|-- install.sh
|-- update.sh
|-- backup.sh
|-- .env.example
|-- .gitignore
|-- server/
|   |-- sls/
|   |-- mumble/
|   |-- nginx/
|   `-- systemd/
|-- web/  (Phase 2)
`-- docs/
    `-- PHASE1.md
```

## 1.3 SLS

A compiler depuis :
- https://github.com/Haivision/srt (libsrt v1.5.x)
- https://github.com/Edward-Wu/srt-live-server

## 1.4 Mumble

apt install mumble-server, port 64738 TCP+UDP.

## 1.5 Nginx + Let's Encrypt

gatesrt.evaremote.com sur 443/tcp avec certbot.

## 1.6 Netdata

Bind localhost + nginx /netdata/ avec auth basique.

## 1.7 .env

/opt/srt-lads/.env (chmod 600, owner srtadmin), gitignore.

## Tests realises

- ssh srtadmin@193.70.43.0 par cle : OK
- sudo -n whoami : root
- ufw status verbose : 7 regles + IPv6
- fail2ban-client status sshd : actif (deja 2 IPs bannies en debut de session)

## Acces

| Service       | URL / Endpoint                          |
|---------------|-----------------------------------------|
| SSH           | srtadmin@193.70.43.0 (cle SSH dediee)  |
| Web           | https://gatesrt.evaremote.com (a venir) |
| SRT main      | srt.evaremote.com:10000/UDP             |
| SRT backup    | srt.evaremote.com:443/UDP               |
| Mumble        | mumble.evaremote.com:64738              |
| Netdata       | https://gatesrt.evaremote.com/netdata/  |

