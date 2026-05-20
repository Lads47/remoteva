// Évaluation formateur — bilan que le formateur rempli après avoir animé
// une session, recueille son avis sur le déroulement, la gestion admin, etc.
// Architecture identique à cold-eval (magic-token, J+7/J+14 relances) mais
// déclenchée à J+1 après dateFin.

import { randomBytes } from "crypto";
import { getConfig, setConfig } from "./appConfig";
import prisma from "./db";
import type { SatisfactionQuestion } from "./satisfaction";

export const TRAINER_EVAL_DELAY_DAYS = 1;        // envoi initial J+1
export const TRAINER_EVAL_REMINDER_1_DAYS = 7;
export const TRAINER_EVAL_REMINDER_2_DAYS = 14;

// === Questions par défaut (alignées sur le template Forms LADS existant) ===

export const TRAINER_EVAL_DEFAULT_QUESTIONS: SatisfactionQuestion[] = [
  // === Section 1 : Identification (pré-remplie depuis le magic-token) ===
  {
    name: "section_identification",
    type: "section_header",
    label: "Identification",
    description: "Ces informations sont pré-remplies depuis votre lien personnel. Vérifiez puis passez à la suite.",
    required: false,
  },
  {
    name: "nom_formateur",
    type: "text",
    label: "Nom du formateur",
    required: true,
    placeholder: "Pré-rempli",
  },
  {
    name: "intitule_formation",
    type: "text",
    label: "Intitulé de la formation",
    required: true,
    placeholder: "Pré-rempli",
  },
  {
    name: "date_formation",
    type: "text",
    label: "Date(s) de la formation",
    required: true,
    placeholder: "Pré-rempli",
  },

  // === Section 2 : Satisfaction (Likert 1-4) ===
  {
    name: "section_satisfaction",
    type: "section_header",
    label: "Votre satisfaction",
    description: "Cochez une valeur en fonction de votre appréciation.",
    required: false,
  },
  {
    name: "attentes_beneficiaires",
    type: "likert_4",
    label: "La formation a-t-elle répondu aux attentes de votre/vos bénéficiaire(s) ?",
    required: true,
    leftLabel: "Non, pas du tout",
    rightLabel: "Oui, tout à fait",
  },
  {
    name: "gestion_admin",
    type: "likert_4",
    label: "Gestion administrative ?",
    required: true,
    leftLabel: "Non, pas du tout",
    rightLabel: "Oui, tout à fait",
  },
  {
    name: "delai_traitement",
    type: "likert_4",
    label: "Délai de traitement ?",
    required: true,
    leftLabel: "Non, pas du tout",
    rightLabel: "Oui, tout à fait",
  },
  {
    name: "elements_appreciies",
    type: "textarea",
    label: "Quels éléments avez-vous le plus appréciés ?",
    required: true,
    placeholder: "Ce qui s'est particulièrement bien passé…",
  },
  {
    name: "elements_moins_appreciies",
    type: "textarea",
    label: "Quels éléments avez-vous le moins appréciés ?",
    required: true,
    placeholder: "Ce qui pourrait être amélioré côté organisation…",
  },
  {
    name: "remarques",
    type: "textarea",
    label: "Remarques",
    required: true,
    placeholder: "Toute autre observation utile à l'équipe pédagogique…",
  },
];

const CONFIG_KEY_GLOBAL_QUESTIONS = "trainer_eval.global_questions";

// === Resolve questions (global ou override formation) ===

export async function getGlobalTrainerEvalQuestions(): Promise<SatisfactionQuestion[]> {
  const raw = await getConfig(CONFIG_KEY_GLOBAL_QUESTIONS);
  if (!raw) return TRAINER_EVAL_DEFAULT_QUESTIONS;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as SatisfactionQuestion[];
  } catch {}
  return TRAINER_EVAL_DEFAULT_QUESTIONS;
}

export async function setGlobalTrainerEvalQuestions(questions: SatisfactionQuestion[]): Promise<void> {
  await setConfig(CONFIG_KEY_GLOBAL_QUESTIONS, JSON.stringify(questions));
}

