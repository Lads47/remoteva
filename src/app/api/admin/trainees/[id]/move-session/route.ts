// POST /api/admin/trainees/[id]/move-session
// Body : { sessionId }
// Déplace le stagiaire vers une autre session de la même formation et recompte
// les places des deux sessions. Ne change pas le statut du stagiaire.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { moveTraineeToSession } from "@/lib/session";
import { recordTraineeEvent } from "@/lib/trainee";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const newSessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    if (!newSessionId) {
      return NextResponse.json({ error: "sessionId requis" }, { status: 400 });
    }

    const res = await moveTraineeToSession(id, newSessionId);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    await recordTraineeEvent(
      id,
      "note",
      `Session changée : ${res.fromSessionCode} → ${res.toSessionCode}`,
      { from: res.fromSessionCode, to: res.toSessionCode }
    );

    return NextResponse.json({ success: true, from: res.fromSessionCode, to: res.toSessionCode });
  } catch (error) {
    console.error("[/api/admin/trainees/[id]/move-session] error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
