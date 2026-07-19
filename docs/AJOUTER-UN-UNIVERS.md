# Ajouter un univers à evaremote — checklist

> Un « univers » = une tuile / un outil du portail EVA (Lien, Newsletter, Flow, Formations, Master…).
> Cette checklist garde le portail **modulaire et sûr** : suivre l'ordre, ne pas déborder sur les autres univers.

## 0. Décider : dans remoteva, ou app séparée ?
| Cas | Choix |
|---|---|
| UI de coordination / CRUD admin (comme Master, Lien, Newsletter) | **Dans remoteva** (suivre cette checklist) |
| Brique lourde / temps réel / autre stack (comme EVA Stream, EVA Scoring) | **App + repo + sous-domaine séparés** (`xxx.evaremote.com`), reliée par le cookie SSO `.evaremote.com` |

## 1. Enregistrer l'univers (gating — fichiers PARTAGÉS, à faire avec soin)
- [ ] `src/lib/auth.ts` → ajouter la clé à `EVA_UNIVERSES` **et** une ligne dans `universeForPath()`.
- [ ] `src/proxy.ts` → ajouter dans **`PROTECTED_ROUTES`**, dans **`universeForPath()`** (⚠️ duplicata à garder synchro avec auth.ts), et dans le **`matcher`** (`export const config`).
- [ ] Mettre à jour les tests : `src/lib/__tests__/auth-universes.test.ts` + `proxy-gating.test.ts`.

## 2. La tuile (2 endroits)
- [ ] `src/app/admin/page.tsx` (hub admin) — ajouter la tuile.
- [ ] `src/app/page.tsx` (accueil public) — ajouter la tuile (publicHref/authedHref).

## 3. Données (structure propre à l'univers)
- [ ] Modèles Prisma **préfixés `<univers>_`** (ex. `master_prestas`). Ne PAS réutiliser les tables d'un autre univers.
- [ ] Migration dédiée : `npx prisma migrate dev --name <univers>_xxx` puis `npx prisma generate`. **Montrer le schéma avant de migrer.**
- [ ] Ne modifier un modèle **partagé** (AdminUser, AppConfig, AccessLink) qu'avec revue explicite.

## 4. Structure des fichiers (par univers, pas à plat)
- [ ] `src/app/admin/<univers>/` (pages) · `src/app/api/admin/<univers>/` (routes)
- [ ] `src/components/admin/<univers>/` (composants) · `src/lib/<univers>*.ts` ou `src/lib/<univers>/` (métier)
- [ ] Réutiliser un composant partagé (ex. NewsletterService) = **dériver**, pas réécrire ni le modifier sans revue.

## 5. Sécurité des routes API
- [ ] **Le proxy ne gate PAS `/api/admin/*` par univers** — ajouter une garde d'accès dans chaque route (voir `src/lib/master-auth.ts` : `requireMasterAccess()` = session + univers/super-admin).
- [ ] Scoper les ressources par parent (éviter les IDOR — voir `confBelongsToPresta`).

## 6. Vérifier & déployer
- [ ] `npm run test` + `npm run build` **verts** (la CI GitHub Actions le re-vérifie à chaque push).
- [ ] Déploiement = **`bash scripts/deploy-vps.sh`** depuis le poste (build Linux + migration idempotente + health checks). **PAS un simple `git push`** (aucun CI/CD ne déploie).

## Règle d'or
Si tu dois toucher `auth.ts`, `proxy.ts`, `db.ts`, un modèle partagé ou un composant partagé → **c'est du code à blast-radius large**. Teste, et fais-toi relire. Le reste (dans le dossier de ton univers) est isolé : casse-le sans stress.
