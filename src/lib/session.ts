import prisma from "./db";
import { provisionSessionDriveFolder } from "./drive-provisioning";
import { sendTrainerSessionAssignment, sendTrainerContractEmail } from "./mailer";

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
  trainerIsExternal: boolean;                // Permet à l'UI de demander un montant si externe
  trainerFeeAmount: number | null;
  trainerContractDriveFileId: string | null;
  trainerContractSentAt: Date | null;
  trainerAssignmentMailSentAt: Date | null;
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
  trainerFeeAmount?: number | null;
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
  trainerFeeAmount?: number | null;
  trainerAssignmentMailSentAt?: Date | null;
  notes?: string;
}

/**
 * Notifie par mail le formateur qu'on vient de lui assigner une session
 * ("Nouvelle session assignée"). Best-effort : ne fait pas échouer l'opération
 * si le mail plante. Skip si le trainer n'existe pas, est inactif, ou n'a pas
 * d'email.
 *
 * NB : ce mail ne contient PAS le contrat de sous-traitance. Le contrat est
 * découplé et envoyé séparément (cf. generateAndSendTrainerContract /
 * maybeSendTrainerContractOnThreshold) une fois la formation confirmée.
 */
export async function notifyTrainerOfSessionAssignment(
  sessionId: string,
  trainerId: string
): Promise<{ ok: boolean; emailSent?: boolean; error?: string }> {
  try {
    const trainer = await prisma.trainer.findUnique({
      where: { id: trainerId },
      select: { id: true, prenom: true, email: true, magicToken: true, active: true },
    });
    if (!trainer || !trainer.active || !trainer.email) {
      return { ok: true, emailSent: false, error: "Formateur introuvable, inactif ou sans email" };
    }
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        code: true,
        dateDebut: true,
        dateFin: true,
        lieu: true,
        horaires: true,
        capacite: true,
        formation: { select: { nomLong: true } },
      },
    });
    if (!session) return { ok: false, error: "Session introuvable" };

    const base = process.env.PUBLIC_BASE_URL || "https://evaremote.com";
    const sessionUrl = `${base}/formateur/sessions/${session.id}?token=${encodeURIComponent(trainer.magicToken)}`;

    const res = await sendTrainerSessionAssignment({
      to: trainer.email,
      prenom: trainer.prenom,
      formationNomLong: session.formation.nomLong,
      sessionCode: session.code,
      sessionDateDebut: session.dateDebut,
      sessionDateFin: session.dateFin,
      sessionLieu: session.lieu,
      sessionHoraires: session.horaires,
      sessionCapacite: session.capacite,
      sessionUrl,
    });
    return { ok: true, emailSent: res.success, error: res.error };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    console.warn(`[notifyTrainerOfSessionAssignment] échec sessionId=${sessionId} trainerId=${trainerId}:`, msg);
    return { ok: false, error: msg };
  }
}

/**
 * Génère le contrat de sous-traitance (PDF) du formateur externe assigné à la
 * session et l'envoie par mail dédié. Best-effort. `amountOverride` permet de
 * forcer un montant (sinon on prend celui persisté sur la session).
 *
 * `generateExternalTrainerContract` persiste trainerContractSentAt : il sert
 * de garde-fou "déjà envoyé" pour l'envoi automatique au seuil.
 */
