// Évaluation à froid (impact en poste, 3 mois après la fin de session).
//
// Différence principale avec l'éval à chaud (satisfaction.ts) :
//   - identification du stagiaire (magic-token personnel)
//   - relances automatiques J+7 et J+14 si non répondu
//   - déclenchement 100% automatique via cron quotidien
//
// Architecture :
//   - cron quotidien (/api/cron/send-cold-eval) :
//       * sessions dont dateFin date d'il y a >= COLD_EVAL_DELAY_DAYS jours
//         et sans invitation envoyée → crée 1 ColdEvalResponse par stagiaire
//         (avec magic-token) et envoie l'invitation initiale.
//       * ColdEvalResponse sans submittedAt, invitedAt >= 7 jours, reminder1At
//         null → envoie relance 1 et met à jour reminder1At.
//       * idem pour reminder2At à J+14.
//   - page publique /eval-froid/[token] : formulaire identifié.
//   - synthèse admin par session : stats + tableau Invité/Relancé/Répondu.

import { randomBytes } from "crypto";
import { getConfig, setConfig } from "./appConfig";
import prisma from "./db";
import type { SatisfactionQuestion } from "./satisfaction";

// Délai par défaut entre dateFin de session et envoi de l'invitation initiale.
// Modifiable via la variable d'env COLD_EVAL_DELAY_DAYS si besoin.
export const COLD_EVAL_DELAY_DAYS = Number(process.env.COLD_EVAL_DELAY_DAYS || 90);
export const COLD_EVAL_REMINDER_1_DAYS = 7;   // relance 1
export const COLD_EVAL_REMINDER_2_DAYS = 14;  // relance 2 (et dernière)

// === Questions par défaut spécifiques au froid ===
//
// Focus sur la mise en pratique des acquis dans le poste de travail —
// ce que demande Qualiopi indicateur 12.

export const COLD_EVAL_DEFAULT_QUESTIONS: SatisfactionQuestion[] = [
  // === Section 1 : Mise en pratique ===
  {
    name: "section_pratique",
    type: "section_header",
    label: "Mise en pratique des acquis",
    description: "Maintenant que vous avez eu le temps de mettre en œuvre la formation, comment cela se passe-t-il dans votre quotidien ?",
    required: false,
  },
  {
    name: "mise_en_pratique_freq",
    type: "single_choice",
    label: "À quelle fréquence avez-vous mis en pratique les acquis de la formation depuis ?",
    required: true,
    options: [
      "Très régulièrement (presque tous les jours)",
      "Régulièrement (quelques fois par semaine)",
      "Occasionnellement (quelques fois par mois)",
      "Rarement (1-2 fois depuis la formation)",
      "Pas encore eu l'occasion",
    ],
  },
  {
    name: "competences_acquises",
    type: "likert_5",
    label: "Estimez-vous avoir acquis les compétences visées par la formation ?",
    required: true,
    leftLabel: "Pas du tout",
    rightLabel: "Totalement",
  },
  {
    name: "transfert_poste",
    type: "likert_5",
    label: "Les acquis de la formation se sont-ils bien intégrés à votre poste de travail ?",
    required: true,
    leftLabel: "Pas du tout",
    rightLabel: "Parfaitement",
  },
  {
    name: "exemple_application",
    type: "textarea",
    label: "Pouvez-vous citer un exemple concret où vous avez appliqué ce que vous avez appris ?",
    required: false,
    placeholder: "Ex : « J'ai pu mettre en place une régie multicaméra sur un événement client… »",
  },

  // === Section 2 : Impact ===
  {
    name: "section_impact",
    type: "section_header",
    label: "Impact dans votre activité",
    description: "Les bénéfices concrets que vous avez pu observer.",
    required: false,
  },
  {
    name: "amelioration_efficacite",
    type: "likert_5",
    label: "La formation a-t-elle amélioré votre efficacité ou la qualité de votre travail ?",
    required: true,
    leftLabel: "Pas du tout",
    rightLabel: "Considérablement",
  },
  {
    name: "nouvelles_missions",
    type: "yes_no",
    label: "La formation vous a-t-elle permis d'aborder de nouvelles missions ou responsabilités ?",
    required: true,
  },
  {
    name: "benefices_observes",
    type: "textarea",
    label: "Quels bénéfices concrets avez-vous observés (gain de temps, qualité, autonomie…) ?",
    required: false,
    placeholder: "Les changements positifs que vous avez constatés…",
  },

  // === Section 3 : Obstacles ===
  {
    name: "section_obstacles",
    type: "section_header",
    label: "Difficultés et obstacles",
    description: "Pour mieux vous accompagner et faire évoluer la formation.",
    required: false,
  },
  {
    name: "obstacles_rencontres",
    type: "single_choice",
    label: "Avez-vous rencontré des obstacles pour mettre en pratique ce que vous avez appris ?",
    required: true,
    options: [
      "Non, aucun obstacle particulier",
      "Quelques difficultés ponctuelles",
      "Plusieurs obstacles importants",
      "Beaucoup, je n'ai pas pu mettre en pratique",
    ],
  },
  {
    name: "obstacles_details",
    type: "textarea",
    label: "Si oui, lesquels (matériel, temps, organisation, manque de pratique…) ?",
    required: false,
    placeholder: "Ce qui vous a freiné dans la mise en pratique…",
  },

  // === Section 4 : Recommandation ===
  {
    name: "section_recommandation",
    type: "section_header",
    label: "Recommandation",
    description: "Avec le recul, recommanderiez-vous cette formation ?",
    required: false,
  },
  {
    name: "recommandation_nps_froid",
    type: "scale_nps",
    label: "Avec le recul, recommanderiez-vous cette formation à un collègue ou un ami ?",
    description: "Net Promoter Score : 0 = je ne recommande pas du tout, 10 = je recommande vivement.",
    required: true,
    leftLabel: "Pas du tout",
    rightLabel: "Très probablement",
  },
  {
    name: "suggestions_amelioration_froid",
    type: "textarea",
    label: "Avec le recul, quelles améliorations suggéreriez-vous pour cette formation ?",
    required: false,
    placeholder: "Ce qui aurait pu mieux vous préparer à mettre en pratique…",
  },
  {
    name: "remarques_libres_froid",
    type: "textarea",
    label: "Autres remarques (optionnel)",
    required: false,
  },
];

