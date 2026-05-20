// Endpoint cron : envoi automatique de la fiche satisfaction formateur
// (J+1 après dateFin) + relances J+7 et J+14 si pas répondu.
//
// À déclencher quotidiennement via le crontab serveur :
//   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
//        https://evaremote.com/api/cron/send-trainer-eval

import { NextRequest, NextResponse } from "next/server";
import {
  createTrainerEvalInvitationForSession,
  findSessionsDueForTrainerEval,
  findTrainerResponsesDueForReminder1,
  findTrainerResponsesDueForReminder2,
  markTrainerReminderSent,
} from "@/lib/trainer-eval";
import { sendTrainerEvalInvite, sendTrainerEvalReminder } from "@/lib/mailer";

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron/send-trainer-eval] CRON_SECRET non configuré — refus par défaut");
    return false;
  }
  const auth = request.headers.get("authorization");
  if (!auth) return false;
  const expected = `Bearer ${secret}`;
  if (auth.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < auth.length; i++) {
    diff |= auth.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function publicBaseUrl(): string {
  return process.env.PUBLIC_BASE_URL || "https://evaremote.com";
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const dueSessions = await findSessionsDueForTrainerEval();
  const dueR1 = await findTrainerResponsesDueForReminder1();
  const dueR2 = await findTrainerResponsesDueForReminder2();
  return NextResponse.json({
    mode: "dry-run",
    sessions_to_invite: dueSessions.length,
    reminder_1: dueR1.length,
    reminder_2: dueR2.length,
  });
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const base = publicBaseUrl();
  const errors: Array<{ context: string; error: string }> = [];
  let invitationsSent = 0;
  let reminder1Sent = 0;
  let reminder2Sent = 0;

  // === Passe 1 : invitations initiales (sessions terminées hier) ===
  const dueSessions = await findSessionsDueForTrainerEval();
  for (const sessionId of dueSessions) {
    try {
      const result = await createTrainerEvalInvitationForSession(sessionId);
      if (!result || !result.created) continue;
      const inv = result.created;
      try {
        const r = await sendTrainerEvalInvite({
          to: inv.email,
          prenom: inv.prenom,
          formationNomLong: result.formation.nomLong,
          surveyUrl: `${base}/eval-formateur/${inv.magicToken}`,
        });
        if (r.success) invitationsSent++;
        else errors.push({ context: `invite ${inv.email}`, error: r.error || "send failed" });
      } catch (err) {
        errors.push({
          context: `invite ${inv.email}`,
          error: err instanceof Error ? err.message : "Erreur inconnue",
        });
      }
    } catch (err) {
      errors.push({
        context: `session ${sessionId}`,
        error: err instanceof Error ? err.message : "Erreur inconnue",
      });
    }
  }

  // === Passe 2 : relance 1 (J+7) ===
  const dueR1 = await findTrainerResponsesDueForReminder1();
  for (const r of dueR1) {
    try {
      const resp = await sendTrainerEvalReminder({
        to: r.email,
        prenom: r.prenom,
        formationNomLong: r.formationNomLong,
        surveyUrl: `${base}/eval-formateur/${r.magicToken}`,
        reminderNumber: 1,
      });
      if (resp.success) {
        await markTrainerReminderSent(r.id, 1);
        reminder1Sent++;
      } else {
        errors.push({ context: `r1 ${r.email}`, error: resp.error || "send failed" });
      }
    } catch (err) {
      errors.push({
        context: `r1 ${r.email}`,
        error: err instanceof Error ? err.message : "Erreur inconnue",
      });
    }
  }

  // === Passe 3 : relance 2 (J+14) ===
  const dueR2 = await findTrainerResponsesDueForReminder2();
  for (const r of dueR2) {
    try {
      const resp = await sendTrainerEvalReminder({
        to: r.email,
        prenom: r.prenom,
        formationNomLong: r.formationNomLong,
        surveyUrl: `${base}/eval-formateur/${r.magicToken}`,
        reminderNumber: 2,
      });
      if (resp.success) {
        await markTrainerReminderSent(r.id, 2);
        reminder2Sent++;
      } else {
        errors.push({ context: `r2 ${r.email}`, error: resp.error || "send failed" });
      }
    } catch (err) {
      errors.push({
        context: `r2 ${r.email}`,
        error: err instanceof Error ? err.message : "Erreur inconnue",
      });
    }
  }

  console.log(
    `[cron/send-trainer-eval] ${invitationsSent} invitations, ${reminder1Sent} relances J+7, ${reminder2Sent} relances J+14, ${errors.length} erreur(s)`
  );

  return NextResponse.json({
    mode: "executed",
    invitationsSent,
    reminder1Sent,
    reminder2Sent,
    errors,
  });
}