export async function resolveTrainerEvalQuestionsForFormation(formationId: string): Promise<SatisfactionQuestion[]> {
  const f = await prisma.formation.findUnique({
    where: { id: formationId },
    select: { trainerEvalConfigForm: true },
  });
  if (f?.trainerEvalConfigForm && f.trainerEvalConfigForm.trim() !== "" && f.trainerEvalConfigForm.trim() !== "{}") {
    try {
      const parsed = JSON.parse(f.trainerEvalConfigForm);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as SatisfactionQuestion[];
    } catch {}
  }
  return getGlobalTrainerEvalQuestions();
}

function generateMagicToken(): string {
  return randomBytes(24).toString("base64url");
}

// === Lecture publique par token ===

export interface TrainerEvalPublicData {
  session: { id: string; code: string; dateDebut: Date; dateFin: Date };
  formation: { nomLong: string };
  trainer: { id: string; prenom: string; nom: string };
  questions: SatisfactionQuestion[];
  // Pré-remplissage automatique de la section identification (le formateur
  // n'a qu'à re-confirmer + remplir le reste du questionnaire)
  prefill: {
    nom_formateur: string;
    intitule_formation: string;
    date_formation: string;
  };
  alreadySubmitted: boolean;
}

function fmtSessionDatesFr(start: Date, end: Date): string {
  const s = new Date(start);
  const e = new Date(end);
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "long", year: "numeric" };
  const sameDay = s.toDateString() === e.toDateString();
  if (sameDay) return s.toLocaleDateString("fr-FR", opts);
  return `${s.toLocaleDateString("fr-FR", opts)} → ${e.toLocaleDateString("fr-FR", opts)}`;
}

export async function getTrainerEvalByToken(token: string): Promise<TrainerEvalPublicData | null> {
  const resp = await prisma.trainerEvalResponse.findUnique({
    where: { magicToken: token },
    include: {
      session: {
        select: {
          id: true,
          code: true,
          dateDebut: true,
          dateFin: true,
          formation: { select: { nomLong: true } },
        },
      },
      trainer: { select: { id: true, prenom: true, nom: true } },
    },
  });
  if (!resp) return null;

  let questions: SatisfactionQuestion[];
  try {
    const parsed = JSON.parse(resp.questionsSnapshot);
    questions = Array.isArray(parsed) ? (parsed as SatisfactionQuestion[]) : TRAINER_EVAL_DEFAULT_QUESTIONS;
  } catch {
    questions = TRAINER_EVAL_DEFAULT_QUESTIONS;
  }

  return {
    session: {
      id: resp.session.id,
      code: resp.session.code,
      dateDebut: resp.session.dateDebut,
      dateFin: resp.session.dateFin,
    },
    formation: { nomLong: resp.session.formation.nomLong },
    trainer: resp.trainer,
    questions,
    prefill: {
      nom_formateur: `${resp.trainer.prenom} ${resp.trainer.nom}`,
      intitule_formation: resp.session.formation.nomLong,
      date_formation: fmtSessionDatesFr(resp.session.dateDebut, resp.session.dateFin),
    },
    alreadySubmitted: resp.submittedAt !== null,
  };
}

// === Soumission par token ===

export interface TrainerEvalSubmitInput {
  token: string;
  answers: Record<string, string>;
}

export async function submitTrainerEvalByToken(
  input: TrainerEvalSubmitInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resp = await prisma.trainerEvalResponse.findUnique({
    where: { magicToken: input.token },
    select: { id: true, submittedAt: true, questionsSnapshot: true },
  });
  if (!resp) return { ok: false, error: "Lien invalide" };
  if (resp.submittedAt) return { ok: false, error: "Ce formulaire a déjà été soumis" };

  let questions: SatisfactionQuestion[] = [];
  try {
    questions = JSON.parse(resp.questionsSnapshot) as SatisfactionQuestion[];
  } catch {}
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
    await tx.trainerEvalResponse.update({
      where: { id: resp.id },
      data: { submittedAt: new Date() },
    });
    const data = Object.entries(input.answers).map(([questionName, value]) => ({
      responseId: resp.id,
      questionName,
      value: String(value),
    }));
    if (data.length > 0) {
      await tx.trainerEvalAnswer.createMany({ data });
    }
  });
  return { ok: true };
}

