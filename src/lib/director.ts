import prisma from "./db";
import { randomBytes } from "crypto";

export interface DirectorInfo {
  id: string;
  name: string;
  email: string;
  phone: string;
  magicToken: string;
  active: boolean;
  createdAt: Date;
}

export interface DirectorWithAvailabilities extends DirectorInfo {
  availableDates: Date[];
}

/**
 * Génère un token magique long (32 bytes hex = 64 chars) pour /presta.
 */
export function generateMagicToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Liste tous les réalisateurs (actifs + inactifs).
 */
export async function getAllDirectors(): Promise<DirectorInfo[]> {
  const list = await prisma.director.findMany({ orderBy: { name: "asc" } });
  return list.map((d) => ({
    id: d.id,
    name: d.name,
    email: d.email,
    phone: d.phone,
    magicToken: d.magicToken,
    active: d.active,
    createdAt: d.createdAt,
  }));
}

/**
 * Liste uniquement les réalisateurs actifs (pour dropdown).
 */
export async function getActiveDirectors(): Promise<DirectorInfo[]> {
  const list = await prisma.director.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  return list.map((d) => ({
    id: d.id,
    name: d.name,
    email: d.email,
    phone: d.phone,
    magicToken: d.magicToken,
    active: d.active,
    createdAt: d.createdAt,
  }));
}

/**
 * Récupère un réalisateur par son magicToken (pour /presta).
 */
export async function getDirectorByToken(token: string): Promise<DirectorInfo | null> {
  if (!token) return null;
  const d = await prisma.director.findUnique({ where: { magicToken: token } });
  if (!d || !d.active) return null;
  return {
    id: d.id,
    name: d.name,
    email: d.email,
    phone: d.phone,
    magicToken: d.magicToken,
    active: d.active,
    createdAt: d.createdAt,
  };
}

/**
 * Récupère un réalisateur par son id.
 */
export async function getDirector(id: string): Promise<DirectorInfo | null> {
  const d = await prisma.director.findUnique({ where: { id } });
  if (!d) return null;
  return {
    id: d.id,
    name: d.name,
    email: d.email,
    phone: d.phone,
    magicToken: d.magicToken,
    active: d.active,
    createdAt: d.createdAt,
  };
}

/**
 * Crée un nouveau réalisateur. Génère le magicToken automatiquement.
 */
export async function createDirector(data: {
  name: string;
  email: string;
  phone?: string;
}): Promise<DirectorInfo> {
  const magicToken = generateMagicToken();
  const d = await prisma.director.create({
    data: {
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      phone: data.phone?.trim() ?? "",
      magicToken,
    },
  });
  return {
    id: d.id,
    name: d.name,
    email: d.email,
    phone: d.phone,
    magicToken: d.magicToken,
    active: d.active,
    createdAt: d.createdAt,
  };
}

/**
 * Met à jour un réalisateur.
 */
export async function updateDirector(
  id: string,
  data: Partial<{ name: string; email: string; phone: string; active: boolean }>
): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.email !== undefined) updateData.email = data.email.trim().toLowerCase();
  if (data.phone !== undefined) updateData.phone = data.phone.trim();
  if (data.active !== undefined) updateData.active = data.active;

  await prisma.director.update({ where: { id }, data: updateData });
}

/**
 * Régénère le magicToken d'un réalisateur (si compromis).
 */
export async function regenerateMagicToken(id: string): Promise<string> {
  const newToken = generateMagicToken();
  await prisma.director.update({ where: { id }, data: { magicToken: newToken } });
  return newToken;
}

/**
 * Supprime définitivement un réalisateur.
 */
export async function deleteDirector(id: string): Promise<void> {
  await prisma.director.delete({ where: { id } });
}

// === Disponibilités ===

/**
 * Normalise une date à 00:00 UTC (utilisé pour les dispos par jour).
 */
function normalizeDate(d: Date | string): Date {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

/**
 * Liste les dates de dispo d'un réalisateur.
 */
export async function getAvailabilities(directorId: string): Promise<Date[]> {
  const list = await prisma.directorAvailability.findMany({
    where: { directorId },
    orderBy: { date: "asc" },
  });
  return list.map((a) => a.date);
}

/**
 * Liste les réalisateurs disponibles pour une date donnée.
 */
export async function getAvailableDirectorsForDate(date: Date | string): Promise<DirectorInfo[]> {
  const normalized = normalizeDate(date);
  const avails = await prisma.directorAvailability.findMany({
    where: { date: normalized },
    include: { director: true },
  });
  return avails
    .filter((a) => a.director.active)
    .map((a) => ({
      id: a.director.id,
      name: a.director.name,
      email: a.director.email,
      phone: a.director.phone,
      magicToken: a.director.magicToken,
      active: a.director.active,
      createdAt: a.director.createdAt,
    }));
}

/**
 * Toggle la dispo d'un réalisateur sur une date.
 * Renvoie true si la dispo a été créée, false si elle a été supprimée.
 */
export async function toggleAvailability(directorId: string, date: Date | string): Promise<boolean> {
  const normalized = normalizeDate(date);
  const existing = await prisma.directorAvailability.findUnique({
    where: { directorId_date: { directorId, date: normalized } },
  });

  if (existing) {
    await prisma.directorAvailability.delete({ where: { id: existing.id } });
    return false;
  } else {
    await prisma.directorAvailability.create({
      data: { directorId, date: normalized },
    });
    return true;
  }
}

/**
 * Supprime explicitement une dispo.
 */
export async function removeAvailability(directorId: string, date: Date | string): Promise<void> {
  const normalized = normalizeDate(date);
  await prisma.directorAvailability.deleteMany({
    where: { directorId, date: normalized },
  });
}
