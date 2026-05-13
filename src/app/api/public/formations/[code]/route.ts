import { NextRequest, NextResponse } from "next/server";
import { getFormationByCode } from "@/lib/formation";
import { getSessionsByFormation } from "@/lib/session";
import { resolvePrerequisForFormation } from "@/lib/formation-prerequis";

// GET /api/public/formations/[code]
// Renvoie la formation (vue publique) + ses sessions ouvertes (status === "open")
export async function GET(_request: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    const formation = await getFormationByCode(code);
    if (!formation || !formation.active) {
      return NextResponse.json({ error: "Formation introuvable" }, { status: 404 });
    }

    const allSessions = await getSessionsByFormation(formation.id);
    const sessions = allSessions
      .filter((s) => s.status === "open")
      .map((s) => ({
        id: s.id,
        code: s.code,
        dateDebut: s.dateDebut,
        dateFin: s.dateFin,
        lieu: s.lieu,
        horaires: s.horaires,
        capacite: s.capacite,
        placesRestantes: Math.max(0, s.capacite - s.traineeCount),
      }));

    const prerequisSchema = resolvePrerequisForFormation({
      code: formation.code,
      configForm: formation.configForm,
    });

    return NextResponse.json({
      formation: {
        code: formation.code,
        nomLong: formation.nomLong,
        description: formation.description,
        prixHT: formation.prixHT,
        dureeJours: formation.dureeJours,
      },
      sessions,
      prerequisSchema,
    });
  } catch (error) {
    console.error("[/api/public/formations/[code]] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
