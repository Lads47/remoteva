import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listPipelineSteps } from "@/lib/sellsy";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// GET /api/admin/sellsy/pipelines/[id]/steps
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const pipelineId = parseInt(id, 10);
    if (!Number.isFinite(pipelineId)) {
      return NextResponse.json({ error: "Pipeline ID invalide" }, { status: 400 });
    }
    const steps = await listPipelineSteps(pipelineId);
    return NextResponse.json({ steps });
  } catch (error) {
    console.error("[/api/admin/sellsy/pipelines/[id]/steps] GET error:", error);
    const message = error instanceof Error ? error.message : "Erreur Sellsy";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
