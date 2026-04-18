import { NextRequest, NextResponse } from "next/server";
import { getDirectorByToken, getAvailabilities } from "@/lib/director";

// GET /api/presta/me?token=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    if (!token) return NextResponse.json({ error: "Token requis" }, { status: 400 });

    const director = await getDirectorByToken(token);
    if (!director) return NextResponse.json({ error: "Token invalide" }, { status: 401 });

    const availableDates = await getAvailabilities(director.id);

    return NextResponse.json({
      director: {
        id: director.id,
        name: director.name,
        email: director.email,
      },
      availableDates,
    });
  } catch (error) {
    console.error("[/api/presta/me] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
