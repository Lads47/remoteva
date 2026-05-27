// POST /api/admin/trainees/[id]/regenerate-end-of-training
//
// Force la re-génération + le re-envoi du certificat de réalisation et de
// l'attestation de fin de formation pour un stagiaire en statut "terminé".
//
// Utile pour :
//   - Mise à jour de template (formulation, charte graphique…)
//   - Correction de données stagiaire (nom mal saisi, dates, etc.)
//   - Changement de l'override "objectifs atteints" après coup
//
// Contrairement au trigger automatique au passage à "termine" (qui skip
// si docs déjà envoyés pour éviter le spam), cet endpoint force la
// regénération sans condition.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { generateAndMailEndOfTrainingDocs } from "@/lib/trainee-documents";

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const { id } = await ctx.params;
    const res = await generateAndMailEndOfTrainingDocs(id);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      certificatDriveFileId: res.certificatDriveFileId,
      attestationDriveFileId: res.attestationDriveFileId,
      emailSent: res.emailSent,
      emailError: res.emailError,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[/api/admin/trainees/[id]/regenerate-end-of-training] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
