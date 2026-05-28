// PUT/DELETE d'un critère par le formateur (portail magic-token).
//   PUT    ?token= : { libelle? }
//   DELETE ?token= : supprime le critère

import { NextRequest, NextResponse } from "next/server";
import { deleteCriterion, updateCriterion } from "@/lib/evaluation-grids";
import { authTrainerForCriterion, notifyAdminGridEdit } from "@/lib/trainer-grid-access";

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id } = await ctx.params;

    const auth = await authTrainerForCriterion(token, id);
    if (!auth) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const body = await request.json();
    const criterion = await updateCriterion(id, {
      libelle: typeof body?.libelle === "string" ? body.libelle : undefined,
    });
    await notifyAdminGridEdit(auth, "Modification d'un critère", criterion.libelle);
    return NextResponse.json({ criterion });
  } catch (error) {
    console.error("[/api/formateur/criteria/[id]] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id } = await ctx.params;

    const auth = await authTrainerForCriterion(token, id);
    if (!auth) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    await deleteCriterion(id);
    await notifyAdminGridEdit(auth, "Suppression d'un critère");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/formateur/criteria/[id]] DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
