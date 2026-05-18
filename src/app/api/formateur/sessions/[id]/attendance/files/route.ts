import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  listAttendanceFiles,
  saveAttendanceFile,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
} from "@/lib/attendance-files";

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

// GET /api/formateur/sessions/[id]/attendance/files?token=...
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id } = await ctx.params;

    const trainer = await authTrainerForSession(token, id);
    if (!trainer) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const files = await listAttendanceFiles(id);
    return NextResponse.json({ files });
  } catch (error) {
    console.error("[/api/formateur/sessions/[id]/attendance/files] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST /api/formateur/sessions/[id]/attendance/files?token=...
// multipart/form-data : file (obligatoire), date (optionnel, YYYY-MM-DD)
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id } = await ctx.params;

    const trainer = await authTrainerForSession(token, id);
    if (!trainer) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    const formData = await request.formData();
    const file = formData.get("file");
    const dateRaw = formData.get("date");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `Fichier trop volumineux (max ${Math.floor(MAX_FILE_SIZE_BYTES / 1024 / 1024)} MB)` },
        { status: 400 }
      );
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `Type non autorisé (${file.type}). Autorisés : PDF, JPEG, PNG, HEIC, WebP.` },
        { status: 400 }
      );
    }

    let date: Date | null = null;
    if (typeof dateRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
      date = new Date(dateRaw + "T00:00:00Z");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = await saveAttendanceFile({
      sessionId: id,
      date,
      filename: file.name,
      mimeType: file.type,
      buffer,
      uploadedById: trainer.id,
    });
    return NextResponse.json({ file: saved }, { status: 201 });
  } catch (error) {
    console.error("[/api/formateur/sessions/[id]/attendance/files] POST error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
