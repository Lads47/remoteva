# Remoteva — evaremote.com

Portail interne **EVA — Electronic Virtual Assistant** des Ateliers du Stream.

## Vue d'ensemble

Remoteva est l'application web Next.js qui héberge le portail interne **evaremote.com**.
Elle est organisée autour de **5 univers EVA** indépendants, accessibles depuis un hub
d'accueil après connexion, et d'un système de comptes modéré par super-administrateurs.

### Les 5 univers EVA

| Univers | Route | Description |
|---|---|---|
| **EVA Lien** | `/admin/lien` | Partage et téléchargement de fichiers volumineux via lien d'accès unique. |
| **EVA Newsletter** | `/admin/newsletter` | Résumés de conférences en direct, génération HTML, lexiques de préparation. |
| **EVA Flow** | `/admin/flow` | Captation vidéo : événements, conférences, réalisateurs intermittents, clés API des machines. |
| **EVA Stream** | _externe_ | Lien externe vers Gate SRT (`gatesrt.evaremote.com`, hébergé sur OVH). |
| **EVA Formations** | `/admin/formations` | Gestion Qualiopi complète : catalogue, sessions, stagiaires, formateurs, évaluations, réclamations. |

Chaque univers a sa propre navigation contextuelle ; le hub d'accueil (`/admin`) filtre
les tuiles selon les permissions de l'utilisateur connecté.

### Modèle de comptes

Modèle hybride introduit en Phase 4 de la réorganisation :

- **Salariés, formateurs, réalisateurs** → comptes avec **inscription libre**, puis
  **validation par un super-administrateur** qui coche les univers autorisés.
- **Clients** → gardent les **liens d'accès uniques** (aucun compte, zéro friction).
- **2 super-administrateurs** au sommet : Lads (`jerome@lesateliersdustream.fr`) et
  Noémie (`noemie@lesateliersdustream.fr`).