// === Création d'invitation (utilisée par le cron + bouton admin) ===

/**
 * Crée la TrainerEvalResponse pour la session si elle n'existe pas déjà.
 * Une session a UN formateur (session.trainerId) → 1 invitation par session.
 * Si la session n'a pas de formateur assigné, retourne null.
 */
export async function createTrainerEvalInvitationForSession(sessionId: string): Promise<{
  created: {
    responseId: string;
    trainerId: string;
    prenom: string;
    nom: string;
    email: string;
    magicToken: string;
  } | null;
  formation: { nomLong: string };
} | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      formation: { select: { id: true, nomLong: true } },
      trainer: { select: { id: true, prenom: true, nom: true, email: true } },
      trainerEvalResponses: { select: { trainerId: true } },
    },
  });
  if (!session) return null;
  if (!session.trainer || !session.trainer.email) {
    return { created: null, formation: { nomLong: session.formation.nomLong } };
  }

  const alreadyInvited = session.trainerEvalResponses.some((r) => r.trainerId === session.trainer!.id);
  if (alreadyInvited) {
    return { created: null, formation: { nomLong: session.formation.nomLong } };
  }

  const questions = await resolveTrainerEvalQuestionsForFormation(session.formation.id);
  const snapshot = JSON.stringify(questions);
  const magicToken = generateMagicToken();
  const resp = await prisma.trainerEvalResponse.create({
    data: {
      sessionId: session.id,
      trainerId: session.trainer.id,
      magicToken,
      questionsSnapshot: snapshot,
    },
    select: { id: true },
  });

  return {
    created: {
      responseId: resp.id,
      trainerId: session.trainer.id,
      prenom: session.trainer.prenom,
      nom: session.trainer.nom,
      email: session.trainer.email,
      magicToken,
    },
    formation: { nomLong: session.formation.nomLong },
  };
}

export async function getExistingTrainerEvalInvitation(
  sessionId: string
): Promise<{
  responseId: string;
  magicToken: string;
  trainerId: string;
  prenom: string;
  email: string;
  formationNomLong: string;
  submitted: boolean;
} | null> {
  const resp = await prisma.trainerEvalResponse.findFirst({
    where: { sessionId },
    include: {
      trainer: { select: { id: true, prenom: true, email: true } },
      session: { include: { formation: { select: { nomLong: true } } } },
    },
  });
  if (!resp || !resp.trainer.email) return null;
  return {
    responseId: resp.id,
    magicToken: resp.magicToken,
    trainerId: resp.trainer.id,
    prenom: resp.trainer.prenom,
    email: resp.trainer.email,
    formationNomLong: resp.session.formation.nomLong,
    submitted: resp.submittedAt !== null,
  };
}

// === Cron : sessions éligibles et relances ===

export async function findSessionsDueForTrainerEval(now: Date = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - TRAINER_EVAL_DELAY_DAYS * 24 * 3600 * 1000);
  const sessions = await prisma.session.findMany({
    where: {
      dateFin: { lte: cutoff },
      trainerId: { not: null },
    },
    select: {
      id: true,
      trainerId: true,
      trainerEvalResponses: { select: { trainerId: true } },
    },
  });
  return sessions
    .filter((s) => s.trainerId && !s.trainerEvalResponses.some((r) => r.trainerId === s.trainerId))
    .map((s) => s.id);
}

