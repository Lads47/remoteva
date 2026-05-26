// Endpoint cron : relance automatique des stagiaires bloqués en statut
// intermédiaire (devis_envoye / convention_envoyee) depuis plus de 14 jours.
//
// À déclencher quotidiennement via crontab :
//   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
//        https://evaremote.com/api/cron/send-relance-bloques
//
// GET = dry-run (liste sans envoyer). POST = exécution.

import { NextRequest, NextResponse } from "next/server";
import { findTraineesDueForRelance, recordRelanceSent } from "@/lib/trainee-relance";
import { sendStagiaireBlockedRelance } from "@/lib/mailer";

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron/send-relance-bloques] CRON_SECRET non configuré — refus par défaut");
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

export async function GET(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const due = await findTraineesDueForRelance();
  return NextResponse.json({
    mode: "dry-run",
    count: due.length,
    trainees: due.map((t) => ({
      id: t.id,
      email: t.email,
      formation: t.formationNomLong,
      status: t.status,
      reminderNumber: t.reminderNumber,
    })),
  });
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const due = await findTraineesDueForRelance();
  let sent = 0;
  const errors: { traineeId: string; error: string }[] = [];

  for (const t of due) {
    try {
      const res = await sendStagiaireBlockedRelance({
        to: t.email,
        prenom: t.prenom,
        formationNomLong: t.formationNomLong,
        sessionDateDebut: t.sessionDateDebut,
        blockedOn: t.blockedOn,
        reminderNumber: t.reminderNumber,
      });
      if (res.success) {
        await recordRelanceSent(t.id, t.status, t.reminderNumber);
        sent++;
      } else {
        errors.push({ traineeId: t.id, error: res.error || "send failed" });
      }
    } catch (err) {
      errors.push({
        traineeId: t.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log(
    `[cron/send-relance-bloques] ${sent}/${due.length} relances envoyées, ${errors.length} erreur(s)`
  );

  return NextResponse.json({
    mode: "executed",
    sent,
    total: due.length,
    errors,
  });
}
