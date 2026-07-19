import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

// Garde d'accès aux routes API EVA MASTER (fix E-1).
// Le proxy gate déjà /admin/master (pages) par univers, MAIS son universeForPath
// ne matche pas /api/admin/... → les routes API n'étaient protégées QUE par la
// présence d'une session. On ajoute ici une vérification d'univers explicite
// (defense in depth) : il faut l'univers "master" ou être super-admin.
// Renvoie une NextResponse d'erreur si refusé, sinon null.
export async function requireMasterAccess() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (session.status !== "validated") {
    return NextResponse.json({ error: "Compte non validé" }, { status: 403 });
  }
  if (!session.isSuperAdmin && !session.universes?.includes("master")) {
    return NextResponse.json({ error: "Accès refusé à cet univers" }, { status: 403 });
  }
  return null;
}
