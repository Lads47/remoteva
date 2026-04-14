import prisma from "./db";

// Statuts possibles d'un projet EVA Flow
export type FlowProjectStatus =
  | "planned"        // Planifié
  | "recording"      // En cours d'enregistrement
  | "ingest"         // Transfert en cours
  | "ready_to_edit"  // Prêt pour le montage
  | "editing"        // En cours de montage
  | "exported"       // Exporté / rendu terminé
  | "delivered";     // Livré au client

// Labels français pour l'affichage
export const STATUS_LABELS: Record<FlowProjectStatus, string> = {
  planned: "Planifié",
  recording: "Enregistrement",
  ingest: "Transfert",
  ready_to_edit: "Prêt au montage",
  editing: "En montage",
  exported: "Exporté",
  delivered: "Livré",
};

// Couleurs pour les badges de statut
export const STATUS_COLORS: Record<FlowProjectStatus, { bg: string; text: string }> = {
  planned: { bg: "#e8f4fd", text: "#1f2244" },
  recording: { bg: "#fef3cd", text: "#856404" },
  ingest: { bg: "#fff3cd", text: "#664d03" },
  ready_to_edit: { bg: "#d1ecf1", text: "#0c5460" },
  editing: { bg: "#e8daef", text: "#6c3483" },
  exported: { bg: "#d4edda", text: "#155724" },
  delivered: { bg: "#cce5ff", text: "#004085" },
};

// Liste des statuts valides
export const VALID_STATUSES: FlowProjectStatus[] = [
  "planned", "recording", "ingest", "ready_to_edit",
  "editing", "exported", "delivered",
];

// Interface projet Flow
export interface FlowProjectInfo {
  id: string;
  title: string;
  date: Date;
  location: string;
  room: string;
  speaker: string;
  status: FlowProjectStatus;
  notes: string;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// Récupère tous les projets (tri par date décroissante)
export async function getAllFlowProjects(): Promise<FlowProjectInfo[]> {
  const projects = await prisma.flowProject.findMany({
    orderBy: { date: "desc" },
  });

  return projects.map((p) => ({
    id: p.id,
    title: p.title,
    date: p.date,
    location: p.location,
    room: p.room,
    speaker: p.speaker,
    status: p.status as FlowProjectStatus,
    notes: p.notes,
    config: JSON.parse(p.config) as Record<string, unknown>,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }));
}

// Récupère un projet par ID
export async function getFlowProject(id: string): Promise<FlowProjectInfo | null> {
  const p = await prisma.flowProject.findUnique({ where: { id } });

  if (!p) return null;

  return {
    id: p.id,
    title: p.title,
    date: p.date,
    location: p.location,
    room: p.room,
    speaker: p.speaker,
    status: p.status as FlowProjectStatus,
    notes: p.notes,
    config: JSON.parse(p.config) as Record<string, unknown>,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// Crée un nouveau projet
export async function createFlowProject(data: {
  title: string;
  date: Date;
  location: string;
  room: string;
  speaker?: string;
  notes?: string;
}): Promise<FlowProjectInfo> {
  const p = await prisma.flowProject.create({
    data: {
      title: data.title,
      date: data.date,
      location: data.location,
      room: data.room,
      speaker: data.speaker ?? "",
      notes: data.notes ?? "",
      status: "planned",
      config: "{}",
    },
  });

  return {
    id: p.id,
    title: p.title,
    date: p.date,
    location: p.location,
    room: p.room,
    speaker: p.speaker,
    status: p.status as FlowProjectStatus,
    notes: p.notes,
    config: JSON.parse(p.config) as Record<string, unknown>,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// Met à jour un projet
export async function updateFlowProject(
  id: string,
  data: Partial<{
    title: string;
    date: Date;
    location: string;
    room: string;
    speaker: string;
    status: FlowProjectStatus;
    notes: string;
    config: Record<string, unknown>;
  }>
): Promise<void> {
  const updateData: Record<string, unknown> = {};

  if (data.title !== undefined) updateData.title = data.title;
  if (data.date !== undefined) updateData.date = data.date;
  if (data.location !== undefined) updateData.location = data.location;
  if (data.room !== undefined) updateData.room = data.room;
  if (data.speaker !== undefined) updateData.speaker = data.speaker;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.config !== undefined) updateData.config = JSON.stringify(data.config);

  await prisma.flowProject.update({ where: { id }, data: updateData });
}

// Supprime un projet
export async function deleteFlowProject(id: string): Promise<void> {
  await prisma.flowProject.delete({ where: { id } });
}

// Compte les projets par statut
export async function getFlowStats(): Promise<Record<string, number>> {
  const projects = await prisma.flowProject.findMany({
    select: { status: true },
  });

  const stats: Record<string, number> = { total: projects.length };
  for (const s of VALID_STATUSES) {
    stats[s] = projects.filter((p) => p.status === s).length;
  }
  return stats;
}
