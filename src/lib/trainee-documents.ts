// Génération de documents administratifs par stagiaire à partir des
// templates Google Docs configurés au niveau de la formation.
//
// Workflow :
//   1. Charge le stagiaire + sa session + sa formation + son formateur
//   2. Récupère l'ID du template Drive correspondant au type demandé
//      (convention | contrat | convocation)
//   3. Copie le template dans 01_INSCRIPTIONS_CONVENTIONS/<Stagiaire>/ sur
//      le Drive de la session (provisionne le dossier session si besoin)
//   4. Lance un batchUpdate Docs pour substituer les variables `{{XXX}}`
//   5. Insère une ligne TraineeDocument pour traçabilité
//
// La liste des variables disponibles est exportée pour pouvoir l'afficher
// côté admin (page de configuration de la formation) — voir DOCUMENT_VARIABLES.

import { getDriveAttachments, getDriveDefaultTemplates } from "./appConfig";
import prisma from "./db";
import { provisionSessionDriveFolder } from "./drive-provisioning";
import { replaceTextInDoc } from "./google-docs";
import {
  copyDriveFile,
  downloadDriveFile,
  exportDriveDocAsPdf,
  findOrCreateFolder,
  isDriveConfigured,
  uploadFile,
} from "./google-drive";
import { sendContractToStagiaire, sendConvocationToStagiaire } from "./mailer";
import { recordTraineeEvent } from "./trainee";

const INSCRIPTIONS_FOLDER_NAME = "01_INSCRIPTIONS_CONVENTIONS";

export type DocumentType = "convention" | "contrat" | "convocation";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  convention: "Convention de formation",
  contrat: "Contrat de formation",
  convocation: "Convocation",
};

/**
 * Catalogue des variables que les templates peuvent utiliser. La syntaxe
 * dans les templates Google Docs est `{{NOM_VARIABLE}}` (double accolades).
 * Affiché côté admin pour aider à préparer les templates.
 */
