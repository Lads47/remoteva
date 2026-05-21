// GET /api/admin/formations/qualiopi-sheet-info
//
// Renvoie l'état du sheet de bilan Qualiopi (id, URL, last sync timestamp).
// Lit AppConfig — pas d'appel Google. Utilisé par le dashboard pour afficher
// le lien "Voir le bilan complet sur Drive".
//
// Auth : déléguée au proxy global (cookie session OU Bearer CRON_SECRET).

import { NextResponse } from "next/server";
import { getQualiopiSheetInfo } from "@/lib/qualiopi-export";

export async function GET() {
  try {
    const info = await getQualiopiSheetInfo();
    return NextResponse.json(info);
  } catch (error) {
    console.error("[/api/admin/formations/qualiopi-sheet-info] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
