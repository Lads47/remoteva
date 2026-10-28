import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { traineeStatusTransitionSchema } from "@/lib/validation";
import { type EvaStatus } from "@/lib/appConfig";
import { transitionTraineeStatus } from "@/lib/trainee-status";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// POST /api/admin/trainees/[id]/status
// Change le statut EVA d'un stagiaire. Les effets de bord (date métier, sync
// Sellsy sortante, génération convention au "devis_signe", documents de fin au
// "termine") sont dans transitionTraineeStatus (partagé avec /upload-signed).
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await ctx.params;
    const body = await request.json();
    const parsed = traineeStatusTransitionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation échouée", issues: parsed.error.issues }, { status: 400 });
    }
    const newStatus = parsed.data.status as EvaStatus;

    const r = await transitionTraineeStatus(id, newStatus);
    if (r.kind === "not_found") {
      return NextResponse.json({ error: "Stagiaire introuvable" }, { status: 404 });
    }
    if (r.kind === "unchanged") {
      return NextResponse.json({ trainee: r.trainee, sellsySynced: false, note: "Statut inchangé" });
    }
    return NextResponse.json({
      trainee: r.trainee,
      sellsySynced: r.sellsySynced,
      sellsyError: r.sellsyError,
      contractTriggered: r.contractTriggered,
      endOfTrainingTriggered: r.endOfTrainingTriggered,
    });
  } catch (error) {
    console.error("[/api/admin/trainees/[id]/status] POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
