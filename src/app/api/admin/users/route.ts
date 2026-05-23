import { NextRequest, NextResponse } from "next/server";
import { getSession, hashPassword, isEvaUniverse } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Garde "super-admin" pour les actions de gestion de comptes (Phase 4).
async function requireSuperAdmin() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!session.isSuperAdmin) {
    return NextResponse.json(
      { error: "Réservé aux super-administrateurs" },
      { status: 403 }
    );
  }
  return null;
}

// GET /api/admin/users - Liste tous les utilisateurs avec leurs accès.
export async function GET() {
  const authError = await requireSuperAdmin();
  if (authError) return authError;

  try {
    const users = await prisma.adminUser.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        isSuperAdmin: true,
        createdAt: true,
        validatedAt: true,
        universes: { select: { universe: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({
      users: users.map((u) => ({
        ...u,
        universes: u.universes.map((un) => un.universe),
      })),
    });
  } catch (error) {
    console.error("Erreur récupération utilisateurs:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST /api/admin/users - Crée un utilisateur (uniquement super-admin).
// Phase 4 : le compte créé peut être directement validé + super-admin si
// précisé. Sinon c'est un compte pending normal.
export async function POST(request: NextRequest) {
  const authError = await requireSuperAdmin();
  if (authError) return authError;

  try {
    const body = await request.json();
    const { email, password, firstName, lastName, isSuperAdmin, status } =
      body;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email et mot de passe requis" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Le mot de passe doit contenir au moins 8 caractères" },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existingUser = await prisma.adminUser.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "Cet email est déjà utilisé" },
        { status: 409 }
      );
    }

    const willBeValidated = status === "validated" || isSuperAdmin === true;
    const passwordHash = await hashPassword(password);
    const user = await prisma.adminUser.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        firstName: typeof firstName === "string" ? firstName.trim() : null,
        lastName: typeof lastName === "string" ? lastName.trim() : null,
        isSuperAdmin: isSuperAdmin === true,
        status: willBeValidated ? "validated" : "pending",
        validatedAt: willBeValidated ? new Date() : null,
      },
      select: { id: true, email: true, status: true, isSuperAdmin: true },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    console.error("Erreur création utilisateur:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PATCH /api/admin/users - Met à jour status, isSuperAdmin, universes
// (action super-admin). Accepte également newPassword pour réinitialiser.
// Body : { id, status?, isSuperAdmin?, universes?: string[], newPassword? }
export async function PATCH(request: NextRequest) {
  const authError = await requireSuperAdmin();
  if (authError) return authError;

  try {
    const body = await request.json();
    const { id, status, isSuperAdmin, universes, newPassword } = body;
    const session = await getSession();

    if (!id) {
      return NextResponse.json({ error: "ID requis" }, { status: 400 });
    }

    const target = await prisma.adminUser.findUnique({
      where: { id },
      select: { id: true, isSuperAdmin: true },
    });
    if (!target) {
      return NextResponse.json(
        { error: "Utilisateur introuvable" },
        { status: 404 }
      );
    }

    // Empêche de retirer son propre statut super-admin (lock-out)
    if (
      session?.userId === id &&
      isSuperAdmin === false &&
      target.isSuperAdmin
    ) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas retirer votre propre rôle super-administrateur" },
        { status: 400 }
      );
    }

    // Garantit qu'il reste au moins 1 super-admin actif
    if (target.isSuperAdmin && isSuperAdmin === false) {
      const remainingSuperAdmins = await prisma.adminUser.count({
        where: { isSuperAdmin: true, NOT: { id } },
      });
      if (remainingSuperAdmins === 0) {
        return NextResponse.json(
          { error: "Au moins un super-administrateur doit rester" },
          { status: 400 }
        );
      }
    }

    const updates: Record<string, unknown> = {};
    if (status === "pending" || status === "validated") {
      updates.status = status;
      if (status === "validated") {
        updates.validatedAt = new Date();
      }
    }
    if (typeof isSuperAdmin === "boolean") {
      updates.isSuperAdmin = isSuperAdmin;
    }
    if (typeof newPassword === "string" && newPassword.length > 0) {
      if (newPassword.length < 8) {
        return NextResponse.json(
          { error: "Le mot de passe doit contenir au moins 8 caractères" },
          { status: 400 }
        );
      }
      updates.passwordHash = await hashPassword(newPassword);
    }

    if (Array.isArray(universes)) {
      const validUniverses = universes.filter(isEvaUniverse);
      // Remplace la liste complète : supprime puis recrée.
      await prisma.userUniverseAccess.deleteMany({ where: { userId: id } });
      if (validUniverses.length > 0) {
        await prisma.userUniverseAccess.createMany({
          data: validUniverses.map((u) => ({ userId: id, universe: u })),
        });
      }
    }

    if (Object.keys(updates).length > 0) {
      await prisma.adminUser.update({ where: { id }, data: updates });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur mise à jour utilisateur:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PUT /api/admin/users - Compat ancien endpoint reset password.
// Conservé pour ne rien casser, mais l'UI doit migrer sur PATCH.
export async function PUT(request: NextRequest) {
  const authError = await requireSuperAdmin();
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

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "Le mot de passe doit contenir au moins 8 caractères" },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.adminUser.update({ where: { id }, data: { passwordHash } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur réinitialisation mot de passe:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/admin/users - Supprime un utilisateur (super-admin).
export async function DELETE(request: NextRequest) {
  const authError = await requireSuperAdmin();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const session = await getSession();

    if (!id) {
      return NextResponse.json({ error: "ID requis" }, { status: 400 });
    }

    if (session?.userId === id) {
      return NextResponse.json(
        { error: "Vous ne pouvez pas supprimer votre propre compte" },
        { status: 400 }
      );
    }

    // Garantit qu'il reste au moins 1 super-admin actif
    const target = await prisma.adminUser.findUnique({
      where: { id },
      select: { isSuperAdmin: true },
    });
    if (target?.isSuperAdmin) {
      const remainingSuperAdmins = await prisma.adminUser.count({
        where: { isSuperAdmin: true, NOT: { id } },
      });
      if (remainingSuperAdmins === 0) {
        return NextResponse.json(
          { error: "Au moins un super-administrateur doit rester" },
          { status: 400 }
        );
      }
    }

    await prisma.adminUser.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression utilisateur:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