export const DOCUMENT_VARIABLES: { key: string; description: string; example: string }[] = [
  // Stagiaire
  { key: "PRENOM", description: "Prénom du stagiaire", example: "Marie" },
  { key: "NOM", description: "Nom du stagiaire", example: "Dupont" },
  { key: "NOM_COMPLET", description: "Prénom + Nom", example: "Marie Dupont" },
  { key: "EMAIL", description: "Email du stagiaire", example: "marie.dupont@example.com" },
  { key: "TELEPHONE", description: "Téléphone du stagiaire", example: "06 12 34 56 78" },
  { key: "ADRESSE", description: "Adresse postale (particulier) ou siège (entreprise)", example: "12 rue des Lilas, 33000 Bordeaux" },
  { key: "STATUT", description: "Statut actuel (intermittent, salarié, DE...)", example: "Intermittent du spectacle" },
  // Entreprise
  { key: "SOCIETE", description: "Raison sociale (vide si particulier)", example: "ACME Films" },
  { key: "SIRET", description: "SIRET de la société", example: "12345678900012" },
  { key: "ADRESSE_SIEGE", description: "Adresse du siège social", example: "10 av. de la République, 75011 Paris" },
  { key: "CONTACT_ADMIN", description: "Référent admin si différent du stagiaire", example: "Jean Martin (jean@acme.fr)" },
  { key: "DOMAINE_ACTIVITE", description: "Domaine d'activité de la société", example: "Production audiovisuelle" },
  // Formation
  { key: "FORMATION", description: "Libellé long de la formation", example: "Perfectionnement vMix — 1 jour" },
  { key: "FORMATION_CODE", description: "Code interne de la formation", example: "vMix-1J" },
  { key: "FORMATION_DUREE_JOURS", description: "Durée en jours", example: "1" },
  { key: "FORMATION_DUREE_HEURES", description: "Durée en heures (= jours × 7)", example: "7" },
  { key: "FORMATION_PRIX_HT", description: "Prix HT catalogue (€)", example: "850" },
  { key: "PRIX_HT", description: "Montant HT facturé : MONTANT_HT si défini, sinon FORMATION_PRIX_HT", example: "850" },
  { key: "PRIX_TTC", description: "Idem PRIX_HT × 1.2 (TVA 20%). À adapter si OF en franchise.", example: "1020" },
  { key: "FORMATION_DESCRIPTION", description: "Description de la formation", example: "Objectifs : maîtriser..." },
  // Session
  { key: "SESSION_CODE", description: "Code de la session", example: "vMix-2026-05" },
  { key: "SESSION_DATE_DEBUT", description: "Date de début (jour mois année)", example: "12 mai 2026" },
  { key: "SESSION_DATE_FIN", description: "Date de fin", example: "12 mai 2026" },
  { key: "SESSION_DATES", description: "Période formatée (intelligent selon durée)", example: "12 – 14 mai 2026" },
  { key: "SESSION_LIEU", description: "Lieu de la session", example: "Marmande (47)" },
  { key: "SESSION_HORAIRES", description: "Horaires", example: "9h – 17h30" },
  { key: "SESSION_CAPACITE", description: "Effectif maximum de la session (configurable côté session)", example: "8" },
  // Formateur
  { key: "FORMATEUR_NOM", description: "Prénom + Nom du formateur", example: "Paul Martin" },
  { key: "FORMATEUR_EMAIL", description: "Email du formateur", example: "paul@example.com" },
  // Financement
  { key: "MODE_FINANCEMENT", description: "Mode de financement", example: "AFDAS" },
  { key: "OPCO", description: "OPCO détecté", example: "AFDAS" },
  { key: "ID_OPCO", description: "N° de dossier OPCO", example: "DOSS-2026-12345" },
  { key: "MONTANT_HT", description: "Montant HT négocié (€)", example: "850" },
  // PSH
  { key: "PSH", description: "« Oui » si PSH, vide sinon", example: "Oui" },
  { key: "BESOINS_ADAPTATION", description: "Besoins d'adaptation PSH", example: "Pause toutes les 45 min" },
  // Divers
  { key: "DATE_AUJOURDHUI", description: "Date du jour de génération", example: "19 mai 2026" },
  { key: "ORGANISME", description: "Nom de l'organisme (LADS)", example: "Les Ateliers du Stream" },
];

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtSessionDates(start: Date | string, end: Date | string | null): string {
  if (!end) return fmtDate(start);
  const s = new Date(start);
  const e = new Date(end);
  const sameDay =
    s.getUTCFullYear() === e.getUTCFullYear() &&
    s.getUTCMonth() === e.getUTCMonth() &&
    s.getUTCDate() === e.getUTCDate();
  if (sameDay) return fmtDate(s);
  const sameMY = s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth();
  if (sameMY) {
    const startDay = s.toLocaleDateString("fr-FR", { day: "numeric", timeZone: "UTC" });
    return `${startDay} – ${fmtDate(e)}`;
  }
  return `${fmtDate(s)} – ${fmtDate(e)}`;
}

export interface GenerateDocumentResult {
  ok: true;
  documentId: string;
  driveFileId: string;
  driveWebUrl: string | null;
  fileName: string;
}
export type GenerateDocumentError = { ok: false; error: string };

/**
 * Résout l'ID du template à utiliser pour un type donné depuis la
 * configuration globale (AppConfig). Les colonnes
 * formation.driveTemplate*Id sont conservées pour rétrocompat mais ne sont
 * plus consultées : tous les templates sont gérés globalement dans
 * /admin/formations/drive-config.
 */
async function resolveTemplateId(type: DocumentType): Promise<string | null> {
  const defaults = await getDriveDefaultTemplates();
  return defaults[type] ?? null;
}

/**
 * Génère un document administratif (convention | contrat | convocation) pour
 * un stagiaire en copiant le template Drive de la formation puis en
 * remplaçant les variables `{{XXX}}` par les valeurs réelles. Le fichier
 * résultant est rangé dans 01_INSCRIPTIONS_CONVENTIONS/<Stagiaire>/ du
 * dossier Drive de la session, et tracé en BDD via TraineeDocument.
 */
