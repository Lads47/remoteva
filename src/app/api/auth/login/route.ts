import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  verifyPassword,
  createSession,
  type AccountStatus,
  type EvaUniverse,
  isEvaUniverse,
} from "@/lib/auth";

// POST /api/auth/login - Connexion (admin / salarié / formateur / réalisateur).
// Phase 4 réorganisation EVA :
//   - le JWT embarque status, isSuperAdmin et univers autorisés
//   - aucun blocage côté login pour un compte "pending" : il peut se
//     connecter mais sera redirigé vers /admin/pending par le proxy
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email et mot de passe requis" },
        { status: 400 }
      );
    }

    const user = await prisma.adminUser.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        status: true,
        isSuperAdmin: true,
        universes: { select: { universe: true } },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Identifiants invalides" },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.passwordHash);

    if (!isValid) {
      return NextResponse.json(
        { error: "Identifiants invalides" },
        { status: 401 }
      );
    }

    const universes: EvaUniverse[] = user.universes
      .map((u) => u.universe)
      .filter(isEvaUniverse);

    await createSession({
      userId: user.id,
      email: user.email,
      status: user.status as AccountStatus,
      isSuperAdmin: user.isSuperAdmin,
      universes,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        status: user.status,
        isSuperAdmin: user.isSuperAdmin,
        universes,
      },
    });
  } catch (error) {
    console.error("Erreur de connexion:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
