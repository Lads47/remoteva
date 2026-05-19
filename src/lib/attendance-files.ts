// Stockage des feuilles d'émargement signées sur disque (volume Docker /app/data).
// Volume Docker `evaremote-data` est monté sur /app/data → persisté entre déploiements.

import { randomUUID } from "crypto";
import { mkdir, writeFile, unlink, readFile, stat } from "fs/promises";
import path from "path";
import prisma from "./db";
import { provisionSessionDriveFolder } from "./drive-provisioning";
import { findOrCreateFolder, isDriveConfigured, trashFile, uploadFile } from "./google-drive";

// Nom du sous-dossier Drive où archiver les feuilles signées d'une session.
// Doit matcher la convention historique des Workflows n8n (cf. structure
// "FORMATION/<session>/02_SUIVI_ET_INCIDENTS/").
const DRIVE_SUIVI_FOLDER_NAME = "02_SUIVI_ET_INCIDENTS";

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
  driveFileId: string | null;
  driveWebUrl: string | null;
  driveSyncedAt: Date | null;
  driveSyncError: string | null;
}

export type DriveSyncResult =
  | { ok: true; fileId: string; webUrl: string | null }
  | { ok: false; error: string };

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

  // Sync Drive best-effort en parallèle. On ne bloque pas la réponse :
  // on attend juste l'update du record en BDD pour que la réponse contienne
  // l'état final (succès ou erreur).
  await syncAttendanceFileToDrive(created.id);
  const refreshed = await prisma.attendanceFile.findUniqueOrThrow({
    where: { id: created.id },
    include: { uploadedBy: { select: { prenom: true, nom: true } } },
  });
  return toInfo(refreshed);
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
  // Best-effort : déplace aussi le fichier Drive dans la corbeille
  if (row.driveFileId) {
    await trashFile(row.driveFileId);
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
    driveFileId: r.driveFileId,
    driveWebUrl: r.driveWebUrl,
    driveSyncedAt: r.driveSyncedAt,
    driveSyncError: r.driveSyncError,
  };
}

/**
 * Tente d'uploader un fichier sur Drive dans le sous-dossier
 * `02_SUIVI_ET_INCIDENTS` de la session. Met à jour le record en BDD avec
 * driveFileId/driveWebUrl (succès) ou driveSyncError (échec).
 *
 * Best-effort : ne throw jamais. Retourne un DriveSyncResult pour info.
 */
export async function syncAttendanceFileToDrive(attendanceFileId: string): Promise<DriveSyncResult> {
  if (!isDriveConfigured()) {
    const error = "Drive non configuré (GOOGLE_SERVICE_ACCOUNT_KEY_B64 absent)";
    await prisma.attendanceFile.update({
      where: { id: attendanceFileId },
      data: { driveSyncError: error },
    });
    return { ok: false, error };
  }

  const row = await prisma.attendanceFile.findUnique({
    where: { id: attendanceFileId },
    include: { session: { select: { id: true, driveFolderId: true } } },
  });
  if (!row) return { ok: false, error: "Fichier introuvable" };

  // Auto-réparation : si la session n'a pas encore de dossier Drive, on tente
  // un provisioning à la volée. Cas typique : session créée avant que le
  // câblage Drive n'existe, ou avant que la formation n'ait son
  // `driveDossierSessionsId` configuré.
  let sessionDriveFolderId = row.session.driveFolderId;
  if (!sessionDriveFolderId) {
    const provision = await provisionSessionDriveFolder(row.session.id);
    if (!provision.ok) {
      await prisma.attendanceFile.update({
        where: { id: attendanceFileId },
        data: { driveSyncError: `Session sans dossier Drive : ${provision.error}` },
      });
      return { ok: false, error: `Session sans dossier Drive : ${provision.error}` };
    }
    sessionDriveFolderId = provision.driveFolderId;
  }

  try {
    // 1. Trouve ou crée le sous-dossier suivi/incidents
    const folder = await findOrCreateFolder(sessionDriveFolderId, DRIVE_SUIVI_FOLDER_NAME);
    // 2. Lit le buffer local et upload
    const localPath = path.join(STORAGE_ROOT, row.storagePath);
    const buffer = await readFile(localPath);
    const driveFile = await uploadFile({
      parentId: folder.id,
      filename: row.filename,
      mimeType: row.mimeType,
      buffer,
    });
    // 3. Update record
    await prisma.attendanceFile.update({
      where: { id: attendanceFileId },
      data: {
        driveFileId: driveFile.id,
        driveWebUrl: driveFile.webViewLink ?? null,
        driveSyncedAt: new Date(),
        driveSyncError: null,
      },
    });
    return { ok: true, fileId: driveFile.id, webUrl: driveFile.webViewLink ?? null };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Erreur inconnue";
    console.warn(`[attendance-files] sync Drive échouée pour ${attendanceFileId}:`, error);
    await prisma.attendanceFile.update({
      where: { id: attendanceFileId },
      data: { driveSyncError: error.slice(0, 500) },
    });
    return { ok: false, error };
  }
}
