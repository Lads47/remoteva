import prisma from "./db";
import { provisionSessionDriveFolder } from "./drive-provisioning";
import { sendTrainerSessionAssignment } from "./mailer";

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
  notes?: string;
}

/**
 * Notifie par mail le formateur qu'on vient de lui assigner une session.
 * Best-effort : ne fait pas échouer l'opération si le mail plante (juste
 * un warn dans les logs). Skip si le trainer n'existe pas, est inactif,
 * ou n'a pas d'email.
 *
 * Si le formateur est externe (Trainer.isExternal = true) ET qu'un
 * `trainerFeeAmount` est fourni, on génère un contrat de sous-traitance
 * personnalisé (PDF) et on le joint au mail (Qualiopi indicateur 27).
 */
export async function notifyTrainerOfSessionAssignment(
  sessionId: string,
  trainerId: string,
  trainerFeeAmount?: number
): Promise<{
  ok: boolean;
  emailSent?: boolean;
  error?: string;
  contractGenerated?: boolean;
  contractSkipReason?: string;
}> {
  try {
    const trainer = await prisma.trainer.findUnique({
      where: { id: trainerId },
      select: {
        id: true,
        prenom: true,
        email: true,
        magicToken: true,
        active: true,
        isExternal: true,
      },
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

    // Si formateur externe + montant fourni : on génère le contrat de
    // sous-traitance et on le joindra au mail. Sinon mail simple.
    let contractPdfBuffer: Buffer | undefined;
    let contractPdfFilename: string | undefined;
    let contractGenerated = false;
    let contractSkipReason: string | undefined;
    if (trainer.isExternal && trainerFeeAmount && trainerFeeAmount > 0) {
      const { generateExternalTrainerContract } = await import("./trainer-contract");
      const contract = await generateExternalTrainerContract(sessionId, trainerFeeAmount);
      if (contract.ok && !contract.skipped) {
        contractPdfBuffer = contract.pdfBuffer;
        contractPdfFilename = contract.pdfFilename;
        contractGenerated = true;
      } else if (contract.skipped) {
        contractSkipReason = contract.skipReason;
      } else {
        contractSkipReason = contract.error;
        console.warn(
          `[notifyTrainerOfSessionAssignment] génération contrat KO sessionId=${sessionId}:`,
          contract.error
        );
      }
    }

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
      contractPdfBuffer,
      contractPdfFilename,
      contractMontantHt: contractGenerated ? trainerFeeAmount : undefined,
    });
    return {
      ok: true,
      emailSent: res.success,
      error: res.error,
      contractGenerated,
      contractSkipReason,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    console.warn(`[notifyTrainerOfSessionAssignment] échec sessionId=${sessionId} trainerId=${trainerId}:`, msg);
    return { ok: false, error: msg };
  }
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
    notes: s.notes,
    traineeCount: s._count.trainees,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
