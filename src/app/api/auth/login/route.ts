import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";

// POST /api/auth/login - Connexion admin
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Validation des champs
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email et mot de passe requis" },
        { status: 400 }
      );
    }

    // Recherche de l'utilisateur
    const user = await prisma.adminUser.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Identifiants invalides" },
        { status: 401 }
      );
    }

    // Vérification du mot de passe
    const isValid = await verifyPassword(password, user.passwordHash);

    if (!isValid) {
      return NextResponse.json(
        { error: "Identifiants invalides" },
        { status: 401 }
      );
    }

    // Création de la session
    await createSession({
      userId: user.id,
      email: user.email,
    });

    return NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email },
    });
  } catch (error) {
    console.error("Erreur de connexion:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
