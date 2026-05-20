// Évaluation à chaud (satisfaction stagiaire en fin de session).
//
// Architecture :
//   - Le formateur déclenche manuellement l'envoi depuis la page session.
//   - On crée une SatisfactionResponse par stagiaire (avec magic-token).
//   - Chaque stagiaire reçoit un mail avec son lien personnel.
//   - Un QR code de la session ouvre une page "choisis ton nom" qui redirige
//     vers le bon lien personnel (pratique pour partager 1 QR à l'écran).
//   - Les réponses sont stockées en BDD avec snapshot des questions pour
//     préserver le contexte si la config évolue.
//   - Synthèse + PDF dans G.3.

import { randomBytes } from "crypto";
import { getConfig, setConfig } from "./appConfig";
import prisma from "./db";

// === Types question ===

export type QuestionType =
  | "section_header" // pas une question : titre de section avec description
  | "likert_5"     // 1=Très insatisfait, 5=Très satisfait (radio buttons)
  | "scale_nps"    // 0–10 NPS
  | "text"         // 1 ligne
  | "textarea"     // multi-lignes
  | "yes_no"       // oui/non
  | "single_choice";

export interface SatisfactionQuestion {
  name: string;            // identifiant interne stable (snake_case)
  type: QuestionType;
  label: string;           // libellé visible (titre de section pour section_header)
  description?: string;    // texte d'aide / contexte (sections + questions)
  required: boolean;       // toujours false pour section_header
  options?: string[];      // pour single_choice
  leftLabel?: string;      // pour scale_nps / likert_5 (libellés des extrêmes)
  rightLabel?: string;
  placeholder?: string;
}

// Utilitaire : filtre les vraies questions (exclut les section headers)
export function isAnswerable(q: SatisfactionQuestion): boolean {
  return q.type !== "section_header";
}

// === Questions standard Qualiopi par défaut ===

