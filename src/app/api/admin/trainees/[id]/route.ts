import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getTraineeById, getTraineeWithDetails, recordTraineeEvent, updateTrainee } from "@/lib/trainee";
import { resolvePrerequisForFormation } from "@/lib/formation-prerequis";
import { adminUpdateTraineeSchema } from "@/lib/validation";

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

// PUT /api/admin/trainees/[id]
// Correction de saisie : permet à l'admin de modifier les champs métier d'un stagiaire.
// Ne touche pas aux IDs Sellsy/Drive ni au statut (qui ont leurs propres workflows).
export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const existing = await getTraineeById(id);
    if (!existing) {
      return NextResponse.json({ error: "Stagiaire introuvable" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = adminUpdateTraineeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const trainee = await updateTrainee(id, parsed.data);

    // Trace l'événement d'édition pour l'audit Qualiopi (en notant les champs modifiés)
    const changedFields = Object.keys(parsed.data).filter((k) => {
      const v = (parsed.data as Record<string, unknown>)[k];
      const old = (existing as unknown as Record<string, unknown>)[k];
      return v !== undefined && v !== old;
    });
    if (changedFields.length > 0) {
      await recordTraineeEvent(
        id,
        "note",
        `Fiche modifiée : ${changedFields.join(", ")}`,
        { changedFields }
      );
    }

    return NextResponse.json({ trainee });
  } catch (error) {
    console.error("[/api/admin/trainees/[id]] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
