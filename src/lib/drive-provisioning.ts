// Provisionnement Google Drive d'une session de formation.
//
// Crée (de manière idempotente) le dossier racine de la session dans le dossier
// parent configuré au niveau de la formation, puis une arborescence de
// sous-dossiers conforme aux exigences Qualiopi (un dossier par étape clé du
// processus de formation, pour faciliter les audits).
//
// Best-effort : aucune erreur n'est propagée à l'appelant — on log et on
// retourne un résultat structuré. La sync attendance peut s'appuyer dessus
// pour s'auto-réparer si la session n'a pas encore de driveFolderId.
//
// L'arborescence est volontairement stable : si elle change, les sessions
// déjà provisionnées ne sont PAS migrées, on ajoute juste les nouveaux
// sous-dossiers manquants à la prochaine provision.

import prisma from "./db";
import { createFolder, findFolder, findOrCreateFolder, isDriveConfigured } from "./google-drive";

/**
 * Sous-dossiers Qualiopi créés dans chaque dossier de session.
 *
 * Préfixes numériques pour figer l'ordre d'affichage Drive (tri alpha).
 * Le sous-dossier `02_SUIVI_ET_INCIDENTS` est aussi utilisé par
 * `attendance-files.ts` (DRIVE_SUIVI_FOLDER_NAME) — garder les deux alignés.
 */
export const QUALIOPI_SESSION_SUBFOLDERS = [
  "01_INSCRIPTIONS_CONVENTIONS",   // devis signés, conventions, contrats, convocations
  "02_SUIVI_ET_INCIDENTS",         // feuilles d'émargement scannées, incidents
  "03_EVALUATIONS",                // exercices, éval entrée, éval chaude, éval froide
  "04_ATTESTATIONS_BILAN",         // attestations de fin, certificats, bilan formateur
  "05_PROGRAMME_SUPPORTS",         // programme PDF de la session, supports stagiaires
] as const;

export type ProvisionResult =
  | {
      ok: true;
      sessionId: string;
      driveFolderId: string;
      created: boolean;          // true si on a créé le dossier session (false = déjà existant)
      subfoldersCreated: string[]; // noms des sous-dossiers nouvellement créés
    }
  | { ok: false; sessionId: string; error: string };

/**
 * Provisionne (ou répare) le dossier Drive d'une session.
 *
 * - Si `session.driveFolderId` est déjà set : on s'assure juste que tous les
 *   sous-dossiers Qualiopi existent (utile si la liste évolue).
 * - Sinon : on crée un dossier `<sessionCode>` dans
 *   `formation.driveDossierSessionsId`, puis tous les sous-dossiers, puis on
 *   met à jour `session.driveFolderId` en BDD.
 *
 * Idempotent : peut être appelée plusieurs fois sans dupliquer les dossiers.
 */
export async function provisionSessionDriveFolder(sessionId: string): Promise<ProvisionResult> {
  if (!isDriveConfigured()) {
    return { ok: false, sessionId, error: "Drive non configuré (GOOGLE_SERVICE_ACCOUNT_KEY_B64 absent)" };
  }

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      formation: {
        select: {
          code: true,
          driveDossierSessionsId: true,
        },
      },
    },
  });
  if (!session) {
    return { ok: false, sessionId, error: "Session introuvable" };
  }
  const parentId = session.formation.driveDossierSessionsId;
  if (!parentId) {
    return {
      ok: false,
      sessionId,
      error:
        "Formation sans « Dossier parent des sessions » configuré (page formation → onglet Google Drive)",
    };
  }

  try {
    // 1. Dossier racine de la session.
    // findOrCreateFolder est idempotent : si un dossier de même nom existe
    // déjà dans le parent (cas où driveFolderId a été perdu en BDD mais que
    // le dossier physique existe), on le réutilise.
    let sessionFolderId = session.driveFolderId;
    let createdRoot = false;
    if (!sessionFolderId) {
      const root = await findOrCreateFolder(parentId, session.code);
      sessionFolderId = root.id;
      createdRoot = true;
      await prisma.session.update({
        where: { id: sessionId },
        data: { driveFolderId: sessionFolderId },
      });
    }

    // 2. Sous-dossiers Qualiopi.
    // On fait un find puis create si absent (au lieu de findOrCreateFolder)
    // pour pouvoir reporter à l'appelant lesquels ont été nouvellement créés.
    const created: string[] = [];
    for (const name of QUALIOPI_SESSION_SUBFOLDERS) {
      const existing = await findFolder(sessionFolderId, name);
      if (!existing) {
        await createFolder(sessionFolderId, name);
        created.push(name);
      }
    }

    return {
      ok: true,
      sessionId,
      driveFolderId: sessionFolderId,
      created: createdRoot,
      subfoldersCreated: created,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.warn(`[drive-provisioning] échec sessionId=${sessionId}:`, message);
    return { ok: false, sessionId, error: message };
  }
}