export async function findTrainerResponsesDueForReminder1(now: Date = new Date()): Promise<Array<{
  id: string;
  magicToken: string;
  prenom: string;
  email: string;
  formationNomLong: string;
}>> {
  const cutoff = new Date(now.getTime() - TRAINER_EVAL_REMINDER_1_DAYS * 24 * 3600 * 1000);
  const list = await prisma.trainerEvalResponse.findMany({
    where: {
      submittedAt: null,
      reminder1At: null,
      invitedAt: { lte: cutoff },
    },
    include: {
      trainer: { select: { prenom: true, email: true } },
      session: { include: { formation: { select: { nomLong: true } } } },
    },
  });
  return list
    .filter((r) => r.trainer.email)
    .map((r) => ({
      id: r.id,
      magicToken: r.magicToken,
      prenom: r.trainer.prenom,
      email: r.trainer.email,
      formationNomLong: r.session.formation.nomLong,
    }));
}

export async function findTrainerResponsesDueForReminder2(now: Date = new Date()): Promise<Array<{
  id: string;
  magicToken: string;
  prenom: string;
  email: string;
  formationNomLong: string;
}>> {
  const cutoff = new Date(now.getTime() - TRAINER_EVAL_REMINDER_2_DAYS * 24 * 3600 * 1000);
  const list = await prisma.trainerEvalResponse.findMany({
    where: {
      submittedAt: null,
      reminder1At: { not: null },
      reminder2At: null,
      invitedAt: { lte: cutoff },
    },
    include: {
      trainer: { select: { prenom: true, email: true } },
      session: { include: { formation: { select: { nomLong: true } } } },
    },
  });
  return list
    .filter((r) => r.trainer.email)
    .map((r) => ({
      id: r.id,
      magicToken: r.magicToken,
      prenom: r.trainer.prenom,
      email: r.trainer.email,
      formationNomLong: r.session.formation.nomLong,
    }));
}

export async function markTrainerReminderSent(
  responseId: string,
  which: 1 | 2,
  when: Date = new Date()
): Promise<void> {
  await prisma.trainerEvalResponse.update({
    where: { id: responseId },
    data: which === 1 ? { reminder1At: when } : { reminder2At: when },
  });
}

// === Synthèse (admin) ===

export interface TrainerEvalSynthesis {
  session: { id: string; code: string; dateDebut: Date; dateFin: Date; lieu: string; horaires: string };
  formation: { nomLong: string };
  trainer: {
    id: string;
    prenom: string;
    nom: string;
    email: string;
    invitedAt: Date | null;
    reminder1At: Date | null;
    reminder2At: Date | null;
    submittedAt: Date | null;
  } | null;
  questions: SatisfactionQuestion[];
  // Pour chaque question, la réponse du formateur (1 seul formateur par session)
  answers: Record<string, string>;
}

export async function buildTrainerEvalSynthesis(sessionId: string): Promise<TrainerEvalSynthesis | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      formation: { select: { id: true, nomLong: true } },
      trainer: { select: { id: true, prenom: true, nom: true, email: true } },
      trainerEvalResponses: {
        include: { answers: true, trainer: { select: { prenom: true, nom: true, email: true } } },
      },
    },
  });
  if (!session) return null;

  const resp = session.trainerEvalResponses[0]; // une seule attendue
  let questions: SatisfactionQuestion[] = await resolveTrainerEvalQuestionsForFormation(session.formation.id);
  if (resp) {
    try {
      const parsed = JSON.parse(resp.questionsSnapshot);
      if (Array.isArray(parsed) && parsed.length > 0) questions = parsed as SatisfactionQuestion[];
    } catch {}
  }

  const answers: Record<string, string> = {};
  if (resp) {
    for (const a of resp.answers) {
      answers[a.questionName] = a.value;
    }
  }

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
    trainer: session.trainer
      ? {
          id: session.trainer.id,
          prenom: session.trainer.prenom,
          nom: session.trainer.nom,
          email: session.trainer.email,
          invitedAt: resp?.invitedAt ?? null,
          reminder1At: resp?.reminder1At ?? null,
          reminder2At: resp?.reminder2At ?? null,
          submittedAt: resp?.submittedAt ?? null,
        }
      : null,
    questions,
    answers,
  };
}
