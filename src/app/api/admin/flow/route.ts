import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getAllFlowProjectsWithAvailability,
  createFlowProject,
  updateFlowProject,
  deleteFlowProject,
  getFlowStats,
} from "@/lib/flow";
import { createProjectSchema, updateProjectSchema } from "@/lib/validation";

async function requireAuth() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  return null;
}

// GET /api/admin/flow — liste tous les projets (ou stats si ?stats=true)
export async function GET(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);

    if (searchParams.get("stats") === "true") {
      const stats = await getFlowStats();
      return NextResponse.json({ stats });
    }

    const projects = await getAllFlowProjectsWithAvailability();
    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Erreur récupération projets Flow:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST /api/admin/flow — crée un nouveau projet (avec conférences optionnelles)
export async function POST(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const parsed = createProjectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { conferences, ...rest } = parsed.data;
    const project = await createFlowProject({
      ...rest,
      date: new Date(rest.date),
      conferences: conferences?.map((c) => ({
        ...c,
        scheduledStart: c.scheduledStart ? new Date(c.scheduledStart) : null,
        scheduledEnd: c.scheduledEnd ? new Date(c.scheduledEnd) : null,
      })),
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Erreur création projet Flow:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PUT /api/admin/flow — met à jour un projet
export async function PUT(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const parsed = updateProjectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { id, ...data } = parsed.data;
    await updateFlowProject(id, {
      ...data,
      date: data.date ? new Date(data.date) : undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur mise à jour projet Flow:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/admin/flow?id=xxx — supprime un projet
export async function DELETE(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "ID requis" }, { status: 400 });
    }
    await deleteFlowProject(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression projet Flow:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
