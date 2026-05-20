// POST /api/admin/trainees/[id]/send-end-of-training
//
// Génère le certificat de réalisation + l'attestation de fin de formation
// pour ce stagiaire, les archive dans son dossier Drive, et envoie un mail
// unique avec les 2 PDF en pièces jointes.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { generateAndMailEndOfTrainingDocs } from "@/lib/trainee-documents";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const result = await generateAndMailEndOfTrainingDocs(id);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 });
    }
    return NextResponse.json({
      success: true,
      emailSent: result.emailSent,
      emailError: result.emailError,
      certificatDriveFileId: result.certificatDriveFileId,
      attestationDriveFileId: result.attestationDriveFileId,
    });
  } catch (error) {
    console.error("[/api/admin/trainees/[id]/send-end-of-training] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
