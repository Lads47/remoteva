import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildAttendanceGrid } from "@/lib/attendance";
import prisma from "@/lib/db";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// GET /api/admin/sessions/[id]/attendance
// Renvoie la grille d'émargement de la session (lecture seule côté admin).
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const session = await prisma.session.findUnique({
      where: { id },
      select: { code: true, dateDebut: true, dateFin: true },
    });
    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });

    const grid = await buildAttendanceGrid(id);
    return NextResponse.json({
      session: { id, code: session.code, dateDebut: session.dateDebut, dateFin: session.dateFin },
      grid,
    });
  } catch (error) {
    console.error("[/api/admin/sessions/[id]/attendance] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
