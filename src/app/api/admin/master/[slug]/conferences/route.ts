import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/db";
import { syncConferencesFromCore, addConference, moveConference } from "@/lib/master";

async function requireAuth() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  return null;
}

async function prestaBySlug(slug: string) {
  return prisma.masterPresta.findUnique({ where: { slug } });
}

// GET /api/admin/master/[slug]/conferences - liste des confs (copie serveur)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { slug } = await params;
  const presta = await prestaBySlug(slug);
  if (!presta) {
    return NextResponse.json({ error: "Presta introuvable" }, { status: 404 });
  }

  const conferences = await prisma.masterConference.findMany({
    where: { prestaId: presta.id },
    orderBy: { position: "asc" },
  });
  return NextResponse.json({ conferences });
}

// POST /api/admin/master/[slug]/conferences
//   body { action: "load-core" }  -> charge/synchronise depuis EVA CORE (stub)
//   body { title }                -> ajoute une conf en direct (+ conf)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { slug } = await params;
  const presta = await prestaBySlug(slug);
  if (!presta) {
    return NextResponse.json({ error: "Presta introuvable" }, { status: 404 });
  }

  try {
    const body = await request.json().catch(() => ({}));

    if (body.action === "load-core") {
      const conferences = await syncConferencesFromCore(presta.id, slug);
      return NextResponse.json({ conferences });
    }

    if (body.action === "reorder") {
      const direction = body.direction === "up" ? "up" : "down";
      const conferences = await moveConference(presta.id, String(body.id), direction);
      return NextResponse.json({ conferences });
    }

    const title = typeof body.title === "string" ? body.title : "";
    const conference = await addConference(presta.id, title);
    return NextResponse.json({ conference }, { status: 201 });
  } catch (error) {
    console.error("Erreur conf presta:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
