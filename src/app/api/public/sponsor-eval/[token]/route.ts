// API publique du formulaire de satisfaction commanditaire/entreprise
// (identifié via magic-token) :
//   GET  → questions du snapshot + méta session/formation/contact
//   POST → soumet une réponse (body: { answers: Record<string,string> })

import { NextRequest, NextResponse } from "next/server";
import { getSponsorEvalByToken, submitSponsorEvalByToken } from "@/lib/sponsor-eval";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const data = await getSponsorEvalByToken(token);
    if (!data) return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    console.error("[/api/public/sponsor-eval/[token]] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const body = await request.json();
    const answers = body?.answers;
    if (!answers || typeof answers !== "object") {
      return NextResponse.json({ error: "Body invalide : 'answers' attendu" }, { status: 400 });
    }
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(answers as Record<string, unknown>)) {
      if (typeof k !== "string" || v === null || v === undefined) continue;
      cleaned[k] = String(v);
    }
    const res = await submitSponsorEvalByToken({ token, answers: cleaned });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/public/sponsor-eval/[token]] POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
