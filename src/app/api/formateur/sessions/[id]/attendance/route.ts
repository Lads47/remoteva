import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { buildAttendanceGrid, bulkUpdateAttendance } from "@/lib/attendance";

/**
 * Vérifie le token formateur + ownership : le trainer doit être assigné à la session.
 * Retourne le trainer si OK, sinon null.
 */
async function authTrainerForSession(token: string | null, sessionId: string) {
  if (!token) return null;
  const trainer = await prisma.trainer.findUnique({ where: { magicToken: token } });
  if (!trainer || !trainer.active) return null;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { trainerId: true, dateDebut: true, dateFin: true, code: true },
  });
  if (!session || session.trainerId !== trainer.id) return null;
  return { trainer, session };
}

// GET /api/formateur/sessions/[id]/attendance?token=...
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id } = await ctx.params;

    const auth = await authTrainerForSession(token, id);
    if (!auth) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const grid = await buildAttendanceGrid(id);
    return NextResponse.json({
      session: {
        id,
        code: auth.session.code,
        dateDebut: auth.session.dateDebut,
        dateFin: auth.session.dateFin,
      },
      grid,
    });
  } catch (error) {
    console.error("[/api/formateur/sessions/[id]/attendance] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

const updateSchema = z.object({
  updates: z.array(
    z.object({
      traineeId: z.string().min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      slot: z.enum(["morning", "afternoon"]),
      status: z.enum(["present", "absent"]).nullable(),
    })
  ),
});

// POST /api/formateur/sessions/[id]/attendance?token=...
// Batch upsert. Body : { updates: BulkAttendanceUpdate[] }
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id } = await ctx.params;

    const auth = await authTrainerForSession(token, id);
    if (!auth) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const res = await bulkUpdateAttendance(id, parsed.data.updates, auth.trainer.id);
    return NextResponse.json({ success: true, ...res });
  } catch (error) {
    console.error("[/api/formateur/sessions/[id]/attendance] POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
