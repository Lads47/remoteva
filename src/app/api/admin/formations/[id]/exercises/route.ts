import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  createExercise,
  listExercisesByFormation,
  reorderExercises,
} from "@/lib/evaluation-grids";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// GET /api/admin/formations/[id]/exercises
// Liste des exercices d'évaluation pratique de la formation (avec critères).
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const exercises = await listExercisesByFormation(id);
    return NextResponse.json({ exercises });
  } catch (error) {
    console.error("[/api/admin/formations/[id]/exercises] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST /api/admin/formations/[id]/exercises
// Body: { titre: string, description?: string }
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const body = await request.json();
    const titre = typeof body?.titre === "string" ? body.titre.trim() : "";
    if (!titre) {
      return NextResponse.json({ error: "Titre requis" }, { status: 400 });
    }
    const description = typeof body?.description === "string" ? body.description : "";
    const exercise = await createExercise({ formationId: id, titre, description });
    return NextResponse.json({ exercise }, { status: 201 });
  } catch (error) {
    console.error("[/api/admin/formations/[id]/exercises] POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PUT /api/admin/formations/[id]/exercises  (reorder)
// Body: { orderedIds: string[] }
export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const body = await request.json();
    const orderedIds = Array.isArray(body?.orderedIds) ? body.orderedIds : null;
    if (!orderedIds || !orderedIds.every((x: unknown) => typeof x === "string")) {
      return NextResponse.json({ error: "orderedIds: tableau de string requis" }, { status: 400 });
    }
    await reorderExercises(id, orderedIds);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/admin/formations/[id]/exercises] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
