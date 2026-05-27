import prisma from "./db";
import { randomBytes } from "crypto";

export interface TrainerInfo {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  magicToken: string;
  active: boolean;
  createdAt: Date;
  sessionCount: number;
  // Qualiopi indicateur 21
  qualifications: string;
  driveCvFolderId: string | null;
  // Qualiopi indicateur 22 — entretien et développement des compétences
  developpementCompetences: string;
  // Qualiopi indicateur 27 — sous-traitance
  isExternal: boolean;
  raisonSociale: string;
  siret: string;
  adresse: string;
  numeroDa: string;
  representantLegal: string;
}

export interface TrainerCreateInput {
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  qualifications?: string;
  driveCvFolderId?: string;
  developpementCompetences?: string;
  isExternal?: boolean;
  raisonSociale?: string;
  siret?: string;
  adresse?: string;
  numeroDa?: string;
  representantLegal?: string;
}

export interface TrainerUpdateInput {
  nom?: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  active?: boolean;
  qualifications?: string;
  driveCvFolderId?: string;
  developpementCompetences?: string;
  isExternal?: boolean;
  raisonSociale?: string;
  siret?: string;
  adresse?: string;
  numeroDa?: string;
  representantLegal?: string;
}

/**
 * Génère un token magique long (32 bytes hex = 64 chars).
 */
export function generateMagicToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Construit l'URL absolue du portail formateur avec son token.
 */
export function buildTrainerMagicLink(token: string, baseUrl?: string): string {
  const base = baseUrl || process.env.PUBLIC_BASE_URL || "http://localhost:3000";
  return `${base}/formateur?token=${encodeURIComponent(token)}`;
}

export async function getAllTrainers(): Promise<TrainerInfo[]> {
  const list = await prisma.trainer.findMany({
    include: { _count: { select: { sessions: true } } },
    orderBy: { nom: "asc" },
  });
  return list.map(toInfo);
}

export async function getActiveTrainers(): Promise<TrainerInfo[]> {
  const list = await prisma.trainer.findMany({
    where: { active: true },
    include: { _count: { select: { sessions: true } } },
    orderBy: { nom: "asc" },
  });
  return list.map(toInfo);
}

export async function getTrainerById(id: string): Promise<TrainerInfo | null> {
  const t = await prisma.trainer.findUnique({
    where: { id },
    include: { _count: { select: { sessions: true } } },
  });
  return t ? toInfo(t) : null;
}

export async function getTrainerByMagicToken(token: string): Promise<TrainerInfo | null> {
  const t = await prisma.trainer.findUnique({
    where: { magicToken: token },
    include: { _count: { select: { sessions: true } } },
  });
  return t ? toInfo(t) : null;
}

export async function createTrainer(input: TrainerCreateInput): Promise<TrainerInfo> {
  const t = await prisma.trainer.create({
    data: {
      nom: input.nom,
      prenom: input.prenom,
      email: input.email,
      telephone: input.telephone ?? "",
      qualifications: input.qualifications ?? "",
      driveCvFolderId: input.driveCvFolderId?.trim() || null,
      developpementCompetences: input.developpementCompetences ?? "",
      isExternal: input.isExternal ?? false,
      raisonSociale: input.raisonSociale ?? "",
      siret: input.siret ?? "",
      adresse: input.adresse ?? "",
      numeroDa: input.numeroDa ?? "",
      representantLegal: input.representantLegal ?? "",
      magicToken: generateMagicToken(),
    },
    include: { _count: { select: { sessions: true } } },
  });
  return toInfo(t);
}

export async function updateTrainer(id: string, input: TrainerUpdateInput): Promise<TrainerInfo> {
  const data: Record<string, unknown> = {};
  if (input.nom !== undefined) data.nom = input.nom;
  if (input.prenom !== undefined) data.prenom = input.prenom;
  if (input.email !== undefined) data.email = input.email;
  if (input.telephone !== undefined) data.telephone = input.telephone;
  if (input.active !== undefined) data.active = input.active;
  if (input.qualifications !== undefined) data.qualifications = input.qualifications;
  if (input.driveCvFolderId !== undefined) {
    data.driveCvFolderId = input.driveCvFolderId.trim() || null;
  }
  if (input.developpementCompetences !== undefined) {
    data.developpementCompetences = input.developpementCompetences;
  }
  if (input.isExternal !== undefined) data.isExternal = input.isExternal;
  if (input.raisonSociale !== undefined) data.raisonSociale = input.raisonSociale;
  if (input.siret !== undefined) data.siret = input.siret;
  if (input.adresse !== undefined) data.adresse = input.adresse;
  if (input.numeroDa !== undefined) data.numeroDa = input.numeroDa;
  if (input.representantLegal !== undefined) data.representantLegal = input.representantLegal;
  const t = await prisma.trainer.update({
    where: { id },
    data,
    include: { _count: { select: { sessions: true } } },
  });
  return toInfo(t);
}

