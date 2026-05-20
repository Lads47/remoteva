// API admin synthèse éval à froid :
//   GET  → synthèse JSON (stats + tableau par stagiaire)
//   PUT  → renvoie directement le PDF (aperçu inline)
//   POST → génère le PDF + archive sur Drive dans 03_EVALUATIONS/

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildColdEvalSynthesis } from "@/lib/cold-eval";
import { buildColdEvalPdf } from "@/lib/cold-eval-pdf";
import { provisionSessionDriveFolder } from "@/lib/drive-provisioning";
import { findFile, findOrCreateFolder, isDriveConfigured, trashFile, uploadFile } from "@/lib/google-drive";

const EVAL_FOLDER_NAME = "03_EVALUATIONS";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const synth = await buildColdEvalSynthesis(id);
    if (!synth) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    return NextResponse.json(synth);
  } catch (error) {
    console.error("[/api/admin/sessions/[id]/cold-eval] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PUT = aperçu inline du PDF (pas d'archivage). Convention identique au
// /satisfaction (PUT évite la confusion avec POST archive).
export async function PUT(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const synth = await buildColdEvalSynthesis(id);
    if (!synth) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    const pdf = await buildColdEvalPdf(synth);
    return new NextResponse(new Uint8Array(pdf.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdf.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[/api/admin/sessions/[id]/cold-eval] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST = génère le PDF + archive Drive dans 03_EVALUATIONS/
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const synth = await buildColdEvalSynthesis(id);
    if (!synth) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    if (synth.totals.submitted === 0) {
      return NextResponse.json({ error: "Aucune réponse à froid soumise pour cette session." }, { status: 400 });
    }

    const pdf = await buildColdEvalPdf(synth);

    if (!isDriveConfigured()) {
      return NextResponse.json({ error: "Drive non configuré (GOOGLE_SERVICE_ACCOUNT_KEY_B64 absent)" }, { status: 500 });
    }

    const provision = await provisionSessionDriveFolder(id);
    if (!provision.ok) {
      return NextResponse.json({ error: `Dossier Drive : ${provision.error}` }, { status: 502 });
    }
    const evalFolder = await findOrCreateFolder(provision.driveFolderId, EVAL_FOLDER_NAME);

    // Si une version précédente du PDF existe (même nom), on la corbeille
    // pour ne pas accumuler les doublons.
    const previous = await findFile(evalFolder.id, pdf.filename);
    if (previous) await trashFile(previous.id);

    const uploaded = await uploadFile({
      parentId: evalFolder.id,
      filename: pdf.filename,
      mimeType: "application/pdf",
      buffer: pdf.buffer,
    });

    return NextResponse.json({
      success: true,
      driveFileId: uploaded.id,
      driveWebUrl: uploaded.webViewLink ?? null,
      filename: pdf.filename,
    });
  } catch (error) {
    console.error("[/api/admin/sessions/[id]/cold-eval] POST error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
