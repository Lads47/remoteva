// Envoi d'emails transactionnels via l'API Resend (HTTPS direct, sans dépendance npm).
// Doc : https://resend.com/docs/api-reference/emails/send-email
//
// Variables d'environnement requises :
// - RESEND_API_KEY  : clé API Resend
// - RESEND_FROM     : adresse expéditeur (ex: "Les Ateliers du Stream <noemie@lesateliersdustream.fr>")
//                     Le domaine doit être vérifié dans Resend (sauf "onboarding@resend.dev" en test)
// - ADMIN_NOTIFY_EMAIL : destinataire des notifs admin (Noémie)
// - PUBLIC_BASE_URL : URL publique (ex: https://evaremote.com) pour générer les liens admin

const RESEND_API_URL = "https://api.resend.com/emails";

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

/**
 * Envoi bas-niveau via Resend. Best-effort : retourne success=false plutôt que de throw.
 * Si RESEND_API_KEY est absente, on log un warning et on simule un succès (mode dev).
 */
async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!apiKey || !from) {
    console.warn("[mailer] RESEND_API_KEY ou RESEND_FROM absent — email non envoyé:", params.subject, "→", params.to);
    return { success: false, error: "RESEND_API_KEY ou RESEND_FROM manquant" };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        reply_to: params.replyTo,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[mailer] Resend HTTP ${res.status}:`, errText);
      return { success: false, error: `HTTP ${res.status}: ${errText.slice(0, 200)}` };
    }
    const data = (await res.json()) as { id?: string };
    return { success: true, messageId: data.id };
  } catch (err) {
    console.error("[mailer] Resend error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// === Templates ===

function fmtDateFr(d: Date | string): string {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Guide contextuel à insérer dans le mail de confirmation, en fonction du mode de financement.
 * Retourne { title, paragraph } — paragraph est du texte brut, sans HTML.
 */
function financementGuide(mode: string): { title: string; paragraph: string } {
  switch (mode) {
    case "AFDAS (Intermittents)":
      return {
        title: "Démarche AFDAS",
        paragraph:
          "Munissez-vous du devis et du programme de formation pour déposer votre demande de prise en charge auprès de l'AFDAS. Le délai de traitement est généralement de 3 à 5 semaines — pensez à anticiper. Nous vous transmettrons dès que possible les pièces nécessaires.",
      };
    case "OPCO entreprise":
      return {
        title: "Démarche OPCO",
        paragraph:
          "Transmettez le devis et le programme de formation à votre OPCO dès réception. Le délai de traitement est généralement de 3 à 5 semaines — pensez à anticiper. Dès l'accord de prise en charge reçu, merci de nous le transférer pour valider définitivement votre place.",
      };
    case "France Travail":
      return {
        title: "Demande d'AIF (France Travail)",
        paragraph:
          "Nous vous accompagnons dans la constitution du dossier d'Aide Individuelle à la Formation (AIF). Comptez environ 15 jours de délai de traitement après dépôt. Nous vous transmettrons les pièces nécessaires avec le devis.",
      };
    case "Fonds propres entreprise":
      return {
        title: "Paiement direct par l'employeur",
        paragraph:
          "Le devis sera à signer et retourner par votre employeur. La convention de formation suivra, puis la facturation se fera après la session.",
      };
    case "Financement personnel":
      return {
        title: "Paiement personnel",
        paragraph:
          "Le contrat de formation vous sera transmis avec le devis. Une fois signé, votre place sera réservée. Le paiement se fait à titre individuel selon les modalités précisées dans le contrat.",
      };
    default:
      return {
        title: "Démarches à venir",
        paragraph:
          "Nous reviendrons vers vous sous quelques jours avec le devis et les démarches à suivre en fonction de votre mode de financement.",
      };
  }
}

/**
 * Mail de confirmation envoyé au stagiaire après inscription.
 */
export async function sendInscriptionConfirmation(params: {
  to: string;
  prenom: string;
  nom: string;
  formationNomLong: string;
  sessionDateDebut: Date | string;
  sessionDateFin: Date | string;
  sessionLieu: string;
  modeFinancement: string;
}): Promise<SendEmailResult> {
  const replyTo = process.env.ADMIN_NOTIFY_EMAIL;
  const safe = {
    prenom: escapeHtml(params.prenom),
    nom: escapeHtml(params.nom),
    formation: escapeHtml(params.formationNomLong),
    lieu: escapeHtml(params.sessionLieu || "Lieu à préciser"),
    mode: escapeHtml(params.modeFinancement),
  };
  const dateDebut = fmtDateFr(params.sessionDateDebut);
  const dateFin = fmtDateFr(params.sessionDateFin);
  const guide = financementGuide(params.modeFinancement);
  const guideTitleSafe = escapeHtml(guide.title);
  const guideParaSafe = escapeHtml(guide.paragraph);

  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2244;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">Demande d'inscription bien reçue ✓</h1>
  <p>Bonjour ${safe.prenom},</p>
  <p>Nous avons bien reçu votre demande d'inscription à la formation <strong>${safe.formation}</strong>.</p>
  <table style="border-collapse: collapse; margin: 16px 0; background: #f8fafc; border-radius: 8px; padding: 12px; width: 100%;">
    <tr><td style="padding: 8px 12px; color: #727485;">Session</td><td style="padding: 8px 12px;"><strong>Du ${dateDebut} au ${dateFin}</strong></td></tr>
    <tr><td style="padding: 8px 12px; color: #727485;">Lieu</td><td style="padding: 8px 12px;">${safe.lieu}</td></tr>
    <tr><td style="padding: 8px 12px; color: #727485;">Mode de financement</td><td style="padding: 8px 12px;">${safe.mode}</td></tr>
  </table>
  <p><strong>Prochaines étapes :</strong></p>
  <ol style="padding-left: 20px;">
    <li>Notre équipe revient vers vous sous quelques jours avec le devis personnalisé.</li>
    <li><strong>${guideTitleSafe}</strong> — ${guideParaSafe}</li>
    <li>Dès la signature des documents (et l'accord de prise en charge le cas échéant), votre place sera définitivement validée.</li>
  </ol>
  <p>Pour toute question, vous pouvez simplement répondre à ce mail.</p>
  <p>Bien cordialement,<br/>Noémie Marphay<br/><em>Les Ateliers du Stream</em></p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;"/>
  <p style="font-size: 11px; color: #9ca3af;">
    Formation référencée Qualiopi. Vos données sont utilisées uniquement pour le traitement de votre inscription, conformément au RGPD.
  </p>
</body>
</html>`;

  const text = `Bonjour ${params.prenom},

Nous avons bien reçu votre demande d'inscription à la formation ${params.formationNomLong}.

Session : du ${dateDebut} au ${dateFin}
Lieu : ${params.sessionLieu || "Lieu à préciser"}
Mode de financement : ${params.modeFinancement}

Prochaines étapes :
1. Notre équipe revient vers vous sous quelques jours avec le devis personnalisé.
2. ${guide.title} — ${guide.paragraph}
3. Dès la signature des documents (et l'accord de prise en charge le cas échéant), votre place sera définitivement validée.

Pour toute question, répondez à ce mail.

Bien cordialement,
Noémie Marphay
Les Ateliers du Stream`;

  return sendEmail({
    to: params.to,
    subject: `Demande d'inscription bien reçue — ${params.formationNomLong}`,
    html,
    text,
    replyTo,
  });
}

