// GET /api/admin/reclamations/[id]   → détail réclamation
// PUT /api/admin/reclamations/[id]   → mise à jour admin (statut, action, notes, ...)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getComplaintById, updateComplaint } from "@/lib/complaint";

const updateSchema = z.object({
  status: z.enum(["new", "in_progress", "resolved", "closed"]).optional(),
  responseType: z.string().trim().optional(),
  responseContent: z.string().trim().optional(),
  actionCorrective: z.string().trim().optional(),
  adminNotes: z.string().trim().optional(),
  resolvedBy: z.string().trim().optional(),
});

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const c = await getComplaintById(id);
    if (!c) return NextResponse.json({ error: "Réclamation introuvable" }, { status: 404 });
    return NextResponse.json({ complaint: c });
  } catch (error) {
    console.error("[/api/admin/reclamations/[id]] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const updated = await updateComplaint(id, parsed.data);
    if (!updated) return NextResponse.json({ error: "Réclamation introuvable" }, { status: 404 });
    return NextResponse.json({ complaint: updated });
  } catch (error) {
    console.error("[/api/admin/reclamations/[id]] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
