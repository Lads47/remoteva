// POST /api/admin/sessions/[id]/regenerate-trainer-contract
//
// Force la (re)génération + le renvoi par mail du contrat de sous-traitance
// pour le formateur externe assigné à cette session. Body optionnel :
//   { trainerFeeAmount?: number }
// Si omis, on réutilise le montant déjà persisté sur la session.
//
// Utile quand :
//   - On ajoute un formateur externe à une session sans saisir le montant
//     au moment de l'assignation (l'API PUT session ne déclenche que si
//     trainerId CHANGE), puis on veut générer le contrat a posteriori.
//   - Mise à jour du template (re-export PDF avec la nouvelle version).
//   - Correction du montant après coup.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/db";
import { generateAndSendTrainerContract } from "@/lib/session";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const bodyAmount =
      typeof body?.trainerFeeAmount === "number" && body.trainerFeeAmount > 0
        ? body.trainerFeeAmount
        : undefined;

    const sessionRow = await prisma.session.findUnique({
      where: { id },
      select: {
        id: true,
        trainerId: true,
        trainerFeeAmount: true,
        trainer: { select: { isExternal: true } },
      },
    });
    if (!sessionRow) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    if (!sessionRow.trainerId) {
      return NextResponse.json({ error: "Aucun formateur assigné à cette session" }, { status: 400 });
    }
    if (!sessionRow.trainer?.isExternal) {
      return NextResponse.json(
        { error: "Le formateur assigné n'est pas externe — pas de contrat de sous-traitance à générer" },
        { status: 400 }
      );
    }

    // Priorité : montant du body (override), sinon montant déjà persisté
    const amount = bodyAmount ?? sessionRow.trainerFeeAmount ?? null;
    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "Montant HT manquant ou nul — saisis-le dans l'édition de la session" },
        { status: 400 }
      );
    }

    const res = await generateAndSendTrainerContract(id, amount);

    return NextResponse.json({
      success: res.ok,
      emailSent: res.emailSent,
      contractGenerated: res.contractGenerated,
      contractSkipReason: res.contractSkipReason,
      error: res.error,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[/api/admin/sessions/[id]/regenerate-trainer-contract] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
