import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getAllDirectors,
  createDirector,
  updateDirector,
  deleteDirector,
} from "@/lib/director";
import { sendMagicLinkEmail, buildMagicLink } from "@/lib/email";
import { createDirectorSchema, updateDirectorSchema } from "@/lib/validation";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// GET /api/admin/directors
export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const directors = await getAllDirectors();
    return NextResponse.json({ directors });
  } catch (error) {
    console.error("[/api/admin/directors] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST /api/admin/directors — crée un réal + envoie le magic link par email
export async function POST(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const parsed = createDirectorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const director = await createDirector(parsed.data);

    // Envoie le magic link en best-effort (n'échoue pas la création si l'email plante)
    const magicLink = buildMagicLink(director.magicToken);
    const emailRes = await sendMagicLinkEmail({
      to: director.email,
      directorName: director.name,
      magicLink,
    });

    return NextResponse.json(
      {
        director,
        emailSent: emailRes.success === true,
        emailError: emailRes.success ? undefined : emailRes.error,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[/api/admin/directors] POST error:", error);
    if (error instanceof Error && error.message.includes("Unique")) {
      return NextResponse.json({ error: "Email déjà utilisé" }, { status: 409 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PUT /api/admin/directors — met à jour un réal
export async function PUT(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const { id, ...rest } = body;
    if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });

    const parsed = updateDirectorSchema.safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    await updateDirector(id, parsed.data);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/admin/directors] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/admin/directors?id=xxx
export async function DELETE(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });
    await deleteDirector(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/admin/directors] DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
