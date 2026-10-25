import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

// Le proxy ne gate pas /api/admin/* : les routes Réseaux sociaux sont réservées aux
// super-administrateurs, comme la page /admin/users qui les héberge.
export async function requireSuperAdmin() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (session.status !== "validated" || !session.isSuperAdmin) {
    return NextResponse.json({ error: "Réservé aux super-administrateurs" }, { status: 403 });
  }
  return null;
}
