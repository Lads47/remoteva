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
  | "likert_5"     // 1=Très insatisfait, 5=Très satisfait (radio buttons)
  | "scale_nps"    // 0–10 NPS
  | "text"         // 1 ligne
  | "textarea"     // multi-lignes
  | "yes_no"       // oui/non
  | "single_choice";

export interface SatisfactionQuestion {
  name: string;            // identifiant interne stable (snake_case)
  type: QuestionType;
  label: string;           // libellé visible
  required: boolean;
  options?: string[];      // pour single_choice
  leftLabel?: string;      // pour scale_nps / likert_5 (libellés des extrêmes)
  rightLabel?: string;
  placeholder?: string;
}

// === Questions standard Qualiopi par défaut ===

export const DEFAULT_QUESTIONS: SatisfactionQuestion[] = [
  {
    name: "satisfaction_globale",
    type: "likert_5",
    label: "Quel est votre niveau de satisfaction global vis-à-vis de la formation ?",
    required: true,
    leftLabel: "Très insatisfait",
    rightLabel: "Très satisfait",
  },
  {
    name: "qualite_animation",
    type: "likert_5",
    label: "Comment évaluez-vous la qualité de l'animation par le formateur ?",
    required: true,
    leftLabel: "Très insuffisante",
    rightLabel: "Excellente",
  },
  {
    name: "qualite_supports",
    type: "likert_5",
    label: "Qualité des supports pédagogiques et exercices ?",
    required: true,
    leftLabel: "Très insuffisante",
    rightLabel: "Excellente",
  },
  {
    name: "pertinence_contenu",
    type: "likert_5",
    label: "Le contenu de la formation correspondait-il à vos attentes et besoins ?",
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
  {
    name: "qualite_organisation",
    type: "likert_5",
    label: "Qualité de l'organisation matérielle (lieu, accueil, matériel) ?",
    required: true,
    leftLabel: "Très insuffisante",
    rightLabel: "Excellente",
  },
  {
    name: "recommandation_nps",
    type: "scale_nps",
    label: "Sur une échelle de 0 à 10, recommanderiez-vous cette formation à un collègue ?",
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
    label: "Quels axes d'amélioration suggérez-vous ?",
    required: false,
    placeholder: "Ce qui pourrait être amélioré, ce qui a manqué…",
  },
  {
    name: "remarques_libres",
    type: "textarea",
    label: "Autres remarques",
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

  // Validation : required fields
  for (const q of questions) {
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
