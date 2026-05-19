import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getDriveAttachments,
  getDriveDefaultTemplates,
  setDriveAttachments,
  setDriveDefaultTemplates,
  type DriveAttachments,
  type DriveDefaultTemplates,
} from "@/lib/appConfig";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// GET /api/admin/drive-config
// Renvoie les IDs des templates Drive par défaut globaux + les IDs des pièces
// jointes Drive (CGV, RI) attachées aux mails contractuels.
export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const [templates, attachments] = await Promise.all([
      getDriveDefaultTemplates(),
      getDriveAttachments(),
    ]);
    return NextResponse.json({ templates, attachments });
  } catch (error) {
    console.error("[/api/admin/drive-config] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PUT /api/admin/drive-config
// Body: { templates?: { convention?, contrat?, convocation? }, attachments?: { cgv?, ri? } }
export async function PUT(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const body = await request.json();

    if (body?.templates !== undefined) {
      const raw = body.templates as Partial<Record<string, unknown>>;
      if (!raw || typeof raw !== "object") {
        return NextResponse.json({ error: "Body invalide : 'templates' doit être un objet" }, { status: 400 });
      }
      const cleaned: DriveDefaultTemplates = {};
      if (typeof raw.convention === "string") cleaned.convention = raw.convention;
      if (typeof raw.contrat === "string") cleaned.contrat = raw.contrat;
      if (typeof raw.convocation === "string") cleaned.convocation = raw.convocation;
      await setDriveDefaultTemplates(cleaned);
    }

    if (body?.attachments !== undefined) {
      const raw = body.attachments as Partial<Record<string, unknown>>;
      if (!raw || typeof raw !== "object") {
        return NextResponse.json({ error: "Body invalide : 'attachments' doit être un objet" }, { status: 400 });
      }
      const cleaned: DriveAttachments = {};
      if (typeof raw.cgv === "string") cleaned.cgv = raw.cgv;
      if (typeof raw.ri === "string") cleaned.ri = raw.ri;
      await setDriveAttachments(cleaned);
    }

    const [templates, attachments] = await Promise.all([
      getDriveDefaultTemplates(),
      getDriveAttachments(),
    ]);
    return NextResponse.json({ success: true, templates, attachments });
  } catch (error) {
    console.error("[/api/admin/drive-config] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