const CONFIG_KEY_GLOBAL_QUESTIONS = "cold_eval.global_questions";

// === Resolve questions (global ou override formation) ===

export async function getGlobalColdEvalQuestions(): Promise<SatisfactionQuestion[]> {
  const raw = await getConfig(CONFIG_KEY_GLOBAL_QUESTIONS);
  if (!raw) return COLD_EVAL_DEFAULT_QUESTIONS;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as SatisfactionQuestion[];
  } catch {}
  return COLD_EVAL_DEFAULT_QUESTIONS;
}

export async function setGlobalColdEvalQuestions(questions: SatisfactionQuestion[]): Promise<void> {
  await setConfig(CONFIG_KEY_GLOBAL_QUESTIONS, JSON.stringify(questions));
}

export async function resolveColdEvalQuestionsForFormation(formationId: string): Promise<SatisfactionQuestion[]> {
  const f = await prisma.formation.findUnique({
    where: { id: formationId },
    select: { coldEvalConfigForm: true },
  });
  if (f?.coldEvalConfigForm && f.coldEvalConfigForm.trim() !== "" && f.coldEvalConfigForm.trim() !== "{}") {
    try {
      const parsed = JSON.parse(f.coldEvalConfigForm);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as SatisfactionQuestion[];
    } catch {}
  }
  return getGlobalColdEvalQuestions();
}

// === Magic token ===

function generateMagicToken(): string {
  return randomBytes(24).toString("base64url");
}

// === Lecture publique par token ===

export interface ColdEvalPublicData {
  session: { id: string; code: string; dateDebut: Date; dateFin: Date };
  formation: { nomLong: string };
  trainee: { id: string; prenom: string; nom: string };
  questions: SatisfactionQuestion[];
  alreadySubmitted: boolean;
}

export async function getColdEvalByToken(token: string): Promise<ColdEvalPublicData | null> {
  const resp = await prisma.coldEvalResponse.findUnique({
    where: { magicToken: token },
    include: {
      session: { select: { id: true, code: true, dateDebut: true, dateFin: true } },
      trainee: { select: { id: true, prenom: true, nom: true } },
    },
  });
  if (!resp) return null;
  // Le snapshot contient les questions au moment de l'invitation. On les
  // ressort tel quel pour préserver la cohérence des réponses.
  let questions: SatisfactionQuestion[];
  try {
    const parsed = JSON.parse(resp.questionsSnapshot);
    questions = Array.isArray(parsed) ? parsed as SatisfactionQuestion[] : COLD_EVAL_DEFAULT_QUESTIONS;
  } catch {
    questions = COLD_EVAL_DEFAULT_QUESTIONS;
  }
  const formation = await prisma.formation.findFirst({
    where: { sessions: { some: { id: resp.session.id } } },
    select: { nomLong: true },
  });
  return {
    session: resp.session,
    formation: { nomLong: formation?.nomLong || "" },
    trainee: resp.trainee,
    questions,
    alreadySubmitted: resp.submittedAt !== null,
  };
}

