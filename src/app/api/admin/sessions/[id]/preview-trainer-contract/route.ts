// POST /api/admin/sessions/[id]/preview-trainer-contract
//
// Génère le contrat de sous-traitance du formateur externe assigné à la
// session et l'envoie à une adresse de PRÉVISUALISATION (par défaut l'admin),
// SANS l'envoyer au formateur et SANS marquer le contrat comme envoyé.
//
// Différences avec /regenerate-trainer-contract :
//   - persist: false → n'écrit pas trainerContractSentAt (le vrai envoi auto
//     au seuil reste possible) et ne laisse pas de Doc Drive orphelin ;
//   - destinataire = body.to (ou ADMIN_NOTIFY_EMAIL), jamais le formateur.
//
// Body (optionnel) : { to?: string, trainerFeeAmount?: number }

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/db";
import { generateExternalTrainerContract } from "@/lib/trainer-contract";
import { sendTrainerContractEmail } from "@/lib/mailer";

// Compare constant-time avec le CRON_SECRET (déclenchement serveur-à-serveur,
// sans cookie admin — même schéma que les endpoints /api/cron/*).
function hasValidSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  if (!auth) return false;
  const expected = `Bearer ${secret}`;
  if (auth.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < auth.length; i++) diff |= auth.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function requireAuth(request: NextRequest) {
  const session = await getSession();
  if (session) return null;
  if (hasValidSecret(request)) return null;
  return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth(request);
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const toOverride = typeof body?.to === "string" ? body.to.trim() : "";
    const amountOverride =
      typeof body?.trainerFeeAmount === "number" && body.trainerFeeAmount > 0
        ? body.trainerFeeAmount
        : undefined;

    const session = await prisma.session.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        dateDebut: true,
        dateFin: true,
        trainerFeeAmount: true,
        trainerId: true,
        trainer: { select: { prenom: true, email: true, magicToken: true, isExternal: true } },
        formation: { select: { nomLong: true } },
      },
    });
    if (!session || !session.trainerId || !session.trainer) {
      return NextResponse.json({ error: "Aucun formateur assigné à cette session" }, { status: 400 });
    }
    if (!session.trainer.isExternal) {
      return NextResponse.json({ error: "Le formateur assigné n'est pas externe" }, { status: 400 });
    }

    const amount = amountOverride ?? session.trainerFeeAmount ?? 0;
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Montant HT manquant ou nul" }, { status: 400 });
    }

    const to = toOverride || process.env.ADMIN_NOTIFY_EMAIL;
    if (!to) {
      return NextResponse.json(
        { error: "Aucune adresse de prévisualisation (body.to ou ADMIN_NOTIFY_EMAIL)" },
        { status: 400 }
      );
    }

    // Génération SANS persistance ni Doc Drive orphelin.
    const contract = await generateExternalTrainerContract(id, amount, { persist: false });
    if (!contract.ok) {
      return NextResponse.json({ error: contract.error || "Échec de génération" }, { status: 502 });
    }
    if (contract.skipped || !contract.pdfBuffer || !contract.pdfFilename) {
      return NextResponse.json(
        { error: `Contrat non généré : ${contract.skipReason || "raison inconnue"}` },
        { status: 400 }
      );
    }

    const base = process.env.PUBLIC_BASE_URL || "https://evaremote.com";
    const sessionUrl = `${base}/formateur/sessions/${session.id}?token=${encodeURIComponent(
      session.trainer.magicToken
    )}`;

    const res = await sendTrainerContractEmail({
      to,
      prenom: session.trainer.prenom,
      formationNomLong: session.formation.nomLong,
      sessionCode: session.code,
      sessionDateDebut: session.dateDebut,
      sessionDateFin: session.dateFin,
      montantHt: amount,
      contractPdfBuffer: contract.pdfBuffer,
      contractPdfFilename: contract.pdfFilename,
      sessionUrl,
    });

    if (!res.success) {
      return NextResponse.json(
        { error: res.error || "Échec de l'envoi du mail", filename: contract.pdfFilename },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      previewSentTo: to,
      filename: contract.pdfFilename,
      trainer: `${session.trainer.prenom}`,
      amount,
    });
  } catch (error) {
    console.error("[/api/admin/sessions/[id]/preview-trainer-contract] POST error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
