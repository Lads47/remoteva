import { NextRequest, NextResponse } from "next/server";
import { authTrainerWithSessions } from "@/lib/trainer";

// GET /api/formateur/me?token=xxx
// Renvoie le formateur authentifié + ses sessions assignées (passées + à venir)
// + les formations auxquelles il a accès (sessions + affectations directes).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    if (!token) return NextResponse.json({ error: "Token requis" }, { status: 400 });

    const result = await authTrainerWithSessions(token);
    if (!result) return NextResponse.json({ error: "Token invalide" }, { status: 401 });

    return NextResponse.json({
      trainer: {
        id: result.trainer.id,
        prenom: result.trainer.prenom,
        nom: result.trainer.nom,
        email: result.trainer.email,
      },
      sessions: result.sessions,
      formations: result.formations,
    });
  } catch (error) {
    console.error("[/api/formateur/me] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
