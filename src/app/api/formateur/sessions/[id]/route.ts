import { NextRequest, NextResponse } from "next/server";
import { getTrainerSessionDetail } from "@/lib/trainer";
import { resolvePrerequisForFormation } from "@/lib/formation-prerequis";

// GET /api/formateur/sessions/[id]?token=xxx
// Renvoie le détail d'une session avec ses stagiaires (lecture seule formateur).
// Vérifie que la session appartient bien au formateur authentifié via le token.
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    if (!token) return NextResponse.json({ error: "Token requis" }, { status: 400 });

    const { id } = await ctx.params;
    const detail = await getTrainerSessionDetail(token, id);
    if (!detail) {
      // 404 plutôt que 403 pour ne pas leaker l'existence d'une session
      return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    }

    const prerequisSchema = resolvePrerequisForFormation({
      code: detail.formation.code,
      configForm: detail.formation.configForm,
    });

    return NextResponse.json({
      trainer: detail.trainer,
      session: detail.session,
      formation: {
        code: detail.formation.code,
        nomLong: detail.formation.nomLong,
        description: detail.formation.description,
        dureeJours: detail.formation.dureeJours,
      },
      trainees: detail.trainees,
      prerequisSchema,
    });
  } catch (error) {
    console.error("[/api/formateur/sessions/[id]] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
