import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateConference, deleteConference } from "@/lib/conference";
import { refreshProjectStatus } from "@/lib/flow";
import { updateConferenceSchema } from "@/lib/validation";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// PUT /api/admin/flow/[id]/conferences/[confId]
export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; confId: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id: projectId, confId } = await ctx.params;
    const body = await request.json();
    const parsed = updateConferenceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const updated = await updateConference(confId, {
      title: data.title,
      speaker: data.speaker,
      order: data.order,
      status: data.status,
      scheduledStart: data.scheduledStart ? new Date(data.scheduledStart) : data.scheduledStart === null ? null : undefined,
      scheduledEnd: data.scheduledEnd ? new Date(data.scheduledEnd) : data.scheduledEnd === null ? null : undefined,
      startTime: data.startTime ? new Date(data.startTime) : data.startTime === null ? null : undefined,
      endTime: data.endTime ? new Date(data.endTime) : data.endTime === null ? null : undefined,
      localFolder: data.localFolder ?? undefined,
      durationSeconds: data.durationSeconds ?? undefined,
    });

    await refreshProjectStatus(projectId);
    return NextResponse.json({ conference: updated });
  } catch (error) {
    console.error("[/api/admin/flow/:id/conferences/:confId] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/admin/flow/[id]/conferences/[confId]
export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; confId: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id: projectId, confId } = await ctx.params;
    await deleteConference(confId);
    await refreshProjectStatus(projectId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/admin/flow/:id/conferences/:confId] DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
