// Consultation + édition des pré-requis d'une formation par le formateur
// (portail magic-token).
//   GET ?token= : schéma de pré-requis résolu + méta formation + usingDefault
//   PUT ?token= : enregistre un nouveau schéma { prerequis: PrerequisField[] }
//
// Périmètre : le formateur doit avoir accès à la formation (session assignée
// OU affectation directe). Chaque enregistrement notifie l'admin (best-effort).

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  resolvePrerequisForFormation,
  validatePrerequisArray,
} from "@/lib/formation-prerequis";
import { authTrainerForFormation, notifyAdminPrerequisEdit } from "@/lib/trainer-grid-access";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id } = await ctx.params;

    const auth = await authTrainerForFormation(token, id);
    if (!auth) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const formation = await prisma.formation.findUnique({
      where: { id },
      select: { code: true, nomLong: true, configForm: true },
    });
    if (!formation) return NextResponse.json({ error: "Formation introuvable" }, { status: 404 });

    const prerequis = resolvePrerequisForFormation(formation);
    const usingDefault =
      !formation.configForm || formation.configForm.trim() === "" || formation.configForm.trim() === "{}";

    return NextResponse.json({
      formation: { code: formation.code, nomLong: formation.nomLong },
      prerequis,
      usingDefault,
    });
  } catch (error) {
    console.error("[/api/formateur/formations/[id]/prerequis] GET error:", error);
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
    const fields = validatePrerequisArray(body?.prerequis);
    if (!fields) {
      return NextResponse.json(
        { error: "Schéma de pré-requis invalide (chaque question doit avoir un libellé et un type valide)" },
        { status: 400 }
      );
    }

    await prisma.formation.update({
      where: { id },
      data: { configForm: JSON.stringify({ prerequis: fields }) },
    });
    await notifyAdminPrerequisEdit(auth);

    return NextResponse.json({ success: true, prerequis: fields });
  } catch (error) {
    console.error("[/api/formateur/formations/[id]/prerequis] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
