import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getAllLinks,
  createLink,
  updateLink,
  deleteLink,
  ServiceType,
} from "@/lib/services";

// Middleware pour vérifier l'authentification admin
async function requireAuth() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Non autorisé" },
      { status: 401 }
    );
  }
  return null;
}

// GET /api/admin/links - Liste tous les liens
export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const links = await getAllLinks();
    return NextResponse.json({ links });
  } catch (error) {
    console.error("Erreur récupération liens:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

// POST /api/admin/links - Crée un nouveau lien
export async function POST(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const { slug, serviceType, clientName, serviceName, expiresAt } = body;

    // Validation
    if (!slug || !serviceType || !clientName || !serviceName || !expiresAt) {
      return NextResponse.json(
        { error: "Tous les champs sont requis" },
        { status: 400 }
      );
    }

    if (!["newsletter", "download"].includes(serviceType)) {
      return NextResponse.json(
        { error: "Type de service invalide" },
        { status: 400 }
      );
    }

    const link = await createLink({
      slug,
      serviceType: serviceType as ServiceType,
      clientName,
      serviceName,
      expiresAt: new Date(expiresAt),
    });

    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    console.error("Erreur création lien:", error);

    // Gestion de l'erreur de slug dupliqué
    if (
      error instanceof Error &&
      error.message.includes("Unique constraint")
    ) {
      return NextResponse.json(
        { error: "Ce slug existe déjà" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

// PUT /api/admin/links - Met à jour un lien
export async function PUT(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID requis" },
        { status: 400 }
      );
    }

    // Conversion de la date si présente
    if (data.expiresAt) {
      data.expiresAt = new Date(data.expiresAt);
    }

    await updateLink(id, data);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur mise à jour lien:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/links - Supprime un lien
export async function DELETE(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID requis" },
        { status: 400 }
      );
    }

    await deleteLink(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression lien:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
