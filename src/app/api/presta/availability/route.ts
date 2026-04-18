import { NextRequest, NextResponse } from "next/server";
import { getDirectorByToken, toggleAvailability, removeAvailability, getAvailabilities } from "@/lib/director";
import { availabilitySchema } from "@/lib/validation";

// POST /api/presta/availability — toggle dispo
// Body: { token, date }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = availabilitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const director = await getDirectorByToken(parsed.data.token);
    if (!director) return NextResponse.json({ error: "Token invalide" }, { status: 401 });

    const created = await toggleAvailability(director.id, parsed.data.date);
    const availableDates = await getAvailabilities(director.id);
    return NextResponse.json({ created, availableDates });
  } catch (error) {
    console.error("[/api/presta/availability] POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/presta/availability — supprime explicitement une dispo
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = availabilitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const director = await getDirectorByToken(parsed.data.token);
    if (!director) return NextResponse.json({ error: "Token invalide" }, { status: 401 });

    await removeAvailability(director.id, parsed.data.date);
    const availableDates = await getAvailabilities(director.id);
    return NextResponse.json({ success: true, availableDates });
  } catch (error) {
    console.error("[/api/presta/availability] DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
