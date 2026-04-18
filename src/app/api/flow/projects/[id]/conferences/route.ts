import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/apiKey";
import { corsPreflightResponse, jsonCors, withCors } from "@/lib/apiCors";
import { getProjectWithConferences } from "@/lib/flow";
import { createConference } from "@/lib/conference";
import { createConferenceSchema } from "@/lib/validation";

export async function OPTIONS() {
  return corsPreflightResponse();
}

// POST /api/flow/projects/[id]/conferences
// Body: { title, speaker?, order?, scheduledStart?, scheduledEnd? }
// Crée une conférence (utile pour les conférences imprévues sur le terrain)
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireApiKey(request);
  if (authError) return withCors(authError);

  try {
    const { id } = await ctx.params;
    const project = await getProjectWithConferences(id);
    if (!project) {
      return jsonCors({ error: "Projet introuvable" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = createConferenceSchema.safeParse(body);
    if (!parsed.success) {
      return jsonCors(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const conference = await createConference({
      flowProjectId: id,
      title: parsed.data.title,
      speaker: parsed.data.speaker,
      order: parsed.data.order,
      scheduledStart: parsed.data.scheduledStart ? new Date(parsed.data.scheduledStart) : null,
      scheduledEnd: parsed.data.scheduledEnd ? new Date(parsed.data.scheduledEnd) : null,
    });

    return jsonCors({ conference }, { status: 201 });
  } catch (error) {
    console.error("[/api/flow/projects/:id/conferences] error:", error);
    return jsonCors({ error: "Erreur serveur" }, { status: 500 });
  }
}
