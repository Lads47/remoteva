// Critères d'un exercice — édition formateur (portail magic-token).
//   POST ?token= : crée un critère    { libelle }
//   PUT  ?token= : réordonne          { orderedIds: string[] }

import { NextRequest, NextResponse } from "next/server";
import { createCriterion, reorderCriteria } from "@/lib/evaluation-grids";
import { authTrainerForExercise, notifyAdminGridEdit } from "@/lib/trainer-grid-access";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id } = await ctx.params;

    const auth = await authTrainerForExercise(token, id);
    if (!auth) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const body = await request.json();
    const libelle = typeof body?.libelle === "string" ? body.libelle.trim() : "";
    if (!libelle) return NextResponse.json({ error: "Libellé requis" }, { status: 400 });

    const criterion = await createCriterion({ exerciseId: id, libelle });
    await notifyAdminGridEdit(auth, "Ajout d'un critère", libelle);
    return NextResponse.json({ criterion }, { status: 201 });
  } catch (error) {
    console.error("[/api/formateur/exercises/[id]/criteria] POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id } = await ctx.params;

    const auth = await authTrainerForExercise(token, id);
    if (!auth) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const body = await request.json();
    const orderedIds = Array.isArray(body?.orderedIds) ? body.orderedIds : null;
    if (!orderedIds || !orderedIds.every((x: unknown) => typeof x === "string")) {
      return NextResponse.json({ error: "orderedIds: tableau de string requis" }, { status: 400 });
    }
    await reorderCriteria(id, orderedIds);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/formateur/exercises/[id]/criteria] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
