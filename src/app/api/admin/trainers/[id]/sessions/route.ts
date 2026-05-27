// GET /api/admin/trainers/[id]/sessions
//
// Renvoie la liste des sessions assignées à un formateur, avec pour chaque
// session : montant ST contractualisé, lien Drive du contrat, statut, etc.
// Utilisé sur la page de détail du formateur (historique d'activité +
// historique des contrats de sous-traitance pour audit Qualiopi ind. 27).

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/db";

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const { id } = await ctx.params;

    const trainer = await prisma.trainer.findUnique({
      where: { id },
      select: { id: true, prenom: true, nom: true, isExternal: true },
    });
    if (!trainer) {
      return NextResponse.json({ error: "Formateur introuvable" }, { status: 404 });
    }

    const sessions = await prisma.session.findMany({
      where: { trainerId: id },
      select: {
        id: true,
        code: true,
        dateDebut: true,
        dateFin: true,
        status: true,
        capacite: true,
        trainerFeeAmount: true,
        trainerContractDriveFileId: true,
        trainerContractSentAt: true,
        formation: { select: { code: true, nomLong: true } },
        _count: { select: { trainees: true } },
      },
      orderBy: { dateDebut: "desc" },
    });

    const totalContractsHt = sessions.reduce(
      (sum, s) => sum + (trainer.isExternal ? s.trainerFeeAmount ?? 0 : 0),
      0
    );
    const totalSessions = sessions.length;
    const totalContractsGenerated = sessions.filter(
      (s) => s.trainerContractDriveFileId !== null
    ).length;

    return NextResponse.json({
      trainer,
      sessions: sessions.map((s) => ({
        id: s.id,
        code: s.code,
        dateDebut: s.dateDebut,
        dateFin: s.dateFin,
        status: s.status,
        capacite: s.capacite,
        formationCode: s.formation.code,
        formationNomLong: s.formation.nomLong,
        traineeCount: s._count.trainees,
        trainerFeeAmount: s.trainerFeeAmount,
        trainerContractDriveFileId: s.trainerContractDriveFileId,
        trainerContractSentAt: s.trainerContractSentAt,
      })),
      summary: {
        totalSessions,
        totalContractsGenerated,
        totalContractsHt,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[/api/admin/trainers/[id]/sessions] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
