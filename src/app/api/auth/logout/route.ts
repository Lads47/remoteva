import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

// POST /api/auth/logout - Déconnexion admin
export async function POST() {
  try {
    await destroySession();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur de déconnexion:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
