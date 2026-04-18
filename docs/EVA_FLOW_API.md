# EVA Flow — API Reference

Documentation de l'API publique d'EVA Flow, utilisée par les machines **EVA Capture** (régie de captation) et **EVA Cut** (poste de montage) pour interagir avec le serveur de planification hébergé sur **evaremote.com**.

---

## Sommaire

- [1. Architecture](#1-architecture)
- [2. Authentification](#2-authentification)
- [3. Cycle de vie des statuts](#3-cycle-de-vie-des-statuts)
- [4. Routes publiques `/api/flow/*`](#4-routes-publiques-apiflow)
- [5. Workflow type EVA Capture (en ligne)](#5-workflow-type-eva-capture-en-ligne)
- [6. Workflow mode hors ligne](#6-workflow-mode-hors-ligne)
- [7. Routes admin et presta](#7-routes-admin-et-presta)
- [8. Codes d'erreur](#8-codes-derreur)

---

## 1. Architecture

```
┌─────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  EVA Capture    │       │   EVA Flow       │       │   EVA Cut        │
│  (Linux, régie) │ ────▶ │ (evaremote.com)  │ ◀──── │  (Windows, post) │
│  Python FastAPI │       │  Next.js + SQLite│       │  Python FastAPI  │
└─────────────────┘       └──────────────────┘       └──────────────────┘
                                  │
                                  ▼
                          ┌──────────────────┐
                          │ n8n (workflow)   │
                          │ - magic-link     │
                          │ - feuille-route  │
                          │ - newsletter     │
                          └──────────────────┘
```

**Concepts clés** :

- **Project** (= événement) : une journée de captation. Identifiée par un `eventId` lisible (`DDMMYY-NNN`, ex `180426-001`).
- **Conference** : sous-événement d'un projet. Une journée a typiquement 1 à 5 conférences (chacune captée et livrée séparément).
- **Director** : réalisateur intermittent, identifié par email + `magicToken` pour /presta.
- **ApiKey** : clé d'authentification pour les machines EVA Capture / EVA Cut (header `X-Api-Key`).
- **Régie** : lieu physique de captation (`WVP_A1`, `WVP_A2`, `WVP_A3`, `WVP_A4`).

---

## 2. Authentification

Toutes les routes `/api/flow/*` exigent un header `X-Api-Key` :

```http
X-Api-Key: evak_a1b2c3d4e5f6...
```

### Format des clés

- Préfixe fixe : `evak_`
- 40 caractères hexadécimaux (20 octets aléatoires)
- Hash SHA-256 stocké en base, plaintext jamais persisté

### Gestion

- **Création** : `/admin/api-keys` (page admin). Le plaintext n'est affiché **qu'une seule fois** à la création.
- **Révocation** : `/admin/api-keys` (bouton Révoquer). Effet immédiat.
- **Expiration** : optionnelle à la création.

### Erreurs d'auth

| Cas | Status | Body |
|---|---|---|
| Header absent | 401 | `{ "error": "Header X-Api-Key manquant" }` |
| Clé inconnue / révoquée / expirée | 401 | `{ "error": "API key invalide, expirée ou révoquée" }` |

### CORS

Toutes les routes `/api/flow/*` autorisent toutes les origines (`Access-Control-Allow-Origin: *`). La sécurité repose entièrement sur l'API key.

---

## 3. Cycle de vie des statuts

### Statuts d'une conférence

```
planned ──▶ recording ──▶ ingest ──▶ ready_to_edit ──▶ editing ──▶ exported ──▶ delivered

                            ┌─ not_captured (cas d'annulation sur le terrain)
```

| Statut | Sens | Provoqué par |
|---|---|---|
| `planned` | Conférence créée, pas encore captée | Création initiale |
| `recording` | Captation en cours sur EVA Capture | `POST /conferences/:id/recording-started` |
| `ingest` | Captation terminée, transfert en cours | `POST /conferences/:id/recording-stopped` |
| `ready_to_edit` | Fichiers sur le serveur, prêts pour le montage | `POST /conferences/:id/uploaded` |
| `editing` | EVA Cut a ouvert le projet | EVA Cut (à venir) |
| `exported` | Rendu final exporté | EVA Cut (à venir) |
| `delivered` | Livré au client | Action admin (à venir) |
| `not_captured` | Conférence annulée sur le terrain | `POST /conferences/:id/not-captured` |

### Statut auto-dérivé du projet

Le statut du projet **n'est jamais modifié à la main** : il est recalculé automatiquement à partir de ses conférences à chaque transition. Règles :

| Conditions | Statut projet |
|---|---|
| Aucune conférence captée (toutes en `planned` ou `not_captured`) | `planned` |
| Au moins une en `recording` | `recording` |
| Toutes en `delivered` (les `not_captured` ignorées) | `delivered` |
| Toutes en `exported` ou `delivered` | `exported` |
| Au moins une en `editing` | `editing` |
| Toutes en `ready_to_edit` ou plus avancé | `ready_to_edit` |
| Au moins une en `ingest` | `ingest` |
| Sinon | `planned` |

---

## 4. Routes publiques `/api/flow/*`

### `GET /api/flow/projects`

Liste les projets pour une date (et optionnellement une régie).

**Query params** :
- `date` *(requis)* — format `YYYY-MM-DD`
- `regie` *(optionnel)* — `WVP_A1` | `WVP_A2` | `WVP_A3` | `WVP_A4`

**Exemple** :
```bash
curl https://evaremote.com/api/flow/projects?date=2026-04-25&regie=WVP_A2 \
  -H "X-Api-Key: evak_..."
```

**Réponse 200** :
```json
{
  "projects": [
    {
      "id": "ckxxxxxx",
      "eventId": "250426-001",
      "title": "Journée sur les nuages",
      "date": "2026-04-25T00:00:00.000Z",
      "location": "Paris",
      "room": "Amphi A",
      "speaker": "Multiples intervenants",
      "director": "Paul Martin",
      "directorId": "ckyyyyyy",
      "regie": "WVP_A2",
      "recordingLocalPath": null,
      "status": "planned",
      "notes": "",
      "config": {},
      "createdAt": "...",
      "updatedAt": "...",
      "conferences": [
        {
          "id": "ckzzzzzz",
          "order": 1,
          "title": "Ouverture",
          "speaker": "Dr Marie Dupont",
          "status": "planned",
          "scheduledStart": "2026-04-25T09:00:00.000Z",
          "scheduledEnd": "2026-04-25T09:30:00.000Z",
          "startTime": null,
          "endTime": null,
          "localFolder": null,
          "durationSeconds": null
        }
      ]
    }
  ]
}
```

---

### `GET /api/flow/projects/:id`

Détail d'un projet (avec ses conférences).

**Réponse 200** : `{ "project": { ... } }`
**404** si projet introuvable.

---

### `GET /api/flow/projects/by-event-id/:eventId`

Lookup par `eventId` (utile pour le mode offline où la machine ne connaît que cet ID).

**Exemple** :
```bash
curl https://evaremote.com/api/flow/projects/by-event-id/250426-001 \
  -H "X-Api-Key: evak_..."
```

**Réponse 200** : même format que `GET /projects/:id`.
**400** si format invalide.
**404** si introuvable.

---

### `POST /api/flow/projects/:id/prepare`

Prépare un projet côté EVA Capture : verrouille la régie + chemin local. **Idempotent** sur même régie. **Écrase** sur autre régie.

**Body** :
```json
{
  "regie": "WVP_A2",
  "director": "Paul Martin",          // optionnel : nom du réal sur place
  "recordingLocalPath": "D:/REC/2026-04-25_journee/"  // optionnel : dossier racine
}
```

**Réponse 200** : `{ "project": { ... } }` avec les nouveaux champs `regie` et `recordingLocalPath` mis à jour.

---

### `POST /api/flow/projects/:id/conferences`

Crée une conférence à la volée (utile pour les conférences imprévues sur le terrain).

**Body** :
```json
{
  "title": "Conférence imprévue",
  "speaker": "Dr X",                   // optionnel
  "order": 4,                           // optionnel : auto-incrément si omis
  "scheduledStart": "2026-04-25T14:00:00.000Z",  // optionnel
  "scheduledEnd": "2026-04-25T15:00:00.000Z"     // optionnel
}
```

**Réponse 201** : `{ "conference": { ... } }`

---

### `POST /api/flow/conferences/:id/recording-started`

Marque une conférence comme en cours d'enregistrement. Pas de body.

**Effets** :
- Conf : `status = "recording"`, `startTime = now()`
- Projet : statut auto-recalculé (deviendra `recording`)

**Réponse 200** :
```json
{
  "conference": { "id": "...", "status": "recording", "startTime": "..." },
  "projectStatus": "recording"
}
```

---

### `POST /api/flow/conferences/:id/recording-stopped`

Marque une conférence comme captée. Le transfert peut démarrer.

**Body** *(tout optionnel)* :
```json
{
  "localFolder": "conf01_ouverture/",
  "durationSeconds": 3245
}
```

**Effets** :
- Conf : `status = "ingest"`, `endTime = now()`, `localFolder` et `durationSeconds` enregistrés.
- Projet : statut auto-recalculé.

**Réponse 200** : `{ "conference": { ... }, "projectStatus": "..." }`

---

### `POST /api/flow/conferences/:id/uploaded`

Marque une conférence comme uploadée et prête au montage. Pas de body.

**Effets** : `status = "ready_to_edit"` ; statut projet auto-recalculé.

**Réponse 200** : `{ "conference": { ... }, "projectStatus": "..." }`

---

### `POST /api/flow/conferences/:id/not-captured`

Marque une conférence comme **non captée** (annulée sur le terrain). Pas de body.

**Effets** : `status = "not_captured"`. Cette conf est ignorée dans le calcul du statut projet.

---

### `POST /api/flow/sync-offline`

Réconciliation pour les événements créés en mode hors ligne sur EVA Capture.

**Stratégie de merge** :

- Si `project.eventId` est fourni **et matche** un projet existant → **MERGE** :
  - Met à jour les champs projet (titre, lieu, etc.)
  - Pour chaque conf : `order` existant → update ; sinon → create
- Si `project.eventId` est fourni **mais inconnu** → CREATE avec cet eventId imposé
- Si `project.eventId` est absent → CREATE avec eventId généré

**Body** :
```json
{
  "clientId": "uuid-local-pour-idempotence",   // optionnel
  "project": {
    "eventId": "250426-001",                    // optionnel — si présent, merge possible
    "title": "Journée sur les nuages",
    "date": "2026-04-25T00:00:00.000Z",
    "location": "Paris",
    "room": "Amphi A",
    "speaker": "",
    "director": "Paul Martin",
    "regie": "WVP_A2",
    "recordingLocalPath": "D:/REC/2026-04-25/",
    "notes": "Créé hors ligne"
  },
  "conferences": [
    {
      "order": 1,
      "title": "Ouverture",
      "speaker": "Dr Dupont",
      "status": "ready_to_edit",
      "scheduledStart": "2026-04-25T09:00:00.000Z",
      "scheduledEnd": "2026-04-25T09:30:00.000Z",
      "startTime": "2026-04-25T09:02:00.000Z",
      "endTime": "2026-04-25T09:31:00.000Z",
      "localFolder": "conf01/",
      "durationSeconds": 1740
    }
  ]
}
```

**Réponse 201** (création) ou **200** (merge) :
```json
{
  "project": { ... },
  "merged": false   // true si fusion sur eventId existant
}
```

---

## 5. Workflow type EVA Capture (en ligne)

Scénario : le réalisateur arrive en régie WVP_A2 le matin, prêt à filmer.

```bash
# 1. Au démarrage : lister les projets du jour pour ma régie
curl "$API/api/flow/projects?date=2026-04-25&regie=WVP_A2" \
  -H "X-Api-Key: $KEY"
# → projets planifiés pour aujourd'hui en WVP_A2

# 2. Le réal sélectionne un projet et appuie sur "Prepare" dans EVA Capture
curl -X POST "$API/api/flow/projects/$PROJ_ID/prepare" \
  -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
  -d '{
    "regie": "WVP_A2",
    "recordingLocalPath": "D:/REC/2026-04-25_journee-nuages/"
  }'

# 3. Début de la conférence 1 → REC sur EVA Capture
curl -X POST "$API/api/flow/conferences/$CONF1_ID/recording-started" \
  -H "X-Api-Key: $KEY"
# → conf status: recording, project status: recording

# 4. Fin de la conférence 1 → STOP sur EVA Capture
curl -X POST "$API/api/flow/conferences/$CONF1_ID/recording-stopped" \
  -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
  -d '{ "localFolder": "conf01_ouverture/", "durationSeconds": 1740 }'
# → conf status: ingest

# 5. Conf 1 uploadée vers le serveur de stockage
curl -X POST "$API/api/flow/conferences/$CONF1_ID/uploaded" \
  -H "X-Api-Key: $KEY"
# → conf status: ready_to_edit

# 6. Si une conf imprévue arrive en cours de journée :
curl -X POST "$API/api/flow/projects/$PROJ_ID/conferences" \
  -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
  -d '{ "title": "Conférence bonus", "speaker": "Dr X" }'

# 7. Si la conf 3 est annulée :
curl -X POST "$API/api/flow/conferences/$CONF3_ID/not-captured" \
  -H "X-Api-Key: $KEY"
```

---

## 6. Workflow mode hors ligne

Scénario : le réal est en régie sans connexion. Il a noté l'eventId `250426-001` dans son mail de feuille de route.

### Côté EVA Capture (offline)

1. Saisir l'`eventId` (ex `250426-001`), titre, conférences.
2. Filmer normalement, EVA Capture stocke localement les statuts/timestamps de chaque conférence.

### Au retour de connexion : sync-offline

EVA Capture envoie un POST unique avec **tout** le contenu local :

```bash
curl -X POST "$API/api/flow/sync-offline" \
  -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
  -d '{
    "project": {
      "eventId": "250426-001",
      "title": "Journée sur les nuages",
      "date": "2026-04-25T00:00:00.000Z",
      "location": "Paris",
      "room": "Amphi A",
      "regie": "WVP_A2",
      "recordingLocalPath": "D:/REC/2026-04-25/",
      "director": "Paul Martin"
    },
    "conferences": [
      {
        "order": 1, "title": "Ouverture", "speaker": "Dr Dupont",
        "status": "ready_to_edit",
        "startTime": "2026-04-25T09:02:00.000Z",
        "endTime": "2026-04-25T09:31:00.000Z",
        "localFolder": "conf01/",
        "durationSeconds": 1740
      }
    ]
  }'
```

### Cas de figure

| Situation | Comportement serveur |
|---|---|
| `eventId` matche projet existant (créé par admin avant l'événement) | **MERGE** : update champs + sync confs par `order` |
| `eventId` fourni mais inconnu | CREATE avec cet eventId imposé |
| `eventId` absent | CREATE avec eventId auto-généré (DDMMYY-NNN) |

L'opération est idempotente : refaire le même sync ne crée pas de doublons (matching par `eventId` + `order`).

---

## 7. Routes admin et presta

Ces routes ne sont **pas** destinées aux machines EVA Capture / EVA Cut. Elles sont utilisées par l'interface web admin et la page mobile des réalisateurs.

### Admin (session NextAuth requise)

| Route | Méthode | Description |
|---|---|---|
| `/api/admin/flow` | `GET POST PUT DELETE` | CRUD projets |
| `/api/admin/flow/:id` | `GET` | Détail projet + dispos réals du jour |
| `/api/admin/flow/:id/assign-director` | `POST` | Assigne un réal + envoie feuille de route |
| `/api/admin/flow/:id/conferences` | `GET POST` | CRUD conférences nested |
| `/api/admin/flow/:id/conferences/:confId` | `PUT DELETE` | Update/delete conf |
| `/api/admin/directors` | `GET POST PUT DELETE` | CRUD réalisateurs |
| `/api/admin/directors/:id/regenerate-token` | `POST` | Régénère le magic token |
| `/api/admin/api-keys` | `GET POST DELETE` | Gestion des clés API |

### Presta (token réalisateur dans le body / query)

| Route | Méthode | Description |
|---|---|---|
| `/api/presta/me?token=xxx` | `GET` | Infos réal + ses dispos |
| `/api/presta/availability` | `POST DELETE` | Toggle / supprime une dispo (body : `{ token, date }`) |

Le `token` vient du `magicToken` du Director, livré par email à la création (ou via régénération). URL d'accès au calendrier : `https://evaremote.com/presta?token=…`

---

## 8. Codes d'erreur

| Code | Signification | Body type |
|---|---|---|
| 200 | OK | Variable |
| 201 | Created | Variable |
| 204 | No Content (preflight CORS) | Vide |
| 400 | Validation échouée | `{ "error": "...", "issues": [...] }` |
| 401 | Auth manquante / invalide | `{ "error": "..." }` |
| 404 | Ressource introuvable | `{ "error": "..." }` |
| 409 | Conflit (eventId déjà utilisé) | `{ "error": "..." }` |
| 500 | Erreur serveur | `{ "error": "Erreur serveur" }` |

### Format des erreurs de validation

Quand un body ne valide pas le schéma Zod, la réponse 400 contient `issues` (le tableau d'erreurs Zod) :

```json
{
  "error": "Validation échouée",
  "issues": [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "undefined",
      "path": ["title"],
      "message": "Required"
    }
  ]
}
```

---

## Annexe — Variables d'environnement serveur

| Variable | Défaut | Description |
|---|---|---|
| `JWT_SECRET` | *(requis)* | Secret de signature des sessions admin |
| `N8N_BASE_URL` | `https://n8n.srv950180.hstgr.cloud/webhook` | Base URL pour les webhooks n8n (envoi emails) |
| `PUBLIC_BASE_URL` | `https://evaremote.com` | Base URL utilisée pour construire les magic links |

---

## Annexe — Schéma Prisma simplifié

```prisma
model FlowProject {
  id                 String       @id
  eventId            String       @unique  // "180426-001"
  title, date, location, room, speaker, director, notes
  directorId         String?      // FK Director
  regie              String?      // WVP_A1..A4
  recordingLocalPath String?
  status             String       // auto-dérivé
  conferences        Conference[]
}

model Conference {
  id, flowProjectId, order, title, speaker, status
  scheduledStart, scheduledEnd, startTime, endTime
  localFolder, durationSeconds
}

model Director {
  id, name, email, phone, magicToken (unique), active
  availabilities  DirectorAvailability[]
}

model DirectorAvailability {
  id, directorId, date  // unique (directorId, date)
}

model ApiKey {
  id, name, keyHash (SHA-256), prefix, lastUsedAt, expiresAt, revoked
}
```
