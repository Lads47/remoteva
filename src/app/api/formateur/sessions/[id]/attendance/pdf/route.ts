// GET /api/formateur/sessions/[id]/attendance/pdf?token=<magicToken>
//
// Génère et télécharge le PDF d'émargement collectif de la session (1 page par
// jour de formation, A4 portrait). Auth par magic-token formateur (le trainer
// doit être assigné à la session).

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { buildAttendanceGrid } from "@/lib/attendance";
import { buildAttendancePdf } from "@/lib/attendance-pdf";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id } = await ctx.params;
    if (!token) return NextResponse.json({ error: "token requis" }, { status: 400 });

    const trainer = await prisma.trainer.findUnique({ where: { magicToken: token } });
    if (!trainer || !trainer.active) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    const session = await prisma.session.findUnique({
      where: { id },
      select: {
        trainerId: true,
        code: true,
        lieu: true,
        formation: { select: { code: true, nomLong: true } },
      },
    });
    if (!session || session.trainerId !== trainer.id) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const grid = await buildAttendanceGrid(id);
    const { buffer, filename } = await buildAttendancePdf({
      session: { code: session.code, lieu: session.lieu },
      formation: session.formation,
      trainer: { prenom: trainer.prenom, nom: trainer.nom },
      grid,
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[/api/formateur/sessions/[id]/attendance/pdf] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
