// API publique pour le formulaire d'évaluation à chaud :
//   GET  → renvoie les questions + métadonnées (session, formation, stagiaire)
//   POST → soumet les réponses (body: { answers: { [questionName]: value } })

import { NextRequest, NextResponse } from "next/server";
import { getSurveyByToken, submitSurvey } from "@/lib/satisfaction";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await ctx.params;
    const survey = await getSurveyByToken(token);
    if (!survey) return NextResponse.json({ error: "Lien invalide ou expiré" }, { status: 404 });
    return NextResponse.json(survey);
  } catch (error) {
    console.error("[/api/public/satisfaction/[token]] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await ctx.params;
    const body = await request.json();
    const answers = body?.answers;
    if (!answers || typeof answers !== "object") {
      return NextResponse.json({ error: "Body invalide : 'answers' attendu" }, { status: 400 });
    }
    // Sanitize : on accepte uniquement des paires string -> string
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(answers as Record<string, unknown>)) {
      if (typeof k !== "string") continue;
      if (v === null || v === undefined) continue;
      cleaned[k] = String(v);
    }
    const res = await submitSurvey({ token, answers: cleaned });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/public/satisfaction/[token]] POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
