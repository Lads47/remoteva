// Backup hors-site du dossier /app/data vers Google Drive.
//
// Contenu sauvegardé dans un zip horodaté :
//   - remoteva.db        → snapshot cohérent via VACUUM INTO (sûr même pendant
//                          des écritures, contrairement à une copie de fichier
//                          en journal_mode=delete)
//   - attendance-files/  → feuilles d'émargement signées uploadées
//   - events/            → fichiers events
//
// Destination : sous-dossier ZZ_BACKUPS_EVA à la racine du Drive FORMATION
// (même logique de résolution que l'export Qualiopi), surchargeable via
// AppConfig key `backup.drive_folder_id`.
//
// Rotation : on conserve les KEEP_COUNT zips les plus récents, le reste part
// à la corbeille Drive.

import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import JSZip from "jszip";
import prisma from "./db";
import {
  findOrCreateFolder,
  isDriveConfigured,
  listFilesInFolder,
  trashFile,
  uploadFile,
} from "./google-drive";

const DATA_DIR = path.join(process.cwd(), "data");
const EXTRA_DIRS = ["attendance-files", "events"];
const BACKUP_FOLDER_NAME = "ZZ_BACKUPS_EVA";
const BACKUP_PREFIX = "eva-backup-";
const KEEP_COUNT = 30;

const CFG_KEYS = {
  targetFolder: "backup.drive_folder_id",
  lastRunAt: "backup.last_run_at",
  lastFile: "backup.last_file",
} as const;

async function getCfg(key: string): Promise<string | null> {
  const row = await prisma.appConfig.findUnique({ where: { key } });
  return row?.value ?? null;
}

async function setCfg(key: string, value: string): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

/**
 * Résout le dossier Drive de destination des backups.
 *   1. AppConfig backup.drive_folder_id si défini
 *   2. Sinon ZZ_BACKUPS_EVA (créé au besoin) dans la racine Drive de la
 *      première formation active configurée
 */
async function resolveBackupFolderId(): Promise<string> {
  const explicit = await getCfg(CFG_KEYS.targetFolder);
  if (explicit) return explicit;

  const firstFormation = await prisma.formation.findFirst({
    where: { driveDossierRacineId: { not: null }, active: true },
    select: { driveDossierRacineId: true },
  });
  if (!firstFormation?.driveDossierRacineId) {
    throw new Error(
      "Aucun dossier Drive cible pour les backups. Définir AppConfig key backup.drive_folder_id, " +
        "ou configurer driveDossierRacineId sur au moins une formation active."
    );
  }
  const folder = await findOrCreateFolder(firstFormation.driveDossierRacineId, BACKUP_FOLDER_NAME);
  return folder.id;
}

/** Horodatage Europe/Paris pour le nom du fichier : 2026-06-10_0340 */
function parisTimestamp(): string {
  const now = new Date();
  const date = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const time = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(now)
    .replace(":", "");
  return `${date}_${time}`;
}

/** Ajoute récursivement le contenu d'un dossier local au zip (s'il existe). */
async function addDirToZip(zip: JSZip, dirPath: string, zipPrefix: string): Promise<number> {
  let count = 0;
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return 0; // dossier absent → rien à sauvegarder
  }
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const zipPath = `${zipPrefix}/${entry.name}`;
    if (entry.isDirectory()) {
      count += await addDirToZip(zip, fullPath, zipPath);
    } else if (entry.isFile()) {
      zip.file(zipPath, await fs.readFile(fullPath));
      count++;
    }
  }
  return count;
}

export interface BackupReport {
  fileName: string;
  fileId: string;
  sizeBytes: number;
  filesInZip: number;
  rotatedOut: string[];
  folderId: string;
}

/**
 * Exécute un backup complet : snapshot DB + fichiers locaux → zip → Drive,
 * puis rotation (conserve les KEEP_COUNT plus récents).
 */
export async function runDataBackup(): Promise<BackupReport> {
  if (!isDriveConfigured()) {
    throw new Error("Drive non configuré (GOOGLE_SERVICE_ACCOUNT_KEY_B64 absent)");
  }

  const folderId = await resolveBackupFolderId();
  // VACUUM INTO refuse d'écraser un fichier existant → nom unique + cleanup finally
  const tmpDbPath = path.join(DATA_DIR, `.backup-tmp-${randomUUID()}.db`);

  try {
    // Le chemin ne contient que des caractères sûrs (uuid + dossier connu),
    // on échappe quand même les apostrophes par principe.
    await prisma.$executeRawUnsafe(`VACUUM INTO '${tmpDbPath.replace(/'/g, "''")}'`);

    const zip = new JSZip();
    zip.file("remoteva.db", await fs.readFile(tmpDbPath));
    let filesInZip = 1;
    for (const dir of EXTRA_DIRS) {
      filesInZip += await addDirToZip(zip, path.join(DATA_DIR, dir), dir);
    }

    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const fileName = `${BACKUP_PREFIX}${parisTimestamp()}.zip`;
    const uploaded = await uploadFile({
      parentId: folderId,
      filename: fileName,
      mimeType: "application/zip",
      buffer,
    });

    // Rotation : les noms horodatés trient chronologiquement par ordre alpha
    const existing = await listFilesInFolder(folderId);
    const backups = existing
      .filter((f) => f.name.startsWith(BACKUP_PREFIX))
      .sort((a, b) => b.name.localeCompare(a.name));
    const rotatedOut: string[] = [];
    for (const old of backups.slice(KEEP_COUNT)) {
      await trashFile(old.id);
      rotatedOut.push(old.name);
    }

    await setCfg(CFG_KEYS.lastRunAt, new Date().toISOString());
    await setCfg(CFG_KEYS.lastFile, fileName);

    return {
      fileName,
      fileId: uploaded.id,
      sizeBytes: buffer.length,
      filesInZip,
      rotatedOut,
      folderId,
    };
  } finally {
    await fs.unlink(tmpDbPath).catch(() => {});
  }
}

/** État du backup pour le dry-run (GET cron). */
export async function getBackupInfo(): Promise<{
  driveConfigured: boolean;
  lastRunAt: string | null;
  lastFile: string | null;
  keepCount: number;
}> {
  return {
    driveConfigured: isDriveConfigured(),
    lastRunAt: await getCfg(CFG_KEYS.lastRunAt),
    lastFile: await getCfg(CFG_KEYS.lastFile),
    keepCount: KEEP_COUNT,
  };
}
