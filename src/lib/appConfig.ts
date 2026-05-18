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

// === Clés de config connues (Sellsy) ===

export const CONFIG_KEYS = {
  SELLSY_PIPELINE_ID: "sellsy.pipeline_id",
  SELLSY_STEP_MAPPING: "sellsy.step_mapping",
  SELLSY_ESTIMATE_MODEL_ID: "sellsy.estimate_model_id",
} as const;

export async function getSellsyEstimateModelId(): Promise<number | null> {
  const raw = await getConfig(CONFIG_KEYS.SELLSY_ESTIMATE_MODEL_ID);
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

export async function setSellsyEstimateModelId(id: number | null): Promise<void> {
  if (id === null) {
    await setConfig(CONFIG_KEYS.SELLSY_ESTIMATE_MODEL_ID, "");
  } else {
    await setConfig(CONFIG_KEYS.SELLSY_ESTIMATE_MODEL_ID, String(id));
  }
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
