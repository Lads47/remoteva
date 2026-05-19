// API admin synthèse éval à chaud :
//   GET  → renvoie la synthèse JSON
//   POST → génère le PDF + archive sur Drive dans 03_EVALUATIONS/

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/db";
import { provisionSessionDriveFolder } from "@/lib/drive-provisioning";
import { findFile, findOrCreateFolder, isDriveConfigured, trashFile, uploadFile } from "@/lib/google-drive";
import { buildSessionSynthesis } from "@/lib/satisfaction";
import { buildSatisfactionPdf } from "@/lib/satisfaction-pdf";

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
    const synthesis = await buildSessionSynthesis(id);
    if (!synthesis) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    return NextResponse.json(synthesis);
  } catch (error) {
    console.error("[/api/admin/sessions/[id]/satisfaction] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const synthesis = await buildSessionSynthesis(id);
    if (!synthesis) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    if (synthesis.totals.submitted === 0) {
      return NextResponse.json({ error: "Aucune réponse soumise pour cette session." }, { status: 400 });
    }

    const pdf = await buildSatisfactionPdf(synthesis);

    if (!isDriveConfigured()) {
      return NextResponse.json({ error: "Drive non configuré (GOOGLE_SERVICE_ACCOUNT_KEY_B64 absent)" }, { status: 500 });
    }

    // Provisionne le dossier session si besoin + crée 03_EVALUATIONS
    const provision = await provisionSessionDriveFolder(id);
    if (!provision.ok) {
      return NextResponse.json({ error: `Dossier Drive : ${provision.error}` }, { status: 502 });
    }
    const evalFolder = await findOrCreateFolder(provision.driveFolderId, EVAL_FOLDER_NAME);

    // Si une version précédente du PDF existe, on la corbeille
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
    console.error("[/api/admin/sessions/[id]/satisfaction] POST error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET ?preview=1 : renvoie directement le PDF sans archivage (pour aperçu)
export async function PUT(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // (PUT utilisé comme alias preview pour ne pas confondre avec POST archive)
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const synthesis = await buildSessionSynthesis(id);
    if (!synthesis) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    const pdf = await buildSatisfactionPdf(synthesis);
    // Use Uint8Array view (TS-compat avec BodyInit dans Next 16)
    return new NextResponse(new Uint8Array(pdf.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdf.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[/api/admin/sessions/[id]/satisfaction] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// Quick helper pour reset les données pendant les tests si jamais (DELETE)
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const result = await prisma.satisfactionResponse.deleteMany({ where: { sessionId: id } });
    return NextResponse.json({ success: true, deleted: result.count });
  } catch (error) {
    console.error("[/api/admin/sessions/[id]/satisfaction] DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
