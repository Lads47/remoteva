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
import {
  createSponsorEvalInvitationsForSession,
  findSessionsDueForSponsorEval,
  findSponsorResponsesDueForReminder1,
  findSponsorResponsesDueForReminder2,
  markSponsorReminderSent,
} from "@/lib/sponsor-eval";
import {
  sendColdEvalInvite,
  sendColdEvalReminder,
  sendSponsorEvalInvite,
  sendSponsorEvalReminder,
} from "@/lib/mailer";

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
  const sponsorDueSessions = await findSessionsDueForSponsorEval();
  const sponsorDueR1 = await findSponsorResponsesDueForReminder1();
  const sponsorDueR2 = await findSponsorResponsesDueForReminder2();
  return NextResponse.json({
    mode: "dry-run",
    sessions_to_invite: dueSessions.length,
    reminder_1: dueR1.length,
    reminder_2: dueR2.length,
    sponsor_sessions_to_invite: sponsorDueSessions.length,
    sponsor_reminder_1: sponsorDueR1.length,
    sponsor_reminder_2: sponsorDueR2.length,
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

  // ==========================================================================
  // Satisfaction commanditaire / entreprise (même déclenchement que le froid)
  // ==========================================================================
  let sponsorInvitationsSent = 0;
  let sponsorReminder1Sent = 0;
  let sponsorReminder2Sent = 0;

  // Passe 4 : invitations initiales par entreprise sur sessions échues
  const sponsorDueSessions = await findSessionsDueForSponsorEval();
  for (const sessionId of sponsorDueSessions) {
    try {
      const result = await createSponsorEvalInvitationsForSession(sessionId);
      if (!result) continue;
      for (const inv of result.created) {
        try {
          const r = await sendSponsorEvalInvite({
            to: inv.email,
            companyName: inv.companyName,
            contactName: inv.contactName,
            formationNomLong: result.formation.nomLong,
            surveyUrl: `${base}/eval-commanditaire/${inv.magicToken}`,
          });
          if (r.success) sponsorInvitationsSent++;
          else errors.push({ context: `sponsor invite ${inv.email}`, error: r.error || "send failed" });
        } catch (err) {
          errors.push({ context: `sponsor invite ${inv.email}`, error: err instanceof Error ? err.message : "Erreur inconnue" });
        }
      }
    } catch (err) {
      errors.push({ context: `sponsor session ${sessionId}`, error: err instanceof Error ? err.message : "Erreur inconnue" });
    }
  }

  // Passe 5 : relance 1 (J+7)
  for (const r of await findSponsorResponsesDueForReminder1()) {
    try {
      const resp = await sendSponsorEvalReminder({
        to: r.email,
        contactName: r.contactName,
        formationNomLong: r.formationNomLong,
        surveyUrl: `${base}/eval-commanditaire/${r.magicToken}`,
        reminderNumber: 1,
      });
      if (resp.success) { await markSponsorReminderSent(r.id, 1); sponsorReminder1Sent++; }
      else errors.push({ context: `sponsor r1 ${r.email}`, error: resp.error || "send failed" });
    } catch (err) {
      errors.push({ context: `sponsor r1 ${r.email}`, error: err instanceof Error ? err.message : "Erreur inconnue" });
    }
  }

  // Passe 6 : relance 2 (J+14)
  for (const r of await findSponsorResponsesDueForReminder2()) {
    try {
      const resp = await sendSponsorEvalReminder({
        to: r.email,
        contactName: r.contactName,
        formationNomLong: r.formationNomLong,
        surveyUrl: `${base}/eval-commanditaire/${r.magicToken}`,
        reminderNumber: 2,
      });
      if (resp.success) { await markSponsorReminderSent(r.id, 2); sponsorReminder2Sent++; }
      else errors.push({ context: `sponsor r2 ${r.email}`, error: resp.error || "send failed" });
    } catch (err) {
      errors.push({ context: `sponsor r2 ${r.email}`, error: err instanceof Error ? err.message : "Erreur inconnue" });
    }
  }

  console.log(
    `[cron/send-cold-eval] froid: ${invitationsSent} inv, ${reminder1Sent} r7, ${reminder2Sent} r14 | ` +
    `commanditaire: ${sponsorInvitationsSent} inv, ${sponsorReminder1Sent} r7, ${sponsorReminder2Sent} r14 | ${errors.length} erreur(s)`
  );

  return NextResponse.json({
    mode: "executed",
    invitationsSent,
    reminder1Sent,
    reminder2Sent,
    sponsorInvitationsSent,
    sponsorReminder1Sent,
    sponsorReminder2Sent,
    errors,
  });
}