Politique d'inscription :
- Inscription ouverte à tous via `/admin/inscription`.
- Emails `@lesateliersdustream.fr` → **auto-validés** (sans univers attribués tant qu'un
  super-admin n'a pas coché).
- Autres emails → **status `pending`**, validation manuelle requise.

## Stack technique

- **Framework** : Next.js 16 (App Router) + Turbopack
- **Langage** : TypeScript
- **Styles** : Tailwind CSS
- **Base de données** : SQLite via Prisma 7 (`/data/remoteva.db`)
- **Authentification** : JWT signé (jose) + bcrypt (12 rounds)
- **Intégrations** : Google Drive / Docs / Sheets, Sellsy, n8n, envoi d'e-mails, crons
- **Déploiement** : Hostinger (Docker) pour `evaremote.com` ; Gate SRT séparé sur OVH

## Structure du projet

```
remoteva/
├── data/                              # Base SQLite
│   └── remoteva.db
├── prisma/
│   ├── migrations/                    # Migrations Prisma
│   └── schema.prisma
├── scripts/
│   ├── seed.ts                        # Super-admin initial (dev only)
│   └── deploy-vps.sh                  # Script de déploiement Hostinger
├── src/
│   ├── app/
│   │   ├── [accessSlug]/              # Espace client (lien d'accès)
│   │   ├── presta/                    # Espace réalisateurs (jeton)
│   │   ├── formateur/                 # Espace formateurs (jeton)
│   │   ├── formations/[code]/         # Inscription publique formations
│   │   ├── eval-chaud/, eval-froid/,  # Évaluations Qualiopi publiques
│   │   │   eval-formateur/, reclamation/
│   │   ├── admin/                     # Back-office EVA
│   │   │   ├── page.tsx               # Hub d'accueil (5 tuiles filtrées)
│   │   │   ├── inscription/           # Formulaire d'inscription public
│   │   │   ├── pending/               # Page d'attente comptes non validés
│   │   │   ├── login/, account/, users/
│   │   │   ├── lien/                  # EVA Lien
│   │   │   ├── newsletter/            # EVA Newsletter (+ preparation)
│   │   │   ├── flow/                  # EVA Flow (+ directors, api-keys)
│   │   │   ├── formations/            # EVA Formations
│   │   │   └── reclamations/          # Réclamations Qualiopi
│   │   └── api/
│   │       ├── auth/                  # login, logout, register
│   │       ├── admin/                 # API admin (links, users, flow, ...)
│   │       ├── formateur/, presta/    # APIs espaces tiers
│   │       ├── public/                # APIs publiques (inscriptions, eval)
│   │       ├── cron/                  # Jobs planifiés
│   │       └── webhooks/sellsy/
│   ├── components/
│   ├── lib/                           # Helpers (auth, db, services métiers)
│   ├── generated/prisma/              # Client Prisma généré
│   └── proxy.ts                       # Middleware d'authentification
├── next.config.ts                     # Inclut les redirections Phase 2
└── package.json
```

## Installation locale

### Prérequis
- Node.js 20+
- npm 10+

### Étapes

```bash
git clone git@github.com:Lads47/remoteva.git
cd remoteva
npm install

# Configurer .env (au minimum)
echo 'JWT_SECRET="change-me-in-prod"' > .env

# Initialiser la base
npm run db:migrate
npm run db:generate

# Créer un super-admin de dev (à supprimer ensuite via /admin/users)
npm run db:seed

# Lancer
npm run dev
```

Identifiants seed (dev uniquement) :
- Email : `admin@eva.local`
- Mot de passe : `ChangeMe!123`

**Changez ce mot de passe immédiatement après le premier login.**

### URLs locales
- Accueil public : `http://localhost:3000`
- Inscription : `http://localhost:3000/admin/inscription`
- Connexion : `http://localhost:3000/admin/login`
- Hub : `http://localhost:3000/admin`

## Authentification & permissions

### Flux

1. **Inscription** (`/admin/inscription`) → compte créé en `pending` (ou `validated`
   si email interne).
2. **Login** (`/admin/login`) → JWT signé contenant `{ userId, email, status,
   isSuperAdmin, universes }`. Cookie httpOnly 24h.
3. **Proxy** (`src/proxy.ts`) intercepte chaque route protégée :
   - Pas de session → `/admin/login`
   - `status: pending` → `/admin/pending` (sauf `/admin/account` et logout)
   - `status: validated`, pas super-admin, route appartient à un univers non
     autorisé → `/admin` (hub)
   - `/admin/users` → super-admin uniquement
4. **Hub** (`/admin`) filtre les tuiles selon `universes` ou affiche tout pour les
   super-admins.

### Bypass Bearer pour les crons

Le header `Authorization: Bearer $CRON_SECRET` permet aux jobs planifiés
(`/api/cron/*`) d'accéder à toutes les routes protégées sans cookie.
Variable d'environnement : `CRON_SECRET`.

### Espaces tiers (hors back-office)

| Espace | Public | Mécanisme d'accès |
|---|---|---|
| `/[accessSlug]` | Clients | Lien d'accès unique (modèle `AccessLink`) |
| `/presta` | Réalisateurs (EVA Flow) | Jeton dans l'URL |
| `/formateur` | Formateurs (EVA Formations) | Jeton dans l'URL |
| `/formations/[code]/inscription` | Stagiaires | Page publique |
| `/eval-chaud`, `/eval-froid`, `/eval-formateur`, `/reclamation` | Stagiaires & public | Pages publiques / jetons |

Ces espaces **n'utilisent pas** le système de comptes : ils restent inchangés.

## Déploiement

Le script `scripts/deploy-vps.sh` automatise le déploiement sur le VPS Hostinger :

```bash
bash scripts/deploy-vps.sh
```

Étapes du script :
1. Backup automatique de la DB SQLite (`/root/evaremote-backups/`)
2. `git pull` depuis `origin/master`
3. Build Next.js dans un container Node Linux
4. Stop du container, déploiement du nouveau standalone
5. `npm install --production` dans le container
6. Application des migrations Prisma manquantes
7. Restart + health checks HTTP

Variables d'environnement à définir sur le VPS :
- `JWT_SECRET` — secret de signature des JWT (obligatoire)
- `CRON_SECRET` — secret partagé pour les jobs cron (optionnel)
- `DATABASE_URL` — non utilisé, le client Prisma utilise le chemin direct

## Sécurité

- Mots de passe hashés bcrypt 12 rounds, minimum 8 caractères.
- JWT HS256 signé, expiration 24h, cookie `httpOnly` + `secure` en production.
- Proxy (`src/proxy.ts`) vérifie statut + univers à **chaque** requête sur `/admin/*`
  et `/api/admin/*`.
- Garde-fous super-admin : impossible de retirer son propre rôle, de se supprimer,
  ou de laisser le portail sans aucun super-admin.
- Slugs normalisés (alphanumériques en minuscule).
- Fichiers de téléchargement protégés contre les traversées de répertoire.

## Réorganisation EVA — historique des phases

| Phase | Objet | PR |
|---|---|---|
| 1 | Hub d'accueil à 5 tuiles + navigation par univers | #1 |
| 2 | Regroupement effectif des routes par univers + redirections 308 | #2 |
| 3 | _Reportée_ — EVA Lien comme univers dédié dépendra du dev fichiers à venir | — |
| 4 | Comptes, inscription libre, validation super-admin, table `UserUniverseAccess` | #3 |
| 5 | Harmonisation cosmétique, doc, nettoyage | #4 |

Voir `Audit_EVA_Remoteva.docx` (hors repo) pour le plan détaillé.

## Licence

Propriétaire — Les Ateliers du Stream.
