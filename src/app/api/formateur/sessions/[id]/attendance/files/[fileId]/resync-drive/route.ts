import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { syncAttendanceFileToDrive } from "@/lib/attendance-files";

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

// POST /api/formateur/sessions/[id]/attendance/files/[fileId]/resync-drive?token=...
// Retente la sync vers Drive pour un fichier déjà déposé localement.
export async function POST(
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

    const res = await syncAttendanceFileToDrive(fileId);
    if (!res.ok) {
      return NextResponse.json({ success: false, error: res.error }, { status: 502 });
    }
    return NextResponse.json({ success: true, driveFileId: res.fileId, driveWebUrl: res.webUrl });
  } catch (error) {
    console.error("[resync-drive] POST error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
