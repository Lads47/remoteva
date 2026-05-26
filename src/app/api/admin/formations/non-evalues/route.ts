// GET /api/admin/formations/non-evalues
//
// Liste les stagiaires "terminés" sans évaluation finale (ni grille remplie
// ni override manuel). Pour la page admin de suivi /admin/formations/non-evalues.

import { NextResponse } from "next/server";
import { findNonEvaluesTrainees } from "@/lib/trainee-non-evalues";

export async function GET() {
  try {
    const list = await findNonEvaluesTrainees();
    return NextResponse.json({ trainees: list, count: list.length });
  } catch (error) {
    console.error("[/api/admin/formations/non-evalues] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
