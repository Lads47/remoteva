import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createCriterion, reorderCriteria } from "@/lib/evaluation-grids";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// POST /api/admin/exercises/[id]/criteria
// Body: { libelle: string }
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const body = await request.json();
    const libelle = typeof body?.libelle === "string" ? body.libelle.trim() : "";
    if (!libelle) {
      return NextResponse.json({ error: "Libellé requis" }, { status: 400 });
    }
    const criterion = await createCriterion({ exerciseId: id, libelle });
    return NextResponse.json({ criterion }, { status: 201 });
  } catch (error) {
    console.error("[/api/admin/exercises/[id]/criteria] POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PUT /api/admin/exercises/[id]/criteria  (reorder)
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
    await reorderCriteria(id, orderedIds);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/admin/exercises/[id]/criteria] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
