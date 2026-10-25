// Endpoint cron : relève les publications de nos comptes (Réseaux sociaux de l'accueil)
// et renouvelle les jetons Instagram avant leur expiration.
//
// Crontab du VPS (toutes les heures, à 7) :
//   7 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
//        https://evaremote.com/api/cron/social >> /var/log/evaremote-cron.log 2>&1

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { syncAll } from "@/lib/social/sync";

export const dynamic = "force-dynamic";

function authorize(request: NextRequest): boolean {
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

export async function GET(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const accounts = await prisma.socialAccount.findMany({
    select: { network: true, handle: true, active: true, lastSyncAt: true, lastError: true, tokenExpiresAt: true },
  });
  return NextResponse.json({ mode: "dry-run", accounts });
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const reports = await syncAll();
  const errors = reports.filter((r) => r.error);
  if (errors.length) console.error("[cron/social]", errors.map((r) => `${r.account} : ${r.error}`).join(" | "));
  return NextResponse.json({ mode: "executed", reports }, { status: errors.length ? 207 : 200 });
}
