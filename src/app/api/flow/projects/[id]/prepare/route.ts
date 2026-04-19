import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/apiKey";
import { corsPreflightResponse, jsonCors, withCors } from "@/lib/apiCors";
import { prepareProject, getProjectWithConferences } from "@/lib/flow";
import { prepareProjectSchema } from "@/lib/validation";

export async function OPTIONS() {
  return corsPreflightResponse();
}

// POST /api/flow/projects/[id]/prepare
// Body: { regie, director?, recordingLocalPath? }
// Idempotent même régie ; écrase si autre régie (cf. Q2 du brief)
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireApiKey(request);
  if (authError) return withCors(authError);

  try {
    const { id } = await ctx.params;
    const existing = await getProjectWithConferences(id);
    if (!existing) {
      return jsonCors({ error: "Événement introuvable" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = prepareProjectSchema.safeParse(body);
    if (!parsed.success) {
      return jsonCors(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const project = await prepareProject(id, parsed.data);
    return jsonCors({ project });
  } catch (error) {
    console.error("[/api/flow/projects/:id/prepare] error:", error);
    return jsonCors({ error: "Erreur serveur" }, { status: 500 });
  }
}
