import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/apiKey";
import { corsPreflightResponse, jsonCors, withCors } from "@/lib/apiCors";
import { getProjectByEventId } from "@/lib/flow";
import { isValidEventId } from "@/lib/eventId";

export async function OPTIONS() {
  return corsPreflightResponse();
}

// GET /api/flow/projects/by-event-id/[eventId]
export async function GET(request: NextRequest, ctx: { params: Promise<{ eventId: string }> }) {
  const authError = await requireApiKey(request);
  if (authError) return withCors(authError);

  try {
    const { eventId } = await ctx.params;
    if (!isValidEventId(eventId)) {
      return jsonCors({ error: "Format eventId invalide (DDMMYY-NNN attendu)" }, { status: 400 });
    }
    const project = await getProjectByEventId(eventId);
    if (!project) {
      return jsonCors({ error: "Projet introuvable" }, { status: 404 });
    }
    return jsonCors({ project });
  } catch (error) {
    console.error("[/api/flow/projects/by-event-id/:eventId] error:", error);
    return jsonCors({ error: "Erreur serveur" }, { status: 500 });
  }
}
