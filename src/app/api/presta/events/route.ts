import { NextRequest, NextResponse } from "next/server";
import { getDirectorByToken } from "@/lib/director";
import prisma from "@/lib/db";

// GET /api/presta/events?token=xxx
// Renvoie tous les événements (id, eventId, title, date, directorId).
// Utilisé par /presta pour le calendrier (orange) et la liste "Prochains événements"
// (badge "Tu t'es positionné" / "Tu es validé" selon état).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    if (!token) return NextResponse.json({ error: "Token requis" }, { status: 400 });

    const director = await getDirectorByToken(token);
    if (!director) return NextResponse.json({ error: "Token invalide" }, { status: 401 });

    const events = await prisma.flowProject.findMany({
      select: { id: true, eventId: true, title: true, date: true, directorId: true },
      orderBy: { date: "asc" },
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error("[/api/presta/events] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
