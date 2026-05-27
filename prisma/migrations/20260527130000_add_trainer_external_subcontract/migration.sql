-- ============================================================================
-- Sous-traitance formateur externe (Qualiopi indicateur 27)
--
-- - 5 nouveaux champs sur trainers : flag isExternal + identité juridique
--   (raison sociale, SIRET, adresse, NDA, représentant légal).
-- - 3 nouveaux champs sur formation_sessions : montant HT contractualisé,
--   ID du fichier Drive du contrat généré, date d'envoi.
-- ============================================================================

-- 1. Champs identité juridique sur trainers
ALTER TABLE "trainers" ADD COLUMN "is_external" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "trainers" ADD COLUMN "raison_sociale" TEXT NOT NULL DEFAULT '';
ALTER TABLE "trainers" ADD COLUMN "siret" TEXT NOT NULL DEFAULT '';
ALTER TABLE "trainers" ADD COLUMN "adresse" TEXT NOT NULL DEFAULT '';
ALTER TABLE "trainers" ADD COLUMN "numero_da" TEXT NOT NULL DEFAULT '';
ALTER TABLE "trainers" ADD COLUMN "representant_legal" TEXT NOT NULL DEFAULT '';

-- 2. Champs contrat sur formation_sessions
ALTER TABLE "formation_sessions" ADD COLUMN "trainer_fee_amount" REAL;
ALTER TABLE "formation_sessions" ADD COLUMN "trainer_contract_drive_file_id" TEXT;
ALTER TABLE "formation_sessions" ADD COLUMN "trainer_contract_sent_at" DATETIME;

-- 3. Index utile pour filtrer rapidement les formateurs externes
CREATE INDEX "trainers_is_external_idx" ON "trainers"("is_external");
