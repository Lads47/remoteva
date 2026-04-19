import { NextRequest, NextResponse } from "next/server";
import { getDirectorByToken } from "@/lib/director";
import { getAllEventDates } from "@/lib/flow";

// GET /api/presta/events?token=xxx
// Renvoie toutes les dates où des événements sont planifiés (futurs + passés).
// Utilisé par le calendrier mobile /presta pour afficher les jours en orange.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    if (!token) return NextResponse.json({ error: "Token requis" }, { status: 400 });

    const director = await getDirectorByToken(token);
    if (!director) return NextResponse.json({ error: "Token invalide" }, { status: 401 });

    const eventDates = await getAllEventDates();
    return NextResponse.json({ eventDates });
  } catch (error) {
    console.error("[/api/presta/events] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
