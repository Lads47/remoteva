import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getAllFlowProjects,
  createFlowProject,
  updateFlowProject,
  deleteFlowProject,
  getFlowStats,
  VALID_STATUSES,
  FlowProjectStatus,
} from "@/lib/flow";

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

// GET /api/admin/flow - Liste tous les projets (ou stats si ?stats=true)
export async function GET(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);

    // Si on demande les stats uniquement
    if (searchParams.get("stats") === "true") {
      const stats = await getFlowStats();
      return NextResponse.json({ stats });
    }

    const projects = await getAllFlowProjects();
    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Erreur récupération projets Flow:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

// POST /api/admin/flow - Crée un nouveau projet
export async function POST(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const { title, date, location, room, speaker, notes } = body;

    // Validation des champs requis
    if (!title || !date || !location || !room) {
      return NextResponse.json(
        { error: "Les champs titre, date, lieu et salle sont requis" },
        { status: 400 }
      );
    }

    const project = await createFlowProject({
      title,
      date: new Date(date),
      location,
      room,
      speaker: speaker || "",
      notes: notes || "",
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Erreur création projet Flow:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

// PUT /api/admin/flow - Met à jour un projet
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

    // Validation du statut si présent
    if (data.status && !VALID_STATUSES.includes(data.status as FlowProjectStatus)) {
      return NextResponse.json(
        { error: `Statut invalide. Valeurs acceptées: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    // Conversion de la date si présente
    if (data.date) {
      data.date = new Date(data.date);
    }

    await updateFlowProject(id, data);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur mise à jour projet Flow:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/flow - Supprime un projet
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

    await deleteFlowProject(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression projet Flow:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