export async function generateAndSendTrainerContract(
  sessionId: string,
  amountOverride?: number
): Promise<{
  ok: boolean;
  emailSent?: boolean;
  contractGenerated?: boolean;
  contractSkipReason?: string;
  error?: string;
}> {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        code: true,
        dateDebut: true,
        dateFin: true,
        trainerFeeAmount: true,
        trainerId: true,
        trainer: { select: { prenom: true, email: true, magicToken: true, active: true, isExternal: true } },
        formation: { select: { nomLong: true } },
      },
    });
    if (!session || !session.trainerId || !session.trainer) {
      return { ok: false, error: "Aucun formateur assigné à cette session" };
    }
    if (!session.trainer.isExternal) {
      return { ok: false, error: "Le formateur assigné n'est pas externe" };
    }
    if (!session.trainer.active || !session.trainer.email) {
      return { ok: true, emailSent: false, error: "Formateur inactif ou sans email" };
    }
    const amount = amountOverride ?? session.trainerFeeAmount ?? 0;
    if (!amount || amount <= 0) {
      return { ok: false, error: "Montant HT manquant ou nul" };
    }

    const { generateExternalTrainerContract } = await import("./trainer-contract");
    const contract = await generateExternalTrainerContract(sessionId, amount);
    if (!contract.ok) {
      return { ok: false, error: contract.error };
    }
    if (contract.skipped || !contract.pdfBuffer || !contract.pdfFilename) {
      return { ok: true, contractGenerated: false, contractSkipReason: contract.skipReason };
    }

    const base = process.env.PUBLIC_BASE_URL || "https://evaremote.com";
    const sessionUrl = `${base}/formateur/sessions/${session.id}?token=${encodeURIComponent(session.trainer.magicToken)}`;

    const res = await sendTrainerContractEmail({
      to: session.trainer.email,
      prenom: session.trainer.prenom,
      formationNomLong: session.formation.nomLong,
      sessionCode: session.code,
      sessionDateDebut: session.dateDebut,
      sessionDateFin: session.dateFin,
      montantHt: amount,
      contractPdfBuffer: contract.pdfBuffer,
      contractPdfFilename: contract.pdfFilename,
      sessionUrl,
    });
    return { ok: true, emailSent: res.success, error: res.error, contractGenerated: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    console.warn(`[generateAndSendTrainerContract] échec sessionId=${sessionId}:`, msg);
    return { ok: false, error: msg };
  }
}

/**
 * Envoie automatiquement le contrat de sous-traitance si la session a atteint
 * le seuil d'inscrits (Formation.minInscrits) confirmant que la formation aura
 * lieu. Best-effort, appelé après chaque inscription. Conditions :
 *   - formateur externe assigné + montant HT saisi ;
 *   - seuil configuré (> 0) ;
 *   - nb d'inscrits non "abandonne" >= seuil ;
 *   - contrat pas déjà envoyé (trainerContractSentAt null).
 */
export async function maybeSendTrainerContractOnThreshold(sessionId: string): Promise<void> {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        trainerId: true,
        trainerFeeAmount: true,
        trainerContractSentAt: true,
        trainer: { select: { isExternal: true } },
        formation: { select: { minInscrits: true } },
      },
    });
    if (!session || !session.trainerId || !session.trainer?.isExternal) return;
    if (session.trainerContractSentAt) return; // déjà envoyé
    if (!session.trainerFeeAmount || session.trainerFeeAmount <= 0) return; // montant non saisi
    const threshold = session.formation.minInscrits;
    if (!threshold || threshold <= 0) return; // seuil désactivé

    const activeCount = await prisma.trainee.count({
      where: { sessionId, status: { not: "abandonne" }, isTest: false },
    });
    if (activeCount < threshold) return;

    await generateAndSendTrainerContract(sessionId, session.trainerFeeAmount);
  } catch (err) {
    console.warn(`[maybeSendTrainerContractOnThreshold] sessionId=${sessionId}:`, err);
  }
}

/**
 * Issue d'une tentative de notification du formateur, telle que remontée à
 * l'admin après création / mise à jour de session.
 */
export type TrainerNotifyOutcome =
  | { status: "sent"; emailSent?: boolean; error?: string }
  | { status: "deferred" } // formateur assigné mais session pas encore "open"
  | { status: "already_sent" };

/**
 * Envoie le mail d'assignation au formateur UNIQUEMENT si toutes ces
 * conditions sont réunies :
 *   - un formateur est assigné à la session ;
 *   - la session est "open" (ouverte aux inscriptions) ;
 *   - le mail n'a pas déjà été envoyé (garde-fou trainerAssignmentMailSentAt).
 *
 * À appeler après création / mise à jour de session et après tout passage de
 * statut. Idempotent : marque trainerAssignmentMailSentAt au premier envoi
 * réussi pour ne jamais doublonner. Retourne null si aucun formateur n'est
 * assigné (rien à signaler).
 */
export async function notifyTrainerIfSessionOpen(
  sessionId: string
): Promise<TrainerNotifyOutcome | null> {
  const s = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
      trainerId: true,
      trainerAssignmentMailSentAt: true,
    },
  });
  if (!s || !s.trainerId) return null;
  if (s.trainerAssignmentMailSentAt) return { status: "already_sent" };
  if (s.status !== "open") return { status: "deferred" };

  const res = await notifyTrainerOfSessionAssignment(s.id, s.trainerId);
  // On marque "notifié" dès que le flux a abouti (mail envoyé, ou skip propre
  // type formateur sans email) pour ne pas re-tenter à chaque édition. Un
  // échec dur (res.ok = false) laisse le flag null → re-tentable.
  if (res.ok) {
    await prisma.session.update({
      where: { id: s.id },
      data: { trainerAssignmentMailSentAt: new Date() },
    });
  }
  return { status: "sent", emailSent: res.emailSent, error: res.error };
}

