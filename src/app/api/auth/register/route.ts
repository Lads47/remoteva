import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { hashPassword } from "@/lib/auth";

// POST /api/auth/register - Inscription libre (Phase 4 réorganisation EVA).
//
// Politique (décision Q4 a+b) :
//   - Inscription ouverte à tous : n'importe quel email est accepté.
//   - Emails @lesateliersdustream.fr : auto-validés (status="validated")
//     mais sans univers cochés. Le super-admin doit ensuite leur attribuer
//     leurs accès (sauf accès direct au hub).
//   - Autres emails : status="pending". Aucun accès tant qu'un super-admin
//     n'a pas validé.
//
// Aucun isSuperAdmin attribué à l'inscription : seul un super-admin existant
// peut promouvoir un compte via la page /admin/users.

const INTERNAL_DOMAIN = "@lesateliersdustream.fr";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, firstName, lastName } = body;

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email et mot de passe requis" },
        { status: 400 }
      );
    }

    if (typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Email invalide" },
        { status: 400 }
      );
    }

    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Le mot de passe doit contenir au moins 8 caractères" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Vérifie qu'il n'existe pas déjà
    const existing = await prisma.adminUser.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Un compte existe déjà avec cet email" },
        { status: 409 }
      );
    }

    const isInternal = normalizedEmail.endsWith(INTERNAL_DOMAIN);

    const passwordHash = await hashPassword(password);

    const user = await prisma.adminUser.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        firstName: typeof firstName === "string" ? firstName.trim() : null,
        lastName: typeof lastName === "string" ? lastName.trim() : null,
        status: isInternal ? "validated" : "pending",
        isSuperAdmin: false,
        validatedAt: isInternal ? new Date() : null,
      },
      select: {
        id: true,
        email: true,
        status: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        user,
        message: isInternal
          ? "Compte créé et auto-validé. Un super-administrateur vous attribuera vos univers EVA."
          : "Compte créé. En attente de validation par un super-administrateur.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erreur inscription:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
