import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listAttendanceFiles } from "@/lib/attendance-files";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// GET /api/admin/sessions/[id]/attendance/files
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const files = await listAttendanceFiles(id);
    return NextResponse.json({ files });
  } catch (error) {
    console.error("[/api/admin/sessions/[id]/attendance/files] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
