import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  getDriveDefaultTemplates,
  setDriveDefaultTemplates,
  type DriveDefaultTemplates,
} from "@/lib/appConfig";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// GET /api/admin/drive-config
// Renvoie les IDs des templates Drive par défaut globaux (convention, contrat,
// convocation) — fallback utilisé quand une formation n'a pas son propre template.
export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const templates = await getDriveDefaultTemplates();
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("[/api/admin/drive-config] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PUT /api/admin/drive-config
// Body: { templates: { convention?, contrat?, convocation? } }
export async function PUT(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const body = await request.json();
    const raw = body?.templates as Partial<Record<string, unknown>> | undefined;
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ error: "Body invalide : 'templates' attendu" }, { status: 400 });
    }
    const cleaned: DriveDefaultTemplates = {};
    if (typeof raw.convention === "string") cleaned.convention = raw.convention;
    if (typeof raw.contrat === "string") cleaned.contrat = raw.contrat;
    if (typeof raw.convocation === "string") cleaned.convocation = raw.convocation;
    await setDriveDefaultTemplates(cleaned);
    const saved = await getDriveDefaultTemplates();
    return NextResponse.json({ success: true, templates: saved });
  } catch (error) {
    console.error("[/api/admin/drive-config] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