/**
 * Re-synchronise le statut d'une session selon son taux de remplissage :
 *   - "open" + count >= capacite → "full"
 *   - "full" + count < capacite  → "open" (place libérée, on rouvre)
 *
 * À appeler après toute modification du roster (création/suppression de
 * Trainee). Best-effort : silencieux si la session n'existe pas ou si on
 * ne touche à aucune des 2 transitions concernées.
 *
 * Le compte utilisé est le nombre TOTAL de Trainee liés à la session
 * (incluant les "abandonne") pour rester cohérent avec le check de
 * capacité déjà appliqué côté inscription publique.
 */
export async function syncSessionStatusOnRosterChange(sessionId: string): Promise<{
  from: string;
  to: string;
} | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
      capacite: true,
      _count: { select: { trainees: true } },
    },
  });
  if (!session) return null;
  const count = session._count.trainees;

  if (session.status === "open" && count >= session.capacite) {
    await prisma.session.update({ where: { id: sessionId }, data: { status: "full" } });
    return { from: "open", to: "full" };
  }
  if (session.status === "full" && count < session.capacite) {
    await prisma.session.update({ where: { id: sessionId }, data: { status: "open" } });
    return { from: "full", to: "open" };
  }
  return null;
}

export async function getAllSessions(): Promise<SessionInfo[]> {
  const list = await prisma.session.findMany({
    include: {
      formation: { select: { code: true, nomLong: true } },
      trainer: { select: { id: true, prenom: true, nom: true, isExternal: true } },
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
      trainer: { select: { id: true, prenom: true, nom: true, isExternal: true } },
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
      trainer: { select: { id: true, prenom: true, nom: true, isExternal: true } },
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
      trainerFeeAmount: input.trainerFeeAmount ?? null,
      notes: input.notes ?? "",
    },
    include: {
      formation: { select: { code: true, nomLong: true } },
      trainer: { select: { id: true, prenom: true, nom: true, isExternal: true } },
      _count: { select: { trainees: true } },
    },
  });
  // Provisionne le dossier Drive de la session (best-effort, ne bloque pas la
  // création même si Drive non configuré ou formation sans parent folder).
  // On attend le résultat pour que la réponse contienne le driveFolderId si
  // tout s'est bien passé, mais on ne propage jamais l'erreur.
  const provision = await provisionSessionDriveFolder(s.id);
  if (!provision.ok) {
    console.warn(`[session] provisioning Drive échoué pour ${s.id}:`, provision.error);
  }
  // Re-fetch pour récupérer le driveFolderId potentiellement mis à jour
  const refreshed = await prisma.session.findUniqueOrThrow({
    where: { id: s.id },
    include: {
      formation: { select: { code: true, nomLong: true } },
      trainer: { select: { id: true, prenom: true, nom: true, isExternal: true } },
      _count: { select: { trainees: true } },
    },
  });
  return toInfo(refreshed);
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
  if (input.trainerFeeAmount !== undefined) data.trainerFeeAmount = input.trainerFeeAmount;
  if (input.trainerAssignmentMailSentAt !== undefined) data.trainerAssignmentMailSentAt = input.trainerAssignmentMailSentAt;
  if (input.notes !== undefined) data.notes = input.notes;

  const s = await prisma.session.update({
    where: { id },
    data,
    include: {
      formation: { select: { code: true, nomLong: true } },
      trainer: { select: { id: true, prenom: true, nom: true, isExternal: true } },
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
  trainer: { id: string; prenom: string; nom: string; isExternal: boolean } | null;
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
    trainerIsExternal: s.trainer?.isExternal ?? false,
    trainerFeeAmount: s.trainerFeeAmount,
    trainerContractDriveFileId: s.trainerContractDriveFileId,
    trainerContractSentAt: s.trainerContractSentAt,
    trainerAssignmentMailSentAt: s.trainerAssignmentMailSentAt,
    notes: s.notes,
    traineeCount: s._count.trainees,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
