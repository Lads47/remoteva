import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getTraineesBySession } from "@/lib/trainee";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// GET /api/admin/trainees?sessionId=xxx
export async function GET(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId requis" }, { status: 400 });
    }
    const trainees = await getTraineesBySession(sessionId);
    return NextResponse.json({ trainees });
  } catch (error) {
    console.error("[/api/admin/trainees] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