/**
 * Mail interne envoyé à Noémie pour l'alerter d'une nouvelle inscription.
 */
export async function sendInscriptionAdminNotif(params: {
  traineeId: string;
  sessionId: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  formationCode: string;
  formationNomLong: string;
  sessionCode: string;
  sessionDateDebut: Date | string;
  inscriptionType: string;
  raisonSociale: string;
  modeFinancement: string;
  opcoDetecte: string;
  psh: boolean;
}): Promise<SendEmailResult> {
  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
  if (!adminEmail) {
    console.warn("[mailer] ADMIN_NOTIFY_EMAIL absent — notif admin non envoyée");
    return { success: false, error: "ADMIN_NOTIFY_EMAIL manquant" };
  }
  const baseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
  const fichSessionUrl = `${baseUrl}/admin/formations/sessions/${params.sessionId}`;

  const safe = {
    prenom: escapeHtml(params.prenom),
    nom: escapeHtml(params.nom),
    email: escapeHtml(params.email),
    telephone: escapeHtml(params.telephone || "—"),
    formation: escapeHtml(params.formationNomLong),
    sessionCode: escapeHtml(params.sessionCode),
    type: escapeHtml(params.inscriptionType),
    raisonSociale: escapeHtml(params.raisonSociale || "—"),
    mode: escapeHtml(params.modeFinancement),
    opco: escapeHtml(params.opcoDetecte && params.opcoDetecte !== "GENERIQUE" ? params.opcoDetecte : "—"),
  };
  const dateDebut = fmtDateFr(params.sessionDateDebut);

  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2244;">
  <h1 style="font-size: 20px; margin: 0 0 16px;">🆕 Nouvelle inscription</h1>
  <p><strong>${safe.prenom} ${safe.nom}</strong> vient de s'inscrire à <strong>${safe.formation}</strong> (session ${safe.sessionCode}, ${dateDebut}).</p>
  <table style="border-collapse: collapse; margin: 16px 0; background: #f8fafc; border-radius: 8px; padding: 12px; width: 100%; font-size: 14px;">
    <tr><td style="padding: 6px 12px; color: #727485;">Email</td><td style="padding: 6px 12px;"><a href="mailto:${safe.email}">${safe.email}</a></td></tr>
    <tr><td style="padding: 6px 12px; color: #727485;">Téléphone</td><td style="padding: 6px 12px;">${safe.telephone}</td></tr>
    <tr><td style="padding: 6px 12px; color: #727485;">Type</td><td style="padding: 6px 12px;">${safe.type}${params.raisonSociale ? ` — ${safe.raisonSociale}` : ""}</td></tr>
    <tr><td style="padding: 6px 12px; color: #727485;">Financement</td><td style="padding: 6px 12px;">${safe.mode}</td></tr>
    <tr><td style="padding: 6px 12px; color: #727485;">OPCO détecté</td><td style="padding: 6px 12px;">${safe.opco}</td></tr>
    ${params.psh ? `<tr><td style="padding: 6px 12px; color: #727485;">PSH</td><td style="padding: 6px 12px; color: #b45309;">Situation de handicap signalée</td></tr>` : ""}
  </table>
  <p style="margin-top: 24px;">
    <a href="${fichSessionUrl}" style="display: inline-block; padding: 10px 18px; background: #1f2244; color: white; text-decoration: none; border-radius: 999px; font-weight: 600;">
      Voir la fiche stagiaire
    </a>
  </p>
</body>
</html>`;

  const text = `Nouvelle inscription

${params.prenom} ${params.nom} vient de s'inscrire à ${params.formationNomLong} (session ${params.sessionCode}, ${dateDebut}).

Email : ${params.email}
Téléphone : ${params.telephone || "—"}
Type : ${params.inscriptionType}${params.raisonSociale ? ` — ${params.raisonSociale}` : ""}
Financement : ${params.modeFinancement}
OPCO détecté : ${params.opcoDetecte && params.opcoDetecte !== "GENERIQUE" ? params.opcoDetecte : "—"}
${params.psh ? "PSH : situation de handicap signalée\n" : ""}
Voir la fiche : ${fichSessionUrl}`;

  return sendEmail({
    to: adminEmail,
    subject: `Nouvelle inscription : ${params.prenom} ${params.nom} — ${params.formationCode} ${params.sessionCode}`,
    html,
    text,
    replyTo: params.email,
  });
}
