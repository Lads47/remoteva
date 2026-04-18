# Workflows n8n — EVA Flow / evaremote

Workflows à importer dans n8n (`https://n8n.srv950180.hstgr.cloud`).

## 📦 Fichiers

| Fichier | Contenu |
|---|---|
| **`evaremote.json`** ⭐ | Workflow unifié recommandé : 3 webhooks (`send-newsletter` + `eva-flow-magic-link` + `eva-flow-feuille-de-route`) |
| `eva-flow-magic-link.json` | Standalone (1 webhook) — si tu préfères un workflow séparé |
| `eva-flow-feuille-de-route.json` | Standalone (1 webhook) — si tu préfères un workflow séparé |

**Recommandé : importer `evaremote.json`** (tout en un, plus propre à gérer).

---

## 🚀 Migration depuis IA Regie Unified

### Contexte

Le webhook `/send-newsletter` est aujourd'hui hébergé dans le workflow géant **"IA Regie V3 - Unified"**. Il est utilisé à la fois par **Remoteva** et **ia-regie-master-v2**.

Pour faire le ménage proprement, on déplace `send-newsletter` dans un nouveau workflow `evaremote` dédié, qui contiendra aussi les 2 nouveaux endpoints EVA Flow.

### Plan en 5 étapes (zero downtime)

#### 1. Importer le nouveau workflow
- n8n → **Workflows → Import from File** → `evaremote.json`
- Vérifier que le node "Send Email" de chaque webhook est bien lié au credential **Gmail account 6** (`pBWX128yc5be6Wx1`)
- **NE PAS encore activer**

#### 2. Désactiver send-newsletter dans IA Regie Unified
- Ouvrir "IA Regie V3 - Unified"
- Trouver le node "Webhook - send-newsletter" (et toute la chaîne associée)
- Clic droit → **Deactivate** (ne PAS supprimer pour l'instant)
- Sauvegarder

#### 3. Activer evaremote
- Ouvrir le workflow `evaremote`
- Toggle **Active** en haut à droite
- Vérifier dans les Executions que les 3 webhooks sont prêts

#### 4. Tester
```bash
# Test newsletter (depuis Remoteva ou ia-regie)
curl -X POST https://n8n.srv950180.hstgr.cloud/webhook/send-newsletter \
  -H "Content-Type: application/json" \
  -d '{"to":"ton-email@example.com","subject":"Test","html":"<h1>Test OK</h1>"}'

# Test magic link
curl -X POST https://n8n.srv950180.hstgr.cloud/webhook/eva-flow-magic-link \
  -H "Content-Type: application/json" \
  -d '{"to":"ton-email@example.com","directorName":"Paul","magicLink":"https://evaremote.com/presta?token=test"}'

# Test feuille de route
curl -X POST https://n8n.srv950180.hstgr.cloud/webhook/eva-flow-feuille-de-route \
  -H "Content-Type: application/json" \
  -d '{"to":"ton-email@example.com","directorName":"Paul","eventId":"180426-001","eventTitle":"Test","eventDate":"2026-04-18","location":"Paris","room":"A","regie":"WVP_A1","conferences":[{"order":1,"title":"Conf 1","speaker":"X","scheduledStart":"2026-04-18T09:00:00Z","scheduledEnd":"2026-04-18T10:00:00Z"}]}'
```

#### 5. (Plus tard, après quelques jours sans bug) Nettoyage final
- Retourner dans "IA Regie V3 - Unified"
- Supprimer définitivement les nodes "Webhook - send-newsletter", "Prepare Data - send-newsletter", "Send Email - send-newsletter", "Build Response - send-newsletter", "Response - send-newsletter"
- Sauvegarder

---

## 🧹 Webhooks à analyser dans IA Regie Unified

D'après l'analyse du code ia-regie-master-v2, voici l'état des webhooks :

### ✅ Webhooks ACTIFS (12) — à conserver dans IA Regie Unified
| Endpoint | Description |
|---|---|
| `/sync-resume` | Sync conférence vers Google Sheet "Suivi_IA" |
| `/update-doc` | Update Google Doc transcription |
| `/scan-drive` | Scan dossier Google Drive |
| `/get-conferences` | Récupère liste confs depuis Google Sheet |
| `/create-transcription-doc` | Crée nouveau Google Doc transcription |
| `/create-photo-folder` | Crée dossier photo dans Drive |
| `/upload-lexicon` | Upload lexique JSON dans Drive |
| `/download-lexicon` | Download lexique depuis Drive |
| `/delete-lexicon` | Suppression lexique Drive |
| `/list-lexiques` | Liste tous les lexiques Drive |
| `/list-templates` | Liste templates newsletter Drive |
| `/download-template` | Download template newsletter |

### ⚠️ Webhooks DEPRECATED — à supprimer si présents dans le workflow
| Endpoint | Raison |
|---|---|
| `N8N_FETCH_SHEET` | Marqué deprecated dans config.py, remplacé |
| `N8N_GET_VALIDATED_CONFERENCES` | Deprecated, remplacé par lecture JSON locale |
| `N8N_UPLOAD_PHOTO` | Défini dans config mais jamais appelé dans le code |

### ⏩ Webhook à MIGRER vers `evaremote`
| Endpoint | Action |
|---|---|
| `/send-newsletter` | Désactiver dans Unified, garder dans `evaremote` (déjà inclus) |

---

## 📡 Spécifications des 3 endpoints `evaremote`

### 1. `POST /webhook/send-newsletter`
**Body** :
```json
{
  "to": "client@example.com",
  "subject": "Newsletter - Mon Événement",
  "html": "<html>...</html>"
}
```
**Réponse** :
```json
{ "success": true, "message_id": "...", "thread_id": "..." }
```

### 2. `POST /webhook/eva-flow-magic-link`
**Body** :
```json
{
  "to": "paul@example.com",
  "directorName": "Paul Martin",
  "magicLink": "https://evaremote.com/presta?token=abc123..."
}
```
Envoie un email de bienvenue avec lien magique d'accès au calendrier `/presta`.

### 3. `POST /webhook/eva-flow-feuille-de-route`
**Body** :
```json
{
  "to": "paul@example.com",
  "directorName": "Paul Martin",
  "eventId": "180426-001",
  "eventTitle": "Journée sur les nuages",
  "eventDate": "2026-04-18",
  "location": "Paris",
  "room": "Salle 2",
  "regie": "WVP_A2",
  "recordingLocalPath": "D:/REC/2026-04-18_journee-nuages/",
  "notes": "Prévoir un micro HF supplémentaire",
  "conferences": [
    {
      "order": 1,
      "title": "Ouverture",
      "speaker": "Dr Dupont",
      "scheduledStart": "2026-04-18T09:00:00.000Z",
      "scheduledEnd": "2026-04-18T10:00:00.000Z"
    }
  ]
}
```
Envoie une feuille de route HTML formatée (header navy, badge eventId, table conférences, rappel mode offline).

---

## 🔐 Credential Gmail utilisé

Tous les nodes "Send Email" pointent vers le credential `Gmail account 6` (id `pBWX128yc5be6Wx1`) — celui que tu utilises déjà pour l'envoi de newsletters.

Si tu le renommes ou le recrées un jour, il suffit de réassigner le credential sur les 3 nodes "Send Email" du workflow `evaremote`.
