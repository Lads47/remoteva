# Architecture evaremote — modèle & garde-fous

> Site interne (evaremote.com) hébergeant plusieurs **univers** (outils) : Lien, Newsletter,
> Flow, Formations, Master + les univers externes (Stream, Scoring). Ce doc fixe le modèle
> pour continuer à développer **sans casser la prod**.

## Le modèle : monolithe modulaire
evaremote est un **monolithe modulaire** (Next.js + Prisma/SQLite), et c'est un choix **assumé** :
une petite équipe, des outils qui **partagent les comptes/auth**. On ne part PAS en microservices
(on ré-implémenterait auth + users N fois). On garde un monolithe, mais **modulaire et sûr**.

- **Modularité des accès** ✅ : `EVA_UNIVERSES` + `proxy.ts` + `UserUniverseAccess` gatent chaque univers.
- **Modularité du code** 🚧 : à imposer par univers (dossiers, frontières) — voir la roadmap.
- **Échappatoire** : un univers lourd/temps-réel sort en app+repo+sous-domaine séparés (cf. Stream, Scoring).

## Carte du rayon de souffle (« blast radius »)
Code partagé = une erreur touche **plusieurs univers**. À traiter avec soin + tests :
| Zone | Fichiers | Risque |
|---|---|---|
| Gating | `src/lib/auth.ts`, `src/proxy.ts` | 🔴 casse le gating de TOUS les univers |
| Données | `prisma/schema.prisma` (1 base), modèles `AdminUser`/`AppConfig`/`AccessLink` | 🟠 migration ratée / modèle partagé |
| Composants | `NewsletterService`, `AccessLinksManager` | 🟠 casse plusieurs univers → **dériver**, pas modifier |
| Socle | `src/lib/db.ts`, `mailer.ts`, `google-drive.ts`, `validation.ts` | 🟠 utilisé partout |

Le reste (code dans le dossier d'un univers) est **isolé** : modifiable sans risque pour les autres.

## Garde-fous en place
- **CI** (`.github/workflows/ci.yml`) : `test` + `build` à chaque push/PR → attrape un univers cassé **avant** le déploiement manuel.
- **Tests du gating partagé** : `src/lib/__tests__/auth-universes.test.ts`, `proxy-gating.test.ts`.
- **Gardes d'accès API par univers** : ex. `src/lib/master-auth.ts` (le proxy ne gate pas `/api/admin/*`).
- **Déploiement** : `bash scripts/deploy-vps.sh` (backup DB + build Linux + migration idempotente + health checks). Pas de CI/CD auto.

## Roadmap de structuration (incrémental, jamais de big-bang)
- **Palier 0 (fait)** : CI + tests sur le code partagé + checklist d'ajout d'univers.
- **Palier 1 (au fil de l'eau)** : un dossier par univers (`lib/<univers>/`, `components/<univers>/`, `api/admin/<univers>/`) — Master le fait déjà ; ranger les anciens **quand on les touche**. Un registre d'univers unique. Séparer `lib/core/` (partagé) de `lib/<univers>/`.
- **Palier 2 (quand ça fait mal)** : schéma Prisma multi-fichiers (`schema/<univers>.prisma`), modèles « core » protégés, extraction des univers lourds.

## À ajouter un univers
Voir **[AJOUTER-UN-UNIVERS.md](./AJOUTER-UN-UNIVERS.md)**.
