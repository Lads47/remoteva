// PUT/DELETE d'un exercice par le formateur (portail magic-token).
//   PUT    ?token= : { titre?, description?, active? }
//   DELETE ?token= : supprime l'exercice + ses critères (cascade)

import { NextRequest, NextResponse } from "next/server";
import { deleteExercise, getExerciseById, updateExercise } from "@/lib/evaluation-grids";
import { authTrainerForExercise, notifyAdminGridEdit } from "@/lib/trainer-grid-access";

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id } = await ctx.params;

    const auth = await authTrainerForExercise(token, id);
    if (!auth) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const body = await request.json();
    const exercise = await updateExercise(id, {
      titre: typeof body?.titre === "string" ? body.titre : undefined,
      description: typeof body?.description === "string" ? body.description : undefined,
      active: typeof body?.active === "boolean" ? body.active : undefined,
    });
    await notifyAdminGridEdit(auth, "Modification d'un exercice", exercise?.titre);
    return NextResponse.json({ exercise });
  } catch (error) {
    console.error("[/api/formateur/exercises/[id]] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id } = await ctx.params;

    const auth = await authTrainerForExercise(token, id);
    if (!auth) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const existing = await getExerciseById(id);
    await deleteExercise(id);
    await notifyAdminGridEdit(auth, "Suppression d'un exercice", existing?.titre);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/formateur/exercises/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
