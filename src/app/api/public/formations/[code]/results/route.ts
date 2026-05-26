// GET /api/public/formations/[code]/results
//
// Endpoint public CORS-friendly pour afficher les résultats agrégés d'une
// formation sur un site externe (ex: lesateliersdustream.fr). Couvre
// Qualiopi indicateur 1 (information publique sur les prestations).
//
// Ne renvoie que des chiffres agrégés (jamais de nom individuel) → 0 souci
// RGPD. Si moins de 5 stagiaires formés, hasEnoughData = false (l'UI publique
// masque le bloc).

import { NextRequest } from "next/server";
import { corsPreflightResponse, jsonCors } from "@/lib/apiCors";
import { getFormationPublicResults } from "@/lib/analytics";

export async function OPTIONS() {
  return corsPreflightResponse();
}

export async function GET(_request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const results = await getFormationPublicResults(code);
    if (!results) {
      return jsonCors({ error: "Formation introuvable" }, { status: 404 });
    }
    return jsonCors(results);
  } catch (error) {
    console.error("[/api/public/formations/[code]/results] error:", error);
    return jsonCors({ error: "Erreur serveur" }, { status: 500 });
  }
}
