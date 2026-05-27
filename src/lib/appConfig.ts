import prisma from "./db";
import {
  EVA_STATUSES,
  EVA_STATUS_LABELS,
  type EvaStatus,
  type SellsyStepMapping,
} from "./appConfig-types";

// Re-exports pour faciliter les imports côté serveur
export { EVA_STATUSES, EVA_STATUS_LABELS };
export type { EvaStatus, SellsyStepMapping };

/**
 * Lit une valeur de config. Retourne `null` si la clé n'existe pas.
 * Pas de parsing JSON — voir `getJsonConfig` pour ça.
 */
export async function getConfig(key: string): Promise<string | null> {
  const row = await prisma.appConfig.findUnique({ where: { key } });
  return row?.value ?? null;
}

/**
 * Lit et parse une valeur JSON. Retourne `null` si la clé n'existe pas ou si le JSON est invalide.
 */
export async function getJsonConfig<T = unknown>(key: string): Promise<T | null> {
  const raw = await getConfig(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Écrit une valeur (upsert).
 */
export async function setConfig(key: string, value: string): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

/**
 * Écrit une valeur JSON (sérialisée).
 */
export async function setJsonConfig(key: string, value: unknown): Promise<void> {
  await setConfig(key, JSON.stringify(value));
}

// === Clés de config connues (Sellsy + Drive) ===

export const CONFIG_KEYS = {
  SELLSY_PIPELINE_ID: "sellsy.pipeline_id",
  SELLSY_STEP_MAPPING: "sellsy.step_mapping",
  DRIVE_DEFAULT_TEMPLATES: "drive.default_templates",
  DRIVE_ATTACHMENTS: "drive.attachments",
} as const;

// Templates Drive par défaut, utilisés quand une formation n'a pas son propre
// template configuré. Stockés en un seul JSON dans AppConfig.
export interface DriveDefaultTemplates {
  convention?: string;
  contrat?: string;
  convocation?: string;
  certificat?: string;            // Certificat de réalisation (obligatoire Qualiopi/OPCO)
  attestation?: string;           // Attestation de fin de formation (acquis pédagogiques)
  externalTrainerContract?: string; // Contrat de sous-traitance formateur externe (Qualiopi ind. 27)
}

// IDs Drive des PDF joints automatiquement à certains mails (CGV, RI...).
// Ces PDF sont déjà finalisés (pas générés dynamiquement) : on les télécharge
// tels quels et on les attache au mail.
export interface DriveAttachments {
  cgv?: string;          // ID du fichier PDF des CGV (Conditions Générales de Vente)
  ri?: string;           // ID du fichier PDF du Règlement Intérieur de l'OF
}

export async function getSellsyPipelineId(): Promise<number | null> {
  const raw = await getConfig(CONFIG_KEYS.SELLSY_PIPELINE_ID);
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export async function setSellsyPipelineId(id: number): Promise<void> {
  await setConfig(CONFIG_KEYS.SELLSY_PIPELINE_ID, String(id));
}

export async function getSellsyStepMapping(): Promise<SellsyStepMapping> {
  return (await getJsonConfig<SellsyStepMapping>(CONFIG_KEYS.SELLSY_STEP_MAPPING)) ?? {};
}

export async function setSellsyStepMapping(mapping: SellsyStepMapping): Promise<void> {
  await setJsonConfig(CONFIG_KEYS.SELLSY_STEP_MAPPING, mapping);
}

// === Templates Drive par défaut ===

/**
 * Retourne le mapping `{ convention, contrat, convocation }` des IDs de
 * templates Drive utilisés par défaut quand une formation n'a pas son propre
 * template configuré. Renvoie un objet vide si rien n'a jamais été défini.
 */
export async function getDriveDefaultTemplates(): Promise<DriveDefaultTemplates> {
  return (await getJsonConfig<DriveDefaultTemplates>(CONFIG_KEYS.DRIVE_DEFAULT_TEMPLATES)) ?? {};
}

export async function setDriveDefaultTemplates(templates: DriveDefaultTemplates): Promise<void> {
  // Nettoyage : on persiste uniquement les entrées non vides
  const cleaned: DriveDefaultTemplates = {};
  if (templates.convention?.trim()) cleaned.convention = templates.convention.trim();
  if (templates.contrat?.trim()) cleaned.contrat = templates.contrat.trim();
  if (templates.convocation?.trim()) cleaned.convocation = templates.convocation.trim();
  if (templates.certificat?.trim()) cleaned.certificat = templates.certificat.trim();
  if (templates.attestation?.trim()) cleaned.attestation = templates.attestation.trim();
  if (templates.externalTrainerContract?.trim()) {
    cleaned.externalTrainerContract = templates.externalTrainerContract.trim();
  }
  await setJsonConfig(CONFIG_KEYS.DRIVE_DEFAULT_TEMPLATES, cleaned);
}

// === Pièces jointes Drive (CGV, RI...) ===

export async function getDriveAttachments(): Promise<DriveAttachments> {
  return (await getJsonConfig<DriveAttachments>(CONFIG_KEYS.DRIVE_ATTACHMENTS)) ?? {};
}

export async function setDriveAttachments(attachments: DriveAttachments): Promise<void> {
  const cleaned: DriveAttachments = {};
  if (attachments.cgv?.trim()) cleaned.cgv = attachments.cgv.trim();
  if (attachments.ri?.trim()) cleaned.ri = attachments.ri.trim();
  await setJsonConfig(CONFIG_KEYS.DRIVE_ATTACHMENTS, cleaned);
}
