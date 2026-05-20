// POST /api/admin/sessions/[id]/cold-eval/resend
//
// Action manuelle déclenchée par l'admin sur la page synthèse :
//
// Body : { mode: "send_initial" | "send_reminder", traineeId?: string }
//   - send_initial : crée les ColdEvalResponse manquantes pour cette session
//     (utile si on veut envoyer en avance, sans attendre le cron) et envoie
//     l'invitation initiale à tous les stagiaires non encore invités. Si
//     `traineeId` est fourni, ne fait l'action que pour ce stagiaire.
//   - send_reminder : ré-envoie l'invitation à un stagiaire spécifique
//     (`traineeId` requis) qui n'a pas encore répondu. Marque reminder1At
//     ou reminder2At selon l'état actuel.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/db";
import {
  createColdEvalInvitationsForSession,
  markReminderSent,
} from "@/lib/cold-eval";
import { sendColdEvalInvite, sendColdEvalReminder } from "@/lib/mailer";

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
    const traineeId = typeof body?.traineeId === "string" ? body.traineeId : null;
    const base = publicBaseUrl();

    if (mode === "send_initial") {
      const result = await createColdEvalInvitationsForSession(id);
      if (!result) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });

      const targets = traineeId
        ? result.created.filter((c) => c.traineeId === traineeId)
        : result.created;

      const results = [];
      for (const inv of targets) {
        try {
          const r = await sendColdEvalInvite({
            to: inv.email,
            prenom: inv.prenom,
            formationNomLong: result.formation.nomLong,
            surveyUrl: `${base}/eval-froid/${inv.magicToken}`,
          });
          results.push({ traineeId: inv.traineeId, email: inv.email, ok: r.success, error: r.error });
        } catch (err) {
          results.push({
            traineeId: inv.traineeId,
            email: inv.email,
            ok: false,
            error: err instanceof Error ? err.message : "Erreur inconnue",
          });
        }
      }
      return NextResponse.json({
        success: true,
        action: "send_initial",
        total: targets.length,
        sent: results.filter((r) => r.ok).length,
        results,
      });
    }

    if (mode === "send_reminder") {
      if (!traineeId) {
        return NextResponse.json({ error: "traineeId requis pour 'send_reminder'" }, { status: 400 });
      }
      const resp = await prisma.coldEvalResponse.findFirst({
        where: { sessionId: id, traineeId },
        include: {
          trainee: { select: { prenom: true, email: true } },
          session: { include: { formation: { select: { nomLong: true } } } },
        },
      });
      if (!resp) {
        return NextResponse.json({ error: "Aucune invitation à froid pour ce stagiaire" }, { status: 404 });
      }
      if (resp.submittedAt) {
        return NextResponse.json({ error: "Le stagiaire a déjà répondu" }, { status: 400 });
      }
      const which: 1 | 2 = resp.reminder1At ? 2 : 1;
      try {
        const r = await sendColdEvalReminder({
          to: resp.trainee.email,
          prenom: resp.trainee.prenom,
          formationNomLong: resp.session.formation.nomLong,
          surveyUrl: `${base}/eval-froid/${resp.magicToken}`,
          reminderNumber: which,
        });
        if (r.success) await markReminderSent(resp.id, which);
        return NextResponse.json({
          success: r.success,
          action: "send_reminder",
          reminderNumber: which,
          email: resp.trainee.email,
          error: r.error,
        });
      } catch (err) {
        return NextResponse.json(
          { success: false, error: err instanceof Error ? err.message : "Erreur inconnue" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ error: "mode invalide (send_initial | send_reminder)" }, { status: 400 });
  } catch (error) {
    console.error("[/api/admin/sessions/[id]/cold-eval/resend] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
