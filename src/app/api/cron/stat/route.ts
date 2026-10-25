// Endpoint cron : entretien quotidien d'EVA Stat (agrégats, archives, purge 13 mois, sauvegarde).
//
// Crontab du VPS (2 h 30 UTC, hors des sauvegardes de 3 h) :
//   30 2 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" \
//        https://evaremote.com/api/cron/stat >> /var/log/evaremote-cron.log 2>&1
//
// GET = dry-run (ce qui serait purgé ou archivé, dernière sauvegarde).
// POST = exécution.

import { NextRequest, NextResponse } from "next/server";
import { maintenanceStatus, runMaintenance } from "@/lib/stat/maintenance";

export const dynamic = "force-dynamic";

function authorize(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron/stat] CRON_SECRET non configuré — refus par défaut");
    return false;
  }
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
  return NextResponse.json({ mode: "dry-run", ...(await maintenanceStatus()) });
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  try {
    const report = await runMaintenance();
    console.log(
      `[cron/stat] ${report.archives.length} archive(s), purge ${report.purge.visits} visite(s), sauvegarde ${report.backup.file ?? "déjà faite"}`
    );
    return NextResponse.json({ mode: "executed", ...report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/stat] échec :", message);
    return NextResponse.json({ mode: "failed", error: message }, { status: 500 });
  }
}
