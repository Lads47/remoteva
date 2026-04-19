import { NextRequest, NextResponse } from "next/server";
import {
  getDirectorByToken,
  toggleAvailability,
  removeAvailability,
  getAvailabilities,
} from "@/lib/director";
import { getAllEventDates } from "@/lib/flow";
import { availabilitySchema } from "@/lib/validation";

function dateKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// POST /api/presta/availability — toggle dispo
// Body: { token, date }
// Refuse l'AJOUT si la date n'a pas d'événement planifié.
// Autorise toujours le RETRAIT (pour nettoyer les dispos legacy).
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

    // Vérifier si la date a un événement planifié
    const requestedDate = new Date(parsed.data.date);
    const requestedKey = dateKey(requestedDate);
    const eventDates = await getAllEventDates();
    const hasEvent = eventDates.some((d) => dateKey(d) === requestedKey);

    // Vérifier si une dispo existe déjà (pour autoriser le retrait même sans événement)
    const currentAvailabilities = await getAvailabilities(director.id);
    const alreadyAvailable = currentAvailabilities.some((d) => dateKey(d) === requestedKey);

    // Cas refusé : ajouter une dispo sur une date sans événement
    if (!hasEvent && !alreadyAvailable) {
      return NextResponse.json(
        { error: "Aucun événement planifié à cette date — disponibilité non autorisée." },
        { status: 403 }
      );
    }

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
