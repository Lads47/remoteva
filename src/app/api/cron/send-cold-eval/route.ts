// Endpoint cron : envoi automatique des invitations à l'éval à froid (3 mois
// après fin de session) + relances J+7 et J+14 si pas répondu.
//
// À déclencher quotidiennement via le crontab système sur le VPS :
//   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
//        https://evaremote.com/api/cron/send-cold-eval
//
// Sécurité : header Authorization: Bearer <CRON_SECRET>.
//
// Le cron fait 3 passes :
//   1. Sessions terminées il y a >= COLD_EVAL_DELAY_DAYS jours et sans
//      ColdEvalResponse → création des invitations + mail initial
//   2. ColdEvalResponse non répondues, invitedAt >= J-7, reminder1At null
//      → mail relance 1 + maj reminder1At
//   3. ColdEvalResponse non répondues, reminder1At posé, reminder2At null,
//      invitedAt >= J-14 → mail relance 2 + maj reminder2At

import { NextRequest, NextResponse } from "next/server";
import {
  createColdEvalInvitationsForSession,
  findResponsesDueForReminder1,
  findResponsesDueForReminder2,
  findSessionsDueForColdEval,
  markReminderSent,
} from "@/lib/cold-eval";
import { sendColdEvalInvite, sendColdEvalReminder } from "@/lib/mailer";

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron/send-cold-eval] CRON_SECRET non configuré — refus par défaut");
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

// GET = dry-run : aperçu de ce que ferait un POST sans envoyer.
export async function GET(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const dueSessions = await findSessionsDueForColdEval();
  const dueR1 = await findResponsesDueForReminder1();
  const dueR2 = await findResponsesDueForReminder2();
  return NextResponse.json({
    mode: "dry-run",
    sessions_to_invite: dueSessions.length,
    reminder_1: dueR1.length,
    reminder_2: dueR2.length,
    detail: {
      sessions: dueSessions,
      r1: dueR1.map((r) => ({ id: r.id, email: r.email, formation: r.formationNomLong })),
      r2: dueR2.map((r) => ({ id: r.id, email: r.email, formation: r.formationNomLong })),
    },
  });
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const base = publicBaseUrl();
  const errors: Array<{ context: string; error: string }> = [];
  let invitationsSent = 0;
  let reminder1Sent = 0;
  let reminder2Sent = 0;

  // === Passe 1 : invitations initiales sur sessions échues ===
  const dueSessions = await findSessionsDueForColdEval();
  for (const sessionId of dueSessions) {
    try {
      const result = await createColdEvalInvitationsForSession(sessionId);
      if (!result) continue;
      for (const inv of result.created) {
        try {
          const r = await sendColdEvalInvite({
            to: inv.email,
            prenom: inv.prenom,
            formationNomLong: result.formation.nomLong,
            surveyUrl: `${base}/eval-froid/${inv.magicToken}`,
          });
          if (r.success) invitationsSent++;
          else errors.push({ context: `invite ${inv.email}`, error: r.error || "send failed" });
        } catch (err) {
          errors.push({
            context: `invite ${inv.email}`,
            error: err instanceof Error ? err.message : "Erreur inconnue",
          });
        }
      }
    } catch (err) {
      errors.push({
        context: `session ${sessionId}`,
        error: err instanceof Error ? err.message : "Erreur inconnue",
      });
    }
  }

  // === Passe 2 : relance 1 (J+7) ===
  const dueR1 = await findResponsesDueForReminder1();
  for (const r of dueR1) {
    try {
      const resp = await sendColdEvalReminder({
        to: r.email,
        prenom: r.prenom,
        formationNomLong: r.formationNomLong,
        surveyUrl: `${base}/eval-froid/${r.magicToken}`,
        reminderNumber: 1,
      });
      if (resp.success) {
        await markReminderSent(r.id, 1);
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
  const dueR2 = await findResponsesDueForReminder2();
  for (const r of dueR2) {
    try {
      const resp = await sendColdEvalReminder({
        to: r.email,
        prenom: r.prenom,
        formationNomLong: r.formationNomLong,
        surveyUrl: `${base}/eval-froid/${r.magicToken}`,
        reminderNumber: 2,
      });
      if (resp.success) {
        await markReminderSent(r.id, 2);
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
    `[cron/send-cold-eval] ${invitationsSent} invitations, ${reminder1Sent} relances J+7, ${reminder2Sent} relances J+14, ${errors.length} erreur(s)`
  );

  return NextResponse.json({
    mode: "executed",
    invitationsSent,
    reminder1Sent,
    reminder2Sent,
    errors,
  });
}
