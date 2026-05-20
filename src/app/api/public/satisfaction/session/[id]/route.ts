// API publique anonyme pour le formulaire d'éval à chaud :
//   GET  → renvoie les questions résolues + meta session/formation
//   POST → soumet une réponse ANONYME (body: { answers: { [questionName]: value } })

import { NextRequest, NextResponse } from "next/server";
import { getSurveyForSession, submitAnonymousSurvey } from "@/lib/satisfaction";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const survey = await getSurveyForSession(id);
    if (!survey) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    return NextResponse.json(survey);
  } catch (error) {
    console.error("[/api/public/satisfaction/session/[id]] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
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
    const res = await submitAnonymousSurvey({ sessionId: id, answers: cleaned });
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/public/satisfaction/session/[id]] POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
