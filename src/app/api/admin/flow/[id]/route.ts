import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getProjectWithConferences } from "@/lib/flow";
import { getAvailableDirectorsForDate } from "@/lib/director";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// GET /api/admin/flow/[id] — détail projet + dispos réals du jour
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await ctx.params;
    const project = await getProjectWithConferences(id);
    if (!project) return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });

    const availableDirectors = await getAvailableDirectorsForDate(project.date);
    return NextResponse.json({ project, availableDirectors });
  } catch (error) {
    console.error("[/api/admin/flow/:id] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
