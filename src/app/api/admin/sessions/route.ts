import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getAllSessions,
  getSessionsByFormation,
  getSessionById,
  createSession,
  updateSession,
  deleteSession,
  generateSessionCode,
  notifyTrainerIfSessionOpen,
  maybeSendTrainerContractOnThreshold,
  type TrainerNotifyOutcome,
} from "@/lib/session";
import { createSessionSchema, updateSessionSchema } from "@/lib/validation";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// GET /api/admin/sessions
// GET /api/admin/sessions?formationId=xxx
export async function GET(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { searchParams } = new URL(request.url);
    const formationId = searchParams.get("formationId");
    const sessions = formationId
      ? await getSessionsByFormation(formationId)
      : await getAllSessions();
    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("[/api/admin/sessions] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST /api/admin/sessions
export async function POST(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const parsed = createSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const dateDebut = new Date(parsed.data.dateDebut);
    const dateFin = new Date(parsed.data.dateFin);
    if (dateFin < dateDebut) {
      return NextResponse.json(
        { error: "La date de fin doit être après la date de début" },
        { status: 400 }
      );
    }
    const code = parsed.data.code && parsed.data.code.trim().length > 0
      ? parsed.data.code.trim()
      : await generateSessionCode(parsed.data.formationId, parsed.data.dateDebut);
    const session = await createSession({ ...parsed.data, code });

    // Le mail d'assignation ne part que lorsque la session est "open" avec un
    // formateur assigné. À la création, cela ne concerne donc que les sessions
    // créées directement ouvertes ; sinon l'envoi est différé jusqu'à
    // l'ouverture (le contrat de sous-traitance suit le même déclenchement).
    const trainerNotified: TrainerNotifyOutcome | null = await notifyTrainerIfSessionOpen(session.id);
    return NextResponse.json({ session, trainerNotified }, { status: 201 });
  } catch (error) {
    console.error("[/api/admin/sessions] POST error:", error);
    if (error instanceof Error && error.message.includes("Unique")) {
      return NextResponse.json({ error: "Code de session déjà utilisé" }, { status: 409 });
    }
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PUT /api/admin/sessions
export async function PUT(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const { id, ...rest } = body;
    if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });

    const parsed = updateSessionSchema.safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    // Si on change de formateur, on réinitialise le garde-fou d'envoi pour que
    // le nouveau formateur soit notifié (à l'ouverture si la session n'est pas
    // encore "open", ou immédiatement si elle l'est déjà).
    const previous = await getSessionById(id);
    const newTrainerId = parsed.data.trainerId;
    const previousTrainerId = previous?.trainerId ?? null;
    const trainerIdChanged = newTrainerId !== undefined && newTrainerId !== previousTrainerId;

    const session = await updateSession(id, {
      ...parsed.data,
      ...(trainerIdChanged ? { trainerAssignmentMailSentAt: null } : {}),
    });

    // Le mail (et le contrat ST le cas échéant) part dès que la session est
    // "open" + formateur assigné + pas déjà envoyé. Couvre donc aussi bien le
    // passage de statut à "open" que l'assignation sur une session déjà ouverte.
    const trainerNotified: TrainerNotifyOutcome | null = await notifyTrainerIfSessionOpen(id);
    // Couvre le cas où l'admin renseigne le montant ST après que le seuil
    // d'inscrits soit déjà atteint (sinon plus aucune inscription ne le
    // re-déclencherait). Best-effort, envoi unique grâce au garde-fou.
    await maybeSendTrainerContractOnThreshold(id);
    return NextResponse.json({ session, trainerNotified });
  } catch (error) {
    console.error("[/api/admin/sessions] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/admin/sessions?id=xxx
export async function DELETE(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });
    await deleteSession(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/admin/sessions] DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
