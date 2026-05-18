import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { deleteAttendanceFile, getAttendanceFile } from "@/lib/attendance-files";

async function authTrainerForSession(token: string | null, sessionId: string) {
  if (!token) return null;
  const trainer = await prisma.trainer.findUnique({ where: { magicToken: token } });
  if (!trainer || !trainer.active) return null;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { trainerId: true },
  });
  if (!session || session.trainerId !== trainer.id) return null;
  return trainer;
}

// GET /api/formateur/sessions/[id]/attendance/files/[fileId]?token=...
// Renvoie le binaire du fichier (download).
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id, fileId } = await ctx.params;

    const trainer = await authTrainerForSession(token, id);
    if (!trainer) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

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
    console.error("[/api/formateur/.../files/[fileId]] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/formateur/sessions/[id]/attendance/files/[fileId]?token=...
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id, fileId } = await ctx.params;

    const trainer = await authTrainerForSession(token, id);
    if (!trainer) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const file = await prisma.attendanceFile.findUnique({ where: { id: fileId } });
    if (!file || file.sessionId !== id) {
      return NextResponse.json({ error: "Fichier introuvable" }, { status: 404 });
    }
    await deleteAttendanceFile(fileId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/formateur/.../files/[fileId]] DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
