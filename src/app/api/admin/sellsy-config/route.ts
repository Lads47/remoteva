import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import {
  EVA_STATUSES,
  getSellsyPipelineId,
  getSellsyStepMapping,
  setSellsyPipelineId,
  setSellsyStepMapping,
} from "@/lib/appConfig";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

const putSchema = z.object({
  pipelineId: z.number().int().positive().nullable(),
  mapping: z.record(z.enum(EVA_STATUSES), z.number().int().positive().nullable().optional()),
});

// GET /api/admin/sellsy-config
export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const pipelineId = await getSellsyPipelineId();
    const mapping = await getSellsyStepMapping();
    return NextResponse.json({ pipelineId, mapping });
  } catch (error) {
    console.error("[/api/admin/sellsy-config] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PUT /api/admin/sellsy-config
export async function PUT(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const body = await request.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    if (parsed.data.pipelineId !== null) {
      await setSellsyPipelineId(parsed.data.pipelineId);
    }
    // Nettoie les valeurs null/undefined avant de stocker
    const cleanMapping: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed.data.mapping)) {
      if (typeof v === "number") cleanMapping[k] = v;
    }
    await setSellsyStepMapping(cleanMapping);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/admin/sellsy-config] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
