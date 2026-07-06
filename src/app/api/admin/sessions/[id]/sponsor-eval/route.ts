// API admin synthèse satisfaction commanditaire/entreprise :
//   GET → synthèse JSON (stats par question + tableau par entreprise/contact)

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildSponsorEvalSynthesis } from "@/lib/sponsor-eval";

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
    const synth = await buildSponsorEvalSynthesis(id);
    if (!synth) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    return NextResponse.json(synth);
  } catch (error) {
    console.error("[/api/admin/sessions/[id]/sponsor-eval] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
