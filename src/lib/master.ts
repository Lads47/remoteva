import { rm } from "fs/promises";
import path from "path";
import prisma from "./db";
import {
  fetchConferences,
  sendDriveLink,
  sendMarkingAndLogs,
  type CoreMarkingItem,
} from "./eva-core";

// === EVA MASTER : accès données prestas ===
//
// Structure propre à EVA MASTER (tables master_*), distincte de flow_*.
// La communication avec EVA CORE est stubbée en v1 (voir lib/eva-core.ts) :
// ces fonctions ne gèrent que la copie serveur des prestas / confs / logs.

// Transforme un nom de presta en slug URL-safe unique.
// "CDC — 20 et 21 juin" -> "cdc-20-et-21-juin"
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // enlève les accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // tout le reste -> tiret
    .replace(/^-+|-+$/g, "") // tirets en bordure
    .slice(0, 60);
}

// Génère un slug unique en base (ajoute -2, -3… en cas de collision).
async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "presta";
  let candidate = base;
  let n = 2;
  // Boucle tant que le slug existe déjà.
  while (await prisma.masterPresta.findUnique({ where: { slug: candidate } })) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
}

// Liste toutes les prestas (plus récentes d'abord) avec le nb de confs.
export async function listPrestas() {
  return prisma.masterPresta.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { conferences: true } } },
  });
}

// Crée une presta minimale : nom + lien Drive. Slug auto-généré.
// Transmet le lien à EVA CORE pour lecture (stub en v1) et stocke le statut.
export async function createPresta(input: { name: string; driveUrl: string }) {
  const slug = await uniqueSlug(input.name);
  const drive = await sendDriveLink(input.driveUrl); // stub EVA CORE
  return prisma.masterPresta.create({
    data: {
      slug,
      name: input.name.trim(),
      driveUrl: input.driveUrl.trim(),
      driveStatus: drive.status === "read" ? "read" : "pending",
    },
  });
}

// Récupère une presta par slug, avec ses confs (triées) et ses logs.
export async function getPrestaBySlug(slug: string) {
  return prisma.masterPresta.findUnique({
    where: { slug },
    include: {
      conferences: { orderBy: { position: "asc" } },
      vmixLogs: { orderBy: { uploadedAt: "desc" } },
    },
  });
}

// Suppression manuelle : efface la presta + confs + logs (cascade Prisma) ET
// les fichiers .log sur disque (fix M-1 : sinon dossier orphelin sur le volume).
export async function deletePresta(id: string) {
  const dir = path.join(process.cwd(), "data", "master", id);
  await rm(dir, { recursive: true, force: true }).catch(() => {});
  return prisma.masterPresta.delete({ where: { id } });
}

// === Conférences ===

// Parse le champ speakers (JSON string) en tableau, tolérant aux erreurs.
export function parseSpeakers(json: string): string[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return [];
  }
}

// Charge / synchronise les confs depuis EVA CORE (stub). Upsert par position :
// met à jour titre + intervenants des positions connues, ajoute les nouvelles.
// Ne supprime rien (on ne perd jamais un marquage déjà pris).
export async function syncConferencesFromCore(prestaId: string, slug: string) {
  const core = await fetchConferences(slug);
  const existing = await prisma.masterConference.findMany({ where: { prestaId } });
  const byPosition = new Map(existing.map((c) => [c.position, c]));

  for (const c of core) {
    const found = byPosition.get(c.position);
    if (found) {
      await prisma.masterConference.update({
        where: { id: found.id },
        data: { title: c.title, speakers: JSON.stringify(c.speakers) },
      });
    } else {
      // Création : on stocke aussi le contenu EVA CORE (transcription + résumé IA).
      // Sur les confs déjà présentes, on ne touche PAS summary (corrections préservées).
      await prisma.masterConference.create({
        data: {
          prestaId,
          position: c.position,
          title: c.title,
          speakers: JSON.stringify(c.speakers),
          status: c.status === "cancelled" ? "cancelled" : "pending",
          transcript: JSON.stringify(c.transcript),
          summary: c.summaryIa,
        },
      });
    }
  }

  return prisma.masterConference.findMany({
    where: { prestaId },
    orderBy: { position: "asc" },
  });
}

// Ajoute une conférence en direct (bouton « + conf »). Position = fin de liste.
export async function addConference(prestaId: string, title: string) {
  const last = await prisma.masterConference.findFirst({
    where: { prestaId },
    orderBy: { position: "desc" },
  });
  return prisma.masterConference.create({
    data: {
      prestaId,
      position: (last?.position ?? 0) + 1,
      title: title.trim() || "Nouvelle conférence",
    },
  });
}