export const DEFAULT_QUESTIONS: SatisfactionQuestion[] = [
  // === Section 1 : Évaluation globale ===
  {
    name: "section_globale",
    type: "section_header",
    label: "Évaluation globale",
    description: "Votre perception générale de la formation.",
    required: false,
  },
  {
    name: "satisfaction_globale",
    type: "likert_5",
    label: "Comment évaluez-vous globalement cette formation ?",
    required: true,
    leftLabel: "Très insatisfait",
    rightLabel: "Très satisfait",
  },
  {
    name: "attentes",
    type: "likert_5",
    label: "Cette formation a-t-elle répondu à vos attentes ?",
    required: true,
    leftLabel: "Pas du tout",
    rightLabel: "Totalement",
  },
  {
    name: "atteinte_objectifs",
    type: "likert_5",
    label: "Les objectifs pédagogiques annoncés ont-ils été atteints ?",
    required: true,
    leftLabel: "Pas du tout",
    rightLabel: "Totalement",
  },

  // === Section 2 : Contenu de la formation ===
  {
    name: "section_contenu",
    type: "section_header",
    label: "Contenu de la formation",
    description: "Pertinence et clarté de ce qui vous a été enseigné.",
    required: false,
  },
  {
    name: "clarte_contenu",
    type: "likert_5",
    label: "Le contenu était-il clair et compréhensible ?",
    required: true,
    leftLabel: "Pas du tout",
    rightLabel: "Totalement",
  },
  {
    name: "pertinence_sujets",
    type: "single_choice",
    label: "Les sujets abordés étaient-ils pertinents par rapport à votre activité ?",
    required: true,
    options: ["Oui, totalement", "En partie", "Pas vraiment"],
  },
  {
    name: "sujets_manquants",
    type: "textarea",
    label: "Y a-t-il des sujets que vous auriez aimé voir abordés mais qui ne l'ont pas été ?",
    required: false,
    placeholder: "Vos suggestions de contenu (optionnel)…",
  },

  // === Section 3 : Qualité de l'enseignement ===
  {
    name: "section_enseignement",
    type: "section_header",
    label: "Qualité de l'enseignement",
    description: "Compétence et disponibilité du formateur.",
    required: false,
  },
  {
    name: "competence_formateur",
    type: "likert_5",
    label: "Comment évaluez-vous la compétence pédagogique et technique du formateur ?",
    required: true,
    leftLabel: "Très insuffisante",
    rightLabel: "Excellente",
  },
  {
    name: "disponibilite_formateur",
    type: "likert_5",
    label: "Le formateur était-il disponible pour répondre à vos questions ?",
    required: true,
    leftLabel: "Pas du tout",
    rightLabel: "Totalement",
  },
  {
    name: "qualite_animation",
    type: "likert_5",
    label: "Comment évaluez-vous la qualité de l'animation et le rythme de la formation ?",
    required: true,
    leftLabel: "Très insuffisante",
    rightLabel: "Excellente",
  },

  // === Section 4 : Aspects pratiques et matériels ===
  {
    name: "section_pratique",
    type: "section_header",
    label: "Aspects pratiques",
    description: "Exercices, supports, matériel et organisation matérielle.",
    required: false,
  },
  {
    name: "utilite_exercices",
    type: "likert_5",
    label: "Les exercices pratiques étaient-ils utiles pour comprendre et maîtriser les concepts ?",
    required: true,
    leftLabel: "Pas du tout",
    rightLabel: "Très utiles",
  },
  {
    name: "qualite_supports",
    type: "likert_5",
    label: "Qualité des supports pédagogiques (programme, documents, ressources) ?",
    required: true,
    leftLabel: "Très insuffisante",
    rightLabel: "Excellente",
  },
  {
    name: "qualite_organisation",
    type: "likert_5",
    label: "Qualité de l'organisation matérielle (lieu, accueil, équipement mis à disposition) ?",
    required: true,
    leftLabel: "Très insuffisante",
    rightLabel: "Excellente",
  },
  {
    name: "difficultes_techniques",
    type: "single_choice",
    label: "Avez-vous rencontré des difficultés techniques pendant la formation ?",
    required: true,
    options: ["Non", "Oui, une fois", "Oui, plusieurs fois"],
  },
  {
    name: "accessibilite_psh",
    type: "single_choice",
    label: "Si vous êtes en situation de handicap : l'adaptation matérielle et pédagogique a-t-elle répondu à vos besoins ?",
    required: false,
    options: ["Non concerné", "Oui, totalement", "Oui, en partie", "Non, insuffisamment"],
  },

  // === Section 5 : Satisfaction et recommandation ===
  {
    name: "section_recommandation",
    type: "section_header",
    label: "Satisfaction et recommandation",
    description: "Votre regard final et vos suggestions.",
    required: false,
  },
  {
    name: "recommandation_nps",
    type: "scale_nps",
    label: "Sur une échelle de 0 à 10, recommanderiez-vous cette formation à un collègue ou un ami ?",
    description: "Net Promoter Score : 0 = je ne recommande pas du tout, 10 = je recommande vivement.",
    required: true,
    leftLabel: "Pas du tout",
    rightLabel: "Très probablement",
  },
  {
    name: "points_forts",
    type: "textarea",
    label: "Quels sont selon vous les points forts de cette formation ?",
    required: false,
    placeholder: "Ce qui vous a particulièrement plu, ce que vous retenez…",
  },
  {
    name: "axes_amelioration",
    type: "textarea",
    label: "Quelles suggestions d'amélioration proposez-vous ?",
    required: false,
    placeholder: "Ce qui pourrait être amélioré, ce qui a manqué…",
  },
  {
    name: "remarques_libres",
    type: "textarea",
    label: "Autres remarques (optionnel)",
    required: false,
  },
];

const CONFIG_KEY_GLOBAL_QUESTIONS = "satisfaction.global_questions";

// === Resolve questions (global ou override formation) ===

export async function getGlobalSatisfactionQuestions(): Promise<SatisfactionQuestion[]> {
  const raw = await getConfig(CONFIG_KEY_GLOBAL_QUESTIONS);
  if (!raw) return DEFAULT_QUESTIONS;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as SatisfactionQuestion[];
  } catch {}
  return DEFAULT_QUESTIONS;
}

export async function setGlobalSatisfactionQuestions(questions: SatisfactionQuestion[]): Promise<void> {
  await setConfig(CONFIG_KEY_GLOBAL_QUESTIONS, JSON.stringify(questions));
}

/**
 * Résout les questions à utiliser pour une formation : son override si
 * configuré (formation.satisfactionConfigForm non vide), sinon le set global.
 */
export async function resolveQuestionsForFormation(formationId: string): Promise<SatisfactionQuestion[]> {
  const f = await prisma.formation.findUnique({
    where: { id: formationId },
    select: { satisfactionConfigForm: true },
  });
  if (f?.satisfactionConfigForm && f.satisfactionConfigForm.trim() !== "" && f.satisfactionConfigForm.trim() !== "{}") {
    try {
      const parsed = JSON.parse(f.satisfactionConfigForm);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as SatisfactionQuestion[];
    } catch {}
  }
  return getGlobalSatisfactionQuestions();
}

// === Magic token ===