// === Soumission par token ===

export interface ColdEvalSubmitInput {
  token: string;
  answers: Record<string, string>;
}

export async function submitColdEvalByToken(
  input: ColdEvalSubmitInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resp = await prisma.coldEvalResponse.findUnique({
    where: { magicToken: input.token },
    select: { id: true, submittedAt: true, questionsSnapshot: true },
  });
  if (!resp) return { ok: false, error: "Lien invalide" };
  if (resp.submittedAt) return { ok: false, error: "Ce questionnaire a déjà été soumis" };

  // Valider required à partir du snapshot
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
    await tx.coldEvalResponse.update({
      where: { id: resp.id },
      data: { submittedAt: new Date() },
    });
    const data = Object.entries(input.answers).map(([questionName, value]) => ({
      responseId: resp.id,
      questionName,
      value: String(value),
    }));
    if (data.length > 0) {
      await tx.coldEvalAnswer.createMany({ data });
    }
  });
  return { ok: true };
}

// === Cron : envoi des invitations initiales + relances ===

export interface ColdEvalCronResult {
  sessionsProcessed: number;
  invitationsSent: number;
  reminder1Sent: number;
  reminder2Sent: number;
  errors: Array<{ context: string; error: string }>;
}

/**
 * Crée les ColdEvalResponse pour les stagiaires d'une session si elles
 * n'existent pas déjà. Si `onlyTraineeId` est fourni, ne traite QUE ce
 * stagiaire (sinon : tous les stagiaires de la session).
 *
 * Retourne la liste créée pour permettre l'envoi de mail derrière.
 */
export async function createColdEvalInvitationsForSession(
  sessionId: string,
  onlyTraineeId?: string | null
): Promise<{
  created: Array<{
    responseId: string;
    traineeId: string;
    prenom: string;
    nom: string;
    email: string;
    magicToken: string;
  }>;
  formation: { nomLong: string };
} | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      formation: { select: { id: true, nomLong: true } },
      trainees: { select: { id: true, prenom: true, nom: true, email: true } },
      coldEvalResponses: { select: { traineeId: true } },
    },
  });
  if (!session) return null;
  const alreadyInvitedTraineeIds = new Set(session.coldEvalResponses.map((r) => r.traineeId));

  const questions = await resolveColdEvalQuestionsForFormation(session.formation.id);
  const snapshot = JSON.stringify(questions);

  const targetTrainees = onlyTraineeId
    ? session.trainees.filter((t) => t.id === onlyTraineeId)
    : session.trainees;

  const created: Awaited<ReturnType<typeof createColdEvalInvitationsForSession>> extends infer T
    ? T extends { created: infer C } ? C : never : never = [];

  for (const t of targetTrainees) {
    if (alreadyInvitedTraineeIds.has(t.id)) continue;
    if (!t.email) continue;
    const magicToken = generateMagicToken();
    const resp = await prisma.coldEvalResponse.create({
      data: {
        sessionId: session.id,
        traineeId: t.id,
        magicToken,
        questionsSnapshot: snapshot,
      },
      select: { id: true },
    });
    created.push({
      responseId: resp.id,
      traineeId: t.id,
      prenom: t.prenom,
      nom: t.nom,
      email: t.email,
      magicToken,
    });
  }
  return { created, formation: { nomLong: session.formation.nomLong } };
}

/**
 * Récupère le magic-token d'une invitation existante (pour ré-envoyer le mail
 * initial à un stagiaire déjà invité par erreur sans mail effectif).
 */
