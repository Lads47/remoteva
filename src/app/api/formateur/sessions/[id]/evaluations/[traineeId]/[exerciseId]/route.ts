import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  authTrainerForSession,
  getEvaluationDetail,
  upsertEvaluation,
  type ScoreInput,
} from "@/lib/evaluation-entries";

// Vérifie qu'un trainee appartient bien à la session du formateur authentifié.
async function checkTraineeBelongsToSession(traineeId: string, sessionId: string): Promise<boolean> {
  const t = await prisma.trainee.findUnique({
    where: { id: traineeId },
    select: { sessionId: true },
  });
  return !!t && t.sessionId === sessionId;
}

// GET /api/formateur/sessions/[id]/evaluations/[traineeId]/[exerciseId]?token=...
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

    const detail = await getEvaluationDetail(traineeId, exerciseId);
    if (!detail) {
      return NextResponse.json({ error: "Évaluation introuvable" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error) {
    console.error("[/api/formateur/.../evaluations/.../GET] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PUT /api/formateur/sessions/[id]/evaluations/[traineeId]/[exerciseId]?token=...
// Body: { globalNote: string, observations: string, scores: [{ criterionId, score, comment }] }
export async function PUT(
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

    const body = await request.json();
    const globalNote = typeof body?.globalNote === "string" ? body.globalNote : "";
    const observations = typeof body?.observations === "string" ? body.observations : "";
    const scoresRaw = Array.isArray(body?.scores) ? body.scores : [];
    const scores: ScoreInput[] = scoresRaw
      .filter((s: unknown): s is { criterionId: string } => typeof s === "object" && s !== null && typeof (s as { criterionId?: unknown }).criterionId === "string")
      .map((s: { criterionId: string; score?: unknown; comment?: unknown }) => ({
        criterionId: s.criterionId,
        score: typeof s.score === "string" ? s.score : "",
        comment: typeof s.comment === "string" ? s.comment : "",
      }));

    await upsertEvaluation({
      traineeId,
      exerciseId,
      evaluatorId: auth.trainer.id,
      globalNote,
      observations,
      scores,
    });

    // Renvoie le détail à jour pour que l'UI reflète bien l'état
    const detail = await getEvaluationDetail(traineeId, exerciseId);
    return NextResponse.json({ success: true, evaluation: detail });
  } catch (error) {
    console.error("[/api/formateur/.../evaluations/.../PUT] error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
