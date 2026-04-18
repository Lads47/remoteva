import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/apiKey";
import { corsPreflightResponse, jsonCors, withCors } from "@/lib/apiCors";
import { getConference, markRecordingStopped } from "@/lib/conference";
import { refreshProjectStatus } from "@/lib/flow";
import { recordingStoppedSchema } from "@/lib/validation";

export async function OPTIONS() {
  return corsPreflightResponse();
}

// POST /api/flow/conferences/[id]/recording-stopped
// Body: { localFolder?, durationSeconds? }
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireApiKey(request);
  if (authError) return withCors(authError);

  try {
    const { id } = await ctx.params;
    const existing = await getConference(id);
    if (!existing) return jsonCors({ error: "Conférence introuvable" }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const parsed = recordingStoppedSchema.safeParse(body);
    if (!parsed.success) {
      return jsonCors(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const conference = await markRecordingStopped(id, {
      localFolder: parsed.data.localFolder ?? null,
      durationSeconds: parsed.data.durationSeconds ?? null,
    });
    const projectStatus = await refreshProjectStatus(conference.flowProjectId);

    return jsonCors({ conference, projectStatus });
  } catch (error) {
    console.error("[/api/flow/conferences/:id/recording-stopped] error:", error);
    return jsonCors({ error: "Erreur serveur" }, { status: 500 });
  }
}
