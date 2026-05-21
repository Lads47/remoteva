// Endpoint cron : passe les sessions dont dateFin est dépassée au statut
// "closed" (Clôturée). Évite que des sessions terminées restent visibles
// comme "Ouverte aux inscriptions" — point d'attention Qualiopi.
//
// À déclencher quotidiennement via crontab système sur le VPS :
//   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
//        https://evaremote.com/api/cron/close-past-sessions
//
// Logique :
//   - Cible les sessions dont dateFin < aujourd'hui (UTC)
//   - Statut courant ∈ ("open", "full", "planned") → passe à "closed"
//   - Ignore "closed", "cancelled" (déjà finalisés)
//
// GET = dry-run (récap sans modif).

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron/close-past-sessions] CRON_SECRET non configuré — refus par défaut");
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

// Statuts éligibles à la bascule auto vers "closed"
const ELIGIBLE_STATUSES = ["planned", "open", "full"];

async function findCandidates() {
  const now = new Date();
  // On compare dateFin avec aujourd'hui à minuit UTC : une session qui se
  // termine le 21 mai à 17h ne sera basculée que le 22 mai au matin.
  const todayMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return prisma.session.findMany({
    where: {
      dateFin: { lt: todayMidnight },
      status: { in: ELIGIBLE_STATUSES },
    },
    select: {
      id: true,
      code: true,
      status: true,
      dateFin: true,
      formation: { select: { nomLong: true } },
    },
  });
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const candidates = await findCandidates();
  return NextResponse.json({
    mode: "dry-run",
    count: candidates.length,
    candidates: candidates.map((s) => ({
      id: s.id,
      code: s.code,
      formation: s.formation.nomLong,
      status: s.status,
      dateFin: s.dateFin,
    })),
  });
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const candidates = await findCandidates();
  const results: Array<{ id: string; code: string; from: string; to: string; ok: boolean; error?: string }> = [];

  for (const s of candidates) {
    try {
      await prisma.session.update({
        where: { id: s.id },
        data: { status: "closed" },
      });
      results.push({ id: s.id, code: s.code, from: s.status, to: "closed", ok: true });
    } catch (err) {
      results.push({
        id: s.id,
        code: s.code,
        from: s.status,
        to: "closed",
        ok: false,
        error: err instanceof Error ? err.message : "Erreur inconnue",
      });
    }
  }

  const closed = results.filter((r) => r.ok).length;
  const failed = results.length - closed;
  console.log(`[cron/close-past-sessions] ${closed} clôturée(s), ${failed} échec(s) sur ${results.length} candidate(s)`);

  return NextResponse.json({
    mode: "executed",
    total: results.length,
    closed,
    failed,
    results,
  });
}
