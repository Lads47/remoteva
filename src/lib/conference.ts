import prisma from "./db";

export type ConferenceStatus =
  | "planned"
  | "recording"
  | "ingest"
  | "ready_to_edit"
  | "editing"
  | "exported"
  | "delivered"
  | "not_captured";

export const CONFERENCE_STATUS_LABELS: Record<ConferenceStatus, string> = {
  planned: "Planifié",
  recording: "Enregistrement",
  ingest: "Transfert",
  ready_to_edit: "Prêt au montage",
  editing: "En montage",
  exported: "Exporté",
  delivered: "Livré",
  not_captured: "Non capté",
};

export const CONFERENCE_STATUS_COLORS: Record<ConferenceStatus, { bg: string; text: string }> = {
  planned: { bg: "#e8f4fd", text: "#1f2244" },
  recording: { bg: "#fef3cd", text: "#856404" },
  ingest: { bg: "#fff3cd", text: "#664d03" },
  ready_to_edit: { bg: "#d1ecf1", text: "#0c5460" },
  editing: { bg: "#e8daef", text: "#6c3483" },
  exported: { bg: "#d4edda", text: "#155724" },
  delivered: { bg: "#cce5ff", text: "#004085" },
  not_captured: { bg: "#f5f5f7", text: "#727485" },
};

export const VALID_CONFERENCE_STATUSES: ConferenceStatus[] = [
  "planned", "recording", "ingest", "ready_to_edit",
  "editing", "exported", "delivered", "not_captured",
];

export interface ConferenceInfo {
  id: string;
  flowProjectId: string;
  order: number;
  title: string;
  speaker: string;
  status: ConferenceStatus;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  startTime: Date | null;
  endTime: Date | null;
  localFolder: string | null;
  durationSeconds: number | null;
  createdAt: Date;
  updatedAt: Date;
}

function toInfo(c: {
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

export async function getConference(id: string): Promise<ConferenceInfo | null> {
  const c = await prisma.conference.findUnique({ where: { id } });
  return c ? toInfo(c) : null;
}

export async function listConferences(flowProjectId: string): Promise<ConferenceInfo[]> {
  const list = await prisma.conference.findMany({
    where: { flowProjectId },
    orderBy: { order: "asc" },
  });
  return list.map(toInfo);
}

export async function createConference(data: {
  flowProjectId: string;
  title: string;
  speaker?: string;
  order?: number;
  scheduledStart?: Date | null;
  scheduledEnd?: Date | null;
}): Promise<ConferenceInfo> {
  let order = data.order;
  if (order === undefined) {
    // auto-incrément : max(order) + 1
    const last = await prisma.conference.findFirst({
      where: { flowProjectId: data.flowProjectId },
      orderBy: { order: "desc" },
    });
    order = (last?.order ?? 0) + 1;
  }

  const c = await prisma.conference.create({
    data: {
      flowProjectId: data.flowProjectId,
      title: data.title.trim(),
      speaker: data.speaker?.trim() ?? "",
      order,
      scheduledStart: data.scheduledStart ?? null,
      scheduledEnd: data.scheduledEnd ?? null,
    },
  });
  return toInfo(c);
}

export async function updateConference(
  id: string,
  data: Partial<{
    title: string;
    speaker: string;
    order: number;
    status: ConferenceStatus;
    scheduledStart: Date | null;
    scheduledEnd: Date | null;
    startTime: Date | null;
    endTime: Date | null;
    localFolder: string | null;
    durationSeconds: number | null;
  }>
): Promise<ConferenceInfo> {
  const updateData: Record<string, unknown> = {};
  if (data.title !== undefined) updateData.title = data.title.trim();
  if (data.speaker !== undefined) updateData.speaker = data.speaker.trim();
  if (data.order !== undefined) updateData.order = data.order;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.scheduledStart !== undefined) updateData.scheduledStart = data.scheduledStart;
  if (data.scheduledEnd !== undefined) updateData.scheduledEnd = data.scheduledEnd;
  if (data.startTime !== undefined) updateData.startTime = data.startTime;
  if (data.endTime !== undefined) updateData.endTime = data.endTime;
  if (data.localFolder !== undefined) updateData.localFolder = data.localFolder;
  if (data.durationSeconds !== undefined) updateData.durationSeconds = data.durationSeconds;

  const c = await prisma.conference.update({ where: { id }, data: updateData });
  return toInfo(c);
}

export async function deleteConference(id: string): Promise<void> {
  await prisma.conference.delete({ where: { id } });
}

// === Transitions de statut côté EVA Capture ===

export async function markRecordingStarted(id: string): Promise<ConferenceInfo> {
  const c = await prisma.conference.update({
    where: { id },
    data: { status: "recording", startTime: new Date() },
  });
  return toInfo(c);
}

export async function markRecordingStopped(
  id: string,
  data: { localFolder?: string | null; durationSeconds?: number | null }
): Promise<ConferenceInfo> {
  const c = await prisma.conference.update({
    where: { id },
    data: {
      status: "ingest",
      endTime: new Date(),
      localFolder: data.localFolder ?? undefined,
      durationSeconds: data.durationSeconds ?? undefined,
    },
  });
  return toInfo(c);
}

export async function markUploaded(id: string): Promise<ConferenceInfo> {
  const c = await prisma.conference.update({
    where: { id },
    data: { status: "ready_to_edit" },
  });
  return toInfo(c);
}

export async function markNotCaptured(id: string): Promise<ConferenceInfo> {
  const c = await prisma.conference.update({
    where: { id },
    data: { status: "not_captured" },
  });
  return toInfo(c);
}
