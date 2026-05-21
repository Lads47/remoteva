// Endpoint cron : synchronise le BPF (Cerfa 10443) annuel dans un Google
// Sheet dédié sur Drive. Parallèle à sync-qualiopi-sheet.
//
// À déclencher quotidiennement via crontab :
//   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
//        https://evaremote.com/api/cron/sync-bpf-sheet

import { NextRequest, NextResponse } from "next/server";
import { syncBpfSheet, getBpfSheetInfo } from "@/lib/bpf-export";

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron/sync-bpf-sheet] CRON_SECRET non configuré — refus par défaut");
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
  const info = await getBpfSheetInfo();
  return NextResponse.json({ mode: "dry-run", ...info });
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const report = await syncBpfSheet();
    console.log(
      `[cron/sync-bpf-sheet] ${report.yearsSynced.length} année(s) synchronisée(s), ${report.errors.length} erreur(s) — ${report.spreadsheetUrl}`
    );
    return NextResponse.json({ mode: "executed", ...report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/sync-bpf-sheet] échec :", message);
    return NextResponse.json({ mode: "failed", error: message }, { status: 500 });
  }
}
