import { NextRequest, NextResponse } from "next/server";
import { authTrainerForSession, getEvaluationMatrix } from "@/lib/evaluation-entries";

// GET /api/formateur/sessions/[id]/evaluations?token=...
// Matrice [stagiaires × exercices] avec état d'avancement par cellule.
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id } = await ctx.params;

    const auth = await authTrainerForSession(token, id);
    if (!auth) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const matrix = await getEvaluationMatrix(id);
    return NextResponse.json(matrix);
  } catch (error) {
    console.error("[/api/formateur/sessions/[id]/evaluations] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
