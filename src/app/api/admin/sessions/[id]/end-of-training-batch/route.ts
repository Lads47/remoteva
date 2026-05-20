// POST /api/admin/sessions/[id]/end-of-training-batch
//
// Génère + envoie les documents de fin de formation (certificat de
// réalisation + attestation) pour tous les stagiaires de la session qui
// sont en statut "termine" (ou statut éligible) et qui n'ont pas déjà reçu
// ces documents.
//
// Body optionnel :
//   - includeStatuses?: string[] — par défaut ["termine"]. Permet d'ouvrir
//     à d'autres statuts si nécessaire (par exemple "en_formation" pour
//     une session qui se termine aujourd'hui).
//   - skipAlreadySent?: boolean — par défaut true. Si false, ré-envoie aux
//     stagiaires qui ont déjà des documents avec sentAt non null.
//   - traineeIds?: string[] — restreint le batch à ces IDs uniquement.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/db";
import { generateAndMailEndOfTrainingDocs } from "@/lib/trainee-documents";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

const DEFAULT_INCLUDE_STATUSES = ["termine"];

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id: sessionId } = await ctx.params;
    const body = await request.json().catch(() => ({}));
    const includeStatuses: string[] = Array.isArray(body?.includeStatuses) && body.includeStatuses.length > 0
      ? body.includeStatuses
      : DEFAULT_INCLUDE_STATUSES;
    const skipAlreadySent: boolean = body?.skipAlreadySent !== false; // default true
    const filterIds: string[] | null = Array.isArray(body?.traineeIds) ? body.traineeIds : null;

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        trainees: {
          include: { documents: { where: { type: { in: ["certificat", "attestation"] } } } },
        },
      },
    });
    if (!session) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });

    const targets = session.trainees.filter((t) => {
      if (filterIds && !filterIds.includes(t.id)) return false;
      if (!includeStatuses.includes(t.status)) return false;
      if (!t.email) return false;
      if (skipAlreadySent) {
        const alreadyHasBoth = t.documents.filter((d) => d.sentAt !== null).length >= 2;
        if (alreadyHasBoth) return false;
      }
      return true;
    });

    const results: Array<{
      traineeId: string;
      stagiaire: string;
      email: string;
      ok: boolean;
      emailSent?: boolean;
      error?: string;
    }> = [];

    for (const t of targets) {
      try {
        const r = await generateAndMailEndOfTrainingDocs(t.id);
        results.push({
          traineeId: t.id,
          stagiaire: `${t.prenom} ${t.nom}`,
          email: t.email,
          ok: r.ok,
          emailSent: r.ok ? r.emailSent : undefined,
          error: r.ok ? undefined : r.error,
        });
      } catch (err) {
        results.push({
          traineeId: t.id,
          stagiaire: `${t.prenom} ${t.nom}`,
          email: t.email,
          ok: false,
          error: err instanceof Error ? err.message : "Erreur inconnue",
        });
      }
    }

    const sent = results.filter((r) => r.ok && r.emailSent).length;
    const failed = results.length - sent;

    return NextResponse.json({
      success: true,
      sessionId,
      total: results.length,
      sent,
      failed,
      skipped: session.trainees.length - targets.length,
      results,
    });
  } catch (error) {
    console.error("[/api/admin/sessions/[id]/end-of-training-batch] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
