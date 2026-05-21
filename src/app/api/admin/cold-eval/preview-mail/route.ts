// POST /api/admin/cold-eval/preview-mail
//
// Outil interne : envoie un MAIL-TYPE d'éval à froid à une adresse arbitraire
// (sans créer de ColdEvalResponse en BDD ni toucher au vrai pipeline). Utile
// pour vérifier le rendu visuel avant que le cron quotidien ne soit déclenché
// sur de vrais stagiaires.
//
// Body : { to: string, which?: "invite" | "reminder1" | "reminder2" }
//   - to        : adresse de destination
//   - which     : variante (default = "invite")

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sendColdEvalInvite, sendColdEvalReminder } from "@/lib/mailer";

/**
 * Auth permissive : cookie admin OU header Authorization: Bearer CRON_SECRET.
 * Permet d'appeler la preview depuis l'admin (cookie) ou depuis un outil de
 * dev / un script (curl avec Bearer).
 */
async function authorize(request: NextRequest): Promise<NextResponse | null> {
  let hasSession = false;
  try {
    const session = await getSession();
    hasSession = !!session;
    if (session) return null;
  } catch (err) {
    console.warn("[preview-mail] getSession() a throw:", err);
  }

  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");

  // Log temporaire pour diagnostiquer le 401 — à retirer une fois fixé
  console.log("[preview-mail] authorize debug", {
    hasSession,
    hasSecret: !!secret,
    secretLength: secret?.length,
    hasAuthHeader: !!auth,
    authPrefix: auth?.slice(0, 20),
    authLength: auth?.length,
    expectedLength: secret ? `Bearer ${secret}`.length : 0,
    match: secret ? auth === `Bearer ${secret}` : false,
  });

  if (secret && auth === `Bearer ${secret}`) return null;
  return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
}

export async function POST(request: NextRequest) {
  const authError = await authorize(request);
  if (authError) return authError;
  try {
    const body = await request.json();
    const to = typeof body?.to === "string" ? body.to.trim() : "";
    const which = body?.which === "reminder1" ? "reminder1"
      : body?.which === "reminder2" ? "reminder2"
      : "invite";

    if (!to || !to.includes("@")) {
      return NextResponse.json({ error: "Paramètre 'to' invalide" }, { status: 400 });
    }

    // Données de démo : un faux token visible dans le lien pour donner
    // l'illusion du vrai mail. Le lien fonctionnera comme un lien 404 si
    // cliqué — c'est OK pour une preview.
    const fakeToken = "DEMO-" + Math.random().toString(36).slice(2, 10);
    const base = process.env.PUBLIC_BASE_URL || "https://evaremote.com";
    const surveyUrl = `${base}/eval-froid/${fakeToken}`;
    const prenom = "Noémie";
    const formationNomLong = "Perfectionnement vMix 1 Jour";

    let result;
    if (which === "invite") {
      result = await sendColdEvalInvite({ to, prenom, formationNomLong, surveyUrl });
    } else {
      result = await sendColdEvalReminder({
        to,
        prenom,
        formationNomLong,
        surveyUrl,
        reminderNumber: which === "reminder2" ? 2 : 1,
      });
    }

    return NextResponse.json({
      success: result.success,
      error: result.error,
      to,
      which,
      sentVia: "Resend",
      previewUrl: surveyUrl,
      note: "Mail-type — aucun ColdEvalResponse créée en BDD. Le lien est factice (404 si cliqué).",
    });
  } catch (error) {
    console.error("[/api/admin/cold-eval/preview-mail] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
