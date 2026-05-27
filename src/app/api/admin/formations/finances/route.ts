// GET /api/admin/formations/finances?year=YYYY&formationId=XXX
//
// Renvoie les stats financières par session pour une année + la liste des
// années avec sessions terminées (pour le sélecteur côté UI).

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getFinancialStats, getYearsWithFinishedSessions } from "@/lib/finances";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const formationId = searchParams.get("formationId") || undefined;

    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    if (!Number.isFinite(year) || year < 2020 || year > 2100) {
      return NextResponse.json({ error: "Année invalide" }, { status: 400 });
    }

    const [overview, yearsAvailable] = await Promise.all([
      getFinancialStats(year, formationId),
      getYearsWithFinishedSessions(),
    ]);

    return NextResponse.json({ overview, yearsAvailable });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[/api/admin/formations/finances] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