export async function getExistingColdEvalInvitation(
  sessionId: string,
  traineeId: string
): Promise<{
  responseId: string;
  magicToken: string;
  prenom: string;
  email: string;
  formationNomLong: string;
  submitted: boolean;
} | null> {
  const resp = await prisma.coldEvalResponse.findFirst({
    where: { sessionId, traineeId },
    include: {
      trainee: { select: { prenom: true, email: true } },
      session: { include: { formation: { select: { nomLong: true } } } },
    },
  });
  if (!resp || !resp.trainee.email) return null;
  return {
    responseId: resp.id,
    magicToken: resp.magicToken,
    prenom: resp.trainee.prenom,
    email: resp.trainee.email,
    formationNomLong: resp.session.formation.nomLong,
    submitted: resp.submittedAt !== null,
  };
}

/**
 * Renvoie les sessions terminées il y a >= COLD_EVAL_DELAY_DAYS jours et
 * sans invitation à froid déjà envoyée (au moins un stagiaire sans
 * ColdEvalResponse). Utilisé par le cron pour déclencher les envois.
 */
export async function findSessionsDueForColdEval(now: Date = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - COLD_EVAL_DELAY_DAYS * 24 * 3600 * 1000);
  // On cherche les sessions dont dateFin <= cutoff et qui ont des stagiaires
  // sans ColdEvalResponse encore créée.
  const sessions = await prisma.session.findMany({
    where: { dateFin: { lte: cutoff } },
    select: {
      id: true,
      trainees: { select: { id: true } },
      coldEvalResponses: { select: { traineeId: true } },
    },
  });
  return sessions
    .filter((s) => {
      const invitedSet = new Set(s.coldEvalResponses.map((r) => r.traineeId));
      return s.trainees.some((t) => !invitedSet.has(t.id));
    })
    .map((s) => s.id);
}

/**
 * Renvoie les ColdEvalResponse qui doivent recevoir la relance 1 (J+7).
 * Critères : pas répondu, invitedAt il y a >= 7 jours, reminder1At null.
 */
export async function findResponsesDueForReminder1(now: Date = new Date()): Promise<Array<{
  id: string;
  magicToken: string;
  prenom: string;
  email: string;
  formationNomLong: string;
}>> {
  const cutoff = new Date(now.getTime() - COLD_EVAL_REMINDER_1_DAYS * 24 * 3600 * 1000);
  const list = await prisma.coldEvalResponse.findMany({
    where: {
      submittedAt: null,
      reminder1At: null,
      invitedAt: { lte: cutoff },
    },
    include: {
      trainee: { select: { prenom: true, email: true } },
      session: { include: { formation: { select: { nomLong: true } } } },
    },
  });
  return list
    .filter((r) => r.trainee.email)
    .map((r) => ({
      id: r.id,
      magicToken: r.magicToken,
      prenom: r.trainee.prenom,
      email: r.trainee.email,
      formationNomLong: r.session.formation.nomLong,
    }));
}

export async function findResponsesDueForReminder2(now: Date = new Date()): Promise<Array<{
  id: string;
  magicToken: string;
  prenom: string;
  email: string;
  formationNomLong: string;
}>> {
  const cutoff = new Date(now.getTime() - COLD_EVAL_REMINDER_2_DAYS * 24 * 3600 * 1000);
  const list = await prisma.coldEvalResponse.findMany({
    where: {
      submittedAt: null,
      reminder1At: { not: null },
      reminder2At: null,
      invitedAt: { lte: cutoff },
    },
    include: {
      trainee: { select: { prenom: true, email: true } },
      session: { include: { formation: { select: { nomLong: true } } } },
    },
  });
  return list
    .filter((r) => r.trainee.email)
    .map((r) => ({
      id: r.id,
      magicToken: r.magicToken,
      prenom: r.trainee.prenom,
      email: r.trainee.email,
      formationNomLong: r.session.formation.nomLong,
    }));
}

export async function markReminderSent(
  responseId: string,
  which: 1 | 2,
  when: Date = new Date()
): Promise<void> {
  await prisma.coldEvalResponse.update({
    where: { id: responseId },
    data: which === 1 ? { reminder1At: when } : { reminder2At: when },
  });
}

// === Synthèse par session ===

export interface ColdEvalSynthesis {
  session: { id: string; code: string; dateDebut: Date; dateFin: Date; lieu: string; horaires: string };
  formation: { nomLong: string };
  totals: { invited: number; submitted: number; pending: number; responseRate: number };
  questions: SatisfactionQuestion[];
  stats: Array<{
    question: SatisfactionQuestion;
    average?: number;
    distribution?: Record<string, number>;
    textResponses?: string[];
    npsScore?: number;
    npsPromoters?: number;
    npsPassives?: number;
    npsDetractors?: number;
  }>;
  // Par stagiaire : son statut d'invitation/réponse (utilisé pour le tableau admin)
  perTrainee: Array<{
    traineeId: string;
    prenom: string;
    nom: string;
    email: string;
    invitedAt: Date | null;
    reminder1At: Date | null;
    reminder2At: Date | null;
    submittedAt: Date | null;
  }>;
}

