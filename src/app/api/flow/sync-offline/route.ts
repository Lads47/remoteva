import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/apiKey";
import { corsPreflightResponse, jsonCors, withCors } from "@/lib/apiCors";
import {
  createFlowProject,
  getProjectByEventId,
  refreshProjectStatus,
  updateFlowProject,
} from "@/lib/flow";
import { createConference, updateConference, type ConferenceStatus } from "@/lib/conference";
import { syncOfflineSchema } from "@/lib/validation";
import prisma from "@/lib/db";

export async function OPTIONS() {
  return corsPreflightResponse();
}

/**
 * POST /api/flow/sync-offline
 *
 * Stratégie de merge :
 * - Si `project.eventId` est fourni et matche un projet existant → MERGE :
 *     - Met à jour les champs projet
 *     - Pour chaque conférence : si même `order` existe → update, sinon → create
 * - Sinon → CREATE un nouveau projet (avec eventId généré côté serveur)
 *
 * Idempotence : refaire le même sync ne crée pas de doublons (merge par eventId+order).
 */
export async function POST(request: NextRequest) {
  const authError = await requireApiKey(request);
  if (authError) return withCors(authError);

  try {
    const body = await request.json();
    const parsed = syncOfflineSchema.safeParse(body);
    if (!parsed.success) {
      return jsonCors(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { project: pIn, conferences: confsIn } = parsed.data;
    const projectDate = new Date(pIn.date);

    // === Cas 1 : eventId fourni → tentative de merge ===
    if (pIn.eventId) {
      const existing = await getProjectByEventId(pIn.eventId);
      if (existing) {
        // Met à jour les champs projet (sans toucher au statut, qui sera recalculé)
        await updateFlowProject(existing.id, {
          title: pIn.title,
          date: projectDate,
          location: pIn.location,
          room: pIn.room,
          speaker: pIn.speaker,
          director: pIn.director,
          regie: pIn.regie ?? null,
          recordingLocalPath: pIn.recordingLocalPath ?? null,
          notes: pIn.notes,
        });

        // Conférences : merge par order
        const existingByOrder = new Map(existing.conferences.map((c) => [c.order, c]));

        for (const c of confsIn) {
          const match = existingByOrder.get(c.order);
          const data = {
            title: c.title,
            speaker: c.speaker,
            status: c.status as ConferenceStatus | undefined,
            scheduledStart: c.scheduledStart ? new Date(c.scheduledStart) : null,
            scheduledEnd: c.scheduledEnd ? new Date(c.scheduledEnd) : null,
            startTime: c.startTime ? new Date(c.startTime) : null,
            endTime: c.endTime ? new Date(c.endTime) : null,
            localFolder: c.localFolder ?? null,
            durationSeconds: c.durationSeconds ?? null,
          };

          if (match) {
            await updateConference(match.id, data);
          } else {
            const created = await createConference({
              flowProjectId: existing.id,
              title: c.title,
              speaker: c.speaker,
              order: c.order,
              scheduledStart: data.scheduledStart,
              scheduledEnd: data.scheduledEnd,
            });
            // Update les fields supplémentaires (status, startTime, etc.)
            if (data.status || data.startTime || data.endTime || data.localFolder !== null || data.durationSeconds !== null) {
              await updateConference(created.id, data);
            }
          }
        }

        await refreshProjectStatus(existing.id);
        const final = await getProjectByEventId(pIn.eventId);
        return jsonCors({ project: final, merged: true }, { status: 200 });
      }
      // eventId fourni mais introuvable → on continue vers la création (le client pourra réutiliser cet ID)
    }

    // === Cas 2 : pas d'eventId / eventId inconnu → CREATE ===
    // Si l'eventId est fourni et qu'on doit le respecter, il faut bypasser la génération auto.
    // Pour simplifier : si eventId fourni & non utilisé, on l'utilise tel quel.
    // Sinon createFlowProject génère.
    let project;
    if (pIn.eventId) {
      // Création directe avec eventId imposé
      const created = await prisma.flowProject.create({
        data: {
          eventId: pIn.eventId,
          title: pIn.title,
          date: projectDate,
          location: pIn.location,
          room: pIn.room,
          speaker: pIn.speaker,
          director: pIn.director,
          regie: pIn.regie ?? null,
          recordingLocalPath: pIn.recordingLocalPath ?? null,
          notes: pIn.notes,
        },
      });
      // Crée les conférences
      for (const c of confsIn) {
        const conf = await createConference({
          flowProjectId: created.id,
          title: c.title,
          speaker: c.speaker,
          order: c.order,
          scheduledStart: c.scheduledStart ? new Date(c.scheduledStart) : null,
          scheduledEnd: c.scheduledEnd ? new Date(c.scheduledEnd) : null,
        });
        if (c.status || c.startTime || c.endTime || c.localFolder !== null || c.durationSeconds !== null) {
          await updateConference(conf.id, {
            status: c.status as ConferenceStatus | undefined,
            startTime: c.startTime ? new Date(c.startTime) : null,
            endTime: c.endTime ? new Date(c.endTime) : null,
            localFolder: c.localFolder ?? null,
            durationSeconds: c.durationSeconds ?? null,
          });
        }
      }
      await refreshProjectStatus(created.id);
      project = await getProjectByEventId(created.eventId);
    } else {
      project = await createFlowProject({
        title: pIn.title,
        date: projectDate,
        location: pIn.location,
        room: pIn.room,
        speaker: pIn.speaker,
        director: pIn.director,
        notes: pIn.notes,
        conferences: confsIn.map((c) => ({
          title: c.title,
          speaker: c.speaker,
          order: c.order,
          scheduledStart: c.scheduledStart ? new Date(c.scheduledStart) : null,
          scheduledEnd: c.scheduledEnd ? new Date(c.scheduledEnd) : null,
        })),
      });
      // Régie / path / status conf à appliquer après création
      if (pIn.regie || pIn.recordingLocalPath) {
        await updateFlowProject(project.id, {
          regie: pIn.regie ?? null,
          recordingLocalPath: pIn.recordingLocalPath ?? null,
        });
      }
      // Status / timestamps des confs
      for (const c of confsIn) {
        if (c.status || c.startTime || c.endTime || c.localFolder !== null || c.durationSeconds !== null) {
          const created = project.conferences.find((cc) => cc.order === c.order);
          if (created) {
            await updateConference(created.id, {
              status: c.status as ConferenceStatus | undefined,
              startTime: c.startTime ? new Date(c.startTime) : null,
              endTime: c.endTime ? new Date(c.endTime) : null,
              localFolder: c.localFolder ?? null,
              durationSeconds: c.durationSeconds ?? null,
            });
          }
        }
      }
      await refreshProjectStatus(project.id);
      project = await getProjectByEventId(project.eventId);
    }

    return jsonCors({ project, merged: false }, { status: 201 });
  } catch (error) {
    console.error("[/api/flow/sync-offline] error:", error);
    // Cas d'eventId imposé déjà existant (race condition / clé unique)
    if (error instanceof Error && error.message.includes("Unique")) {
      return jsonCors({ error: "Conflit eventId (unique)" }, { status: 409 });
    }
    return jsonCors({ error: "Erreur serveur" }, { status: 500 });
  }
}
