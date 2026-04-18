import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getProjectWithConferences, updateFlowProject } from "@/lib/flow";
import { getDirector } from "@/lib/director";
import { sendFeuilleDeRouteEmail } from "@/lib/email";
import { z } from "zod";

const assignSchema = z.object({
  directorId: z.string().nullable(),
});

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// POST /api/admin/flow/[id]/assign-director
// Body: { directorId: string | null }
// Assigne un réalisateur à un projet et lui envoie la feuille de route par email.
// Si directorId = null → désassigne (pas de mail envoyé).
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await ctx.params;
    const project = await getProjectWithConferences(id);
    if (!project) return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });

    const body = await request.json();
    const parsed = assignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { directorId } = parsed.data;

    // Désassignation
    if (directorId === null) {
      await updateFlowProject(id, { directorId: null, director: "" });
      return NextResponse.json({ success: true, emailSent: false });
    }

    const director = await getDirector(directorId);
    if (!director) return NextResponse.json({ error: "Réalisateur introuvable" }, { status: 404 });

    await updateFlowProject(id, { directorId, director: director.name });

    // Envoi feuille de route best-effort
    const emailRes = await sendFeuilleDeRouteEmail({
      to: director.email,
      directorName: director.name,
      eventId: project.eventId,
      eventTitle: project.title,
      eventDate: project.date,
      location: project.location,
      room: project.room,
      regie: project.regie,
      recordingLocalPath: project.recordingLocalPath,
      notes: project.notes,
      conferences: project.conferences.map((c) => ({
        order: c.order,
        title: c.title,
        speaker: c.speaker,
        scheduledStart: c.scheduledStart,
        scheduledEnd: c.scheduledEnd,
      })),
    });

    return NextResponse.json({
      success: true,
      director: { id: director.id, name: director.name, email: director.email },
      emailSent: emailRes.success === true,
      emailError: emailRes.success ? undefined : emailRes.error,
    });
  } catch (error) {
    console.error("[/api/admin/flow/:id/assign-director] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
