// API publique du formulaire d'éval formateur (identifié via magic-token).
//   GET  → questions du snapshot + meta session/formation/trainer + prefill
//   POST → soumet une réponse (body: { answers: Record<string,string> })

import { NextRequest, NextResponse } from "next/server";
import { getTrainerEvalByToken, submitTrainerEvalByToken } from "@/lib/trainer-eval";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await ctx.params;
    const data = await getTrainerEvalByToken(token);
    if (!data) return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    console.error("[/api/public/trainer-eval/[token]] GET error:", error);
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
      if (typeof k !== "string") continue;
      if (v === null || v === undefined) continue;
      cleaned[k] = String(v);
    }
    const res = await submitTrainerEvalByToken({ token, answers: cleaned });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/public/trainer-eval/[token]] POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
