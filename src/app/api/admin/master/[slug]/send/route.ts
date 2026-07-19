import { NextRequest, NextResponse } from "next/server";
import { requireMasterAccess } from "@/lib/master-auth";
import prisma from "@/lib/db";
import { applyMarkingAndSend } from "@/lib/master";
import type { CoreMarkingItem } from "@/lib/eva-core";

async function requireAuth() {
  return requireMasterAccess();
}

// POST /api/admin/master/[slug]/send
// Reçoit le marquage local (IndexedDB régie) + les ids de logs à joindre.
// Écrit la copie serveur, transmet à EVA CORE (stub), renvoie la liste
// réconciliée. Un échec est sans conséquence : la régie garde son local.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { slug } = await params;
  const presta = await prisma.masterPresta.findUnique({ where: { slug } });
  if (!presta) {
    return NextResponse.json({ error: "Presta introuvable" }, { status: 404 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const markings: CoreMarkingItem[] = Array.isArray(body.markings)
      ? body.markings
      : [];
    const logIds: string[] = Array.isArray(body.logIds) ? body.logIds : [];

    const { sync, conferences } = await applyMarkingAndSend(
      presta.id,
      slug,
      markings,
      logIds
    );
    return NextResponse.json({ ok: sync.ok, message: sync.message, conferences });
  } catch (error) {
    console.error("Erreur envoi EVA Core:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