function generateMagicToken(): string {
  return randomBytes(24).toString("base64url");
}

// === Récupération de la liste mails pour envoi groupé ===

export interface TraineeContact {
  traineeId: string;
  prenom: string;
  nom: string;
  email: string;
}

/**
 * Renvoie la liste des stagiaires d'une session avec leurs coordonnées
 * pour l'envoi du mail d'invitation à l'éval à chaud. L'envoi est groupé
 * (même URL pour tous), pas de magic-link personnel.
 */
export async function getSessionContacts(sessionId: string): Promise<{
  formation: { id: string; nomLong: string };
  trainees: TraineeContact[];
} | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      formation: { select: { id: true, nomLong: true } },
      trainees: {
        select: { id: true, prenom: true, nom: true, email: true },
        orderBy: { nom: "asc" },
      },
    },
  });
  if (!session) return null;
  return {
    formation: session.formation,
    trainees: session.trainees.map((t) => ({
      traineeId: t.id,
      prenom: t.prenom,
      nom: t.nom,
      email: t.email,
    })),
  };
}

// === Lecture publique des questions d'une session (pour le formulaire) ===

export interface SurveyPublicData {
  session: { id: string; code: string; dateDebut: Date; dateFin: Date };
  formation: { nomLong: string };
  questions: SatisfactionQuestion[];
}

export async function getSurveyForSession(sessionId: string): Promise<SurveyPublicData | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { formation: { select: { id: true, nomLong: true } } },
  });
  if (!session) return null;
  const questions = await resolveQuestionsForFormation(session.formation.id);
  return {
    session: { id: session.id, code: session.code, dateDebut: session.dateDebut, dateFin: session.dateFin },
    formation: { nomLong: session.formation.nomLong },
    questions,
  };
}

// === Soumission anonyme ===

export interface AnonymousSubmitInput {
  sessionId: string;
  answers: Record<string, string>;     // questionName -> value (string)
}

/**
 * Crée une SatisfactionResponse anonyme : pas de traineeId, pas de
 * magicToken, juste sessionId + questionsSnapshot + answers + submittedAt.
 * Aucun lien avec un stagiaire identifié.
 */
export async function submitAnonymousSurvey(
  input: AnonymousSubmitInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await prisma.session.findUnique({
    where: { id: input.sessionId },
    select: { id: true, formationId: true },
  });
  if (!session) return { ok: false, error: "Session introuvable" };

  const questions = await resolveQuestionsForFormation(session.formationId);
  const snapshot = JSON.stringify(questions);

  // Validation : required fields (skip les section_header)
  for (const q of questions) {
    if (q.type === "section_header") continue;
    if (q.required) {
      const v = input.answers[q.name];
      if (v === undefined || v === null || String(v).trim() === "") {
        return { ok: false, error: `Question requise non répondue : ${q.label}` };
      }
    }
  }

  // Crée la réponse anonyme + les answers en une transaction
  await prisma.$transaction(async (tx) => {
    const resp = await tx.satisfactionResponse.create({
      data: {
        sessionId: input.sessionId,
        questionsSnapshot: snapshot,
        submittedAt: new Date(),
        // traineeId et magicToken volontairement laissés à null
      },
      select: { id: true },
    });
    const data = Object.entries(input.answers).map(([questionName, value]) => ({
      responseId: resp.id,
      questionName,
      value: String(value),
    }));
    if (data.length > 0) {
      await tx.satisfactionAnswer.createMany({ data });
    }
  });

  return { ok: true };
}

// generateMagicToken n'est plus utilisé dans le nouveau flow mais on le
// garde au cas où on en ait besoin pour des tokens internes admin.
void generateMagicToken;

// === Synthèse / agrégations ===

export interface SatisfactionSynthesis {
  session: { id: string; code: string; dateDebut: Date; dateFin: Date; lieu: string; horaires: string };
  formation: { nomLong: string };
  totals: { invited: number; submitted: number; pending: number; responseRate: number };
  questions: SatisfactionQuestion[];
  // Pour chaque question, les stats calculées
  stats: Array<{
    question: SatisfactionQuestion;
    // Pour likert / nps : moyenne + distribution
    average?: number;          // moyenne pour likert (1-5) et nps (0-10)
    distribution?: Record<string, number>; // value → count
    // Pour textarea / text : liste des réponses non vides
    textResponses?: string[];
    // Pour nps : score NPS calculé
    npsScore?: number;
    npsPromoters?: number;
    npsPassives?: number;
    npsDetractors?: number;
  }>;
  // Réponses individuelles anonymisées (pour audit)
  responses: Array<{
    submittedAt: Date | null;
    answers: Record<string, string>;     // questionName → value
  }>;
}

