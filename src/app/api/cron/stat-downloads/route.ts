// Endpoint cron : reçoit les nouvelles lignes du journal « telechargements.log » du canal
// evadif (envoyées par scripts/stat-collect-downloads.sh depuis l'hôte, toutes les 10 min)
// et enregistre les téléchargements complets d'EVAPILOT. Rejouer les mêmes lignes ne
// compte rien deux fois (empreinte de ligne).

import { NextRequest, NextResponse } from "next/server";
import { enregistrer } from "@/lib/stat/downloads";
import { siteBySlug } from "@/lib/stat/sites";

export const dynamic = "force-dynamic";
const MAX_OCTETS = 2 * 1024 * 1024;

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

export async function POST(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const texte = await request.text();
  if (texte.length > MAX_OCTETS) return NextResponse.json({ error: "Trop de lignes d'un coup" }, { status: 413 });
  const site = await siteBySlug("evadif");
  if (!site) return NextResponse.json({ error: "Site evadif absent" }, { status: 500 });
  const rapport = await enregistrer(site.id, texte);
  if (rapport.nouvelles) console.log(`[cron/stat-downloads] ${rapport.nouvelles} téléchargement(s) enregistré(s)`);
  return NextResponse.json(rapport);
}
