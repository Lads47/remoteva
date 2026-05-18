import prisma from "./db";

export type AttendanceSlot = "morning" | "afternoon";
export type AttendanceStatus = "present" | "absent";

export interface AttendanceCell {
  date: string;       // ISO YYYY-MM-DD (UTC)
  slot: AttendanceSlot;
  status: AttendanceStatus | null;       // null = pas encore saisi
  signedAt?: string;                     // ISO datetime de la dernière saisie
  signedByPrenomNom?: string;            // "Prénom Nom" du formateur qui a saisi
}

export interface AttendanceTraineeRow {
  traineeId: string;
  prenom: string;
  nom: string;
  cells: AttendanceCell[];
}

export interface AttendanceGrid {
  slots: { date: string; slot: AttendanceSlot; label: string }[];   // colonnes
  rows: AttendanceTraineeRow[];                                     // lignes (stagiaires)
}

const SLOT_LABEL: Record<AttendanceSlot, string> = {
  morning: "Matin",
  afternoon: "Après-midi",
};

/**
 * Génère la liste de toutes les demi-journées entre `start` et `end` inclus,
 * triées dans l'ordre chronologique.
 * Travaille en UTC pour rester insensible au fuseau du serveur.
 */
export function generateSlots(start: Date, end: Date): { date: string; slot: AttendanceSlot; label: string }[] {
  const slots: { date: string; slot: AttendanceSlot; label: string }[] = [];
  const startDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  const cursor = new Date(startDay);
  while (cursor.getTime() <= endDay.getTime()) {
    const iso = cursor.toISOString().slice(0, 10);
    const dateLabel = cursor.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" });
    slots.push({ date: iso, slot: "morning", label: `${dateLabel} — ${SLOT_LABEL.morning}` });
    slots.push({ date: iso, slot: "afternoon", label: `${dateLabel} — ${SLOT_LABEL.afternoon}` });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return slots;
}

/**
 * Construit la grille complète d'émargement pour une session :
 * - colonnes = demi-journées entre dateDebut et dateFin
 * - lignes = stagiaires inscrits
 * - cellules = statut courant (présent / absent / null)
 */
export async function buildAttendanceGrid(sessionId: string): Promise<AttendanceGrid> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { dateDebut: true, dateFin: true },
  });
  if (!session) throw new Error("Session introuvable");

  const slots = generateSlots(session.dateDebut, session.dateFin);

  const trainees = await prisma.trainee.findMany({
    where: { sessionId },
    select: {
      id: true,
      prenom: true,
      nom: true,
      attendances: {
        select: {
          date: true,
          slot: true,
          status: true,
          signedAt: true,
          signedBy: { select: { prenom: true, nom: true } },
        },
      },
    },
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
  });

  const rows: AttendanceTraineeRow[] = trainees.map((t) => {
    const byKey = new Map<string, (typeof t.attendances)[number]>();
    for (const a of t.attendances) {
      const key = `${a.date.toISOString().slice(0, 10)}_${a.slot}`;
      byKey.set(key, a);
    }
    const cells: AttendanceCell[] = slots.map((s) => {
      const key = `${s.date}_${s.slot}`;
      const a = byKey.get(key);
      if (!a) return { date: s.date, slot: s.slot, status: null };
      return {
        date: s.date,
        slot: s.slot,
        status: a.status as AttendanceStatus,
        signedAt: a.signedAt.toISOString(),
        signedByPrenomNom: a.signedBy ? `${a.signedBy.prenom} ${a.signedBy.nom}` : undefined,
      };
    });
    return { traineeId: t.id, prenom: t.prenom, nom: t.nom, cells };
  });

  return { slots, rows };
}

export interface BulkAttendanceUpdate {
  traineeId: string;
  date: string;                 // YYYY-MM-DD
  slot: AttendanceSlot;
  status: AttendanceStatus | null;     // null = supprime la saisie
}

/**
 * Met à jour les présences en batch (upsert ou delete pour les null).
 * Toutes les mises à jour sont attribuées au formateur `signedById`.
 */
export async function bulkUpdateAttendance(
  sessionId: string,
  updates: BulkAttendanceUpdate[],
  signedById: string | null
): Promise<{ updated: number; deleted: number }> {
  // Sécurité : on vérifie que les stagiaires updatés appartiennent bien à la session
  const traineeIds = Array.from(new Set(updates.map((u) => u.traineeId)));
  const valid = await prisma.trainee.findMany({
    where: { id: { in: traineeIds }, sessionId },
    select: { id: true },
  });
  const validSet = new Set(valid.map((t) => t.id));

  let updated = 0;
  let deleted = 0;

  for (const u of updates) {
    if (!validSet.has(u.traineeId)) continue;
    const date = new Date(u.date + "T00:00:00Z");
    if (u.status === null) {
      const res = await prisma.attendance.deleteMany({
        where: { traineeId: u.traineeId, date, slot: u.slot },
      });
      deleted += res.count;
    } else {
      await prisma.attendance.upsert({
        where: {
          traineeId_date_slot: { traineeId: u.traineeId, date, slot: u.slot },
        },
        update: { status: u.status, signedById, signedAt: new Date() },
        create: {
          traineeId: u.traineeId,
          date,
          slot: u.slot,
          status: u.status,
          signedById,
        },
      });
      updated += 1;
    }
  }

  return { updated, deleted };
}
