import { NextRequest, NextResponse } from "next/server";
import { getSession, hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

// GET /api/admin/users - Liste tous les utilisateurs
export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const users = await prisma.adminUser.findMany({
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    return NextResponse.json({ users });
  } catch (error) {
    console.error("Erreur récupération utilisateurs:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

// POST /api/admin/users - Crée un nouvel utilisateur
export async function POST(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const { email, password } = body;

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email et mot de passe requis" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Le mot de passe doit contenir au moins 6 caractères" },
        { status: 400 }
      );
    }

    // Vérifie si l'email existe déjà
    const existingUser = await prisma.adminUser.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Cet email est déjà utilisé" },
        { status: 409 }
      );
    }

    // Hash du mot de passe et création
    const passwordHash = await hashPassword(password);
    const user = await prisma.adminUser.create({
      data: {
        email,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    console.error("Erreur création utilisateur:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

// PUT /api/admin/users - Réinitialise le mot de passe d'un utilisateur
export async function PUT(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const { id, newPassword } = body;

    if (!id || !newPassword) {
      return NextResponse.json(
        { error: "ID et nouveau mot de passe requis" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "Le mot de passe doit contenir au moins 6 caractères" },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.adminUser.update({
      where: { id },
      data: { passwordHash },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur réinitialisation mot de passe:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/users - Supprime un utilisateur
export async function DELETE(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const session = await getSession();

    if (!id) {
      return NextResponse.json(
        { error: "ID requis" },
        { status: 400 }
      );
    }

    // Empêche de supprimer son propre compte
    if (session?.userId === id) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas supprimer votre propre compte" },
        { status: 400 }
      );
    }

    // Vérifie qu'il reste au moins un utilisateur
    const count = await prisma.adminUser.count();
    if (count <= 1) {
      return NextResponse.json(
        { error: "Impossible de supprimer le dernier administrateur" },
        { status: 400 }
      );
    }

    await prisma.adminUser.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression utilisateur:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