export async function buildSessionSynthesis(sessionId: string): Promise<SatisfactionSynthesis | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      formation: { select: { id: true, nomLong: true } },
      satisfactionResponses: {
        where: { submittedAt: { not: null } },
        include: { answers: true },
        orderBy: { invitedAt: "asc" },
      },
      trainees: { select: { id: true } },
    },
  });
  if (!session) return null;

  // Dans le modèle anonyme : "invited" = nombre de stagiaires de la session
  // (on ne crée plus de SatisfactionResponse par avance). "submitted" =
  // nombre de réponses anonymes soumises.
  const submitted = session.satisfactionResponses;
  const invited = session.trainees.length;
  const totals = {
    invited,
    submitted: submitted.length,
    pending: Math.max(0, invited - submitted.length),
    responseRate: invited > 0 ? submitted.length / invited : 0,
  };

  // Résoudre les questions : on utilise la config actuelle (override
  // formation ou global), pas un snapshot — car en mode anonyme on n'a pas
  // de SatisfactionResponse pré-existante pour stocker le snapshot avant
  // soumission. Si des soumissions existantes ont un snapshot, on peut
  // l'utiliser comme historique, mais pour la cohérence on prend la config
  // courante.
  let questions: SatisfactionQuestion[];
  questions = await resolveQuestionsForFormation(session.formation.id);
  // Fallback : si la session a déjà des réponses, on préfère leur snapshot
  // (car les questions ont pu évoluer depuis la soumission).
  if (submitted.length > 0) {
    try {
      const latestSnapshot = JSON.parse(
        submitted[submitted.length - 1].questionsSnapshot
      ) as SatisfactionQuestion[];
      if (Array.isArray(latestSnapshot) && latestSnapshot.length > 0) {
        questions = latestSnapshot;
      }
    } catch {
      // garde la config courante
    }
  }

  // Calculer les stats par question — les section_header sont passés tels
  // quels (pas de stats à calculer) pour préserver la structure visuelle
  // dans la synthèse.
  const stats = questions.map((q) => {
    if (q.type === "section_header") {
      return { question: q };
    }
    const values: string[] = [];
    for (const r of submitted) {
      const a = r.answers.find((x) => x.questionName === q.name);
      if (a && a.value !== "" && a.value !== null && a.value !== undefined) values.push(a.value);
    }

    if (q.type === "likert_5") {
      const nums = values.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
      const distribution: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
      for (const n of nums) distribution[String(n)] = (distribution[String(n)] || 0) + 1;
      const average = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : undefined;
      return { question: q, average, distribution };
    }

    if (q.type === "scale_nps") {
      const nums = values.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n >= 0 && n <= 10);
      const distribution: Record<string, number> = {};
      for (let i = 0; i <= 10; i++) distribution[String(i)] = 0;
      for (const n of nums) distribution[String(n)] = (distribution[String(n)] || 0) + 1;
      const promoters = nums.filter((n) => n >= 9).length;
      const passives = nums.filter((n) => n >= 7 && n <= 8).length;
      const detractors = nums.filter((n) => n <= 6).length;
      const npsScore = nums.length > 0 ? Math.round(((promoters - detractors) / nums.length) * 100) : undefined;
      const average = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : undefined;
      return {
        question: q,
        average,
        distribution,
        npsScore,
        npsPromoters: promoters,
        npsPassives: passives,
        npsDetractors: detractors,
      };
    }

    if (q.type === "yes_no" || q.type === "single_choice") {
      const distribution: Record<string, number> = {};
      for (const v of values) distribution[v] = (distribution[v] || 0) + 1;
      return { question: q, distribution };
    }

    // text / textarea
    return { question: q, textResponses: values.filter((v) => v.trim() !== "") };
  });

  return {
    session: {
      id: session.id,
      code: session.code,
      dateDebut: session.dateDebut,
      dateFin: session.dateFin,
      lieu: session.lieu,
      horaires: session.horaires,
    },
    formation: { nomLong: session.formation.nomLong },
    totals,
    questions,
    stats,
    responses: submitted.map((r) => {
      const answers: Record<string, string> = {};
      for (const a of r.answers) answers[a.questionName] = a.value;
      return { submittedAt: r.submittedAt, answers };
    }),
  };
}

// (getSessionInvitationsForSelection a été supprimée : plus de page de
//  sélection avec magic-tokens. Le formulaire est désormais directement
//  accessible via /eval-chaud/session/[id] et soumis en anonyme.)