export async function regenerateMagicToken(id: string): Promise<string> {
  const newToken = generateMagicToken();
  await prisma.trainer.update({
    where: { id },
    data: { magicToken: newToken },
  });
  return newToken;
}

export async function deleteTrainer(id: string): Promise<void> {
  await prisma.trainer.delete({ where: { id } });
}

// === Portail formateur (lecture seule, auth par magic-token) ===

export interface TrainerSessionInfo {
  id: string;
  code: string;
  formationCode: string;
  formationNomLong: string;
  dateDebut: Date;
  dateFin: Date;
  lieu: string;
  horaires: string;
  status: string;
  traineeCount: number;
  capacite: number;
  isPast: boolean;
}

/**
 * Authentifie un formateur par son magic token (actif uniquement) + charge
 * ses sessions assignées (passées + à venir), triées par date décroissante.
 */
export async function authTrainerWithSessions(
  token: string
): Promise<{ trainer: TrainerInfo; sessions: TrainerSessionInfo[] } | null> {
  if (!token) return null;
  const trainerRow = await prisma.trainer.findUnique({
    where: { magicToken: token },
    include: { _count: { select: { sessions: true } } },
  });
  if (!trainerRow || !trainerRow.active) return null;

  const sessions = await prisma.session.findMany({
    where: { trainerId: trainerRow.id },
    include: {
      formation: { select: { code: true, nomLong: true } },
      _count: { select: { trainees: true } },
    },
    orderBy: { dateDebut: "desc" },
  });

  const now = Date.now();
  const trainerSessions: TrainerSessionInfo[] = sessions.map((s) => ({
    id: s.id,
    code: s.code,
    formationCode: s.formation.code,
    formationNomLong: s.formation.nomLong,
    dateDebut: s.dateDebut,
    dateFin: s.dateFin,
    lieu: s.lieu,
    horaires: s.horaires,
    status: s.status,
    traineeCount: s._count.trainees,
    capacite: s.capacite,
    isPast: s.dateFin.getTime() < now,
  }));

  return { trainer: toInfo(trainerRow), sessions: trainerSessions };
}

/**
 * Récupère une session spécifique pour un formateur (vérifie ownership via le token).
 * Retourne aussi les stagiaires inscrits + formation pour le portail.
 */
export async function getTrainerSessionDetail(token: string, sessionId: string) {
  if (!token) return null;
  const trainer = await prisma.trainer.findUnique({ where: { magicToken: token } });
  if (!trainer || !trainer.active) return null;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      formation: true,
      trainees: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!session) return null;
  // Ownership : la session doit être assignée à ce formateur
  if (session.trainerId !== trainer.id) return null;

  return {
    trainer: { id: trainer.id, prenom: trainer.prenom, nom: trainer.nom, email: trainer.email },
    session: {
      id: session.id,
      code: session.code,
      dateDebut: session.dateDebut,
      dateFin: session.dateFin,
      lieu: session.lieu,
      horaires: session.horaires,
      status: session.status,
      capacite: session.capacite,
      notes: session.notes,
      driveFolderId: session.driveFolderId,
    },
    formation: {
      id: session.formation.id,
      code: session.formation.code,
      nomLong: session.formation.nomLong,
      description: session.formation.description,
      dureeJours: session.formation.dureeJours,
      configForm: session.formation.configForm,
    },
    trainees: session.trainees.map((t) => ({
      id: t.id,
      nom: t.nom,
      prenom: t.prenom,
      email: t.email,
      telephone: t.telephone,
      inscriptionType: t.inscriptionType,
      raisonSociale: t.raisonSociale,
      statutActuel: t.statutActuel,
      modeFinancement: t.modeFinancement,
      psh: t.psh,
      besoinsAdaptation: t.besoinsAdaptation,
      attentes: t.attentes,
      evalEntree: t.evalEntree,
      status: t.status,
    })),
  };
}

type TrainerRow = Awaited<ReturnType<typeof prisma.trainer.findUniqueOrThrow>> & {
  _count: { sessions: number };
};

function toInfo(t: TrainerRow): TrainerInfo {
  return {
    id: t.id,
    nom: t.nom,
    prenom: t.prenom,
    email: t.email,
    telephone: t.telephone,
    magicToken: t.magicToken,
    active: t.active,
    createdAt: t.createdAt,
    sessionCount: t._count.sessions,
    qualifications: t.qualifications,
    driveCvFolderId: t.driveCvFolderId,
    developpementCompetences: t.developpementCompetences,
    isExternal: t.isExternal,
    raisonSociale: t.raisonSociale,
    siret: t.siret,
    adresse: t.adresse,
    numeroDa: t.numeroDa,
    representantLegal: t.representantLegal,
  };
}
