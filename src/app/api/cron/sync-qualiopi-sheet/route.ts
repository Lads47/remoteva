// Endpoint cron : synchronise le bilan Qualiopi annuel dans un Google Sheet
// sur le Shared Drive FORMATION.
//
// À déclencher quotidiennement via crontab :
//   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
//        https://evaremote.com/api/cron/sync-qualiopi-sheet
//
// GET = dry-run (renvoie l'état du sheet sans déclencher la sync).
// POST = exécution.

import { NextRequest, NextResponse } from "next/server";
import { syncQualiopiSheet, getQualiopiSheetInfo } from "@/lib/qualiopi-export";

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron/sync-qualiopi-sheet] CRON_SECRET non configuré — refus par défaut");
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
  const info = await getQualiopiSheetInfo();
  return NextResponse.json({ mode: "dry-run", ...info });
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const report = await syncQualiopiSheet();
    console.log(
      `[cron/sync-qualiopi-sheet] ${report.yearsSynced.length} année(s) synchronisée(s), ${report.errors.length} erreur(s) — ${report.spreadsheetUrl}`
    );
    return NextResponse.json({ mode: "executed", ...report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/sync-qualiopi-sheet] échec :", message);
    return NextResponse.json({ mode: "failed", error: message }, { status: 500 });
  }
}
