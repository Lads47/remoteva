# 📡 SRT LADS — Cahier des charges

**Projet** : Infrastructure SRT multi-sites avec intercom et interface de gestion
**Client initial** : TF1 Factory
**Maître d'œuvre** : Evaremote / Lads47
**Date de cadrage** : Mai 2026
**Version** : 1.1 — Cahier des charges figé (corrections TTL/latence + Ubuntu 24.04)

---

## 🎯 Objectif du projet

Créer une infrastructure centralisée de relais SRT permettant à plusieurs vMix distants d'échanger des flux vidéo bidirectionnels avec une régie centrale, sans aucune contrainte de pare-feu sur les sites distants, accompagnée :

- D'un système d'intercom audio indépendant pour les techniciens
- D'une interface web de gestion des projets et de monitoring temps réel
- D'un déploiement reproductible par script

**Cas d'usage initial** : 1 régie centrale + 5 villes distantes = 10 flux SRT simultanés.

**Marge prévue** : architecture dimensionnée pour 20+ flux simultanés.

---

## 🏗️ Infrastructure

### Serveur principal

- **Hébergeur** : OVH
- **Modèle** : VPS-3 (8 vCores, 24 Go RAM, 1,5 Gbit/s)
- **OS** : **Ubuntu Server 24.04 LTS** (support jusqu'en avril 2029)
- **Coût** : 17 €/mois HT

### Serveur de secours (prêt mais non commandé)

- **Modèle** : RISE-S OVH (Ryzen 7 9700X, 64 Go RAM, 1 Gbit/s dédié)
- **Statut** : Script de déploiement reproductible — commande à la demande si nécessaire

### Nom de domaine

- **Domaine** : `evaremote.com` (Hostinger)
- **Sous-domaines** : srt.evaremote.com, mumble.evaremote.com, gatesrt.evaremote.com

### TTL DNS = 300 secondes

⚠️ **À ne pas confondre avec la latence SRT** ⚠️

Le TTL est un paramètre **DNS chez Hostinger**, exprimé en **secondes** (300s = 5 minutes).
Il définit la durée de cache des serveurs DNS du monde.
Un TTL court permet de basculer rapidement vers un autre serveur (changement IP).

---

## 🔌 Services et ports

| Service | Port | Protocole | Rôle |
|---------|------|-----------|------|
| **SRT principal** | 10000 | UDP | Hub SRT (SLS) |
| **SRT secours** | 443 | UDP | Fallback pare-feux restrictifs |
| **Mumble** | 64738 | TCP+UDP | Intercom |
| **Interface web** | 443 | TCP | HTTPS gatesrt.evaremote.com |
| **HTTP redirect** | 80 | TCP | Redirect HTTP → HTTPS |
| **SSH admin** | 22 | TCP | Administration (IP source restreinte) |

---

## 🎬 Paramètres SRT

### Paramètres globaux par défaut

```yaml
Mode             : Caller partout
Hostname         : srt.evaremote.com
Port             : 10000 (UDP), fallback 443 (UDP)
Chiffrement      : AES-256 (Key Length 32)

Vidéo            : H.264 High Profile Level 4.0
Bitrate          : 8 Mbps CBR (configurable par projet)
Résolution       : 1920×1080
Framerate        : 25 fps
GOP              : 1 seconde

Audio            : AAC LC 128 kbps stéréo 48 kHz

Hardware Encoder : Activé
Low Power Encoder: DÉSACTIVÉ
```

### ⚡ Latence SRT — Paramètre configurable

**Unité** : millisecondes (ms) — à ne pas confondre avec le TTL DNS (secondes).

**Configurabilité dans l'interface** :
- **Niveau projet** : valeur par défaut (par défaut 300 ms)
- **Niveau site** : override possible (champ optionnel par site)
- **Plage acceptable** : 80 à 2000 ms

**Recommandations par type de liaison** :

| Type de liaison | Latence recommandée |
|-----------------|---------------------|
| Fibre symétrique pro | 150-200 ms |
| Fibre grand public | 250-300 ms |
| ADSL / VDSL bonne qualité | 400-500 ms |
| 4G/5G stable | 500-800 ms |
| Connexion instable | 1000-1500 ms |

**Règle empirique** : Latence SRT = 4 × RTT (ping aller-retour)

**Overhead Bandwidth** : 25% par défaut, configurable par projet (10% à 100%).

---

## 🏷️ Convention de stream-ids

### Format technique

Caractères autorisés : `[a-z0-9\-_/]` (minuscules ASCII, chiffres, tiret, underscore, slash).

### Convention recommandée

```
[nom-site]/[type-flux]

Exemples :
  bordeaux/cam       ← Caméra envoyée
  bordeaux/retour    ← Retour reçu
```

### Projet TF1 Factory

```
bordeaux/cam, bordeaux/retour
lyon/cam, lyon/retour
marseille/cam, marseille/retour
toulouse/cam, toulouse/retour
lille/cam, lille/retour
```

Les stream-ids sont **100 % personnalisables** par projet dans l'interface.

---

## 🧰 Stack logicielle

| Composant | Version | Rôle |
|-----------|---------|------|
| OS | **Ubuntu 24.04 LTS** | Base (support 5 ans) |
| SLS | Dernière stable | Hub SRT |
| libsrt | v1.5.x | Bibliothèque |
| Mumble Server | Dépôt Ubuntu | Intercom |
| Node.js | 20 LTS | Backend web |
| Nginx | 1.24+ | Reverse proxy HTTPS |
| Let's Encrypt | — | Certificats |
| Netdata | Officiel | Monitoring système |
| UFW + fail2ban | Standard | Sécurité |

### Plan B firewall

- **Tailscale** : VPN mesh gratuit
- **vMix Call / Zoom** : backup ultime par site

---

## 🖥️ Interface web SRT LADS

### URL : `https://gatesrt.evaremote.com`

### Pages V1

#### 1. Dashboard
Statut global + projet actif + navigation.

#### 2. Vue Live
- Flux entrants/sortants temps réel (1s WebSocket)
- Bitrate, RTT, % pertes, **latence SRT négociée**, durée, contact
- Codes couleur 🟢🟡🔴
- Bouton "Kick" par flux
- Mode plein écran régie

#### 3. Vue Projets
Liste, création, édition, duplication, archivage.

#### 4. Édition de projet

**Paramètres globaux** :
- Nom, Statut, Passphrase SRT (libre)
- **Latence SRT par défaut** : champ ms (défaut 300)
- Overhead Bandwidth (%) : défaut 25
- Bitrate (kbps) : défaut 8000

**Sites** :
- Nom, stream-ids cam/retour
- **Latence SRT spécifique** (override optionnel)
- Technicien + téléphone + notes

**Génération automatique** :
- URLs SRT complètes copiables
- Export PDF "Fiche vMix"
- Export PDF "Fiche IT"

#### 5. Vue Système
Netdata + statut services systemd + restart buttons.

#### 6. Vue Logs
Recherche/filtre, export CSV.

#### 7. Onglet Runbook
Rendu markdown + lien PDF.

### Stockage

Format JSON dans `/var/lib/srt-lads/`. Pas de BDD en V1.

---

## 🎤 Mumble

- Port 64738 TCP+UDP
- TLS auto-signé, Opus 96 kbps max
- 10 utilisateurs : centre, ville1-5, prod1-2, admin, invite
- Mots de passe lisibles éditables
- Canaux : Régie centrale, Tech Ville 1-5, Talkback antenne, Coordination, Test
- Client : Push-to-Talk obligatoire, casque obligatoire, codec Opus 72 kbps

---

## 📦 Repo Git

### Localisation : `github.com/Lads47/remoteva` (privé)

Sous-dossier : `srt-lads/` (à créer en Phase 1).

### Auth : Personal Access Token GitHub (scope `repo`)

### Structure

```
srt-lads/
├── README.md
├── CAHIER_DES_CHARGES.md
├── install.sh, update.sh, backup.sh
├── .env.example, .gitignore
├── server/ (sls, mumble, nginx, systemd)
├── web/ (backend, frontend, package.json)
└── docs/ (runbook, guides, fiche IT)
```

### Secrets

`.env` sur le serveur uniquement, **JAMAIS dans Git**.

---

## 📅 Planning

| Jour | Actions |
|------|---------|
| **J-5** | Commande VPS-3 Ubuntu 24.04. Phase 1 Claude Code. |
| **J-4** | Phase 2 Claude Code (interface web). |
| **J-3** | Tests réels 1-2 villes. |
| **J-2** | Répétition générale 6 sites. |
| **J-1** | Calme + runbook imprimé. |
| **JOUR J** | Surveillance dédiée. |

---

## 🛡️ Plan de résilience (5 niveaux)

1. **Serveur** : VPS-3 → RISE-S via bascule DNS
2. **Port firewall** : 10000/UDP → 443/UDP
3. **VPN** : Tailscale
4. **Visio** : vMix Call / Zoom
5. **Intercom** : Mumble → GSM

---

## 💰 Budget

- VPS-3 OVH : **17 €/mois HT**
- Domaine : ~1 €/mois
- Logiciels open source : 0 €
- **Total : ~18 €/mois HT**

Option RISE-S : +65 €/mois HT.

---

## 📚 Glossaire

### TTL DNS vs Latence SRT

| Concept | Unité | Rôle |
|---------|-------|------|
| **TTL DNS** | secondes (300s) | Cache DNS Hostinger |
| **Latence SRT** | millisecondes (300ms) | Buffer retransmission |

**Aucun rapport entre eux** malgré la coïncidence du chiffre 300.

### Bitrate vs Overhead

- **Bitrate vidéo** (8 Mbps) : débit utile
- **Overhead SRT** (25%) : marge retransmission
- **BP réelle** : 8 × 1.25 = 10 Mbps

---

**Version 1.1 — Mai 2026**
