import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getTraineeWithDetails } from "@/lib/trainee";
import { resolvePrerequisForFormation } from "@/lib/formation-prerequis";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// GET /api/admin/trainees/[id]
// Renvoie le trainee complet + sa session + sa formation + ses events + le schéma de pré-requis résolu.
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const trainee = await getTraineeWithDetails(id);
    if (!trainee) {
      return NextResponse.json({ error: "Stagiaire introuvable" }, { status: 404 });
    }
    const prerequisSchema = resolvePrerequisForFormation({
      code: trainee.formation.code,
      configForm: trainee.formation.configForm,
    });
    return NextResponse.json({ trainee, prerequisSchema });
  } catch (error) {
    console.error("[/api/admin/trainees/[id]] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
