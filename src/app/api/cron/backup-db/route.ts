// Endpoint cron : backup hors-site de la base + fichiers locaux vers Drive.
//
// À déclencher quotidiennement via crontab :
//   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
//        https://evaremote.com/api/cron/backup-db
//
// GET = dry-run (état du dernier backup, sans rien déclencher).
// POST = exécution (snapshot VACUUM INTO + zip + upload + rotation 30).

import { NextRequest, NextResponse } from "next/server";
import { getBackupInfo, runDataBackup } from "@/lib/db-backup";

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron/backup-db] CRON_SECRET non configuré — refus par défaut");
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
  const info = await getBackupInfo();
  return NextResponse.json({ mode: "dry-run", ...info });
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const report = await runDataBackup();
    console.log(
      `[cron/backup-db] ${report.fileName} uploadé (${Math.round(report.sizeBytes / 1024)} Ko, ${report.filesInZip} fichiers, ${report.rotatedOut.length} rotation(s))`
    );
    return NextResponse.json({ mode: "executed", ...report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/backup-db] échec :", message);
    return NextResponse.json({ mode: "failed", error: message }, { status: 500 });
  }
}