export async function generateTraineeDocument(
  traineeId: string,
  type: DocumentType
): Promise<GenerateDocumentResult | GenerateDocumentError> {
  if (!isDriveConfigured()) {
    return { ok: false, error: "Drive non configuré (GOOGLE_SERVICE_ACCOUNT_KEY_B64 absent)" };
  }

  const trainee = await prisma.trainee.findUnique({
    where: { id: traineeId },
    include: {
      session: { include: { formation: true, trainer: true } },
    },
  });
  if (!trainee) return { ok: false, error: "Stagiaire introuvable" };

  const formation = trainee.session.formation;
  const templateId = await resolveTemplateId(type);
  if (!templateId) {
    return {
      ok: false,
      error: `Pas de template ${DOCUMENT_TYPE_LABELS[type]} configuré. À renseigner dans /admin/formations/drive-config.`,
    };
  }

  // Provisionne le dossier Drive de la session si besoin
  const provision = await provisionSessionDriveFolder(trainee.session.id);
  if (!provision.ok) {
    return { ok: false, error: `Dossier Drive session : ${provision.error}` };
  }
  const sessionFolderId = provision.driveFolderId;

  try {
    // Sous-dossier 01_INSCRIPTIONS_CONVENTIONS / <Prénom Nom>
    const inscFolder = await findOrCreateFolder(sessionFolderId, INSCRIPTIONS_FOLDER_NAME);
    const fullName = `${trainee.prenom} ${trainee.nom}`.trim();
    const traineeFolder = await findOrCreateFolder(inscFolder.id, fullName);

    // Construit le nom de fichier final
    const typeLabel = DOCUMENT_TYPE_LABELS[type];
    const safeFormation = formation.code || "formation";
    const fileName = `${typeLabel} — ${fullName} — ${safeFormation}`;

    // 1. Copie du template vers le dossier stagiaire
    const copy = await copyDriveFile({
      sourceFileId: templateId,
      parentFolderId: traineeFolder.id,
      newName: fileName,
    });

    // 2. Substitution des variables via Docs API
    const variables = buildVariablesForTrainee(trainee);
    await replaceTextInDoc(copy.id, variables);

    // 3. Enregistrement BDD
    const doc = await prisma.traineeDocument.create({
      data: {
        traineeId,
        type,
        driveFileId: copy.id,
        driveFileUrl: copy.webViewLink ?? "",
        fileName,
      },
    });

    return {
      ok: true,
      documentId: doc.id,
      driveFileId: copy.id,
      driveWebUrl: copy.webViewLink ?? null,
      fileName,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Erreur inconnue";
    console.warn(`[trainee-documents] génération échouée ${type} traineeId=${traineeId}:`, error);
    return { ok: false, error };
  }
}

type TraineeWithRelations = Awaited<ReturnType<typeof prisma.trainee.findUnique>>;

function buildVariablesForTrainee(
  t: NonNullable<TraineeWithRelations> & {
    session: { formation: { code: string; nomLong: string; dureeJours: number; prixHT: number; description: string }; trainer: { prenom: string; nom: string; email: string } | null; code: string; dateDebut: Date; dateFin: Date; lieu: string; horaires: string; capacite: number };
  }
): Record<string, string> {
  const formation = t.session.formation;
  const session = t.session;
  const trainer = session.trainer;

  // Adresse selon type d'inscription (particulier vs entreprise)
  const adresse = t.inscriptionType === "entreprise" ? t.adresseSiege : t.adressePostale;

  // Prix facturé : montant négocié (per-stagiaire) si renseigné, sinon prix catalogue
  const prixHtFacture = t.montantHT && t.montantHT > 0 ? t.montantHT : formation.prixHT;
  // TVA 20% par défaut (l'OF peut être en franchise — ajuster le template si besoin)
  const prixTtcFacture = Math.round(prixHtFacture * 1.2 * 100) / 100;

  return {
    // Stagiaire
    PRENOM: t.prenom,
    NOM: t.nom,
    NOM_COMPLET: `${t.prenom} ${t.nom}`,
    EMAIL: t.email,
    TELEPHONE: t.telephone,
    ADRESSE: adresse || "",
    STATUT: t.statutActuel || "",
    // Entreprise
    SOCIETE: t.raisonSociale || "",
    SIRET: t.siret || "",
    ADRESSE_SIEGE: t.adresseSiege || "",
    CONTACT_ADMIN: t.contactAdmin || "",
    DOMAINE_ACTIVITE: t.domaineActivite || "",
    // Formation
    FORMATION: formation.nomLong,
    FORMATION_CODE: formation.code,
    FORMATION_DUREE_JOURS: String(formation.dureeJours),
    FORMATION_DUREE_HEURES: String(formation.dureeJours * 7),
    FORMATION_PRIX_HT: String(formation.prixHT),
    PRIX_HT: String(prixHtFacture),
    PRIX_TTC: String(prixTtcFacture),
    FORMATION_DESCRIPTION: formation.description || "",
    // Session
    SESSION_CODE: session.code,
    SESSION_DATE_DEBUT: fmtDate(session.dateDebut),
    SESSION_DATE_FIN: fmtDate(session.dateFin),
    SESSION_DATES: fmtSessionDates(session.dateDebut, session.dateFin),
    SESSION_LIEU: session.lieu || "",
    SESSION_HORAIRES: session.horaires || "",
    SESSION_CAPACITE: String(session.capacite),
    // Formateur
    FORMATEUR_NOM: trainer ? `${trainer.prenom} ${trainer.nom}` : "",
    FORMATEUR_EMAIL: trainer?.email || "",
    // Financement
    MODE_FINANCEMENT: t.modeFinancement || "",
    OPCO: t.opcoDetecte || "",
    ID_OPCO: t.idOpco || "",
    MONTANT_HT: t.montantHT ? String(t.montantHT) : "",
    // PSH
    PSH: t.psh ? "Oui" : "",
    BESOINS_ADAPTATION: t.besoinsAdaptation || "",
    // Divers
    DATE_AUJOURDHUI: fmtDate(new Date()),
    ORGANISME: "Les Ateliers du Stream",
  };
}

// =========================================================================
// Archivage d'un fichier arbitraire dans le dossier Drive d'un stagiaire
// =========================================================================

export interface ArchiveTraineeFileInput {
  traineeId: string;
  type: string;              // ex: "devis" | "convention_signed" | "contrat_signed" | ...
  filename: string;          // nom du fichier tel qu'affiché sur Drive
  buffer: Buffer;
  mimeType: string;          // ex: "application/pdf"
}

export type ArchiveResult =
  | { ok: true; documentId: string; driveFileId: string; driveFileUrl: string | null }
  | { ok: false; error: string };

/**
 * Archive un fichier dans le dossier Drive du stagiaire :
 *   <Session>/01_INSCRIPTIONS_CONVENTIONS/<Prénom Nom>/<filename>
 *
 * Provisionne le dossier de session + le sous-dossier stagiaire si besoin,
 * upload le PDF (ou autre), et trace l'opération dans TraineeDocument (avec
 * le `type` fourni — pas d'enum, utiliser une convention texte cohérente).
 *
 * Best-effort : aucune exception propagée. Retourne un résultat structuré.
 */
export async function archiveTraineeFile(input: ArchiveTraineeFileInput): Promise<ArchiveResult> {
  if (!isDriveConfigured()) {
    return { ok: false, error: "Drive non configuré (GOOGLE_SERVICE_ACCOUNT_KEY_B64 absent)" };
  }

  const trainee = await prisma.trainee.findUnique({
    where: { id: input.traineeId },
    select: { id: true, prenom: true, nom: true, sessionId: true },
  });
  if (!trainee) return { ok: false, error: "Stagiaire introuvable" };

  try {
    const provision = await provisionSessionDriveFolder(trainee.sessionId);
    if (!provision.ok) {
      return { ok: false, error: `Dossier Drive session : ${provision.error}` };
    }
    const sessionFolderId = provision.driveFolderId;

    const inscFolder = await findOrCreateFolder(sessionFolderId, INSCRIPTIONS_FOLDER_NAME);
    const fullName = `${trainee.prenom} ${trainee.nom}`.trim();
    const traineeFolder = await findOrCreateFolder(inscFolder.id, fullName);

    const driveFile = await uploadFile({
      parentId: traineeFolder.id,
      filename: input.filename,
      mimeType: input.mimeType,
      buffer: input.buffer,
    });

    const doc = await prisma.traineeDocument.create({
      data: {
        traineeId: input.traineeId,
        type: input.type,
        driveFileId: driveFile.id,
        driveFileUrl: driveFile.webViewLink ?? "",
        fileName: input.filename,
      },
    });

    return {
      ok: true,
      documentId: doc.id,
      driveFileId: driveFile.id,
      driveFileUrl: driveFile.webViewLink ?? null,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Erreur inconnue";
    console.warn(`[archiveTraineeFile] échec ${input.type} traineeId=${input.traineeId}:`, error);
    return { ok: false, error };
  }
}

// =========================================================================
// Orchestration : génère la convention/contrat + envoie mail avec CGV + RI
// =========================================================================

export type GenerateAndMailResult =
  | { ok: true; documentType: DocumentType; driveFileId: string; driveWebUrl: string | null; emailSent: boolean; emailError: string | null }
  | { ok: false; error: string };

/**
 * Workflow : à la signature du devis, on déclenche :
 *   1. Génération de la convention (entreprise) ou du contrat (particulier)
 *   2. Export en PDF du Google Doc généré
 *   3. Téléchargement des CGV et RI depuis Drive (selon IDs configurés)
 *   4. Envoi du mail au stagiaire avec les 3 PJ
 *
 * Best-effort sur chaque étape : si CGV ou RI manquent, le mail part quand
 * même avec ce qu'on a. Si la génération échoue, on retourne une erreur.
 *
 * Le type de document est choisi automatiquement selon `trainee.inscriptionType`.
 */
export async function generateAndMailContract(traineeId: string): Promise<GenerateAndMailResult> {
  const trainee = await prisma.trainee.findUnique({
    where: { id: traineeId },
    include: {
      session: { include: { formation: true } },
    },
  });
  if (!trainee) return { ok: false, error: "Stagiaire introuvable" };

  const docType: DocumentType = trainee.inscriptionType === "entreprise" ? "convention" : "contrat";

  // 1. Génère le document via le pipeline standard (copie template + substitue
  //    variables + archive dans Drive + crée TraineeDocument).
  const gen = await generateTraineeDocument(traineeId, docType);
  if (!gen.ok) {
    return { ok: false, error: `Génération ${docType} échouée : ${gen.error}` };
  }

  // 2. Export en PDF du Doc généré
  let contractPdfBuffer: Buffer;
  let contractPdfFilename: string;
  try {
    const exported = await exportDriveDocAsPdf(gen.driveFileId);
    contractPdfBuffer = exported.buffer;
    contractPdfFilename = `${exported.name}.pdf`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    return { ok: false, error: `Export PDF échoué : ${msg}` };
  }

  // 3. Téléchargement CGV + RI (best-effort)
  const attachmentsConfig = await getDriveAttachments();
  let cgvBuffer: Buffer | undefined;
  let cgvFilename: string | undefined;
  let riBuffer: Buffer | undefined;
  let riFilename: string | undefined;
  if (attachmentsConfig.cgv) {
    try {
      const cgv = await downloadDriveFile(attachmentsConfig.cgv);
      cgvBuffer = cgv.buffer;
      cgvFilename = cgv.name.endsWith(".pdf") ? cgv.name : `${cgv.name}.pdf`;
    } catch (err) {
      console.warn("[generateAndMailContract] CGV download échoué:", err);
    }
  }
  if (attachmentsConfig.ri) {
    try {
      const ri = await downloadDriveFile(attachmentsConfig.ri);
      riBuffer = ri.buffer;
      riFilename = ri.name.endsWith(".pdf") ? ri.name : `${ri.name}.pdf`;
    } catch (err) {
      console.warn("[generateAndMailContract] RI download échoué:", err);
    }
  }

  // 4. Envoi du mail
  const mailRes = await sendContractToStagiaire({
    to: trainee.email,
    prenom: trainee.prenom,
    nom: trainee.nom,
    formationNomLong: trainee.session.formation.nomLong,
    sessionDateDebut: trainee.session.dateDebut,
    sessionDateFin: trainee.session.dateFin,
    sessionLieu: trainee.session.lieu,
    documentType: docType,
    contractPdfBuffer,
    contractPdfFilename,
    contractDriveUrl: gen.driveWebUrl || undefined,
    cgvBuffer,
    cgvFilename,
    riBuffer,
    riFilename,
  });

  await recordTraineeEvent(
    traineeId,
    mailRes.success ? "email_sent" : "email_failed",
    mailRes.success
      ? `Mail ${docType} envoyé au stagiaire (${trainee.email}) avec ${[contractPdfFilename, cgvFilename, riFilename].filter(Boolean).length} PJ`
      : `Échec mail ${docType} : ${mailRes.error}`,
    {
      type: docType,
      to: trainee.email,
      messageId: mailRes.messageId,
      attachments: { contract: true, cgv: !!cgvBuffer, ri: !!riBuffer },
    }
  );

  return {
    ok: true,
    documentType: docType,
    driveFileId: gen.driveFileId,
    driveWebUrl: gen.driveWebUrl,
    emailSent: mailRes.success,
    emailError: mailRes.error || null,
  };
}

// =========================================================================
// Convocation : génération + envoi mail au stagiaire (avec RI en PJ)
// =========================================================================

export type GenerateAndMailConvocationResult =
  | { ok: true; driveFileId: string; driveWebUrl: string | null; emailSent: boolean; emailError: string | null }
  | { ok: false; error: string };

/**
 * Workflow J-15 : pour un stagiaire donné, génère la convocation, l'exporte
 * en PDF, télécharge le RI depuis Drive, et envoie un mail au stagiaire.
 * Met aussi à jour `dateConvocation` du trainee si pas déjà fait.
 *
 * Idempotent au niveau "envoi mail" : un statut/champ devrait être posé par
 * l'appelant pour ne pas réenvoyer si déjà fait (voir le cronjob).
 */
export async function generateAndMailConvocation(traineeId: string): Promise<GenerateAndMailConvocationResult> {
  const trainee = await prisma.trainee.findUnique({
    where: { id: traineeId },
    include: { session: { include: { formation: true } } },
  });
  if (!trainee) return { ok: false, error: "Stagiaire introuvable" };

  // 1. Génère la convocation
  const gen = await generateTraineeDocument(traineeId, "convocation");
  if (!gen.ok) {
    return { ok: false, error: `Génération convocation échouée : ${gen.error}` };
  }

  // 2. Export PDF
  let convocPdfBuffer: Buffer;
  let convocPdfFilename: string;
  try {
    const exported = await exportDriveDocAsPdf(gen.driveFileId);
    convocPdfBuffer = exported.buffer;
    convocPdfFilename = `${exported.name}.pdf`;
  } catch (err) {
    return { ok: false, error: `Export PDF convocation échoué : ${err instanceof Error ? err.message : "?"}` };
  }

  // 3. RI (best-effort)
  const attachmentsConfig = await getDriveAttachments();
  let riBuffer: Buffer | undefined;
  let riFilename: string | undefined;
  if (attachmentsConfig.ri) {
    try {
      const ri = await downloadDriveFile(attachmentsConfig.ri);
      riBuffer = ri.buffer;
      riFilename = ri.name.endsWith(".pdf") ? ri.name : `${ri.name}.pdf`;
    } catch (err) {
      console.warn("[generateAndMailConvocation] RI download échoué:", err);
    }
  }

  // 4. Envoi mail
  const mailRes = await sendConvocationToStagiaire({
    to: trainee.email,
    prenom: trainee.prenom,
    nom: trainee.nom,
    formationNomLong: trainee.session.formation.nomLong,
    sessionDateDebut: trainee.session.dateDebut,
    sessionDateFin: trainee.session.dateFin,
    sessionLieu: trainee.session.lieu,
    sessionHoraires: trainee.session.horaires,
    convocationPdfBuffer: convocPdfBuffer,
    convocationPdfFilename: convocPdfFilename,
    riBuffer,
    riFilename,
  });

  // 5. Update trainee.dateConvocation
  if (mailRes.success && !trainee.dateConvocation) {
    await prisma.trainee.update({
      where: { id: traineeId },
      data: { dateConvocation: new Date() },
    });
  }

  await recordTraineeEvent(
    traineeId,
    mailRes.success ? "email_sent" : "email_failed",
    mailRes.success
      ? `Convocation envoyée au stagiaire (${trainee.email})${riBuffer ? " + RI" : ""}`
      : `Échec mail convocation : ${mailRes.error}`,
    { type: "convocation", to: trainee.email, messageId: mailRes.messageId, ri: !!riBuffer }
  );

  return {
    ok: true,
    driveFileId: gen.driveFileId,
    driveWebUrl: gen.driveWebUrl,
    emailSent: mailRes.success,
    emailError: mailRes.error || null,
  };
}
