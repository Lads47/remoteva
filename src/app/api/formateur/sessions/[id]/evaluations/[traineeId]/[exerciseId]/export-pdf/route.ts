import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { authTrainerForSession, upsertEvaluation } from "@/lib/evaluation-entries";
import { syncEvaluationToDrive } from "@/lib/evaluation-drive";
import { buildEvaluationPdf } from "@/lib/evaluation-pdf";

async function checkTraineeBelongsToSession(traineeId: string, sessionId: string): Promise<boolean> {
  const t = await prisma.trainee.findUnique({
    where: { id: traineeId },
    select: { sessionId: true },
  });
  return !!t && t.sessionId === sessionId;
}

// POST /api/formateur/sessions/[id]/evaluations/[traineeId]/[exerciseId]/export-pdf?token=...
// Génère le PDF de synthèse + upload Drive (03_EVALUATIONS/<Stagiaire>/).
// Crée la fiche d'évaluation si elle n'existe pas encore.
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; traineeId: string; exerciseId: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id, traineeId, exerciseId } = await ctx.params;

    const auth = await authTrainerForSession(token, id);
    if (!auth) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    if (!(await checkTraineeBelongsToSession(traineeId, id))) {
      return NextResponse.json({ error: "Stagiaire introuvable dans cette session" }, { status: 404 });
    }

    // S'assure qu'une fiche existe (vide si pas encore saisie — utile pour
    // pouvoir tester l'archivage avant remplissage complet).
    const existing = await prisma.traineeExerciseEvaluation.findUnique({
      where: { traineeId_exerciseId: { traineeId, exerciseId } },
      select: { id: true },
    });
    let evaluationId: string;
    if (existing) {
      evaluationId = existing.id;
    } else {
      evaluationId = await upsertEvaluation({
        traineeId,
        exerciseId,
        evaluatorId: auth.trainer.id,
        globalNote: "",
        observations: "",
        scores: [],
      });
    }

    const result = await syncEvaluationToDrive(evaluationId);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 });
    }
    return NextResponse.json({
      success: true,
      driveFileId: result.driveFileId,
      driveWebUrl: result.driveWebUrl,
    });
  } catch (error) {
    console.error("[/api/formateur/.../export-pdf] error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET /api/formateur/sessions/[id]/evaluations/[traineeId]/[exerciseId]/export-pdf?token=...
// Renvoie le PDF directement en download (pour permettre de prévisualiser
// sans avoir à passer par Drive).
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; traineeId: string; exerciseId: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id, traineeId, exerciseId } = await ctx.params;

    const auth = await authTrainerForSession(token, id);
    if (!auth) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    if (!(await checkTraineeBelongsToSession(traineeId, id))) {
      return NextResponse.json({ error: "Stagiaire introuvable dans cette session" }, { status: 404 });
    }

    const existing = await prisma.traineeExerciseEvaluation.findUnique({
      where: { traineeId_exerciseId: { traineeId, exerciseId } },
      select: { id: true },
    });
    let evaluationId: string;
    if (existing) {
      evaluationId = existing.id;
    } else {
      evaluationId = await upsertEvaluation({
        traineeId,
        exerciseId,
        evaluatorId: auth.trainer.id,
        globalNote: "",
        observations: "",
        scores: [],
      });
    }

    const bundle = await buildEvaluationPdf(evaluationId);
    return new NextResponse(new Uint8Array(bundle.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${bundle.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[/api/formateur/.../export-pdf GET] error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
