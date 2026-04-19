import prisma from "./db";
import { generateEventId } from "./eventId";
import type { ConferenceInfo, ConferenceStatus } from "./conference";

// === Régies fixes (4 PCs de captation EVA Capture) ===

export const VALID_REGIES = ["WVP_A1", "WVP_A2", "WVP_A3", "WVP_A4"] as const;
export type Regie = (typeof VALID_REGIES)[number];

export function isValidRegie(value: string): value is Regie {
  return (VALID_REGIES as readonly string[]).includes(value);
}

// === Statuts projet (auto-dérivés depuis les conférences) ===

export type FlowProjectStatus =
  | "planned"
  | "recording"
  | "ingest"
  | "ready_to_edit"
  | "editing"
  | "exported"
  | "delivered";

export const PROJECT_STATUS_LABELS: Record<FlowProjectStatus, string> = {
  planned: "Planifié",
  recording: "Enregistrement",
  ingest: "Transfert",
  ready_to_edit: "Prêt au montage",
  editing: "En montage",
  exported: "Exporté",
  delivered: "Livré",
};

export const PROJECT_STATUS_COLORS: Record<FlowProjectStatus, { bg: string; text: string }> = {
  planned: { bg: "#e8f4fd", text: "#1f2244" },
  recording: { bg: "#fef3cd", text: "#856404" },
  ingest: { bg: "#fff3cd", text: "#664d03" },
  ready_to_edit: { bg: "#d1ecf1", text: "#0c5460" },
  editing: { bg: "#e8daef", text: "#6c3483" },
  exported: { bg: "#d4edda", text: "#155724" },
  delivered: { bg: "#cce5ff", text: "#004085" },
};

/**
 * Calcule le statut auto-dérivé d'un projet à partir des statuts de ses conférences.
 *
 * Règles :
 * - "not_captured" sont ignorées
 * - Pas de conférences captées : planned
 * - Au moins une en recording : recording
 * - Toutes en delivered : delivered
 * - Toutes en exported (ou +) : exported
 * - Au moins une en editing : editing
 * - Toutes en ready_to_edit (ou +) : ready_to_edit
 * - Au moins une en ingest : ingest
 * - Sinon : planned
 */
export function computeProjectStatus(
  conferenceStatuses: ConferenceStatus[]
): FlowProjectStatus {
  const real = conferenceStatuses.filter((s) => s !== "not_captured");
  if (real.length === 0) return "planned";

  if (real.some((s) => s === "recording")) return "recording";
  if (real.every((s) => s === "delivered")) return "delivered";
  if (real.every((s) => s === "exported" || s === "delivered")) return "exported";
  if (real.some((s) => s === "editing")) return "editing";
  if (real.every((s) => s === "ready_to_edit" || s === "editing" || s === "exported" || s === "delivered")) {
    return "ready_to_edit";
  }
  if (real.some((s) => s === "ingest")) return "ingest";
  return "planned";
}

/**
 * Recalcule et persiste le statut d'un projet à partir de ses conférences.
 * À appeler après tout changement de statut de conférence.
 */
export async function refreshProjectStatus(projectId: string): Promise<FlowProjectStatus> {
  const confs = await prisma.conference.findMany({
    where: { flowProjectId: projectId },
    select: { status: true },
  });
  const newStatus = computeProjectStatus(confs.map((c) => c.status as ConferenceStatus));
  await prisma.flowProject.update({
    where: { id: projectId },
    data: { status: newStatus },
  });
  return newStatus;
}

// === Types ===

