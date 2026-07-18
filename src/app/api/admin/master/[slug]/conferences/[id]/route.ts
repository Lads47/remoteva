import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateConference, deleteConference } from "@/lib/master";

async function requireAuth() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  return null;
}

// PATCH /api/admin/master/[slug]/conferences/[id]
// Édite une conf : titre, statut, marquage (copie serveur), intervenants.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  try {
    const body = await request.json();
    const conference = await updateConference(id, {
      title: typeof body.title === "string" ? body.title : undefined,
      status: typeof body.status === "string" ? body.status : undefined,
      startedAt:
        body.startedAt === null
          ? null
          : typeof body.startedAt === "string"
          ? new Date(body.startedAt)
          : undefined,
      endedAt:
        body.endedAt === null
          ? null
          : typeof body.endedAt === "string"
          ? new Date(body.endedAt)
          : undefined,
      speakers: Array.isArray(body.speakers) ? body.speakers.map(String) : undefined,
    });
    return NextResponse.json({ conference });
  } catch (error) {
    console.error("Erreur maj conf:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/admin/master/[slug]/conferences/[id] - retire une conf
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  try {
    await deleteConference(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression conf:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
