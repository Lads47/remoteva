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

// === Création des invitations pour une session ===

export interface SurveyInvitation {
  responseId: string;
  traineeId: string;
  traineeName: string;
  email: string;
  magicToken: string;
  surveyUrl: string;
  alreadyExisted: boolean;
}

/**
 * Crée (ou retrouve) une SatisfactionResponse par stagiaire de la session.
 * Idempotent : si une réponse existe déjà pour un (sessionId, traineeId), on
 * la réutilise (et son magicToken) au lieu d'en créer une nouvelle.
 *
 * Retourne la liste des invitations avec l'URL publique du formulaire.
 */
export async function createOrReuseInvitations(
  sessionId: string,
  publicBaseUrl: string
): Promise<SurveyInvitation[]> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      formation: { select: { id: true } },
      trainees: { select: { id: true, prenom: true, nom: true, email: true } },
    },
  });
  if (!session) throw new Error("Session introuvable");

  const questions = await resolveQuestionsForFormation(session.formation.id);
  const snapshot = JSON.stringify(questions);

  const existing = await prisma.satisfactionResponse.findMany({
    where: { sessionId },
    select: { id: true, traineeId: true, magicToken: true },
  });
  const existingByTrainee = new Map<string, { id: string; magicToken: string }>();
  for (const e of existing) {
    existingByTrainee.set(e.traineeId, { id: e.id, magicToken: e.magicToken });
  }

  const invitations: SurveyInvitation[] = [];
  for (const t of session.trainees) {
    const found = existingByTrainee.get(t.id);
    if (found) {
      invitations.push({
        responseId: found.id,
        traineeId: t.id,
        traineeName: `${t.prenom} ${t.nom}`,
        email: t.email,
        magicToken: found.magicToken,
        surveyUrl: `${publicBaseUrl}/eval-chaud/${found.magicToken}`,
        alreadyExisted: true,
      });
      continue;
    }
    const magicToken = generateMagicToken();
    const created = await prisma.satisfactionResponse.create({
      data: {
        sessionId,
        traineeId: t.id,
        magicToken,
        questionsSnapshot: snapshot,
      },
      select: { id: true },
    });
    invitations.push({
      responseId: created.id,
      traineeId: t.id,
      traineeName: `${t.prenom} ${t.nom}`,
      email: t.email,
      magicToken,
      surveyUrl: `${publicBaseUrl}/eval-chaud/${magicToken}`,
      alreadyExisted: false,
    });
  }
  return invitations;
}

// === Lecture publique par token (page de réponse) ===

export interface SurveyPublicData {
  responseId: string;
  trainee: { prenom: string; nom: string };
  session: { code: string; dateDebut: Date; dateFin: Date };
  formation: { nomLong: string };
  questions: SatisfactionQuestion[];
  submittedAt: Date | null;
  // Pour pré-remplir si l'utilisateur reprend avant submit (optionnel — pas
  // de sauvegarde brouillon dans cette V1)
}

export async function getSurveyByToken(token: string): Promise<SurveyPublicData | null> {
  const r = await prisma.satisfactionResponse.findUnique({
    where: { magicToken: token },
    include: {
      trainee: { select: { prenom: true, nom: true } },
      session: {
        include: { formation: { select: { nomLong: true } } },
      },
    },
  });
  if (!r) return null;
  let questions: SatisfactionQuestion[];
  try {
    questions = JSON.parse(r.questionsSnapshot) as SatisfactionQuestion[];
  } catch {
    questions = DEFAULT_QUESTIONS;
  }
  return {
    responseId: r.id,
    trainee: { prenom: r.trainee.prenom, nom: r.trainee.nom },
    session: { code: r.session.code, dateDebut: r.session.dateDebut, dateFin: r.session.dateFin },
    formation: { nomLong: r.session.formation.nomLong },
    questions,
    submittedAt: r.submittedAt,
  };
}

// === Soumission ===

export interface SubmitInput {
  token: string;
  answers: Record<string, string>;     // questionName -> value (string)
}

export async function submitSurvey(input: SubmitInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const survey = await prisma.satisfactionResponse.findUnique({
    where: { magicToken: input.token },
  });
  if (!survey) return { ok: false, error: "Lien invalide" };
  if (survey.submittedAt) return { ok: false, error: "Vous avez déjà répondu à cette enquête." };

  let questions: SatisfactionQuestion[];
  try {
    questions = JSON.parse(survey.questionsSnapshot) as SatisfactionQuestion[];
  } catch {
    return { ok: false, error: "Snapshot questions invalide" };
  }

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

  await prisma.$transaction(async (tx) => {
    // Stocke les answers (remplace si existantes, par sécurité)
    await tx.satisfactionAnswer.deleteMany({ where: { responseId: survey.id } });
    const data = Object.entries(input.answers).map(([questionName, value]) => ({
      responseId: survey.id,
      questionName,
      value: String(value),
    }));
    if (data.length > 0) {
      await tx.satisfactionAnswer.createMany({ data });
    }
    await tx.satisfactionResponse.update({
      where: { id: survey.id },
      data: { submittedAt: new Date() },
    });
  });

  return { ok: true };
}

// === Page de sélection pour QR code ===

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
      formation: { select: { nomLong: true } },
      satisfactionResponses: {
        include: { answers: true },
        orderBy: { invitedAt: "asc" },
      },
    },
  });
  if (!session) return null;

  const responses = session.satisfactionResponses;
  const submitted = responses.filter((r) => r.submittedAt !== null);
  const totals = {
    invited: responses.length,
    submitted: submitted.length,
    pending: responses.length - submitted.length,
    responseRate: responses.length > 0 ? submitted.length / responses.length : 0,
  };

  // Résoudre les questions : prendre le snapshot le plus récent (ou défaut)
  let questions: SatisfactionQuestion[];
  if (responses.length > 0) {
    try {
      questions = JSON.parse(responses[responses.length - 1].questionsSnapshot) as SatisfactionQuestion[];
    } catch {
      questions = DEFAULT_QUESTIONS;
    }
  } else {
    questions = DEFAULT_QUESTIONS;
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

export async function getSessionInvitationsForSelection(sessionId: string): Promise<{
  session: { code: string; dateDebut: Date; dateFin: Date };
  formation: { nomLong: string };
  invitations: Array<{ prenom: string; nom: string; magicToken: string; submittedAt: Date | null }>;
} | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      formation: { select: { nomLong: true } },
      satisfactionResponses: {
        include: { trainee: { select: { prenom: true, nom: true } } },
        orderBy: { trainee: { nom: "asc" } },
      },
    },
  });
  if (!session) return null;
  return {
    session: { code: session.code, dateDebut: session.dateDebut, dateFin: session.dateFin },
    formation: { nomLong: session.formation.nomLong },
    invitations: session.satisfactionResponses.map((r) => ({
      prenom: r.trainee.prenom,
      nom: r.trainee.nom,
      magicToken: r.magicToken,
      submittedAt: r.submittedAt,
    })),
  };
}