export interface FlowProjectInfo {
  id: string;
  eventId: string;
  title: string;
  date: Date;
  location: string;
  room: string;
  speaker: string;
  director: string;
  directorId: string | null;
  regie: Regie | null;
  recordingLocalPath: string | null;
  status: FlowProjectStatus;
  notes: string;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlowProjectWithConferences extends FlowProjectInfo {
  conferences: ConferenceInfo[];
}

export interface FlowProjectListItem extends FlowProjectInfo {
  availableDirectorsCount: number; // Nombre de réals dispos pour la date du projet
}

function toProjectInfo(p: {
  id: string;
  eventId: string;
  title: string;
  date: Date;
  location: string;
  room: string;
  speaker: string;
  director: string;
  directorId: string | null;
  regie: string | null;
  recordingLocalPath: string | null;
  status: string;
  notes: string;
  config: string;
  createdAt: Date;
  updatedAt: Date;
}): FlowProjectInfo {
  return {
    id: p.id,
    eventId: p.eventId,
    title: p.title,
    date: p.date,
    location: p.location,
    room: p.room,
    speaker: p.speaker,
    director: p.director,
    directorId: p.directorId,
    regie: p.regie as Regie | null,
    recordingLocalPath: p.recordingLocalPath,
    status: p.status as FlowProjectStatus,
    notes: p.notes,
    config: JSON.parse(p.config),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function toConferenceInfo(c: {
  id: string;
  flowProjectId: string;
  order: number;
  title: string;
  speaker: string;
  status: string;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  startTime: Date | null;
  endTime: Date | null;
  localFolder: string | null;
  durationSeconds: number | null;
  createdAt: Date;
  updatedAt: Date;
}): ConferenceInfo {
  return {
    id: c.id,
    flowProjectId: c.flowProjectId,
    order: c.order,
    title: c.title,
    speaker: c.speaker,
    status: c.status as ConferenceStatus,
    scheduledStart: c.scheduledStart,
    scheduledEnd: c.scheduledEnd,
    startTime: c.startTime,
    endTime: c.endTime,
    localFolder: c.localFolder,
    durationSeconds: c.durationSeconds,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

// === Queries ===

export async function getAllFlowProjects(): Promise<FlowProjectInfo[]> {
  const list = await prisma.flowProject.findMany({ orderBy: { date: "desc" } });
  return list.map(toProjectInfo);
}

/**
 * Liste tous les projets enrichis du nombre de réals dispos pour la date du projet.
 * Utilisé par /admin/flow pour afficher un badge "X réals dispos".
 */
export async function getAllFlowProjectsWithAvailability(): Promise<FlowProjectListItem[]> {
  const projects = await prisma.flowProject.findMany({ orderBy: { date: "desc" } });

  // Récupère toutes les dispos en une fois et groupe par date (clé YYYY-MM-DD)
  const availabilities = await prisma.directorAvailability.findMany({
    select: { date: true, director: { select: { active: true } } },
  });
  const countByDate = new Map<string, number>();
  for (const a of availabilities) {
    if (!a.director?.active) continue; // ignore les réals désactivés
    const k = `${a.date.getUTCFullYear()}-${String(a.date.getUTCMonth() + 1).padStart(2, "0")}-${String(a.date.getUTCDate()).padStart(2, "0")}`;
    countByDate.set(k, (countByDate.get(k) ?? 0) + 1);
  }

  return projects.map((p) => {
    const info = toProjectInfo(p);
    const k = `${p.date.getUTCFullYear()}-${String(p.date.getUTCMonth() + 1).padStart(2, "0")}-${String(p.date.getUTCDate()).padStart(2, "0")}`;
    return { ...info, availableDirectorsCount: countByDate.get(k) ?? 0 };
  });
}

/**
 * Renvoie toutes les dates d'événements (utilisé par /presta pour afficher les dates "événement").
 * Dates normalisées à 00:00 UTC, dédupliquées (si plusieurs événements le même jour).
 */
export async function getAllEventDates(): Promise<Date[]> {
  const list = await prisma.flowProject.findMany({ select: { date: true } });
  // Normalise à 00:00 UTC + déduplique
  const set = new Set<string>();
  for (const p of list) {
    const d = new Date(p.date);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    set.add(key);
  }
  return Array.from(set).map((k) => new Date(`${k}T00:00:00.000Z`));
}

export async function getProjectsByDate(
  date: Date | string,
  regie?: Regie | null
): Promise<FlowProjectWithConferences[]> {
  const d = typeof date === "string" ? new Date(date) : date;
  const startOfDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));

  const list = await prisma.flowProject.findMany({
    where: {
      date: { gte: startOfDay, lte: endOfDay },
      ...(regie ? { regie } : {}),
    },
    include: { conferences: { orderBy: { order: "asc" } } },
    orderBy: { date: "asc" },
  });

  return list.map((p) => ({
    ...toProjectInfo(p),
    conferences: p.conferences.map(toConferenceInfo),
  }));
}

export async function getProjectWithConferences(id: string): Promise<FlowProjectWithConferences | null> {
  const p = await prisma.flowProject.findUnique({
    where: { id },
    include: { conferences: { orderBy: { order: "asc" } } },
  });
  if (!p) return null;
  return { ...toProjectInfo(p), conferences: p.conferences.map(toConferenceInfo) };
}

export async function getProjectByEventId(eventId: string): Promise<FlowProjectWithConferences | null> {
  const p = await prisma.flowProject.findUnique({
    where: { eventId },
    include: { conferences: { orderBy: { order: "asc" } } },
  });
  if (!p) return null;
  return { ...toProjectInfo(p), conferences: p.conferences.map(toConferenceInfo) };
}

// === Mutations ===

export async function createFlowProject(data: {
  title: string;
  date: Date;
  location: string;
  room: string;
  speaker?: string;
  director?: string;
  directorId?: string | null;
  notes?: string;
  conferences?: Array<{
    title: string;
    speaker?: string;
    order?: number;
    scheduledStart?: Date | null;
    scheduledEnd?: Date | null;
  }>;
}): Promise<FlowProjectWithConferences> {
  const eventId = await generateEventId(data.date);

  const p = await prisma.flowProject.create({
    data: {
      eventId,
      title: data.title.trim(),
      date: data.date,
      location: data.location.trim(),
      room: data.room.trim(),
      speaker: data.speaker?.trim() ?? "",
      director: data.director?.trim() ?? "",
      directorId: data.directorId ?? null,
      notes: data.notes?.trim() ?? "",
      conferences:
        data.conferences && data.conferences.length > 0
          ? {
              create: data.conferences.map((c, idx) => ({
                title: c.title.trim(),
                speaker: c.speaker?.trim() ?? "",
                order: c.order ?? idx + 1,
                scheduledStart: c.scheduledStart ?? null,
                scheduledEnd: c.scheduledEnd ?? null,
              })),
            }
          : undefined,
    },
    include: { conferences: { orderBy: { order: "asc" } } },
  });

  return { ...toProjectInfo(p), conferences: p.conferences.map(toConferenceInfo) };
}

export async function updateFlowProject(
  id: string,
  data: Partial<{
    title: string;
    date: Date;
    location: string;
    room: string;
    speaker: string;
    director: string;
    directorId: string | null;
    regie: Regie | null;
    recordingLocalPath: string | null;
    notes: string;
    config: Record<string, unknown>;
  }>
): Promise<void> {
  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title.trim();
  if (data.date !== undefined) updateData.date = data.date;
  if (data.location !== undefined) updateData.location = data.location.trim();
  if (data.room !== undefined) updateData.room = data.room.trim();
  if (data.speaker !== undefined) updateData.speaker = data.speaker.trim();
  if (data.director !== undefined) updateData.director = data.director.trim();
  if (data.directorId !== undefined) updateData.directorId = data.directorId;
  if (data.regie !== undefined) updateData.regie = data.regie;
  if (data.recordingLocalPath !== undefined) updateData.recordingLocalPath = data.recordingLocalPath;
  if (data.notes !== undefined) updateData.notes = data.notes.trim();
  if (data.config !== undefined) updateData.config = JSON.stringify(data.config);

  await prisma.flowProject.update({ where: { id }, data: updateData });
}

export async function deleteFlowProject(id: string): Promise<void> {
  await prisma.flowProject.delete({ where: { id } });
}

/**
 * Prepare un projet côté EVA Capture (lock régie + path local).
 * Idempotent : même régie = update OK ; autre régie = écrase (selon Q2 du brief).
 */
export async function prepareProject(
  id: string,
  data: { regie: Regie; director?: string; recordingLocalPath?: string }
): Promise<FlowProjectWithConferences> {
  const updateData: Record<string, unknown> = { regie: data.regie };
  if (data.recordingLocalPath !== undefined) updateData.recordingLocalPath = data.recordingLocalPath;
  if (data.director !== undefined) updateData.director = data.director.trim();

  await prisma.flowProject.update({ where: { id }, data: updateData });

  const refreshed = await getProjectWithConferences(id);
  if (!refreshed) throw new Error(`Project ${id} not found after prepare`);
  return refreshed;
}

// === Stats ===

export async function getFlowStats(): Promise<{
  total: number;
  planned: number;
  inProgress: number;
  done: number;
  byStatus: Record<FlowProjectStatus, number>;
}> {
  const projects = await prisma.flowProject.findMany({ select: { status: true } });
  const total = projects.length;

  const byStatus: Record<string, number> = {};
  for (const s of Object.keys(PROJECT_STATUS_LABELS)) byStatus[s] = 0;
  for (const p of projects) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;

  return {
    total,
    planned: byStatus.planned ?? 0,
    inProgress:
      (byStatus.recording ?? 0) +
      (byStatus.ingest ?? 0) +
      (byStatus.ready_to_edit ?? 0) +
      (byStatus.editing ?? 0),
    done: (byStatus.exported ?? 0) + (byStatus.delivered ?? 0),
    byStatus: byStatus as Record<FlowProjectStatus, number>,
  };
}
