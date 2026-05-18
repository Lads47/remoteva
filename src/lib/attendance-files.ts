// Stockage des feuilles d'émargement signées sur disque (volume Docker /app/data).
// Volume Docker `evaremote-data` est monté sur /app/data → persisté entre déploiements.

import { randomUUID } from "crypto";
import { mkdir, writeFile, unlink, readFile, stat } from "fs/promises";
import path from "path";
import prisma from "./db";

// Racine de stockage des feuilles signées (sur le volume persistant)
const STORAGE_ROOT = path.join(process.cwd(), "data", "attendance-files");

// Limites de sécurité
export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
]);

export interface AttendanceFileInfo {
  id: string;
  sessionId: string;
  date: Date | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  uploadedByPrenomNom: string | null;
}

async function ensureStorageRoot(): Promise<void> {
  await mkdir(STORAGE_ROOT, { recursive: true });
}

function extensionFromMime(mime: string, originalName: string): string {
  // Prioriser l'extension du nom original si valide
  const dotIdx = originalName.lastIndexOf(".");
  if (dotIdx >= 0 && dotIdx < originalName.length - 1) {
    const ext = originalName.slice(dotIdx + 1).toLowerCase();
    if (/^[a-z0-9]{2,5}$/.test(ext)) return ext;
  }
  // Fallback : déduction depuis le mime type
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/heic") return "heic";
  if (mime === "image/heif") return "heif";
  if (mime === "image/webp") return "webp";
  return "bin";
}

/**
 * Sauvegarde un fichier uploadé pour une session.
 * Le fichier est stocké sous `{uuid}.{ext}` pour éviter toute collision et path traversal.
 * Les métadonnées (filename original, mime, size, uploader) sont en BDD.
 */
export async function saveAttendanceFile(input: {
  sessionId: string;
  date: Date | null;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  uploadedById: string | null;
}): Promise<AttendanceFileInfo> {
  if (input.buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(`Fichier trop volumineux (max ${Math.floor(MAX_FILE_SIZE_BYTES / 1024 / 1024)} MB)`);
  }
  if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
    throw new Error(`Type de fichier non autorisé (${input.mimeType}). Autorisés : PDF, JPEG, PNG, HEIC, WebP.`);
  }

  await ensureStorageRoot();
  const ext = extensionFromMime(input.mimeType, input.filename);
  const storageFileName = `${randomUUID()}.${ext}`;
  const fullPath = path.join(STORAGE_ROOT, storageFileName);
  await writeFile(fullPath, input.buffer);

  const created = await prisma.attendanceFile.create({
    data: {
      sessionId: input.sessionId,
      date: input.date,
      filename: input.filename,
      storagePath: storageFileName,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.length,
      uploadedById: input.uploadedById,
    },
    include: { uploadedBy: { select: { prenom: true, nom: true } } },
  });

  return toInfo(created);
}

export async function listAttendanceFiles(sessionId: string): Promise<AttendanceFileInfo[]> {
  const rows = await prisma.attendanceFile.findMany({
    where: { sessionId },
    include: { uploadedBy: { select: { prenom: true, nom: true } } },
    orderBy: [{ date: "asc" }, { uploadedAt: "asc" }],
  });
  return rows.map(toInfo);
}

export async function getAttendanceFile(id: string): Promise<(AttendanceFileInfo & { buffer: Buffer }) | null> {
  const row = await prisma.attendanceFile.findUnique({
    where: { id },
    include: { uploadedBy: { select: { prenom: true, nom: true } } },
  });
  if (!row) return null;
  const fullPath = path.join(STORAGE_ROOT, row.storagePath);
  try {
    await stat(fullPath);
  } catch {
    return null;
  }
  const buffer = await readFile(fullPath);
  return { ...toInfo(row), buffer };
}

export async function deleteAttendanceFile(id: string): Promise<boolean> {
  const row = await prisma.attendanceFile.findUnique({ where: { id } });
  if (!row) return false;
  const fullPath = path.join(STORAGE_ROOT, row.storagePath);
  try {
    await unlink(fullPath);
  } catch {
    // fichier disque déjà absent — on supprime quand même la ligne
  }
  await prisma.attendanceFile.delete({ where: { id } });
  return true;
}

type Row = Awaited<ReturnType<typeof prisma.attendanceFile.findUniqueOrThrow>> & {
  uploadedBy: { prenom: string; nom: string } | null;
};

function toInfo(r: Row): AttendanceFileInfo {
  return {
    id: r.id,
    sessionId: r.sessionId,
    date: r.date,
    filename: r.filename,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    uploadedAt: r.uploadedAt,
    uploadedByPrenomNom: r.uploadedBy ? `${r.uploadedBy.prenom} ${r.uploadedBy.nom}` : null,
  };
}
