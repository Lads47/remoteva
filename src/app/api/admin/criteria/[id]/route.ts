import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { deleteCriterion, updateCriterion } from "@/lib/evaluation-grids";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// PUT /api/admin/criteria/[id]
// Body: { libelle?, ordre? }
export async function PUT(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const body = await request.json();
    const criterion = await updateCriterion(id, {
      libelle: typeof body?.libelle === "string" ? body.libelle : undefined,
      ordre: typeof body?.ordre === "number" ? body.ordre : undefined,
    });
    return NextResponse.json({ criterion });
  } catch (error) {
    console.error("[/api/admin/criteria/[id]] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/admin/criteria/[id]
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    await deleteCriterion(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/admin/criteria/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
