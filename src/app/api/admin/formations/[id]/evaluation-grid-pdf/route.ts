// GET /api/admin/formations/[id]/evaluation-grid-pdf
// Télécharge la grille d'évaluation VIERGE de la formation au format PDF
// (document type présenté à l'auditeur Qualiopi). Content-Disposition:
// attachment → déclenche un téléchargement direct côté navigateur.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildBlankFormationGridPdf } from "@/lib/evaluation-pdf";

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
    const pdf = await buildBlankFormationGridPdf(id);
    return new NextResponse(new Uint8Array(pdf.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdf.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[/api/admin/formations/[id]/evaluation-grid-pdf] GET error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    const status = message === "Formation introuvable" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
