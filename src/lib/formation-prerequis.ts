// Schémas de pré-requis et analyse du besoin par formation.
// Stockés en JSON dans Trainee.evalEntree après soumission.

export type PrerequisField =
  | { name: string; label: string; type: "single_choice"; options: string[]; required?: boolean }
  | { name: string; label: string; type: "yes_no"; required?: boolean }
  | { name: string; label: string; type: "scale_1_5"; leftLabel: string; rightLabel: string; required?: boolean }
  | { name: string; label: string; type: "text"; placeholder?: string; required?: boolean }
  | { name: string; label: string; type: "textarea"; placeholder?: string; required?: boolean };

const VMIX_PREREQUIS: PrerequisField[] = [
  {
    name: "exp_vmix",
    label: "Quelle est votre expérience avec vMix ?",
    type: "single_choice",
    required: true,
    options: [
      "Débutant (je connais de nom)",
      "Intermédiaire (je pratique occasionnellement)",
      "Confirmé (je l'utilise régulièrement en production)",
    ],
  },
  {
    name: "tutoriels_vmix",
    label: "Avez-vous déjà suivi des tutoriels ou une formation initiale sur vMix ?",
    type: "yes_no",
    required: true,
  },
  {
    name: "skill_presets",
    label: "Êtes-vous capable de charger des presets dans le logiciel vMix ?",
    type: "yes_no",
    required: true,
  },
  {
    name: "skill_input",
    label: "Êtes-vous capable d'ajouter un nouvel input avec les réglages appropriés ?",
    type: "yes_no",
    required: true,
  },
  {
    name: "skill_diag_son",
    label: "Êtes-vous capable d'identifier et/ou rechercher les causes d'un problème technique en cas d'absence de son d'un input ?",
    type: "yes_no",
    required: true,
  },
  {
    name: "niveau_vmix",
    label: "Comment évaluez-vous vos connaissances actuelles du logiciel vMix ?",
    type: "scale_1_5",
    leftLabel: "Inexistantes",
    rightLabel: "Bonnes connaissances générales",
    required: true,
  },
  {
    name: "attentes",
    label: "Qu'attendez-vous prioritairement de cette formation ?",
    type: "textarea",
    required: true,
  },
  {
    name: "projets",
    label: "Quel(s) projet(s) concret(s) souhaitez-vous réaliser après cette formation ?",
    type: "textarea",
    required: true,
  },
];

const IA_PREREQUIS: PrerequisField[] = [
  {
    name: "niveau_usage_ia",
    label: "Actuellement, à quel niveau utilisez-vous l'IA ?",
    type: "single_choice",
    required: true,
    options: [
      "Je n'utilise jamais l'IA",
      "J'utilise occasionnellement des outils comme ChatGPT",
      "J'utilise régulièrement l'IA dans mon activité",
      "J'ai déjà automatisé certaines tâches avec l'IA",
      "J'utilise des workflows ou agents IA avancés",
    ],
  },
  {
    name: "tutoriels_ia",
    label: "Avez-vous déjà suivi des tutoriels ou une formation sur l'utilisation de l'IA ?",
    type: "yes_no",
    required: true,
  },
  {
    name: "outils_ia",
    label: "Quels outils IA utilisez-vous ou connaissez-vous déjà ?",
    type: "textarea",
    required: true,
  },
  {
    name: "outils_quotidien",
    label: "Quels outils informatiques utilisez-vous au quotidien, dans un cadre professionnel ou personnel ?",
    type: "textarea",
    required: true,
  },
  {
    name: "aisance_num",
    label: "Comment évaluez-vous votre aisance avec les outils numériques ?",
    type: "scale_1_5",
    leftLabel: "Débutant",
    rightLabel: "Avancé",
    required: true,
  },
  {
    name: "niveau_ia",
    label: "Comment évaluez-vous vos connaissances actuelles de l'IA ?",
    type: "scale_1_5",
    leftLabel: "Aucune connaissance",
    rightLabel: "Bonnes connaissances générales",
    required: true,
  },
  {
    name: "attentes",
    label: "Qu'attendez-vous prioritairement de cette formation ?",
    type: "textarea",
    required: true,
  },
  {
    name: "projet",
    label: "Quel projet concret souhaitez-vous réaliser après cette formation ?",
    type: "textarea",
    required: true,
  },
];

