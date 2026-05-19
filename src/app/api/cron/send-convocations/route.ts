// Endpoint cron : envoi automatique des convocations + RI à J-15 du début
// de session, pour les stagiaires non encore convoqués.
//
// À déclencher quotidiennement via un crontab système sur le VPS :
//   curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//        https://evaremote.com/api/cron/send-convocations
//
// Sécurité : nécessite un header Authorization: Bearer <CRON_SECRET> qui
// matche la variable d'env CRON_SECRET.
//
// Logique :
//   - Cible les sessions dont dateDebut tombe dans [aujourd'hui+14j, aujourd'hui+16j]
//     (fenêtre de 2 jours pour rattraper un éventuel jour manqué)
//   - Pour chaque session, parcourt les stagiaires actifs (statut != abandonne/termine)
//   - Skip ceux qui ont déjà dateConvocation
//   - Génère + envoie la convocation pour les autres
//   - Réponse : récap des envois (succès/échecs)

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { generateAndMailConvocation } from "@/lib/trainee-documents";

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron/send-convocations] CRON_SECRET non configuré — refus par défaut");
    return false;
  }
  const auth = request.headers.get("authorization");
  if (!auth) return false;
  // Compare en temps constant pour éviter les timing attacks
  const expected = `Bearer ${secret}`;
  if (auth.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < auth.length; i++) {
    diff |= auth.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// GET (idempotent — pas d'effet de bord si rien à envoyer) : récap des
// stagiaires qui RECEVRAIENT une convocation maintenant si on déclenchait.
export async function GET(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const candidates = await findCandidates();
  return NextResponse.json({
    mode: "dry-run",
    count: candidates.length,
    candidates: candidates.map((c) => ({
      traineeId: c.id,
      stagiaire: `${c.prenom} ${c.nom}`,
      email: c.email,
      sessionCode: c.session.code,
      dateDebut: c.session.dateDebut,
    })),
  });
}

// POST : exécute l'envoi
export async function POST(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const candidates = await findCandidates();
  const results: Array<{
    traineeId: string;
    stagiaire: string;
    email: string;
    sessionCode: string;
    ok: boolean;
    emailSent?: boolean;
    error?: string;
  }> = [];

  for (const t of candidates) {
    try {
      const res = await generateAndMailConvocation(t.id);
      results.push({
        traineeId: t.id,
        stagiaire: `${t.prenom} ${t.nom}`,
        email: t.email,
        sessionCode: t.session.code,
        ok: res.ok,
        emailSent: res.ok ? res.emailSent : undefined,
        error: !res.ok ? res.error : undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      results.push({
        traineeId: t.id,
        stagiaire: `${t.prenom} ${t.nom}`,
        email: t.email,
        sessionCode: t.session.code,
        ok: false,
        error: msg,
      });
    }
  }

  const sent = results.filter((r) => r.ok && r.emailSent).length;
  const failed = results.length - sent;
  console.log(`[cron/send-convocations] ${sent} envoyées, ${failed} échec(s) sur ${results.length} candidats`);

  return NextResponse.json({
    mode: "executed",
    total: results.length,
    sent,
    failed,
    results,
  });
}

// Stagiaires éligibles : leur session démarre dans 14-16 jours, statut
// actif, et pas encore convoqués (dateConvocation null).
async function findCandidates() {
  const now = new Date();
  // UTC bornes du créneau J+14 (début) à J+16 (fin)
  const lo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 14));
  const hi = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 17));

  const sessions = await prisma.session.findMany({
    where: { dateDebut: { gte: lo, lt: hi } },
    select: { id: true, code: true, dateDebut: true },
  });
  const sessionIds = sessions.map((s) => s.id);
  if (sessionIds.length === 0) return [];

  const trainees = await prisma.trainee.findMany({
    where: {
      sessionId: { in: sessionIds },
      dateConvocation: null,
      status: { notIn: ["abandonne", "termine"] },
    },
    include: { session: { select: { id: true, code: true, dateDebut: true } } },
  });
  return trainees;
}
