import { NextRequest, NextResponse } from "next/server";
import { requireMasterAccess } from "@/lib/master-auth";
import prisma from "@/lib/db";
import { updateConference, deleteConference } from "@/lib/master";

async function requireAuth() {
  return requireMasterAccess();
}

// Fix E-2 : vérifie que la conf `id` appartient bien à la presta du `slug`.
// Empêche de modifier/supprimer la conf d'une AUTRE presta via son id.
// Renvoie true si l'appartenance est confirmée.
async function confBelongsToPresta(slug: string, id: string): Promise<boolean> {
  const conf = await prisma.masterConference.findFirst({
    where: { id, presta: { slug } },
    select: { id: true },
  });
  return conf !== null;
}

// PATCH /api/admin/master/[slug]/conferences/[id]
// Édite une conf : titre, statut, marquage (copie serveur), intervenants, correction.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { slug, id } = await params;
  if (!(await confBelongsToPresta(slug, id))) {
    return NextResponse.json({ error: "Conférence introuvable" }, { status: 404 });
  }

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
      summary: typeof body.summary === "string" ? body.summary : undefined,
      speakerMapping:
        body.speakerMapping && typeof body.speakerMapping === "object"
          ? (body.speakerMapping as Record<string, string>)
          : undefined,
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

  const { slug, id } = await params;
  if (!(await confBelongsToPresta(slug, id))) {
    return NextResponse.json({ error: "Conférence introuvable" }, { status: 404 });
  }

  try {
    await deleteConference(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression conf:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
