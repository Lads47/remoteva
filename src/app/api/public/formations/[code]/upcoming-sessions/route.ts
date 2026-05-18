import { NextRequest } from "next/server";
import { corsPreflightResponse, jsonCors } from "@/lib/apiCors";
import { getFormationByCode } from "@/lib/formation";
import { getSessionsByFormation } from "@/lib/session";

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "https://evaremote.com";

// Limite par défaut. Surchargeable via ?limit=N (max 10).
const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 10;

export async function OPTIONS() {
  return corsPreflightResponse();
}

// GET /api/public/formations/[code]/upcoming-sessions?limit=3
//
// Endpoint public CORS-friendly pour embarquer la liste des prochaines
// sessions d'une formation sur un site externe (ex: lesateliersdustream.fr).
//
// Filtres appliqués :
// - formation active
// - sessions au statut "open"
// - dateDebut dans le futur (ou aujourd'hui)
// - placesRestantes > 0
// - triées par dateDebut croissante
// - limitées à N (défaut 3)
export async function GET(request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;

    const { searchParams } = new URL(request.url);
    const limitRaw = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
    const limit = Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(limitRaw) ? limitRaw : DEFAULT_LIMIT));

    const formation = await getFormationByCode(code);
    if (!formation || !formation.active) {
      return jsonCors({ error: "Formation introuvable" }, { status: 404 });
    }

    const all = await getSessionsByFormation(formation.id);
    const now = Date.now();
    const upcoming = all
      .filter((s) => s.status === "open")
      .filter((s) => new Date(s.dateDebut).getTime() >= now - 24 * 3600 * 1000) // tolérance 1j
      .filter((s) => s.capacite - s.traineeCount > 0)
      .sort((a, b) => new Date(a.dateDebut).getTime() - new Date(b.dateDebut).getTime())
      .slice(0, limit);

    const inscriptionBase = `${PUBLIC_BASE_URL}/formations/${encodeURIComponent(formation.code)}/inscription`;

    return jsonCors({
      formation: {
        code: formation.code,
        nomLong: formation.nomLong,
        dureeJours: formation.dureeJours,
        prixHT: formation.prixHT,
      },
      sessions: upcoming.map((s) => ({
        id: s.id,
        code: s.code,
        dateDebut: s.dateDebut,
        dateFin: s.dateFin,
        lieu: s.lieu,
        horaires: s.horaires,
        capacite: s.capacite,
        placesRestantes: Math.max(0, s.capacite - s.traineeCount),
        inscriptionUrl: `${inscriptionBase}?session=${encodeURIComponent(s.id)}`,
      })),
    });
  } catch (error) {
    console.error("[/api/public/formations/[code]/upcoming-sessions] error:", error);
    return jsonCors({ error: "Erreur serveur" }, { status: 500 });
  }
}
