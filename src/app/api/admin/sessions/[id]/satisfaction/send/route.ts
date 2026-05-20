// POST /api/admin/sessions/[id]/satisfaction/send
// Body : { sendEmails?: boolean }
//
// Équivalent admin de l'endpoint formateur — permet à l'admin de préparer
// les invitations / d'envoyer les mails sans avoir besoin du magic token
// du formateur de la session.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/db";
import { sendSatisfactionSurveyInvite } from "@/lib/mailer";
import { createOrReuseInvitations } from "@/lib/satisfaction";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await ctx.params;

    let sendEmails = true;
    try {
      const body = await request.json();
      if (body && typeof body.sendEmails === "boolean") sendEmails = body.sendEmails;
    } catch {
      // pas de body : envoi par défaut
    }

    const publicBaseUrl = process.env.PUBLIC_BASE_URL || "https://evaremote.com";
    const invitations = await createOrReuseInvitations(id, publicBaseUrl);

    if (!sendEmails) {
      return NextResponse.json({
        success: true,
        sessionId: id,
        mode: "prepared",
        invitations: invitations.map((inv) => ({
          traineeId: inv.traineeId,
          traineeName: inv.traineeName,
          email: inv.email,
          ok: true,
          alreadyExisted: inv.alreadyExisted,
        })),
        totalInvitations: invitations.length,
        mailsSent: 0,
      });
    }

    const session = await prisma.session.findUnique({
      where: { id },
      select: { formation: { select: { nomLong: true } } },
    });
    const formationNomLong = session?.formation.nomLong ?? "votre formation";

    const sendResults = [];
    for (const inv of invitations) {
      try {
        const r = await sendSatisfactionSurveyInvite({
          to: inv.email,
          prenom: inv.traineeName.split(" ")[0],
          formationNomLong,
          surveyUrl: inv.surveyUrl,
        });
        sendResults.push({
          traineeId: inv.traineeId,
          traineeName: inv.traineeName,
          email: inv.email,
          ok: r.success,
          error: r.error,
          alreadyExisted: inv.alreadyExisted,
        });
      } catch (err) {
        sendResults.push({
          traineeId: inv.traineeId,
          traineeName: inv.traineeName,
          email: inv.email,
          ok: false,
          error: err instanceof Error ? err.message : "Erreur inconnue",
          alreadyExisted: inv.alreadyExisted,
        });
      }
    }

    return NextResponse.json({
      success: true,
      sessionId: id,
      mode: "sent",
      invitations: sendResults,
      totalInvitations: invitations.length,
      mailsSent: sendResults.filter((r) => r.ok).length,
    });
  } catch (error) {
    console.error("[/api/admin/sessions/[id]/satisfaction/send] error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
