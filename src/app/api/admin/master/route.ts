import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listPrestas, createPresta, deletePresta } from "@/lib/master";

// Vérifie l'authentification admin (le proxy gère déjà l'accès à l'univers).
async function requireAuth() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  return null;
}

// GET /api/admin/master - Liste les prestas
export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const prestas = await listPrestas();
    return NextResponse.json({ prestas });
  } catch (error) {
    console.error("Erreur récupération prestas:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST /api/admin/master - Crée une presta (nom + lien Drive)
export async function POST(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const driveUrl = typeof body.driveUrl === "string" ? body.driveUrl.trim() : "";

    if (!name || !driveUrl) {
      return NextResponse.json(
        { error: "Le nom et le lien Drive sont requis" },
        { status: 400 }
      );
    }

    const presta = await createPresta({ name, driveUrl });
    return NextResponse.json({ presta }, { status: 201 });
  } catch (error) {
    console.error("Erreur création presta:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/admin/master?id=... - Supprime une presta (manuel, cascade)
export async function DELETE(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "ID requis" }, { status: 400 });
    }

    await deletePresta(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression presta:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