// Met à jour une conf (titre, statut, marquage, + correction EVA NL).
export async function updateConference(
  id: string,
  data: {
    title?: string;
    status?: string;
    startedAt?: Date | null;
    endedAt?: Date | null;
    speakers?: string[];
    summary?: string;
    speakerMapping?: Record<string, string>;
  }
) {
  const patch: Record<string, unknown> = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.status !== undefined) patch.status = data.status;
  if (data.startedAt !== undefined) patch.startedAt = data.startedAt;
  if (data.endedAt !== undefined) patch.endedAt = data.endedAt;
  if (data.speakers !== undefined) patch.speakers = JSON.stringify(data.speakers);
  if (data.summary !== undefined) patch.summary = data.summary;
  if (data.speakerMapping !== undefined) patch.speakerMapping = JSON.stringify(data.speakerMapping);
  return prisma.masterConference.update({ where: { id }, data: patch });
}

// Parse le champ speakerMapping (JSON) en objet {label: nom}.
export function parseMapping(json: string): Record<string, string> {
  try {
    const obj = JSON.parse(json);
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

// Parse le champ transcript (JSON) en segments [{speaker,text}].
export function parseTranscript(json: string | null): { speaker: string; text: string }[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// Liste dédupliquée des intervenants d'une presta (union des speakers de toutes
// les confs — la source pour le mapping speakers dans EVA NL, §9).
export function prestaIntervenants(confs: { speakers: string }[]): string[] {
  const set = new Set<string>();
  confs.forEach((c) => parseSpeakers(c.speakers).forEach((s) => set.add(s)));
  return Array.from(set).sort();
}

// Supprime une conf (annulée / retirée du planning).
export async function deleteConference(id: string) {
  return prisma.masterConference.delete({ where: { id } });
}

// Déplace une conf d'un cran (↑/↓) : échange avec sa voisine puis renumérote
// toutes les positions 1..N (l'ordre réel prime sur l'ordre planifié, §5.2).
// Renvoie la liste réordonnée.
export async function moveConference(
  prestaId: string,
  confId: string,
  direction: "up" | "down"
) {
  const confs = await prisma.masterConference.findMany({
    where: { prestaId },
    orderBy: { position: "asc" },
  });
  const idx = confs.findIndex((c) => c.id === confId);
  if (idx < 0) return confs;
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= confs.length) return confs; // déjà en bout de liste

  // Échange dans le tableau, puis réattribution séquentielle des positions.
  [confs[idx], confs[target]] = [confs[target], confs[idx]];
  await prisma.$transaction(
    confs.map((c, i) =>
      prisma.masterConference.update({ where: { id: c.id }, data: { position: i + 1 } })
    )
  );

  return prisma.masterConference.findMany({
    where: { prestaId },
    orderBy: { position: "asc" },
  });
}

// === Envoi groupé (marquage + logs) vers EVA CORE ===

// Applique le marquage reçu de la régie (IndexedDB) à la copie serveur, marque
// les logs comme envoyés, transmet à EVA CORE (stub) et renvoie la liste de
// confs synchronisée (réconciliation §5.5).
export async function applyMarkingAndSend(
  prestaId: string,
  slug: string,
  markings: CoreMarkingItem[],
  logIds: string[]
) {
  // 1. Écrit la copie serveur du marquage. `updateMany` scopé à `prestaId`
  //    (fix E-2 : un marquage ciblant la conf d'une AUTRE presta ne matche pas).
  for (const m of markings) {
    await prisma.masterConference
      .updateMany({
        where: { id: m.conferenceId, prestaId },
        data: {
          startedAt: m.startedAt ? new Date(m.startedAt) : null,
          endedAt: m.endedAt ? new Date(m.endedAt) : null,
          status: m.status,
        },
      })
      .catch(() => {
        // conf supprimée entre-temps : on ignore, sans conséquence.
      });
  }

  // 2. Marque les logs joints comme envoyés.
  const logs = await prisma.masterVmixLog.findMany({
    where: { prestaId, id: { in: logIds } },
  });
  if (logIds.length > 0) {
    await prisma.masterVmixLog.updateMany({
      where: { prestaId, id: { in: logIds } },
      data: { sent: true },
    });
  }

  // 3. Transmet à EVA CORE (stub) + réconciliation retour.
  const sync = await sendMarkingAndLogs({
    prestaId,
    prestaSlug: slug,
    markings,
    logFilenames: logs.map((l) => l.filename),
  });

  // 4. Réconcilie la liste (ajouts/mises à jour par position, pas de delete).
  const conferences = await syncConferencesFromCore(prestaId, slug);

  return { sync, conferences };
}
