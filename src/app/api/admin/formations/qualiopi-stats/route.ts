// GET /api/admin/formations/qualiopi-stats?year=YYYY
//
// Renvoie tous les indicateurs Qualiopi annuels agrégés en un appel :
// activité (volume + heures-stagiaires), satisfaction chaud, satisfaction
// froid, atteinte des objectifs pédagogiques, satisfaction formateurs et
// réclamations. Utilisé par le dashboard /admin/formations.
//
// Auth : la route est sous /api/admin/* → vérifiée par le proxy global
// (cookie session OU Bearer CRON_SECRET).

import { NextResponse } from "next/server";
import { getQualiopiOverview, getAvailableYears } from "@/lib/analytics";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const yearParam = url.searchParams.get("year");
    const year = yearParam ? Number.parseInt(yearParam, 10) : new Date().getFullYear();
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "Année invalide" }, { status: 400 });
    }

    const [overview, availableYears] = await Promise.all([
      getQualiopiOverview(year),
      getAvailableYears(),
    ]);

    return NextResponse.json({ ...overview, availableYears });
  } catch (error) {
    console.error("[/api/admin/formations/qualiopi-stats] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
