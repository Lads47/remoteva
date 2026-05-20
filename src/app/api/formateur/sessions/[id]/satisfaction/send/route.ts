// POST /api/formateur/sessions/[id]/satisfaction/send?token=...
//
// Déclenche l'envoi de l'invitation d'évaluation à chaud à tous les
// stagiaires de la session. Idempotent : si une invitation existe déjà
// (même magicToken réutilisé), on ne crée pas de doublon — mais on
// renvoie quand même le mail (le formateur peut s'en servir comme bouton
// "Renvoyer").

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { sendSatisfactionSurveyInvite } from "@/lib/mailer";
import { createOrReuseInvitations } from "@/lib/satisfaction";

async function authTrainerForSession(token: string | null, sessionId: string) {
  if (!token) return null;
  const trainer = await prisma.trainer.findUnique({ where: { magicToken: token } });
  if (!trainer || !trainer.active) return null;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { trainerId: true, formationId: true },
  });
  if (!session || session.trainerId !== trainer.id) return null;
  return trainer;
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const { id } = await ctx.params;

    const trainer = await authTrainerForSession(token, id);
    if (!trainer) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

    // Body optionnel : { sendEmails?: boolean }. Si false → on crée juste les
    // invitations (donc QR fonctionnel) sans envoyer de mail aux stagiaires.
    let sendEmails = true;
    try {
      const body = await request.json();
      if (body && typeof body.sendEmails === "boolean") sendEmails = body.sendEmails;
    } catch {
      // pas de body : comportement par défaut (envoi mails)
    }

    const publicBaseUrl = process.env.PUBLIC_BASE_URL || "https://evaremote.com";
    const invitations = await createOrReuseInvitations(id, publicBaseUrl);

    if (!sendEmails) {
      // Mode "préparation" : invitations créées, QR code utilisable, aucun
      // mail envoyé. Pratique pour partager le QR en présentiel.
      return NextResponse.json({
        success: true,
        sessionId: id,
        mode: "prepared",
        invitations: invitations.map((inv) => ({
          traineeId: inv.traineeId,
          traineeName: inv.traineeName,
          email: inv.email,
          ok: true,
          alreadyExisted: inv.alreadyExisted,
        })),
        totalInvitations: invitations.length,
        mailsSent: 0,
      });
    }

    // Charge la formation pour le label dans le mail
    const session = await prisma.session.findUnique({
      where: { id },
      select: { formation: { select: { nomLong: true } } },
    });
    const formationNomLong = session?.formation.nomLong ?? "votre formation";

    // URL de la page de sélection — la même pour tous les stagiaires de la
    // session. Les stagiaires n'ont pas de magic-link personnel ; ils
    // arrivent sur cette page (commune) puis choisissent leur nom dans la
    // liste avant de remplir le formulaire.
    const selectionUrl = `${publicBaseUrl}/eval-chaud/session/${id}`;

    // Envoi des mails (best-effort, on log les échecs mais on continue)
    const sendResults = [];
    for (const inv of invitations) {
      try {
        const r = await sendSatisfactionSurveyInvite({
          to: inv.email,
          prenom: inv.traineeName.split(" ")[0],
          formationNomLong,
          surveyUrl: selectionUrl,
        });
        sendResults.push({
          traineeId: inv.traineeId,
          traineeName: inv.traineeName,
          email: inv.email,
          ok: r.success,
          error: r.error,
          alreadyExisted: inv.alreadyExisted,
        });
      } catch (err) {
        sendResults.push({
          traineeId: inv.traineeId,
          traineeName: inv.traineeName,
          email: inv.email,
          ok: false,
          error: err instanceof Error ? err.message : "Erreur inconnue",
          alreadyExisted: inv.alreadyExisted,
        });
      }
    }

    return NextResponse.json({
      success: true,
      sessionId: id,
      mode: "sent",
      invitations: sendResults,
      totalInvitations: invitations.length,
      mailsSent: sendResults.filter((r) => r.ok).length,
    });
  } catch (error) {
    console.error("[/api/formateur/sessions/[id]/satisfaction/send] error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
