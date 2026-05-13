import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getAllFormations,
  createFormation,
  updateFormation,
  deleteFormation,
} from "@/lib/formation";
import { createFormationSchema, updateFormationSchema } from "@/lib/validation";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// GET /api/admin/formations
export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const formations = await getAllFormations();
    return NextResponse.json({ formations });
  } catch (error) {
    console.error("[/api/admin/formations] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST /api/admin/formations
export async function POST(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const parsed = createFormationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const formation = await createFormation(parsed.data);
    return NextResponse.json({ formation }, { status: 201 });
  } catch (error) {
    console.error("[/api/admin/formations] POST error:", error);
    if (error instanceof Error && error.message.includes("Unique")) {
      return NextResponse.json({ error: "Code de formation déjà utilisé" }, { status: 409 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PUT /api/admin/formations
export async function PUT(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const { id, ...rest } = body;
    if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });

    const parsed = updateFormationSchema.safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const formation = await updateFormation(id, parsed.data);
    return NextResponse.json({ formation });
  } catch (error) {
    console.error("[/api/admin/formations] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/admin/formations?id=xxx
export async function DELETE(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });
    await deleteFormation(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/admin/formations] DELETE error:", error);
    if (error instanceof Error && error.message.includes("Foreign key")) {
      return NextResponse.json(
        { error: "Impossible de supprimer : des sessions existent pour cette formation" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
