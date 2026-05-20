import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  generateTraineeDocument,
  type DocumentType,
} from "@/lib/trainee-documents";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

const ALLOWED: DocumentType[] = ["convention", "contrat", "convocation", "certificat", "attestation"];

// POST /api/admin/trainees/[id]/generate-document
// Body : { type: "convention" | "contrat" | "convocation" }
// Copie le template Drive de la formation, substitue les variables, archive
// dans 01_INSCRIPTIONS_CONVENTIONS/<Stagiaire>/ et crée une ligne dans
// TraineeDocument.
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await ctx.params;
    const body = await request.json();
    const type = typeof body?.type === "string" ? body.type : "";
    if (!ALLOWED.includes(type as DocumentType)) {
      return NextResponse.json(
        { error: `type invalide. Attendu : ${ALLOWED.join(" | ")}` },
        { status: 400 }
      );
    }

    const result = await generateTraineeDocument(id, type as DocumentType);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 });
    }
    return NextResponse.json({
      success: true,
      documentId: result.documentId,
      driveFileId: result.driveFileId,
      driveWebUrl: result.driveWebUrl,
      fileName: result.fileName,
    });
  } catch (error) {
    console.error("[/api/admin/trainees/[id]/generate-document] error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
