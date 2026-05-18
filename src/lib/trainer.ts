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
}

export interface TrainerCreateInput {
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
}

export interface TrainerUpdateInput {
  nom?: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  active?: boolean;
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
  };
}
