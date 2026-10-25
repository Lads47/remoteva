import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

// Le proxy ne gate pas /api/admin/* par univers : chaque route API EVA Stat
// appelle cette garde (même modèle que requireMasterAccess).
export async function requireStatAccess() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (session.status !== "validated") {
    return NextResponse.json({ error: "Compte non validé" }, { status: 403 });
  }
  if (!session.isSuperAdmin && !session.universes?.includes("stat")) {
    return NextResponse.json({ error: "Accès refusé à cet univers" }, { status: 403 });
  }
  return null;
}