export async function buildColdEvalSynthesis(sessionId: string): Promise<ColdEvalSynthesis | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      formation: { select: { id: true, nomLong: true } },
      trainees: { select: { id: true, prenom: true, nom: true, email: true } },
      coldEvalResponses: {
        include: { answers: true, trainee: { select: { id: true, prenom: true, nom: true, email: true } } },
        orderBy: { invitedAt: "asc" },
      },
    },
  });
  if (!session) return null;

  const submitted = session.coldEvalResponses.filter((r) => r.submittedAt !== null);
  const invited = session.coldEvalResponses.length;
  const totals = {
    invited,
    submitted: submitted.length,
    pending: Math.max(0, invited - submitted.length),
    responseRate: invited > 0 ? submitted.length / invited : 0,
  };

  // Résoudre les questions (même logique que satisfaction.ts) : on prend
  // le snapshot d'une réponse récente si dispo, sinon la config courante.
  let questions: SatisfactionQuestion[];
  questions = await resolveColdEvalQuestionsForFormation(session.formation.id);
  if (submitted.length > 0) {
    try {
      const latestSnapshot = JSON.parse(
        submitted[submitted.length - 1].questionsSnapshot
      ) as SatisfactionQuestion[];
      if (Array.isArray(latestSnapshot) && latestSnapshot.length > 0) {
        questions = latestSnapshot;
      }
    } catch {}
  }

  const stats = questions.map((q) => {
    if (q.type === "section_header") {
      return { question: q };
    }
    const values: string[] = [];
    for (const r of submitted) {
      const a = r.answers.find((x) => x.questionName === q.name);
      if (a) values.push(a.value);
    }
    if (q.type === "likert_5") {
      const dist: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
      let sum = 0, n = 0;
      for (const v of values) {
        const num = Number(v);
        if (Number.isFinite(num) && num >= 1 && num <= 5) {
          dist[String(num)] = (dist[String(num)] || 0) + 1;
          sum += num; n++;
        }
      }
      return { question: q, distribution: dist, average: n > 0 ? sum / n : undefined };
    }
    if (q.type === "scale_nps") {
      const dist: Record<string, number> = {};
      for (let i = 0; i <= 10; i++) dist[String(i)] = 0;
      let sum = 0, n = 0, prom = 0, pass = 0, detr = 0;
      for (const v of values) {
        const num = Number(v);
        if (Number.isFinite(num) && num >= 0 && num <= 10) {
          dist[String(num)] = (dist[String(num)] || 0) + 1;
          sum += num; n++;
          if (num >= 9) prom++;
          else if (num >= 7) pass++;
          else detr++;
        }
      }
      const npsScore = n > 0 ? Math.round(((prom - detr) / n) * 100) : undefined;
      return { question: q, distribution: dist, average: n > 0 ? sum / n : undefined, npsScore, npsPromoters: prom, npsPassives: pass, npsDetractors: detr };
    }
    if (q.type === "yes_no" || q.type === "single_choice") {
      const dist: Record<string, number> = {};
      for (const v of values) {
        dist[v] = (dist[v] || 0) + 1;
      }
      return { question: q, distribution: dist };
    }
    // text / textarea
    const textResponses = values.filter((v) => v.trim() !== "");
    return { question: q, textResponses };
  });

  // Tableau par stagiaire : un stagiaire peut ne pas avoir de ColdEvalResponse
  // (si invité après création de la session etc.) ou ne pas avoir répondu.
  const responsesByTrainee = new Map(session.coldEvalResponses.map((r) => [r.traineeId, r]));
  const perTrainee = session.trainees
    .map((t) => {
      const r = responsesByTrainee.get(t.id);
      return {
        traineeId: t.id,
        prenom: t.prenom,
        nom: t.nom,
        email: t.email,
        invitedAt: r?.invitedAt ?? null,
        reminder1At: r?.reminder1At ?? null,
        reminder2At: r?.reminder2At ?? null,
        submittedAt: r?.submittedAt ?? null,
      };
    })
    .sort((a, b) => a.nom.localeCompare(b.nom));

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
    perTrainee,
  };
}
