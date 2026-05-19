import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { deleteExercise, updateExercise } from "@/lib/evaluation-grids";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// PUT /api/admin/exercises/[id]
// Body: { titre?, description?, active?, ordre? }
export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const body = await request.json();
    const exercise = await updateExercise(id, {
      titre: typeof body?.titre === "string" ? body.titre : undefined,
      description: typeof body?.description === "string" ? body.description : undefined,
      active: typeof body?.active === "boolean" ? body.active : undefined,
      ordre: typeof body?.ordre === "number" ? body.ordre : undefined,
    });
    return NextResponse.json({ exercise });
  } catch (error) {
    console.error("[/api/admin/exercises/[id]] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/admin/exercises/[id]
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    await deleteExercise(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/admin/exercises/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
