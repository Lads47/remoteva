// Gestion des réclamations (Qualiopi indicateur 32).
//
// Architecture :
//   - Formulaire public anonyme /reclamation → POST /api/public/reclamations
//   - Notification immédiate à l'admin (mail) + accusé réception au réclamant
//   - Admin traite via /admin/reclamations : statut + action corrective +
//     réponse formelle (envoyée par mail)
//   - Engagement réglementaire : traitement sous 30 jours
//   - Bilan annuel auto : nombre, types, taux de résolution, délai moyen

import prisma from "./db";

export type ComplaintStatus = "new" | "in_progress" | "resolved" | "closed";

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  new: "Nouvelle",
  in_progress: "En cours de traitement",
  resolved: "Résolue",
  closed: "Clôturée",
};

export interface ComplaintCreateInput {
  // Section réclamant (saisie publique)
  authorName: string;
  authorCompany?: string;
  authorRole?: string;
  authorEmail: string;
  concernedName?: string;
  concernedCompany?: string;
  concernedRole?: string;
  subject: string;
  description: string;
  // Optionnels : auto-renseignés si le réclamant arrive via un lien sessionnel
  sessionId?: string;
  traineeId?: string;
  receptionMode?: string;
}

/**
 * Génère un numéro lisible RECL-YYYY-NNN où NNN est l'ordinal annuel.
 * Sûr face aux conflits : on prend le max + 1 dans une transaction.
 */
async function generateNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `RECL-${year}-`;
  // Compte des réclamations de l'année courante
  const last = await prisma.complaint.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  let next = 1;
  if (last?.number) {
    const tail = last.number.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (Number.isFinite(n)) next = n + 1;
  }
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export async function createComplaint(input: ComplaintCreateInput): Promise<{
  id: string;
  number: string;
}> {
  const number = await generateNumber();
  const created = await prisma.complaint.create({
    data: {
      number,
      authorName: input.authorName.trim(),
      authorCompany: (input.authorCompany ?? "").trim(),
      authorRole: (input.authorRole ?? "").trim(),
      authorEmail: input.authorEmail.trim(),
      concernedName: (input.concernedName ?? "").trim(),
      concernedCompany: (input.concernedCompany ?? "").trim(),
      concernedRole: (input.concernedRole ?? "").trim(),
      subject: input.subject.trim(),
      description: input.description.trim(),
      sessionId: input.sessionId || null,
      traineeId: input.traineeId || null,
      receptionMode: input.receptionMode || "formulaire_web",
      status: "new",
    },
    select: { id: true, number: true },
  });
  return created;
}

export interface ComplaintInfo {
  id: string;
  number: string;
  authorName: string;
  authorCompany: string;
  authorRole: string;
  authorEmail: string;
  concernedName: string;
  concernedCompany: string;
  concernedRole: string;
  subject: string;
  description: string;
  sessionId: string | null;
  traineeId: string | null;
  receptionMode: string;
  status: ComplaintStatus;
  responseType: string;
  responseContent: string;
  actionCorrective: string;
  responseSentAt: Date | null;
  resolvedAt: Date | null;
  resolvedBy: string;
  adminNotes: string;
  createdAt: Date;
  updatedAt: Date;
  // Enrichissement optionnel
  sessionCode?: string | null;
  formationNomLong?: string | null;
  traineeNomComplet?: string | null;
}

function toInfo(c: Awaited<ReturnType<typeof prisma.complaint.findUniqueOrThrow>> & {
  session?: { code: string; formation: { nomLong: string } } | null;
  trainee?: { prenom: string; nom: string } | null;
}): ComplaintInfo {
  return {
    id: c.id,
    number: c.number,
    authorName: c.authorName,
    authorCompany: c.authorCompany,
    authorRole: c.authorRole,
    authorEmail: c.authorEmail,
    concernedName: c.concernedName,
    concernedCompany: c.concernedCompany,
    concernedRole: c.concernedRole,
    subject: c.subject,
    description: c.description,
    sessionId: c.sessionId,
    traineeId: c.traineeId,
    receptionMode: c.receptionMode,
    status: c.status as ComplaintStatus,
    responseType: c.responseType,
    responseContent: c.responseContent,
    actionCorrective: c.actionCorrective,
    responseSentAt: c.responseSentAt,
    resolvedAt: c.resolvedAt,
    resolvedBy: c.resolvedBy,
    adminNotes: c.adminNotes,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    sessionCode: c.session?.code ?? null,
    formationNomLong: c.session?.formation.nomLong ?? null,
    traineeNomComplet: c.trainee ? `${c.trainee.prenom} ${c.trainee.nom}` : null,
  };
}

