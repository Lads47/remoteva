// Satisfaction commanditaire / entreprise (Qualiopi indicateur 2).
//
// Recueil des appréciations de l'entreprise qui a inscrit ses salariés.
// Destinataire = le référent entreprise (email saisi à l'inscription).
// 1 enquête par entreprise (référent) et par session. Envoyée EN MÊME TEMPS
// que l'éval à froid stagiaire (même délai COLD_EVAL_DELAY_DAYS après la fin
// de session, via le même cron), avec relances J+7 / J+14 si pas répondu.
//
// Décalque de cold-eval.ts, mais le destinataire est un contact entreprise
// (email dénormalisé sur la réponse), pas un Trainee.

import { randomBytes } from "crypto";
import { getConfig, setConfig } from "./appConfig";
import prisma from "./db";
import type { SatisfactionQuestion } from "./satisfaction";
import { COLD_EVAL_DELAY_DAYS, COLD_EVAL_REMINDER_1_DAYS, COLD_EVAL_REMINDER_2_DAYS } from "./cold-eval";

// Mêmes cadences que l'éval à froid (envoi synchronisé).
export const SPONSOR_EVAL_DELAY_DAYS = COLD_EVAL_DELAY_DAYS;
export const SPONSOR_EVAL_REMINDER_1_DAYS = COLD_EVAL_REMINDER_1_DAYS;
export const SPONSOR_EVAL_REMINDER_2_DAYS = COLD_EVAL_REMINDER_2_DAYS;

// === Questions par défaut (satisfaction entreprise / commanditaire) ===

export const SPONSOR_EVAL_DEFAULT_QUESTIONS: SatisfactionQuestion[] = [
  {
    name: "section_relation",
    type: "section_header",
    label: "Relation & organisation",
    description: "Votre expérience en tant qu'entreprise commanditaire de la formation.",
    required: false,
  },
  {
    name: "communication_amont",
    type: "likert_5",
    label: "La communication en amont (inscription, informations pratiques, convention) a-t-elle été claire et efficace ?",
    required: true,
    leftLabel: "Pas du tout",
    rightLabel: "Tout à fait",
  },
  {
    name: "organisation_logistique",
    type: "likert_5",
    label: "L'organisation de la formation (dates, lieu, logistique) a-t-elle répondu à vos attentes ?",
    required: true,
    leftLabel: "Pas du tout",
    rightLabel: "Totalement",
  },
  {
    name: "section_impact",
    type: "section_header",
    label: "Adéquation & impact",
    description: "L'apport de la formation pour votre entreprise et vos salariés.",
    required: false,
  },
  {
    name: "adequation_besoins",
    type: "likert_5",
    label: "Le contenu de la formation était-il adapté aux besoins de votre entreprise ?",
    required: true,
    leftLabel: "Pas du tout",
    rightLabel: "Parfaitement",
  },
  {
    name: "montee_competence",
    type: "likert_5",
    label: "Avez-vous constaté une montée en compétence des salariés formés ?",
    required: true,
    leftLabel: "Pas du tout",
    rightLabel: "Nettement",
  },
  {
    name: "impact_concret",
    type: "textarea",
    label: "Quels bénéfices concrets avez-vous observés pour votre entreprise (qualité, autonomie, nouvelles missions…) ?",
    required: false,
    placeholder: "Les effets constatés depuis la formation…",
  },
  {
    name: "section_recommandation",
    type: "section_header",
    label: "Recommandation",
    description: "Votre appréciation globale.",
    required: false,
  },
  {
    name: "recommandation_nps_entreprise",
    type: "scale_nps",
    label: "Recommanderiez-vous Les Ateliers du Stream à une autre entreprise ?",
    description: "0 = pas du tout, 10 = très probablement.",
    required: true,
    leftLabel: "Pas du tout",
    rightLabel: "Très probablement",
  },
  {
    name: "suggestions_entreprise",
    type: "textarea",
    label: "Suggestions d'amélioration ou remarques (optionnel)",
    required: false,
  },
];

