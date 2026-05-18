import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAttendanceFile } from "@/lib/attendance-files";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// GET /api/admin/sessions/[id]/attendance/files/[fileId]
// Téléchargement du binaire (pour archive Qualiopi).
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; fileId: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id, fileId } = await ctx.params;
    const file = await getAttendanceFile(fileId);
    if (!file || file.sessionId !== id) {
      return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
    }
    return new NextResponse(file.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(file.filename)}"`,
        "Content-Length": String(file.sizeBytes),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[/api/admin/.../files/[fileId]] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
