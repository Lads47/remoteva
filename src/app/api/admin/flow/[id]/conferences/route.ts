import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getProjectWithConferences, refreshProjectStatus } from "@/lib/flow";
import { listConferences, createConference } from "@/lib/conference";
import { createConferenceSchema } from "@/lib/validation";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// GET /api/admin/flow/[id]/conferences
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const conferences = await listConferences(id);
    return NextResponse.json({ conferences });
  } catch (error) {
    console.error("[/api/admin/flow/:id/conferences] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST /api/admin/flow/[id]/conferences
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await ctx.params;
    const project = await getProjectWithConferences(id);
    if (!project) return NextResponse.json({ error: "Événement introuvable" }, { status: 404 });

    const body = await request.json();
    const parsed = createConferenceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const conference = await createConference({
      flowProjectId: id,
      title: parsed.data.title,
      speaker: parsed.data.speaker,
      order: parsed.data.order,
      scheduledStart: parsed.data.scheduledStart ? new Date(parsed.data.scheduledStart) : null,
      scheduledEnd: parsed.data.scheduledEnd ? new Date(parsed.data.scheduledEnd) : null,
    });

    await refreshProjectStatus(id);
    return NextResponse.json({ conference }, { status: 201 });
  } catch (error) {
    console.error("[/api/admin/flow/:id/conferences] POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
