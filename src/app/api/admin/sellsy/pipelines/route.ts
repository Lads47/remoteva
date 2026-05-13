import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listPipelines } from "@/lib/sellsy";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// GET /api/admin/sellsy/pipelines
// Proxy vers l'API Sellsy : liste des pipelines disponibles.
export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const pipelines = await listPipelines();
    return NextResponse.json({ pipelines });
  } catch (error) {
    console.error("[/api/admin/sellsy/pipelines] GET error:", error);
    const message = error instanceof Error ? error.message : "Erreur Sellsy";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
