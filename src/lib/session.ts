import prisma from "./db";

export interface SessionInfo {
  id: string;
  formationId: string;
  formationCode: string;
  formationNomLong: string;
  code: string;
  dateDebut: Date;
  dateFin: Date;
  capacite: number;
  lieu: string;
  horaires: string;
  status: string;
  driveFolderId: string | null;
  driveSuiviFileId: string | null;
  trainerId: string | null;
  trainerNomComplet: string | null;          // "Prénom NOM" dénormalisé pour affichage
  notes: string;
  traineeCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionCreateInput {
  formationId: string;
  code: string;
  dateDebut: Date | string;
  dateFin: Date | string;
  capacite?: number;
  lieu?: string;
  horaires?: string;
  status?: string;
  trainerId?: string | null;
  notes?: string;
}

export interface SessionUpdateInput {
  code?: string;
  dateDebut?: Date | string;
  dateFin?: Date | string;
  capacite?: number;
  lieu?: string;
  horaires?: string;
  status?: string;
  driveFolderId?: string | null;
  driveSuiviFileId?: string | null;
  trainerId?: string | null;
  notes?: string;
}

export async function getAllSessions(): Promise<SessionInfo[]> {
  const list = await prisma.session.findMany({
    include: {
      formation: { select: { code: true, nomLong: true } },
      trainer: { select: { id: true, prenom: true, nom: true } },
      _count: { select: { trainees: true } },
    },
    orderBy: { dateDebut: "desc" },
  });
  return list.map(toInfo);
}

export async function getSessionsByFormation(formationId: string): Promise<SessionInfo[]> {
  const list = await prisma.session.findMany({
    where: { formationId },
    include: {
      formation: { select: { code: true, nomLong: true } },
      trainer: { select: { id: true, prenom: true, nom: true } },
      _count: { select: { trainees: true } },
    },
    orderBy: { dateDebut: "desc" },
  });
  return list.map(toInfo);
}

export async function getSessionById(id: string): Promise<SessionInfo | null> {
  const s = await prisma.session.findUnique({
    where: { id },
    include: {
      formation: { select: { code: true, nomLong: true } },
      trainer: { select: { id: true, prenom: true, nom: true } },
      _count: { select: { trainees: true } },
    },
  });
  return s ? toInfo(s) : null;
}

/**
 * Génère un code session unique au format <formationCode>-YYYY-MM.
 * Si une session existe déjà avec ce code, suffixe avec -2, -3, ...
 */
export async function generateSessionCode(
  formationId: string,
  date: Date | string
): Promise<string> {
  const formation = await prisma.formation.findUnique({
    where: { id: formationId },
    select: { code: true },
  });
  if (!formation) throw new Error("Formation introuvable");

  const d = new Date(date);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const base = `${formation.code}-${yyyy}-${mm}`;

  let candidate = base;
  let suffix = 1;
  while (await prisma.session.findUnique({ where: { code: candidate }, select: { id: true } })) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  return candidate;
}

export async function createSession(input: SessionCreateInput): Promise<SessionInfo> {
  const s = await prisma.session.create({
    data: {
      formationId: input.formationId,
      code: input.code,
      dateDebut: new Date(input.dateDebut),
      dateFin: new Date(input.dateFin),
      capacite: input.capacite ?? 8,
      lieu: input.lieu ?? "",
      horaires: input.horaires ?? "",
      status: input.status ?? "planned",
      trainerId: input.trainerId ?? null,
      notes: input.notes ?? "",
    },
    include: {
      formation: { select: { code: true, nomLong: true } },
      trainer: { select: { id: true, prenom: true, nom: true } },
      _count: { select: { trainees: true } },
    },
  });
  return toInfo(s);
}

export async function updateSession(id: string, input: SessionUpdateInput): Promise<SessionInfo> {
  const data: Record<string, unknown> = {};
  if (input.code !== undefined) data.code = input.code;
  if (input.dateDebut !== undefined) data.dateDebut = new Date(input.dateDebut);
  if (input.dateFin !== undefined) data.dateFin = new Date(input.dateFin);
  if (input.capacite !== undefined) data.capacite = input.capacite;
  if (input.lieu !== undefined) data.lieu = input.lieu;
  if (input.horaires !== undefined) data.horaires = input.horaires;
  if (input.status !== undefined) data.status = input.status;
  if (input.driveFolderId !== undefined) data.driveFolderId = input.driveFolderId;
  if (input.driveSuiviFileId !== undefined) data.driveSuiviFileId = input.driveSuiviFileId;
  if (input.trainerId !== undefined) data.trainerId = input.trainerId;
  if (input.notes !== undefined) data.notes = input.notes;

  const s = await prisma.session.update({
    where: { id },
    data,
    include: {
      formation: { select: { code: true, nomLong: true } },
      trainer: { select: { id: true, prenom: true, nom: true } },
      _count: { select: { trainees: true } },
    },
  });
  return toInfo(s);
}

export async function deleteSession(id: string): Promise<void> {
  await prisma.session.delete({ where: { id } });
}

type SessionRow = Awaited<ReturnType<typeof prisma.session.findUniqueOrThrow>> & {
  formation: { code: string; nomLong: string };
  trainer: { id: string; prenom: string; nom: string } | null;
  _count: { trainees: number };
};

function toInfo(s: SessionRow): SessionInfo {
  return {
    id: s.id,
    formationId: s.formationId,
    formationCode: s.formation.code,
    formationNomLong: s.formation.nomLong,
    code: s.code,
    dateDebut: s.dateDebut,
    dateFin: s.dateFin,
    capacite: s.capacite,
    lieu: s.lieu,
    horaires: s.horaires,
    status: s.status,
    driveFolderId: s.driveFolderId,
    driveSuiviFileId: s.driveSuiviFileId,
    trainerId: s.trainerId,
    trainerNomComplet: s.trainer ? `${s.trainer.prenom} ${s.trainer.nom}` : null,
    notes: s.notes,
    traineeCount: s._count.trainees,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