const CONFIG_KEY_GLOBAL_QUESTIONS = "sponsor_eval.global_questions";

export async function getGlobalSponsorEvalQuestions(): Promise<SatisfactionQuestion[]> {
  const raw = await getConfig(CONFIG_KEY_GLOBAL_QUESTIONS);
  if (!raw) return SPONSOR_EVAL_DEFAULT_QUESTIONS;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as SatisfactionQuestion[];
  } catch {}
  return SPONSOR_EVAL_DEFAULT_QUESTIONS;
}

export async function setGlobalSponsorEvalQuestions(questions: SatisfactionQuestion[]): Promise<void> {
  await setConfig(CONFIG_KEY_GLOBAL_QUESTIONS, JSON.stringify(questions));
}

// === Magic token ===

function generateMagicToken(): string {
  return randomBytes(24).toString("base64url");
}

// === Regroupement des référents entreprise d'une session ===

interface SessionSponsorContact {
  email: string;        // normalisé (lowercase trim)
  companyName: string;
  contactName: string;
}

/**
 * Retourne la liste dédupliquée des référents entreprise d'une session
 * (inscriptions type "entreprise" avec un referentEmail renseigné).
 */
async function getSessionSponsorContacts(sessionId: string): Promise<SessionSponsorContact[]> {
  const trainees = await prisma.trainee.findMany({
    where: { sessionId, inscriptionType: "entreprise", isTest: false },
    select: { referentEmail: true, raisonSociale: true, contactAdmin: true },
  });
  const byEmail = new Map<string, SessionSponsorContact>();
  for (const t of trainees) {
    const email = (t.referentEmail || "").trim().toLowerCase();
    if (!email) continue;
    if (!byEmail.has(email)) {
      byEmail.set(email, { email, companyName: t.raisonSociale || "", contactName: t.contactAdmin || "" });
    }
  }
  return Array.from(byEmail.values());
}

// === Lecture publique par token ===

export interface SponsorEvalPublicData {
  session: { id: string; code: string; dateDebut: Date; dateFin: Date };
  formation: { nomLong: string };
  contact: { companyName: string; contactName: string };
  questions: SatisfactionQuestion[];
  alreadySubmitted: boolean;
}

export async function getSponsorEvalByToken(token: string): Promise<SponsorEvalPublicData | null> {
  const resp = await prisma.sponsorEvalResponse.findUnique({
    where: { magicToken: token },
    include: {
      session: {
        select: { id: true, code: true, dateDebut: true, dateFin: true, formation: { select: { nomLong: true } } },
      },
    },
  });
  if (!resp) return null;
  let questions: SatisfactionQuestion[];
  try {
    const parsed = JSON.parse(resp.questionsSnapshot);
    questions = Array.isArray(parsed) ? (parsed as SatisfactionQuestion[]) : SPONSOR_EVAL_DEFAULT_QUESTIONS;
  } catch {
    questions = SPONSOR_EVAL_DEFAULT_QUESTIONS;
  }
  return {
    session: {
      id: resp.session.id,
      code: resp.session.code,
      dateDebut: resp.session.dateDebut,
      dateFin: resp.session.dateFin,
    },
    formation: { nomLong: resp.session.formation.nomLong },
    contact: { companyName: resp.companyName, contactName: resp.contactName },
    questions,
    alreadySubmitted: resp.submittedAt !== null,
  };
}

// === Soumission par token ===

