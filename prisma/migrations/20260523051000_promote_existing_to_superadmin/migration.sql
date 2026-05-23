-- Phase 4 réorganisation EVA — migration de données
-- Décision Q2a : tous les comptes existants au moment de la Phase 4 sont
-- promus super-admin validés. La distinction salariés vs super-admins
-- (Lads + Noémie) sera affinée ensuite via l'UI super-admin.
--
-- Conditions :
--   - status est encore "pending" (valeur par défaut auto-appliquée par
--     la migration 20260523050337_add_accounts_phase4 sur les lignes
--     existantes)
--   - validated_at est NULL (jamais validé)
-- Cette double condition garantit que cette UPDATE ne touche QUE les comptes
-- legacy migrés, jamais les futurs comptes pending issus de l'inscription.

UPDATE "admin_users"
SET
  "status" = 'validated',
  "is_super_admin" = 1,
  "validated_at" = CURRENT_TIMESTAMP
WHERE
  "status" = 'pending'
  AND "validated_at" IS NULL;
