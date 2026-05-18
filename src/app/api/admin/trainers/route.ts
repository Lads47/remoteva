import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  buildTrainerMagicLink,
  createTrainer,
  deleteTrainer,
  getAllTrainers,
  updateTrainer,
} from "@/lib/trainer";
import { createTrainerSchema, updateTrainerSchema } from "@/lib/validation";
import { sendTrainerWelcomeEmail } from "@/lib/mailer";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// GET /api/admin/trainers
export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const trainers = await getAllTrainers();
    return NextResponse.json({ trainers });
  } catch (error) {
    console.error("[/api/admin/trainers] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST /api/admin/trainers — crée un formateur + envoie le mail de bienvenue
export async function POST(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const parsed = createTrainerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const trainer = await createTrainer(parsed.data);

    // Mail de bienvenue best-effort
    const magicLink = buildTrainerMagicLink(trainer.magicToken);
    const emailRes = await sendTrainerWelcomeEmail({
      to: trainer.email,
      prenom: trainer.prenom,
      nom: trainer.nom,
      magicLink,
    });

    return NextResponse.json(
      {
        trainer,
        emailSent: emailRes.success,
        emailError: emailRes.success ? undefined : emailRes.error,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[/api/admin/trainers] POST error:", error);
    if (error instanceof Error && error.message.includes("Unique")) {
      return NextResponse.json({ error: "Email déjà utilisé" }, { status: 409 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PUT /api/admin/trainers — met à jour un formateur
export async function PUT(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const { id, ...rest } = body;
    if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });

    const parsed = updateTrainerSchema.safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const trainer = await updateTrainer(id, parsed.data);
    return NextResponse.json({ trainer });
  } catch (error) {
    console.error("[/api/admin/trainers] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/admin/trainers?id=xxx
export async function DELETE(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });
    await deleteTrainer(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/admin/trainers] DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
