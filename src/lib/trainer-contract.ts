// ============================================================================
// Génération du contrat de sous-traitance d'un formateur externe.
//
// Pour un Trainer.isExternal = true assigné à une Session, on :
//   1. Copie le template Doc "Contrat sous-traitance" (clé AppConfig
//      drive.default_templates.externalTrainerContract) dans le dossier
//      Drive de la session, sous-dossier "07_SOUS-TRAITANCE".
//   2. Substitue les variables (formateur + session + montant HT).
//   3. Exporte en PDF.
//   4. Enregistre l'ID du Doc + la date d'envoi sur la Session
//      (trainer_contract_drive_file_id, trainer_contract_sent_at).
//
// L'appelant (session.ts → notifyTrainerOfSessionAssignment) joint ensuite
// le PDF au mail "session assignée".
//
// Best-effort : si Drive n'est pas configuré, ou si le template n'a pas
// été défini dans /admin/formations/parametres-communs/drive, on skip
// silencieusement (le mail est quand même envoyé sans PJ).
// ============================================================================

import prisma from "./db";
import { getDriveDefaultTemplates } from "./appConfig";
import {
  copyDriveFile,
  exportDriveDocAsPdf,
  findOrCreateFolder,
  isDriveConfigured,
  trashFile,
} from "./google-drive";
import { replaceTextInDoc } from "./google-docs";
import { provisionSessionDriveFolder } from "./drive-provisioning";

const SOUS_TRAITANCE_FOLDER_NAME = "07_SOUS-TRAITANCE";

export interface TrainerContractResult {
  ok: boolean;
  pdfBuffer?: Buffer;
  pdfFilename?: string;
  driveFileId?: string;
  driveWebUrl?: string | null;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
}

/**
 * Génère le contrat de sous-traitance d'un formateur externe pour une
 * session donnée, puis retourne le PDF (à joindre au mail d'assignation)
 * et persiste l'ID du fichier Drive sur la session.
 *
 * Retourne `skipped: true` (avec skipReason) si :
 *   - Drive n'est pas configuré → on continue sans PJ
 *   - Le formateur n'est pas externe (isExternal=false)
 *   - Aucun template n'a été configuré pour le contrat formateur externe
 *   - Le montant HT est absent ou ≤ 0 (saisi à l'assignation)
 *
 * `opts.persist` (défaut true) : trace l'ID du Doc + la date d'envoi sur la
 * Session (garde-fou "déjà envoyé"). En mode prévisualisation/test on passe
 * `persist: false` : aucune écriture BDD et le Doc Drive généré est mis à la
 * corbeille juste après l'export PDF (pas de fichier orphelin, état intact).
 */