export async function submitSponsorEvalByToken(input: {
  token: string;
  answers: Record<string, string>;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const resp = await prisma.sponsorEvalResponse.findUnique({
    where: { magicToken: input.token },
    select: { id: true, submittedAt: true, questionsSnapshot: true },
  });
  if (!resp) return { ok: false, error: "Lien invalide" };
  if (resp.submittedAt) return { ok: false, error: "Ce questionnaire a déjà été soumis" };

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
    await tx.sponsorEvalResponse.update({ where: { id: resp.id }, data: { submittedAt: new Date() } });
    const data = Object.entries(input.answers).map(([questionName, value]) => ({
      responseId: resp.id,
      questionName,
      value: String(value),
    }));
    if (data.length > 0) await tx.sponsorEvalAnswer.createMany({ data });
  });
  return { ok: true };
}

// === Cron : invitations initiales + relances ===

/**
 * Crée les invitations manquantes (1 par référent entreprise) pour une session.
 * Retourne la liste créée pour l'envoi des mails.
 */
export async function createSponsorEvalInvitationsForSession(sessionId: string): Promise<{
  created: Array<{ responseId: string; email: string; companyName: string; contactName: string; magicToken: string }>;
  formation: { nomLong: string };
} | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, formation: { select: { id: true, nomLong: true } }, sponsorEvalResponses: { select: { contactEmail: true } } },
  });
  if (!session) return null;

  const alreadyInvited = new Set(session.sponsorEvalResponses.map((r) => r.contactEmail.toLowerCase()));
  const contacts = await getSessionSponsorContacts(sessionId);

  const questions = await getGlobalSponsorEvalQuestions();
  const snapshot = JSON.stringify(questions);

  const created: Array<{ responseId: string; email: string; companyName: string; contactName: string; magicToken: string }> = [];
  for (const c of contacts) {
    if (alreadyInvited.has(c.email)) continue;
    const magicToken = generateMagicToken();
    const resp = await prisma.sponsorEvalResponse.create({
      data: {
        sessionId: session.id,
        companyName: c.companyName,
        contactEmail: c.email,
        contactName: c.contactName,
        magicToken,
        questionsSnapshot: snapshot,
      },
      select: { id: true },
    });
    created.push({ responseId: resp.id, email: c.email, companyName: c.companyName, contactName: c.contactName, magicToken });
  }
  return { created, formation: { nomLong: session.formation.nomLong } };
}

/**
 * Sessions terminées il y a >= SPONSOR_EVAL_DELAY_DAYS jours ayant au moins un
 * référent entreprise pas encore invité. (Même fenêtre que l'éval à froid.)
 */
export async function findSessionsDueForSponsorEval(now: Date = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - SPONSOR_EVAL_DELAY_DAYS * 24 * 3600 * 1000);
  const sessions = await prisma.session.findMany({
    where: {
      dateFin: { lte: cutoff },
      trainees: { some: { inscriptionType: "entreprise", isTest: false, referentEmail: { not: "" } } },
    },
    select: { id: true },
  });
  const due: string[] = [];
  for (const s of sessions) {
    const contacts = await getSessionSponsorContacts(s.id);
    if (contacts.length === 0) continue;
    const invited = await prisma.sponsorEvalResponse.findMany({
      where: { sessionId: s.id },
      select: { contactEmail: true },
    });
    const invitedSet = new Set(invited.map((r) => r.contactEmail.toLowerCase()));
    if (contacts.some((c) => !invitedSet.has(c.email))) due.push(s.id);
  }
  return due;
}

interface DueReminder {
  id: string;
  magicToken: string;
  email: string;
  companyName: string;
  contactName: string;
  formationNomLong: string;
}

async function findResponsesDueForReminder(which: 1 | 2, now: Date = new Date()): Promise<DueReminder[]> {
  const days = which === 1 ? SPONSOR_EVAL_REMINDER_1_DAYS : SPONSOR_EVAL_REMINDER_2_DAYS;
  const cutoff = new Date(now.getTime() - days * 24 * 3600 * 1000);
  const list = await prisma.sponsorEvalResponse.findMany({
    where: {
      submittedAt: null,
      invitedAt: { lte: cutoff },
      ...(which === 1 ? { reminder1At: null } : { reminder1At: { not: null }, reminder2At: null }),
    },
    include: { session: { select: { formation: { select: { nomLong: true } } } } },
  });
  return list.map((r) => ({
    id: r.id,
    magicToken: r.magicToken,
    email: r.contactEmail,
    companyName: r.companyName,
    contactName: r.contactName,
    formationNomLong: r.session.formation.nomLong,
  }));
}

