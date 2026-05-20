// PUT /api/admin/trainees/[id]/objectifs-atteints
//
// Met à jour le champ override d'atteinte des objectifs pour ce stagiaire.
// Body : { value: "" | "atteints" | "partiellement_atteints" | "non_atteints" }
//
// "" = revient au calcul auto depuis les grilles d'évaluation.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/db";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

const ALLOWED = new Set(["", "atteints", "partiellement_atteints", "non_atteints"]);

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const body = await request.json();
    const value = typeof body?.value === "string" ? body.value : "";
    if (!ALLOWED.has(value)) {
      return NextResponse.json(
        { error: "value invalide. Attendu : '' | 'atteints' | 'partiellement_atteints' | 'non_atteints'" },
        { status: 400 }
      );
    }
    await prisma.trainee.update({
      where: { id },
      data: { objectifsAtteintsOverride: value },
    });
    return NextResponse.json({ success: true, value });
  } catch (error) {
    console.error("[/api/admin/trainees/[id]/objectifs-atteints] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
