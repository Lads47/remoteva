// POST /api/admin/sessions/[id]/trainer-eval/resend
//
// Body : { mode: "send_initial" | "send_reminder" }
//   - send_initial : crée l'invitation pour le formateur (si pas déjà créée)
//     + envoie le mail initial (utile pour test ou envoi anticipé avant cron).
//     Si une invitation existe déjà, ré-envoie le mail initial avec le token
//     existant.
//   - send_reminder : envoie une relance au formateur (1 ou 2 selon état).

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  createTrainerEvalInvitationForSession,
  getExistingTrainerEvalInvitation,
  markTrainerReminderSent,
} from "@/lib/trainer-eval";
import prisma from "@/lib/db";
import { sendTrainerEvalInvite, sendTrainerEvalReminder } from "@/lib/mailer";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

function publicBaseUrl(): string {
  return process.env.PUBLIC_BASE_URL || "https://evaremote.com";
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const mode = body?.mode;
    const base = publicBaseUrl();

    if (mode === "send_initial") {
      let result = await createTrainerEvalInvitationForSession(id);
      if (!result) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });

      let target = result.created;

      // Si pas créée (invitation déjà existante), récupère le token existant
      // pour ré-envoyer le mail initial.
      if (!target) {
        const existing = await getExistingTrainerEvalInvitation(id);
        if (!existing) {
          return NextResponse.json({ error: "Pas de formateur assigné à cette session" }, { status: 400 });
        }
        if (existing.submitted) {
          return NextResponse.json({ error: "Le formateur a déjà répondu" }, { status: 400 });
        }
        target = {
          responseId: existing.responseId,
          trainerId: existing.trainerId,
          prenom: existing.prenom,
          nom: "",
          email: existing.email,
          magicToken: existing.magicToken,
        };
      }

      const r = await sendTrainerEvalInvite({
        to: target.email,
        prenom: target.prenom,
        formationNomLong: result.formation.nomLong,
        surveyUrl: `${base}/eval-formateur/${target.magicToken}`,
      });
      return NextResponse.json({
        success: r.success,
        action: "send_initial",
        email: target.email,
        error: r.error,
      });
    }

    if (mode === "send_reminder") {
      const resp = await prisma.trainerEvalResponse.findFirst({
        where: { sessionId: id },
        include: {
          trainer: { select: { prenom: true, email: true } },
          session: { include: { formation: { select: { nomLong: true } } } },
        },
      });
      if (!resp) {
        return NextResponse.json({ error: "Aucune invitation pour ce formateur" }, { status: 404 });
      }
      if (resp.submittedAt) {
        return NextResponse.json({ error: "Le formateur a déjà répondu" }, { status: 400 });
      }
      const which: 1 | 2 = resp.reminder1At ? 2 : 1;
      const r = await sendTrainerEvalReminder({
        to: resp.trainer.email,
        prenom: resp.trainer.prenom,
        formationNomLong: resp.session.formation.nomLong,
        surveyUrl: `${base}/eval-formateur/${resp.magicToken}`,
        reminderNumber: which,
      });
      if (r.success) await markTrainerReminderSent(resp.id, which);
      return NextResponse.json({
        success: r.success,
        action: "send_reminder",
        reminderNumber: which,
        email: resp.trainer.email,
        error: r.error,
      });
    }

    return NextResponse.json({ error: "mode invalide (send_initial | send_reminder)" }, { status: 400 });
  } catch (error) {
    console.error("[/api/admin/sessions/[id]/trainer-eval/resend] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
