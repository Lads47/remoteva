// API publique : liste des stagiaires d'une session avec leur magicToken
// pour la page de sélection (atterrissage du QR code).

import { NextRequest, NextResponse } from "next/server";
import { getSessionInvitationsForSelection } from "@/lib/satisfaction";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const data = await getSessionInvitationsForSelection(id);
    if (!data) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    if (data.invitations.length === 0) {
      return NextResponse.json({
        ...data,
        message: "L'enquête de satisfaction n'a pas encore été lancée pour cette session.",
      });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error("[/api/public/satisfaction/session/[id]] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
