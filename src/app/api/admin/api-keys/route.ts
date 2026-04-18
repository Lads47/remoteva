import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listApiKeys, createApiKey, revokeApiKey } from "@/lib/apiKey";
import { createApiKeySchema } from "@/lib/validation";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// GET /api/admin/api-keys
export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const apiKeys = await listApiKeys();
    return NextResponse.json({ apiKeys });
  } catch (error) {
    console.error("[/api/admin/api-keys] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST /api/admin/api-keys — crée une clé et renvoie le plaintext (UNE FOIS)
export async function POST(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const body = await request.json();
    const parsed = createApiKeySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const { apiKey, plaintext } = await createApiKey(
      parsed.data.name,
      parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined
    );

    // Renvoie le plaintext UNE seule fois (à montrer à l'utilisateur dans un modal)
    return NextResponse.json({ apiKey, plaintext }, { status: 201 });
  } catch (error) {
    console.error("[/api/admin/api-keys] POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE /api/admin/api-keys?id=xxx — révoque (soft delete)
export async function DELETE(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID requis" }, { status: 400 });
    await revokeApiKey(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[/api/admin/api-keys] DELETE error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
