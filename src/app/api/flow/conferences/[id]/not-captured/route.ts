import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/apiKey";
import { corsPreflightResponse, jsonCors, withCors } from "@/lib/apiCors";
import { getConference, markNotCaptured } from "@/lib/conference";
import { refreshProjectStatus } from "@/lib/flow";

export async function OPTIONS() {
  return corsPreflightResponse();
}

// POST /api/flow/conferences/[id]/not-captured
// Marque une conférence comme non captée (annulée sur le terrain)
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireApiKey(request);
  if (authError) return withCors(authError);

  try {
    const { id } = await ctx.params;
    const existing = await getConference(id);
    if (!existing) return jsonCors({ error: "Conférence introuvable" }, { status: 404 });

    const conference = await markNotCaptured(id);
    const projectStatus = await refreshProjectStatus(conference.flowProjectId);

    return jsonCors({ conference, projectStatus });
  } catch (error) {
    console.error("[/api/flow/conferences/:id/not-captured] error:", error);
    return jsonCors({ error: "Erreur serveur" }, { status: 500 });
  }
}
