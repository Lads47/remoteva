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
 * Retourne le schéma de pré-requis pour une formation (par son code).
 * Reconnaît vMix et IA / INITIA. Sinon retourne un schéma générique minimal.
 */
export function getPrerequisForFormation(code: string): PrerequisField[] {
  const c = code.toLowerCase();
  if (c.includes("vmix")) return VMIX_PREREQUIS;
  if (c.includes("initia") || c.includes("ia")) return IA_PREREQUIS;
  return GENERIC_PREREQUIS;
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
