import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { provisionSessionDriveFolder } from "@/lib/drive-provisioning";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// POST /api/admin/sessions/[id]/provision-drive
// Crée (ou répare, idempotent) le dossier Drive de la session + l'arborescence
// Qualiopi. Réponse contient le driveFolderId et la liste des sous-dossiers
// nouvellement créés.
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await ctx.params;
    const result = await provisionSessionDriveFolder(id);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 });
    }
    return NextResponse.json({
      success: true,
      driveFolderId: result.driveFolderId,
      created: result.created,
      subfoldersCreated: result.subfoldersCreated,
    });
  } catch (error) {
    console.error("[/api/admin/sessions/[id]/provision-drive] POST error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
