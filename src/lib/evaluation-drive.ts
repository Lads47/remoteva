// Synchronise le PDF de synthèse d'une évaluation pratique vers Google Drive.
//
// Arborescence cible :
//   <Dossier session>/03_EVALUATIONS/<Prénom Nom>/<filename.pdf>
//
// Idempotent : si une version antérieure existait (`driveFileId` en BDD),
// on l'envoie à la corbeille avant l'upload. La BDD est mise à jour avec le
// nouvel id Drive + l'URL, ou avec un message d'erreur en cas d'échec.

import prisma from "./db";
import { provisionSessionDriveFolder } from "./drive-provisioning";
import { buildEvaluationPdf, buildGlobalEvaluationPdf } from "./evaluation-pdf";
import { findFile, findOrCreateFolder, isDriveConfigured, trashFile, uploadFile } from "./google-drive";

const EVAL_FOLDER_NAME = "03_EVALUATIONS";

export type EvaluationDriveSyncResult =
  | { ok: true; driveFileId: string; driveWebUrl: string | null }
  | { ok: false; error: string };

/**
 * Génère le PDF de synthèse et l'upload dans le dossier Drive
 * 03_EVALUATIONS/<Stagiaire>/ de la session.
 *
 * Best-effort : aucune exception propagée. La BDD est toujours mise à jour
 * (avec succès ou erreur), même en cas d'échec Drive.
 */
export async function syncEvaluationToDrive(
  evaluationId: string
): Promise<EvaluationDriveSyncResult> {
  if (!isDriveConfigured()) {
    const error = "Drive non configuré (GOOGLE_SERVICE_ACCOUNT_KEY_B64 absent)";
    await prisma.traineeExerciseEvaluation
      .update({ where: { id: evaluationId }, data: { driveSyncError: error } })
      .catch(() => undefined);
    return { ok: false, error };
  }

  // 1. Récupère l'évaluation + sessionId + ancien driveFileId
  const evaluation = await prisma.traineeExerciseEvaluation.findUnique({
    where: { id: evaluationId },
    include: {
      trainee: { select: { sessionId: true } },
    },
  });
  if (!evaluation) return { ok: false, error: "Évaluation introuvable" };

  const sessionId = evaluation.trainee.sessionId;
  const previousDriveFileId = evaluation.driveFileId;

  try {
    // 2. S'assure que la session a un dossier Drive (provision à la volée si besoin)
    const provision = await provisionSessionDriveFolder(sessionId);
    if (!provision.ok) {
      const error = `Session sans dossier Drive : ${provision.error}`;
      await prisma.traineeExerciseEvaluation.update({
        where: { id: evaluationId },
        data: { driveSyncError: error },
      });
      return { ok: false, error };
    }
    const sessionFolderId = provision.driveFolderId;

    // 3. Génère le PDF (lit toutes les données BDD requises)
    const bundle = await buildEvaluationPdf(evaluationId);

    // 4. Sous-dossier 03_EVALUATIONS dans la session
    const evalFolder = await findOrCreateFolder(sessionFolderId, EVAL_FOLDER_NAME);
    // 5. Sous-sous-dossier <Stagiaire> dans 03_EVALUATIONS
    const traineeFolder = await findOrCreateFolder(evalFolder.id, bundle.traineeFullName);

    // 6. Upload du PDF
    const driveFile = await uploadFile({
      parentId: traineeFolder.id,
      filename: bundle.filename,
      mimeType: "application/pdf",
      buffer: bundle.buffer,
    });

    // 7. Met à la corbeille l'ancienne version si elle existait
    if (previousDriveFileId && previousDriveFileId !== driveFile.id) {
      await trashFile(previousDriveFileId);
    }

    // 8. Update BDD avec nouvel état
    await prisma.traineeExerciseEvaluation.update({
      where: { id: evaluationId },
      data: {
        driveFileId: driveFile.id,
        driveWebUrl: driveFile.webViewLink ?? null,
        driveSyncedAt: new Date(),
        driveSyncError: null,
      },
    });

    return { ok: true, driveFileId: driveFile.id, driveWebUrl: driveFile.webViewLink ?? null };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Erreur inconnue";
    console.warn(`[evaluation-drive] sync échouée pour evalId=${evaluationId}:`, error);
    await prisma.traineeExerciseEvaluation
      .update({
        where: { id: evaluationId },
        data: { driveSyncError: error.slice(0, 500) },
      })
      .catch(() => undefined);
    return { ok: false, error };
  }
}

/**
 * Génère le PDF de synthèse globale d'un stagiaire (toutes ses évaluations
 * pratiques) et l'upload dans 03_EVALUATIONS/<Stagiaire>/ sur Drive.
 *
 * Idempotent : si un fichier portant le même nom existe déjà dans le dossier
 * cible (cas d'une régénération), il est mis à la corbeille avant l'upload
 * du nouveau.
 *
 * Best-effort : aucune exception propagée. Pas de state en BDD pour ce PDF
 * — l'état est porté par la présence du fichier sur Drive.
 */
export async function syncGlobalEvaluationPdfToDrive(
  traineeId: string
): Promise<EvaluationDriveSyncResult> {
  if (!isDriveConfigured()) {
    return {
      ok: false,
      error: "Drive non configuré (GOOGLE_SERVICE_ACCOUNT_KEY_B64 absent)",
    };
  }

  const trainee = await prisma.trainee.findUnique({
    where: { id: traineeId },
    select: { sessionId: true },
  });
  if (!trainee) return { ok: false, error: "Stagiaire introuvable" };

  try {
    const provision = await provisionSessionDriveFolder(trainee.sessionId);
    if (!provision.ok) {
      return { ok: false, error: `Session sans dossier Drive : ${provision.error}` };
    }
    const sessionFolderId = provision.driveFolderId;

    const bundle = await buildGlobalEvaluationPdf(traineeId);

    const evalFolder = await findOrCreateFolder(sessionFolderId, EVAL_FOLDER_NAME);
    const traineeFolder = await findOrCreateFolder(evalFolder.id, bundle.traineeFullName);

    // Recherche une version précédente portant le même nom et l'envoie à la
    // corbeille avant l'upload (sinon Drive accepte les doublons).
    const previous = await findFile(traineeFolder.id, bundle.filename);
    if (previous) {
      await trashFile(previous.id);
    }

    const driveFile = await uploadFile({
      parentId: traineeFolder.id,
      filename: bundle.filename,
      mimeType: "application/pdf",
      buffer: bundle.buffer,
    });

    return { ok: true, driveFileId: driveFile.id, driveWebUrl: driveFile.webViewLink ?? null };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Erreur inconnue";
    console.warn(`[evaluation-drive] sync globale échouée pour traineeId=${traineeId}:`, error);
    return { ok: false, error };
  }
}
