// POST /api/admin/sessions/[id]/satisfaction/send
//
// Équivalent admin de l'endpoint formateur. Envoie le mail d'invitation
// à tous les stagiaires de la session avec l'URL publique anonyme.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sendSatisfactionSurveyInvite } from "@/lib/mailer";
import { getSessionContacts } from "@/lib/satisfaction";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await ctx.params;
    const contacts = await getSessionContacts(id);
    if (!contacts) return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    if (contacts.trainees.length === 0) {
      return NextResponse.json({ error: "Aucun stagiaire inscrit dans cette session." }, { status: 400 });
    }

    const publicBaseUrl = process.env.PUBLIC_BASE_URL || "https://evaremote.com";
    const surveyUrl = `${publicBaseUrl}/eval-chaud/session/${id}`;

    const sendResults = [];
    for (const t of contacts.trainees) {
      try {
        const r = await sendSatisfactionSurveyInvite({
          to: t.email,
          prenom: t.prenom,
          formationNomLong: contacts.formation.nomLong,
          surveyUrl,
        });
        sendResults.push({
          traineeId: t.traineeId,
          traineeName: `${t.prenom} ${t.nom}`,
          email: t.email,
          ok: r.success,
          error: r.error,
        });
      } catch (err) {
        sendResults.push({
          traineeId: t.traineeId,
          traineeName: `${t.prenom} ${t.nom}`,
          email: t.email,
          ok: false,
          error: err instanceof Error ? err.message : "Erreur inconnue",
        });
      }
    }

    return NextResponse.json({
      success: true,
      sessionId: id,
      total: contacts.trainees.length,
      mailsSent: sendResults.filter((r) => r.ok).length,
      results: sendResults,
      surveyUrl,
    });
  } catch (error) {
    console.error("[/api/admin/sessions/[id]/satisfaction/send] error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