export async function listComplaints(filter?: {
  status?: ComplaintStatus;
  year?: number;
}): Promise<ComplaintInfo[]> {
  const where: { status?: ComplaintStatus; createdAt?: { gte: Date; lt: Date } } = {};
  if (filter?.status) where.status = filter.status;
  if (filter?.year) {
    where.createdAt = {
      gte: new Date(filter.year, 0, 1),
      lt: new Date(filter.year + 1, 0, 1),
    };
  }
  const list = await prisma.complaint.findMany({
    where,
    include: {
      session: { include: { formation: { select: { nomLong: true } } } },
      trainee: { select: { prenom: true, nom: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return list.map(toInfo);
}

export async function getComplaintById(id: string): Promise<ComplaintInfo | null> {
  const c = await prisma.complaint.findUnique({
    where: { id },
    include: {
      session: { include: { formation: { select: { nomLong: true } } } },
      trainee: { select: { prenom: true, nom: true } },
    },
  });
  if (!c) return null;
  return toInfo(c);
}

export interface ComplaintUpdateInput {
  status?: ComplaintStatus;
  responseType?: string;
  responseContent?: string;
  actionCorrective?: string;
  adminNotes?: string;
  resolvedBy?: string;
}

export async function updateComplaint(id: string, input: ComplaintUpdateInput): Promise<ComplaintInfo | null> {
  // Si on bascule à "resolved" ou "closed" pour la 1re fois, on tamponne resolvedAt
  const existing = await prisma.complaint.findUnique({ where: { id }, select: { resolvedAt: true } });
  if (!existing) return null;

  const data: Partial<{
    status: ComplaintStatus;
    responseType: string;
    responseContent: string;
    actionCorrective: string;
    adminNotes: string;
    resolvedBy: string;
    resolvedAt: Date | null;
  }> = {};
  if (input.status !== undefined) {
    data.status = input.status;
    if ((input.status === "resolved" || input.status === "closed") && !existing.resolvedAt) {
      data.resolvedAt = new Date();
    }
    if (input.status === "new" || input.status === "in_progress") {
      // Rouverture : on efface resolvedAt pour ne pas fausser le délai
      data.resolvedAt = null;
    }
  }
  if (input.responseType !== undefined) data.responseType = input.responseType;
  if (input.responseContent !== undefined) data.responseContent = input.responseContent;
  if (input.actionCorrective !== undefined) data.actionCorrective = input.actionCorrective;
  if (input.adminNotes !== undefined) data.adminNotes = input.adminNotes;
  if (input.resolvedBy !== undefined) data.resolvedBy = input.resolvedBy;

  await prisma.complaint.update({ where: { id }, data });
  return getComplaintById(id);
}

export async function markResponseSent(id: string): Promise<void> {
  await prisma.complaint.update({
    where: { id },
    data: { responseSentAt: new Date() },
  });
}

// === Statistiques (utilisées par le dashboard Qualiopi + BPF) ===

export interface ComplaintStats {
  year: number;
  total: number;
  byStatus: Record<ComplaintStatus, number>;
  resolved: number;
  unresolved: number;
  resolutionRate: number;         // 0..1
  averageResolutionDays: number;  // 0 si pas de réclamation résolue
  overdue: number;                // ouvertes depuis > 30 jours
}

export async function getComplaintStats(year: number = new Date().getFullYear()): Promise<ComplaintStats> {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const list = await prisma.complaint.findMany({
    where: { createdAt: { gte: yearStart, lt: yearEnd } },
    select: { status: true, createdAt: true, resolvedAt: true },
  });
  const total = list.length;
  const byStatus: Record<ComplaintStatus, number> = { new: 0, in_progress: 0, resolved: 0, closed: 0 };
  let resolved = 0;
  let totalResolutionMs = 0;
  let countResolved = 0;
  const now = new Date();
  const thirtyDays = 30 * 24 * 3600 * 1000;
  let overdue = 0;

  for (const c of list) {
    const s = (c.status as ComplaintStatus);
    byStatus[s] = (byStatus[s] || 0) + 1;
    if (s === "resolved" || s === "closed") {
      resolved++;
      if (c.resolvedAt) {
        totalResolutionMs += c.resolvedAt.getTime() - c.createdAt.getTime();
        countResolved++;
      }
    } else {
      // Ouverte : on regarde si on a dépassé l'engagement 30j
      if (now.getTime() - c.createdAt.getTime() > thirtyDays) overdue++;
    }
  }

  return {
    year,
    total,
    byStatus,
    resolved,
    unresolved: total - resolved,
    resolutionRate: total > 0 ? resolved / total : 0,
    averageResolutionDays: countResolved > 0 ? Math.round((totalResolutionMs / countResolved) / (24 * 3600 * 1000)) : 0,
    overdue,
  };
}
