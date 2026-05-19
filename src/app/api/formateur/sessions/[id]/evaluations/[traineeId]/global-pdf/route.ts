import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { authTrainerForSession } from "@/lib/evaluation-entries";
import { syncGlobalEvaluationPdfToDrive } from "@/lib/evaluation-drive";
import { buildGlobalEvaluationPdf } from "@/lib/evaluation-pdf";

async function checkTraineeBelongsToSession(traineeId: string, sessionId: string): Promise<boolean> {
  const t = await prisma.trainee.findUnique({
    where: { id: traineeId },
    select: { sessionId: true },
  });
  return !!t && t.sessionId === sessionId;
}

// GET /api/formateur/sessions/[id]/evaluations/[traineeId]/global-pdf?token=...
// Renvoie le PDF global du stagiaire en download direct (aperçu).
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; traineeId: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id, traineeId } = await ctx.params;

    const auth = await authTrainerForSession(token, id);
    if (!auth) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    if (!(await checkTraineeBelongsToSession(traineeId, id))) {
      return NextResponse.json({ error: "Stagiaire introuvable dans cette session" }, { status: 404 });
    }

    const bundle = await buildGlobalEvaluationPdf(traineeId);
    return new NextResponse(new Uint8Array(bundle.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${bundle.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[/api/formateur/.../global-pdf GET] error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/formateur/sessions/[id]/evaluations/[traineeId]/global-pdf?token=...
// Génère + upload le PDF global dans 03_EVALUATIONS/<Stagiaire>/ sur Drive.
// Si une version antérieure existait, elle est mise à la corbeille.
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; traineeId: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id, traineeId } = await ctx.params;

    const auth = await authTrainerForSession(token, id);
    if (!auth) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    if (!(await checkTraineeBelongsToSession(traineeId, id))) {
      return NextResponse.json({ error: "Stagiaire introuvable dans cette session" }, { status: 404 });
    }

    const result = await syncGlobalEvaluationPdfToDrive(traineeId);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 });
    }
    return NextResponse.json({
      success: true,
      driveFileId: result.driveFileId,
      driveWebUrl: result.driveWebUrl,
    });
  } catch (error) {
    console.error("[/api/formateur/.../global-pdf POST] error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
