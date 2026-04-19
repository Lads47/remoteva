import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/apiKey";
import { corsPreflightResponse, jsonCors, withCors } from "@/lib/apiCors";
import { getProjectWithConferences } from "@/lib/flow";

export async function OPTIONS() {
  return corsPreflightResponse();
}

// GET /api/flow/projects/[id]
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireApiKey(request);
  if (authError) return withCors(authError);

  try {
    const { id } = await ctx.params;
    const project = await getProjectWithConferences(id);
    if (!project) {
      return jsonCors({ error: "Événement introuvable" }, { status: 404 });
    }
    return jsonCors({ project });
  } catch (error) {
    console.error("[/api/flow/projects/:id] error:", error);
    return jsonCors({ error: "Erreur serveur" }, { status: 500 });
  }
}