export function findSponsorResponsesDueForReminder1(now?: Date) {
  return findResponsesDueForReminder(1, now);
}
export function findSponsorResponsesDueForReminder2(now?: Date) {
  return findResponsesDueForReminder(2, now);
}

export async function markSponsorReminderSent(responseId: string, which: 1 | 2, when: Date = new Date()): Promise<void> {
  await prisma.sponsorEvalResponse.update({
    where: { id: responseId },
    data: which === 1 ? { reminder1At: when } : { reminder2At: when },
  });
}

// === Synthèse par session ===

export interface SponsorEvalSynthesis {
  session: { id: string; code: string; dateDebut: Date; dateFin: Date };
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
  perContact: Array<{
    companyName: string;
    contactName: string;
    email: string;
    invitedAt: Date | null;
    reminder1At: Date | null;
    reminder2At: Date | null;
    submittedAt: Date | null;
  }>;
}

export async function buildSponsorEvalSynthesis(sessionId: string): Promise<SponsorEvalSynthesis | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      formation: { select: { nomLong: true } },
      sponsorEvalResponses: { include: { answers: true }, orderBy: { invitedAt: "asc" } },
    },
  });
  if (!session) return null;

  const responses = session.sponsorEvalResponses;
  const submitted = responses.filter((r) => r.submittedAt !== null);
  const invited = responses.length;
  const totals = {
    invited,
    submitted: submitted.length,
    pending: Math.max(0, invited - submitted.length),
    responseRate: invited > 0 ? submitted.length / invited : 0,
  };

  let questions: SatisfactionQuestion[] = await getGlobalSponsorEvalQuestions();
  if (submitted.length > 0) {
    try {
      const latest = JSON.parse(submitted[submitted.length - 1].questionsSnapshot) as SatisfactionQuestion[];
      if (Array.isArray(latest) && latest.length > 0) questions = latest;
    } catch {}
  }

  const stats = questions.map((q) => {
    if (q.type === "section_header") return { question: q };
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
        if (Number.isFinite(num) && num >= 1 && num <= 5) { dist[String(num)]++; sum += num; n++; }
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
          dist[String(num)]++; sum += num; n++;
          if (num >= 9) prom++; else if (num >= 7) pass++; else detr++;
        }
      }
      const npsScore = n > 0 ? Math.round(((prom - detr) / n) * 100) : undefined;
      return { question: q, distribution: dist, average: n > 0 ? sum / n : undefined, npsScore, npsPromoters: prom, npsPassives: pass, npsDetractors: detr };
    }
    if (q.type === "yes_no" || q.type === "single_choice") {
      const dist: Record<string, number> = {};
      for (const v of values) dist[v] = (dist[v] || 0) + 1;
      return { question: q, distribution: dist };
    }
    return { question: q, textResponses: values.filter((v) => v.trim() !== "") };
  });

  const perContact = responses
    .map((r) => ({
      companyName: r.companyName,
      contactName: r.contactName,
      email: r.contactEmail,
      invitedAt: r.invitedAt,
      reminder1At: r.reminder1At,
      reminder2At: r.reminder2At,
      submittedAt: r.submittedAt,
    }))
    .sort((a, b) => a.companyName.localeCompare(b.companyName));

  return {
    session: { id: session.id, code: session.code, dateDebut: session.dateDebut, dateFin: session.dateFin },
    formation: { nomLong: session.formation.nomLong },
    totals,
    questions,
    stats,
    perContact,
  };
}
