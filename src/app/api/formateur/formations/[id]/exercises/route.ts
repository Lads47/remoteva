// Édition de la grille d'évaluation par le formateur (portail magic-token).
//   GET    ?token= : liste exercices + critères + méta (formation partagée ?)
//   POST   ?token= : crée un exercice  { titre, description? }
//   PUT    ?token= : réordonne         { orderedIds: string[] }
//
// Périmètre : le formateur doit avoir ≥1 session sur la formation.
// Chaque mutation déclenche une notification admin best-effort.

import { NextRequest, NextResponse } from "next/server";
import {
  createExercise,
  listExercisesByFormation,
  reorderExercises,
} from "@/lib/evaluation-grids";
import {
  authTrainerForFormation,
  isFormationSharedWithOtherTrainers,
  notifyAdminGridEdit,
} from "@/lib/trainer-grid-access";
import prisma from "@/lib/db";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id } = await ctx.params;

    const auth = await authTrainerForFormation(token, id);
    if (!auth) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const [exercises, formation, sharedInfo] = await Promise.all([
      listExercisesByFormation(id),
      prisma.formation.findUnique({ where: { id }, select: { code: true, nomLong: true } }),
      isFormationSharedWithOtherTrainers(id, auth.trainer.id),
    ]);

    return NextResponse.json({
      exercises,
      formation,
      shared: sharedInfo.shared,
      otherTrainers: sharedInfo.otherTrainers,
    });
  } catch (error) {
    console.error("[/api/formateur/formations/[id]/exercises] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id } = await ctx.params;

    const auth = await authTrainerForFormation(token, id);
    if (!auth) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const body = await request.json();
    const titre = typeof body?.titre === "string" ? body.titre.trim() : "";
    if (!titre) return NextResponse.json({ error: "Titre requis" }, { status: 400 });
    const description = typeof body?.description === "string" ? body.description : "";

    const exercise = await createExercise({ formationId: id, titre, description });
    await notifyAdminGridEdit(auth, "Ajout d'un exercice", titre);
    return NextResponse.json({ exercise }, { status: 201 });
  } catch (error) {
    console.error("[/api/formateur/formations/[id]/exercises] POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id } = await ctx.params;

    const auth = await authTrainerForFormation(token, id);
    if (!auth) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const body = await request.json();
    const orderedIds = Array.isArray(body?.orderedIds) ? body.orderedIds : null;
    if (!orderedIds || !orderedIds.every((x: unknown) => typeof x === "string")) {
      return NextResponse.json({ error: "orderedIds: tableau de string requis" }, { status: 400 });
    }
    await reorderExercises(id, orderedIds);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/formateur/formations/[id]/exercises] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