export async function generateExternalTrainerContract(
  sessionId: string,
  trainerFeeAmount: number,
  opts: { persist?: boolean } = {}
): Promise<TrainerContractResult> {
  const persist = opts.persist !== false;
  if (!isDriveConfigured()) {
    return { ok: true, skipped: true, skipReason: "Drive non configuré" };
  }

  if (!trainerFeeAmount || trainerFeeAmount <= 0) {
    return { ok: true, skipped: true, skipReason: "Montant HT non saisi" };
  }

  const session = await loadSessionWithRelations(sessionId);
  if (!session) {
    return { ok: false, error: "Session introuvable" };
  }
  if (!session.trainer) {
    return { ok: true, skipped: true, skipReason: "Aucun formateur assigné" };
  }
  if (!session.trainer.isExternal) {
    return { ok: true, skipped: true, skipReason: "Formateur interne (pas de contrat de sous-traitance)" };
  }

  const templates = await getDriveDefaultTemplates();
  const templateId = templates.externalTrainerContract;
  if (!templateId) {
    return {
      ok: true,
      skipped: true,
      skipReason: "Template contrat sous-traitance non configuré (Paramètres communs > Drive)",
    };
  }

  // 1. Provisionne le dossier Drive de la session
  const provision = await provisionSessionDriveFolder(sessionId);
  if (!provision.ok) {
    return {
      ok: false,
      error: `Impossible de provisionner le dossier Drive : ${provision.error}`,
    };
  }
  const sessionFolderId = provision.driveFolderId;

  try {
    // 2. Sous-dossier 07_SOUS-TRAITANCE
    const sousTraitanceFolder = await findOrCreateFolder(sessionFolderId, SOUS_TRAITANCE_FOLDER_NAME);

    // 3. Nom de fichier final
    const trainerFullName = `${session.trainer.prenom} ${session.trainer.nom}`.trim();
    const fileName = `Contrat sous-traitance — ${trainerFullName} — ${session.formation.code}`;

    // 4. Copie du template
    const copy = await copyDriveFile({
      sourceFileId: templateId,
      parentFolderId: sousTraitanceFolder.id,
      newName: fileName,
    });

    // 5. Substitution des variables
    const variables = buildVariables(session, session.trainer, trainerFeeAmount);
    await replaceTextInDoc(copy.id, variables);

    // 6. Export PDF
    const pdf = await exportDriveDocAsPdf(copy.id);

    // 7. Persistance (ID + date d'envoi) — sauf en mode prévisualisation.
    if (persist) {
      await prisma.session.update({
        where: { id: sessionId },
        data: {
          trainerFeeAmount,
          trainerContractDriveFileId: copy.id,
          trainerContractSentAt: new Date(),
        },
      });
    } else {
      // Prévisualisation : on ne garde pas le Doc généré dans le Drive de la
      // session (il n'est pas tracé en BDD → éviter un fichier orphelin).
      await trashFile(copy.id).catch((e) =>
        console.warn(`[trainer-contract] échec corbeille preview doc ${copy.id}:`, e)
      );
    }

    return {
      ok: true,
      pdfBuffer: pdf.buffer,
      pdfFilename: pdf.name,
      driveFileId: persist ? copy.id : undefined,
      driveWebUrl: persist ? copy.webViewLink ?? null : null,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Erreur inconnue";
    console.warn(`[trainer-contract] échec sessionId=${sessionId}:`, error);
    return { ok: false, error };
  }
}

// ============================================================================
// Variables du template
// ============================================================================

// Helper local pour typer le retour de findUnique avec ses includes — on
// repasse par le shape Prisma plutôt que de déclarer un type complet à la main.
type SessionWithTrainerAndFormation = Awaited<
  ReturnType<typeof loadSessionWithRelations>
>;

async function loadSessionWithRelations(sessionId: string) {
  return prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      formation: { select: { code: true, nomLong: true, dureeJours: true } },
      trainer: true,
    },
  });
}

type SessionFull = NonNullable<SessionWithTrainerAndFormation>;
type TrainerFull = NonNullable<SessionFull["trainer"]>;

function buildVariables(
  session: SessionFull,
  trainer: TrainerFull,
  montantHt: number
): Record<string, string> {
  const formation = session.formation;
  // 1 jour = 7 heures (cohérent avec les conventions stagiaires)
  const dureeHeures = formation.dureeJours * 7;

  const trainerRaisonSociale =
    trainer.raisonSociale || `${trainer.prenom} ${trainer.nom}`.trim();
  const trainerRepresentant =
    trainer.representantLegal || `${trainer.prenom} ${trainer.nom}`.trim();

  // Formatage FR du montant : "1 250,00 €" — on formate sans le symbole car le
  // template a déjà "{{MONTANT_HT}} € HT".
  const montantFmt = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(montantHt);

  return {
    // Formateur (sous-traitant)
    FORMATEUR_PRENOM: trainer.prenom,
    FORMATEUR_NOM: trainer.nom,
    FORMATEUR_EMAIL: trainer.email,
    FORMATEUR_TELEPHONE: trainer.telephone || "—",
    FORMATEUR_RAISON_SOCIALE: trainerRaisonSociale,
    FORMATEUR_SIRET: trainer.siret || "—",
    FORMATEUR_ADRESSE: trainer.adresse || "—",
    FORMATEUR_NDA: trainer.numeroDa || "Non applicable (le sous-traitant n'est pas OF déclaré)",
    FORMATEUR_REPRESENTANT: trainerRepresentant,

    // Formation
    FORMATION_TITRE: formation.nomLong,
    FORMATION_DUREE_JOURS: String(formation.dureeJours),
    FORMATION_DUREE_HEURES: String(dureeHeures),

    // Session
    SESSION_CODE: session.code,
    SESSION_DATE_DEBUT: fmtDate(session.dateDebut),
    SESSION_DATE_FIN: fmtDate(session.dateFin),
    SESSION_LIEU: session.lieu || "Lieu à préciser",
    SESSION_HORAIRES: session.horaires || "Horaires à préciser",
    SESSION_CAPACITE: String(session.capacite),

    // Rémunération
    MONTANT_HT: montantFmt,

    // Divers
    DATE_AUJOURDHUI: fmtDate(new Date()),
  };
}

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