/**
 * Schémas hardcodés utilisés en fallback quand formation.configForm n'a pas de
 * schéma personnalisé valide.
 */
export function getDefaultPrerequisForCode(code: string): PrerequisField[] {
  const c = code.toLowerCase();
  if (c.includes("vmix")) return VMIX_PREREQUIS;
  if (c.includes("initia") || c.includes("ia")) return IA_PREREQUIS;
  return GENERIC_PREREQUIS;
}

/**
 * Résout le schéma de pré-requis pour une formation :
 * 1. Tente de parser formation.configForm comme `{ prerequis: PrerequisField[] }`
 * 2. Sinon retombe sur le schéma hardcodé en fonction du code.
 *
 * @param formation Objet contenant au minimum `code` et `configForm` (JSON string).
 */
export function resolvePrerequisForFormation(formation: {
  code: string;
  configForm: string;
}): PrerequisField[] {
  const custom = parsePrerequisFromConfig(formation.configForm);
  if (custom) return custom;
  return getDefaultPrerequisForCode(formation.code);
}

/**
 * Parse strictement le JSON `configForm` et valide la structure des champs.
 * Retourne `null` si invalide ou vide (→ fallback hardcoded).
 */
function parsePrerequisFromConfig(configForm: string): PrerequisField[] | null {
  if (!configForm || configForm.trim() === "" || configForm.trim() === "{}") return null;
  try {
    const parsed = JSON.parse(configForm) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as { prerequis?: unknown };
    if (!Array.isArray(obj.prerequis)) return null;
    const result: PrerequisField[] = [];
    for (const f of obj.prerequis) {
      const validated = validateField(f);
      if (!validated) return null; // au moindre champ invalide, on tombe sur fallback
      result.push(validated);
    }
    return result.length > 0 ? result : null;
  } catch {
    return null;
  }
}

function validateField(f: unknown): PrerequisField | null {
  if (!f || typeof f !== "object") return null;
  const obj = f as Record<string, unknown>;
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  const label = typeof obj.label === "string" ? obj.label.trim() : "";
  const type = typeof obj.type === "string" ? obj.type : "";
  const required = obj.required === true;
  if (!name || !label) return null;
  switch (type) {
    case "yes_no":
      return { name, label, type: "yes_no", required };
    case "single_choice": {
      if (!Array.isArray(obj.options)) return null;
      const options = obj.options.filter((o): o is string => typeof o === "string" && o.trim() !== "");
      if (options.length === 0) return null;
      return { name, label, type: "single_choice", options, required };
    }
    case "scale_1_5": {
      const leftLabel = typeof obj.leftLabel === "string" ? obj.leftLabel : "";
      const rightLabel = typeof obj.rightLabel === "string" ? obj.rightLabel : "";
      return { name, label, type: "scale_1_5", leftLabel, rightLabel, required };
    }
    case "text":
    case "textarea": {
      const placeholder = typeof obj.placeholder === "string" ? obj.placeholder : undefined;
      return { name, label, type, required, ...(placeholder ? { placeholder } : {}) };
    }
    default:
      return null;
  }
}

const GENERIC_PREREQUIS: PrerequisField[] = [
  {
    name: "attentes",
    label: "Qu'attendez-vous prioritairement de cette formation ?",
    type: "textarea",
    required: true,
  },
  {
    name: "projet",
    label: "Quel projet concret souhaitez-vous réaliser après cette formation ?",
    type: "textarea",
    required: true,
  },
];
