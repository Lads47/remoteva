// GET /api/admin/formations/dashboard-stats
//
// Stats sommaires pour le tableau de bord Formations. Volontairement léger :
// quelques compteurs basiques qui répondent aux questions admin du quotidien.
// Les indicateurs Qualiopi détaillés (NPS, satisfaction, atteinte objectifs,
// taux d'assiduité, BPF) seront ajoutés dans une 2e itération du dashboard.

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getComplaintStats } from "@/lib/complaint";
import { countNonEvalues } from "@/lib/trainee-non-evalues";

export async function GET() {
  try {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear() + 1, 0, 1);
    const threeMonthsLater = new Date(now.getTime() + 90 * 24 * 3600 * 1000);

    const [
      formationsActives,
      sessionsAVenir,
      sessionsEnCours,
      stagiairesAnnee,
      complaintStats,
      pendingTrainees,
      nonEvaluesCount,
    ] = await Promise.all([
      prisma.formation.count({ where: { active: true } }),
      prisma.session.count({
        where: {
          dateDebut: { gte: now, lt: threeMonthsLater },
          status: { in: ["open", "full", "planned"] },
        },
      }),
      prisma.session.count({
        where: {
          dateDebut: { lte: now },
          dateFin: { gte: now },
          status: { notIn: ["cancelled", "closed"] },
        },
      }),
      prisma.trainee.count({
        where: { createdAt: { gte: yearStart, lt: yearEnd }, isTest: false },
      }),
      getComplaintStats(now.getFullYear()),
      // Stagiaires "bloqués" : statut intermédiaire (devis_envoye / convention_envoyee)
      // depuis plus de 14 jours sans avancer
      prisma.trainee.count({
        where: {
          status: { in: ["devis_envoye", "convention_envoyee"] },
          updatedAt: { lte: new Date(now.getTime() - 14 * 24 * 3600 * 1000) },
          isTest: false,
        },
      }),
      countNonEvalues(),
    ]);

    return NextResponse.json({
      year: now.getFullYear(),
      formationsActives,
      sessionsAVenir,
      sessionsEnCours,
      stagiairesAnnee,
      pendingTrainees,
      nonEvalues: nonEvaluesCount,
      complaints: {
        total: complaintStats.total,
        open: complaintStats.unresolved,
        overdue: complaintStats.overdue,
        resolutionRate: complaintStats.resolutionRate,
      },
    });
  } catch (error) {
    console.error("[/api/admin/formations/dashboard-stats] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
