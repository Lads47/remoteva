import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

// Renvoie l'état de session courant (auth + rôle) pour l'en-tête admin.
// Sert notamment à n'afficher le lien "Administration" qu'aux super-admins.
// Le proxy protège déjà /api/admin/* (401 si pas de session).
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  return NextResponse.json({
    isSuperAdmin: !!session.isSuperAdmin,
    email: session.email,
  });
}
