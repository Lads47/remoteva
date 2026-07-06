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

interface EmailAttachment {
  filename: string;
  content: string;             // base64
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
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
        attachments: params.attachments,
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
  // Fuseau Europe/Paris explicite : les dates de session sont stockées en heure
  // civile Paris (minuit Paris = 22:00 UTC la veille en été). Le serveur tournant
  // en UTC, sans ce timeZone on afficherait le jour précédent dans les mails.
  return new Date(d).toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
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
    Vos données sont utilisées uniquement pour le traitement de votre inscription, conformément au RGPD.
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
 * Mail au stagiaire avec le devis Sellsy en pièce jointe.
 * Contextualisé selon le mode de financement (cf. financementGuide).
 */
export async function sendDevisToStagiaire(params: {
  to: string;
  prenom: string;
  nom: string;
  formationNomLong: string;
  sessionDateDebut: Date | string;
  sessionDateFin: Date | string;
  sessionLieu: string;
  modeFinancement: string;
  contactAdminEmail?: string;     // CC vers le contact admin si différent du stagiaire
  pdfBuffer: Buffer;
  pdfFilename: string;
  // Programme pédagogique de la formation (PDF Drive, optionnel) — joint en
  // PJ pour donner au stagiaire le détail des objectifs/contenu avant signature.
  programmeBuffer?: Buffer;
  programmeFilename?: string;
  // Guide de financement (PDF Drive commun, optionnel) — joint en PJ pour aider
  // le stagiaire à monter son dossier de prise en charge.
  financementGuideBuffer?: Buffer;
  financementGuideFilename?: string;
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
  <h1 style="font-size: 22px; margin: 0 0 16px;">Votre devis pour la formation ${safe.formation}</h1>
  <p>Bonjour ${safe.prenom},</p>
  <p>Suite à votre demande d'inscription pour la formation <strong>${safe.formation}</strong>
  (session du ${dateDebut} au ${dateFin}), vous trouverez ci-joint :</p>
  <ul style="padding-left: 20px;">
    <li>Votre <strong>devis personnalisé</strong> à signer</li>
    ${params.programmeBuffer ? `<li>Le <strong>programme détaillé</strong> de la formation</li>` : ""}
    ${params.financementGuideBuffer ? `<li>Le <strong>guide de financement</strong> pour vous aider dans vos démarches de prise en charge</li>` : ""}
  </ul>

  <table style="border-collapse: collapse; margin: 16px 0; background: #f8fafc; border-radius: 8px; padding: 12px; width: 100%;">
    <tr><td style="padding: 8px 12px; color: #727485;">Session</td><td style="padding: 8px 12px;"><strong>Du ${dateDebut} au ${dateFin}</strong></td></tr>
    <tr><td style="padding: 8px 12px; color: #727485;">Lieu</td><td style="padding: 8px 12px;">${safe.lieu}</td></tr>
    <tr><td style="padding: 8px 12px; color: #727485;">Mode de financement</td><td style="padding: 8px 12px;">${safe.mode}</td></tr>
  </table>

  <p style="background: #fef3c7; padding: 12px 16px; border-radius: 8px; border-left: 4px solid #f59e0b;">
    <strong>${guideTitleSafe}</strong><br/>${guideParaSafe}
  </p>

  <p><strong>Prochaines étapes :</strong></p>
  <ol style="padding-left: 20px;">
    <li>Vérifiez le devis ci-joint et retournez-le signé.</li>
    <li>Dès la signature reçue (et l'accord de prise en charge le cas échéant), votre place sera
    définitivement validée.</li>
    <li>Vous recevrez ensuite votre convocation et le programme détaillé.</li>
  </ol>

  <p>Pour toute question, vous pouvez simplement répondre à ce mail.</p>
  <p>Bien cordialement,<br/>Noémie Marphay<br/><em>Les Ateliers du Stream</em></p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;"/>
  <p style="font-size: 11px; color: #9ca3af;">
    Vos données sont utilisées uniquement pour le traitement de votre inscription, conformément au RGPD.
  </p>
</body>
</html>`;

  const text = `Bonjour ${params.prenom},

Suite à votre demande d'inscription à la formation ${params.formationNomLong} (session du ${dateDebut} au ${dateFin}), vous trouverez ci-joint :
- Votre devis personnalisé à signer${params.programmeBuffer ? `
- Le programme détaillé de la formation` : ""}${params.financementGuideBuffer ? `
- Le guide de financement (démarches de prise en charge)` : ""}

Session : du ${dateDebut} au ${dateFin}
Lieu : ${params.sessionLieu || "Lieu à préciser"}
Mode de financement : ${params.modeFinancement}

${guide.title} : ${guide.paragraph}

Prochaines étapes :
1. Vérifiez le devis ci-joint et retournez-le signé.
2. Dès la signature reçue (et l'accord de prise en charge le cas échéant), votre place sera définitivement validée.
3. Vous recevrez ensuite votre convocation détaillée.

Pour toute question, répondez à ce mail.

Bien cordialement,
Noémie Marphay
Les Ateliers du Stream`;

  const attachments: EmailAttachment[] = [
    { filename: params.pdfFilename, content: params.pdfBuffer.toString("base64") },
  ];
  if (params.programmeBuffer && params.programmeFilename) {
    attachments.push({
      filename: params.programmeFilename,
      content: params.programmeBuffer.toString("base64"),
    });
  }
  if (params.financementGuideBuffer && params.financementGuideFilename) {
    attachments.push({
      filename: params.financementGuideFilename,
      content: params.financementGuideBuffer.toString("base64"),
    });
  }

  return sendEmail({
    to: params.to,
    subject: `Votre devis — ${params.formationNomLong}`,
    html,
    text,
    replyTo,
    attachments,
  });
}

/**
 * Mail de bienvenue envoyé à un formateur avec son magic-link d'accès
 * à l'espace formateur.
 */
export async function sendTrainerWelcomeEmail(params: {
  to: string;
  prenom: string;
  nom: string;
  magicLink: string;
}): Promise<SendEmailResult> {
  const replyTo = process.env.ADMIN_NOTIFY_EMAIL;
  const safe = {
    prenom: escapeHtml(params.prenom),
    magicLink: escapeHtml(params.magicLink),
  };

  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2244;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">Bienvenue dans votre espace formateur</h1>
  <p>Bonjour ${safe.prenom},</p>
  <p>Voici votre lien personnel d'accès à l'espace formateur des <strong>Ateliers du Stream</strong>.
  Vous y trouverez les sessions de formation qui vous sont assignées, avec la liste des stagiaires
  inscrits et leurs réponses aux questionnaires de pré-requis.</p>

  <p style="margin: 24px 0; text-align: center;">
    <a href="${safe.magicLink}" style="display: inline-block; padding: 12px 22px; background: #1f2244; color: white; text-decoration: none; border-radius: 999px; font-weight: 600;">
      Accéder à mon espace
    </a>
  </p>

  <p style="background: #fef3c7; padding: 12px 16px; border-radius: 8px; border-left: 4px solid #f59e0b; font-size: 13px;">
    <strong>Conservez précieusement ce lien</strong> — c'est votre clé d'accès personnelle.
    Si vous l'égarez, contactez-nous pour qu'on vous en génère un nouveau.
  </p>

  <p>Bien cordialement,<br/>Noémie Marphay<br/><em>Les Ateliers du Stream</em></p>
</body>
</html>`;

  const text = `Bonjour ${params.prenom},

Bienvenue dans votre espace formateur des Ateliers du Stream.

Voici votre lien personnel d'accès :
${params.magicLink}

Vous y trouverez les sessions de formation qui vous sont assignées, avec la liste des stagiaires inscrits et leurs réponses aux questionnaires de pré-requis.

Conservez précieusement ce lien — c'est votre clé d'accès personnelle. Si vous l'égarez, contactez-nous pour qu'on vous en génère un nouveau.

Bien cordialement,
Noémie Marphay
Les Ateliers du Stream`;

  return sendEmail({
    to: params.to,
    subject: "Bienvenue dans votre espace formateur — Les Ateliers du Stream",
    html,
    text,
    replyTo,
  });
}

/**
 * Mail au formateur quand on l'assigne à une session — création de session
 * avec trainerId ou modification d'une session qui change le trainerId.
 * Donne les infos clés (formation, dates, lieu, horaires, effectif prévu) +
 * lien vers l'espace formateur de la session.
 */
export async function sendTrainerSessionAssignment(params: {
  to: string;
  prenom: string;
  formationNomLong: string;
  sessionCode: string;
  sessionDateDebut: Date | string;
  sessionDateFin: Date | string;
  sessionLieu: string;
  sessionHoraires: string;
  sessionCapacite: number;
  sessionUrl: string;       // /formateur/sessions/[id]?token=<magicToken>
  replyTo?: string;
  // Optionnel : si fourni, le contrat de sous-traitance est joint au mail
  // et un paragraphe additionnel est ajouté pour annoncer la PJ (Qualiopi ind. 27).
  contractPdfBuffer?: Buffer;
  contractPdfFilename?: string;
  contractMontantHt?: number;
}): Promise<SendEmailResult> {
  const replyTo = params.replyTo || process.env.ADMIN_NOTIFY_EMAIL;
  const safe = {
    prenom: escapeHtml(params.prenom),
    formation: escapeHtml(params.formationNomLong),
    code: escapeHtml(params.sessionCode),
    lieu: escapeHtml(params.sessionLieu || "Lieu à préciser"),
    horaires: escapeHtml(params.sessionHoraires || "Horaires à préciser"),
    url: escapeHtml(params.sessionUrl),
  };
  const dateDebut = fmtDateFr(params.sessionDateDebut);
  const dateFin = fmtDateFr(params.sessionDateFin);

  const hasContract = Boolean(params.contractPdfBuffer && params.contractPdfFilename);
  const montantFmt = hasContract && params.contractMontantHt
    ? new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(params.contractMontantHt) + " € HT"
    : "";

  const contractBlockHtml = hasContract
    ? `<div style="margin: 20px 0; padding: 14px 16px; background: #fef3c7; border-left: 3px solid #92400e; border-radius: 6px;">
    <p style="margin: 0 0 6px; font-weight: 600; color: #92400e;">📎 Contrat de sous-traitance joint</p>
    <p style="margin: 0; font-size: 13px; color: #92400e;">
      Vous trouverez en pièce jointe le contrat de sous-traitance correspondant à cette session
      ${montantFmt ? `(rémunération : <strong>${escapeHtml(montantFmt)}</strong>)` : ""}.
      Merci de le retourner signé à <a href="mailto:formation@lesateliersdustream.fr">formation@lesateliersdustream.fr</a>.
    </p>
  </div>`
    : "";
  const contractBlockText = hasContract
    ? `\n📎 CONTRAT DE SOUS-TRAITANCE\nVous trouverez en pièce jointe le contrat de sous-traitance correspondant à cette session${montantFmt ? ` (rémunération : ${montantFmt})` : ""}. Merci de le retourner signé à formation@lesateliersdustream.fr.\n`
    : "";

  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2244;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">Nouvelle session assignée</h1>
  <p>Bonjour ${safe.prenom},</p>
  <p>Une nouvelle session de formation vous a été confiée :</p>

  <table style="border-collapse: collapse; margin: 16px 0; background: #f8fafc; border-radius: 8px; padding: 12px; width: 100%;">
    <tr><td style="padding: 8px 12px; color: #727485; width: 40%;">Formation</td><td style="padding: 8px 12px;"><strong>${safe.formation}</strong></td></tr>
    <tr><td style="padding: 8px 12px; color: #727485;">Code session</td><td style="padding: 8px 12px; font-family: 'JetBrains Mono', monospace;">${safe.code}</td></tr>
    <tr><td style="padding: 8px 12px; color: #727485;">Dates</td><td style="padding: 8px 12px;">Du ${dateDebut} au ${dateFin}</td></tr>
    <tr><td style="padding: 8px 12px; color: #727485;">Lieu</td><td style="padding: 8px 12px;">${safe.lieu}</td></tr>
    <tr><td style="padding: 8px 12px; color: #727485;">Horaires</td><td style="padding: 8px 12px;">${safe.horaires}</td></tr>
    <tr><td style="padding: 8px 12px; color: #727485;">Effectif max</td><td style="padding: 8px 12px;">${params.sessionCapacite} stagiaire${params.sessionCapacite > 1 ? "s" : ""}</td></tr>
  </table>

  ${contractBlockHtml}

  <p style="margin: 24px 0; text-align: center;">
    <a href="${safe.url}" style="display: inline-block; padding: 12px 22px; background: #1f2244; color: white; text-decoration: none; border-radius: 999px; font-weight: 600;">
      Voir ma session →
    </a>
  </p>

  <p style="font-size: 13px; color: #727485;">
    Depuis votre espace formateur vous pourrez :
  </p>
  <ul style="font-size: 13px; color: #727485; padding-left: 20px;">
    <li>Consulter la liste des stagiaires inscrits + leurs pré-requis</li>
    <li>Saisir l'émargement chaque demi-journée</li>
    <li>Évaluer les exercices pratiques</li>
    <li>Diffuser le questionnaire de satisfaction en fin de session (QR ou mail)</li>
  </ul>

  <p>Pour toute question, vous pouvez répondre directement à ce mail.</p>
  <p>Bien cordialement,<br/>Noémie Marphay<br/><em>Les Ateliers du Stream</em></p>
</body>
</html>`;

  const text = `Bonjour ${params.prenom},

Une nouvelle session de formation vous a été confiée :

Formation : ${params.formationNomLong}
Code session : ${params.sessionCode}
Dates : du ${dateDebut} au ${dateFin}
Lieu : ${params.sessionLieu || "Lieu à préciser"}
Horaires : ${params.sessionHoraires || "Horaires à préciser"}
Effectif max : ${params.sessionCapacite} stagiaire${params.sessionCapacite > 1 ? "s" : ""}
${contractBlockText}
Accéder à votre espace formateur :
${params.sessionUrl}

Depuis votre espace vous pourrez consulter les stagiaires, saisir les émargements, évaluer les exercices et diffuser le questionnaire de satisfaction.

Pour toute question, répondez à ce mail.

Bien cordialement,
Noémie Marphay
Les Ateliers du Stream`;

  const attachments: EmailAttachment[] = [];
  if (hasContract && params.contractPdfBuffer && params.contractPdfFilename) {
    attachments.push({
      filename: params.contractPdfFilename,
      content: params.contractPdfBuffer.toString("base64"),
    });
  }

  return sendEmail({
    to: params.to,
    subject: `Nouvelle session assignée — ${params.formationNomLong}`,
    html,
    text,
    replyTo,
    attachments: attachments.length ? attachments : undefined,
  });
}

/**
 * Mail dédié à l'envoi du contrat de sous-traitance (Qualiopi ind. 27).
 *
 * Découplé du mail d'assignation : il ne part que lorsque la formation est
 * confirmée (seuil d'inscrits atteint) ou sur action manuelle de l'admin, pour
 * ne pas engager le sous-traitant avant d'être sûr que la session aura lieu.
 */
export async function sendTrainerContractEmail(params: {
  to: string;
  prenom: string;
  formationNomLong: string;
  sessionCode: string;
  sessionDateDebut: Date | string;
  sessionDateFin: Date | string;
  montantHt: number;
  contractPdfBuffer: Buffer;
  contractPdfFilename: string;
  sessionUrl: string;
  replyTo?: string;
}): Promise<SendEmailResult> {
  const replyTo = params.replyTo || process.env.ADMIN_NOTIFY_EMAIL;
  const safe = {
    prenom: escapeHtml(params.prenom),
    formation: escapeHtml(params.formationNomLong),
    code: escapeHtml(params.sessionCode),
    url: escapeHtml(params.sessionUrl),
  };
  const dateDebut = fmtDateFr(params.sessionDateDebut);
  const dateFin = fmtDateFr(params.sessionDateFin);
  const montantFmt =
    new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(params.montantHt) +
    " € HT";

  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2244;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">Votre contrat de sous-traitance</h1>
  <p>Bonjour ${safe.prenom},</p>
  <p>La session ci-dessous est confirmée. Vous trouverez <strong>en pièce jointe</strong> votre contrat de sous-traitance.</p>

  <table style="border-collapse: collapse; margin: 16px 0; background: #f8fafc; border-radius: 8px; padding: 12px; width: 100%;">
    <tr><td style="padding: 8px 12px; color: #727485; width: 40%;">Formation</td><td style="padding: 8px 12px;"><strong>${safe.formation}</strong></td></tr>
    <tr><td style="padding: 8px 12px; color: #727485;">Code session</td><td style="padding: 8px 12px; font-family: 'JetBrains Mono', monospace;">${safe.code}</td></tr>
    <tr><td style="padding: 8px 12px; color: #727485;">Dates</td><td style="padding: 8px 12px;">Du ${dateDebut} au ${dateFin}</td></tr>
    <tr><td style="padding: 8px 12px; color: #727485;">Rémunération</td><td style="padding: 8px 12px;"><strong>${escapeHtml(montantFmt)}</strong></td></tr>
  </table>

  <p style="font-size: 14px;">Merci de retourner le contrat <strong>signé</strong> à
    <a href="mailto:formation@lesateliersdustream.fr">formation@lesateliersdustream.fr</a>.</p>

  <p style="margin: 24px 0; text-align: center;">
    <a href="${safe.url}" style="display: inline-block; padding: 12px 22px; background: #1f2244; color: white; text-decoration: none; border-radius: 999px; font-weight: 600;">
      Voir ma session →
    </a>
  </p>

  <p>Pour toute question, vous pouvez répondre directement à ce mail.</p>
  <p>Bien cordialement,<br/>Noémie Marphay<br/><em>Les Ateliers du Stream</em></p>
</body>
</html>`;

  const text = `Bonjour ${params.prenom},

La session ci-dessous est confirmée. Vous trouverez en pièce jointe votre contrat de sous-traitance.

Formation : ${params.formationNomLong}
Code session : ${params.sessionCode}
Dates : du ${dateDebut} au ${dateFin}
Rémunération : ${montantFmt}

Merci de retourner le contrat signé à formation@lesateliersdustream.fr.

Accéder à votre espace formateur :
${params.sessionUrl}

Pour toute question, répondez à ce mail.

Bien cordialement,
Noémie Marphay
Les Ateliers du Stream`;

  return sendEmail({
    to: params.to,
    subject: `Contrat de sous-traitance — ${params.formationNomLong} (${params.sessionCode})`,
    html,
    text,
    replyTo,
    attachments: [
      {
        filename: params.contractPdfFilename,
        content: params.contractPdfBuffer.toString("base64"),
      },
    ],
  });
}

/**
 * Accusé de réception d'une réclamation au réclamant.
 * Rappelle l'engagement réglementaire de traitement sous 30 jours.
 */
export async function sendComplaintAcknowledgement(params: {
  to: string;
  authorName: string;
  complaintNumber: string;
  subject: string;
}): Promise<SendEmailResult> {
  const replyTo = process.env.ADMIN_NOTIFY_EMAIL;
  const safe = {
    authorName: escapeHtml(params.authorName),
    number: escapeHtml(params.complaintNumber),
    subject: escapeHtml(params.subject),
  };

  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2244;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">Votre réclamation a bien été reçue</h1>
  <p>Bonjour ${safe.authorName},</p>
  <p>Nous accusons réception de votre réclamation et vous en remercions. Voici les références :</p>

  <table style="border-collapse: collapse; margin: 16px 0; background: #f8fafc; border-radius: 8px; padding: 12px; width: 100%;">
    <tr><td style="padding: 8px 12px; color: #727485;">Numéro</td><td style="padding: 8px 12px; font-family: 'JetBrains Mono', monospace;"><strong>${safe.number}</strong></td></tr>
    <tr><td style="padding: 8px 12px; color: #727485;">Objet</td><td style="padding: 8px 12px;">${safe.subject}</td></tr>
  </table>

  <p style="background: #fef3c7; padding: 12px 16px; border-radius: 8px; border-left: 4px solid #f59e0b; font-size: 14px;">
    <strong>Engagement Les Ateliers du Stream :</strong> nous traiterons votre réclamation
    sous <strong>30 jours maximum</strong>. Vous recevrez un mail de retour avec notre analyse
    et les actions mises en place.
  </p>

  <p>Pour toute information complémentaire ou pour préciser votre réclamation,
  vous pouvez répondre à ce mail en mentionnant le numéro <strong>${safe.number}</strong>.</p>

  <p>Bien cordialement,<br/>Noémie Marphay<br/><em>Les Ateliers du Stream</em></p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;"/>
  <p style="font-size: 11px; color: #9ca3af;">
    Les Ateliers du Stream — Organisme de formation professionnelle continue, NDA N°75470196847.
  </p>
</body>
</html>`;

  const text = `Bonjour ${params.authorName},

Nous accusons réception de votre réclamation et vous en remercions.

Numéro : ${params.complaintNumber}
Objet : ${params.subject}

Engagement Les Ateliers du Stream : nous traiterons votre réclamation sous 30 jours maximum. Vous recevrez un mail de retour avec notre analyse et les actions mises en place.

Pour toute information complémentaire, vous pouvez répondre à ce mail en mentionnant le numéro ${params.complaintNumber}.

Bien cordialement,
Noémie Marphay
Les Ateliers du Stream`;

  return sendEmail({
    to: params.to,
    subject: `Réclamation ${params.complaintNumber} — accusé de réception`,
    html,
    text,
    replyTo,
  });
}

/**
 * Alerte interne à Noémie quand une nouvelle réclamation arrive.
 */
export async function sendComplaintAdminAlert(params: {
  complaintNumber: string;
  authorName: string;
  authorEmail: string;
  subject: string;
  description: string;
  adminUrl: string;       // Lien direct vers /admin/reclamations/[id]
}): Promise<SendEmailResult> {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) {
    return { success: false, error: "ADMIN_NOTIFY_EMAIL non configuré" };
  }
  const safe = {
    number: escapeHtml(params.complaintNumber),
    author: escapeHtml(params.authorName),
    email: escapeHtml(params.authorEmail),
    subject: escapeHtml(params.subject),
    description: escapeHtml(params.description).replace(/\n/g, "<br/>"),
    url: escapeHtml(params.adminUrl),
  };

  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2244;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">⚠ Nouvelle réclamation reçue</h1>
  <p>Une nouvelle réclamation vient d'être déposée sur le formulaire public :</p>

  <table style="border-collapse: collapse; margin: 16px 0; background: #fef3c7; border-radius: 8px; padding: 12px; width: 100%; border-left: 4px solid #f59e0b;">
    <tr><td style="padding: 8px 12px; color: #92400e; width: 35%;">Numéro</td><td style="padding: 8px 12px; font-family: 'JetBrains Mono', monospace;"><strong>${safe.number}</strong></td></tr>
    <tr><td style="padding: 8px 12px; color: #92400e;">Auteur</td><td style="padding: 8px 12px;">${safe.author} &lt;${safe.email}&gt;</td></tr>
    <tr><td style="padding: 8px 12px; color: #92400e;">Objet</td><td style="padding: 8px 12px;"><strong>${safe.subject}</strong></td></tr>
  </table>

  <p><strong>Description :</strong></p>
  <p style="background: #f8fafc; padding: 12px; border-radius: 6px; font-size: 14px;">${safe.description}</p>

  <p style="margin: 24px 0; text-align: center;">
    <a href="${safe.url}" style="display: inline-block; padding: 12px 22px; background: #1f2244; color: white; text-decoration: none; border-radius: 999px; font-weight: 600;">
      Traiter la réclamation →
    </a>
  </p>

  <p style="font-size: 13px; color: #991b1b;">
    <strong>Engagement Qualiopi :</strong> traitement sous 30 jours maximum.
  </p>
</body>
</html>`;

  const text = `Nouvelle réclamation reçue.

Numéro : ${params.complaintNumber}
Auteur : ${params.authorName} <${params.authorEmail}>
Objet : ${params.subject}

Description :
${params.description}

Lien admin : ${params.adminUrl}

Engagement Qualiopi : traitement sous 30 jours maximum.`;

  return sendEmail({
    to,
    subject: `[Réclamation ${params.complaintNumber}] ${params.subject}`,
    html,
    text,
    replyTo: params.authorEmail,
  });
}

/**
 * Réponse formelle envoyée au réclamant une fois la réclamation traitée.
 * Saisie côté admin (responseContent), envoyée explicitement par bouton.
 */
export async function sendComplaintResponse(params: {
  to: string;
  authorName: string;
  complaintNumber: string;
  subject: string;
  responseContent: string;
  actionCorrective?: string;     // Mention de l'action corrective si l'admin l'a renseignée
}): Promise<SendEmailResult> {
  const replyTo = process.env.ADMIN_NOTIFY_EMAIL;
  const safe = {
    authorName: escapeHtml(params.authorName),
    number: escapeHtml(params.complaintNumber),
    subject: escapeHtml(params.subject),
    response: escapeHtml(params.responseContent).replace(/\n/g, "<br/>"),
    action: escapeHtml(params.actionCorrective ?? "").replace(/\n/g, "<br/>"),
  };

  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2244;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">Réponse à votre réclamation</h1>
  <p>Bonjour ${safe.authorName},</p>
  <p>Suite à votre réclamation référence <strong>${safe.number}</strong> portant sur «&nbsp;${safe.subject}&nbsp;»,
  voici notre retour :</p>

  <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0; font-size: 14px;">
    ${safe.response}
  </div>

  ${params.actionCorrective ? `
  <p><strong>Actions mises en place :</strong></p>
  <div style="background: #dcfce7; padding: 16px; border-radius: 8px; margin: 16px 0; font-size: 14px; border-left: 4px solid #166534;">
    ${safe.action}
  </div>
  ` : ""}

  <p>Si vous souhaitez compléter ou si notre réponse ne vous satisfait pas, n'hésitez pas
  à répondre directement à ce mail.</p>

  <p>Nous vous remercions de nous avoir permis d'améliorer nos prestations.</p>
  <p>Bien cordialement,<br/>Noémie Marphay<br/><em>Les Ateliers du Stream</em></p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;"/>
  <p style="font-size: 11px; color: #9ca3af;">
    Les Ateliers du Stream — Organisme de formation professionnelle continue, NDA N°75470196847.
  </p>
</body>
</html>`;

  const text = `Bonjour ${params.authorName},

Suite à votre réclamation référence ${params.complaintNumber} portant sur « ${params.subject} », voici notre retour :

${params.responseContent}
${params.actionCorrective ? `\nActions mises en place :\n${params.actionCorrective}\n` : ""}

Si vous souhaitez compléter ou si notre réponse ne vous satisfait pas, n'hésitez pas à répondre à ce mail.

Nous vous remercions de nous avoir permis d'améliorer nos prestations.

Bien cordialement,
Noémie Marphay
Les Ateliers du Stream`;

  return sendEmail({
    to: params.to,
    subject: `Réclamation ${params.complaintNumber} — notre réponse`,
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

/**
 * Notifie l'admin qu'un formateur a modifié la grille d'évaluation d'une
 * formation depuis son portail (garde-fou Qualiopi : le donneur d'ordre
 * reste responsable de la cohérence objectifs/évaluation).
 * Best-effort : ne bloque jamais la modification.
 */
export async function sendGridEditedNotification(params: {
  trainerNomComplet: string;
  formationCode: string;
  formationNomLong: string;
  formationId: string;
  action: string;            // ex: "ajout d'un exercice", "suppression d'un critère"
  detail?: string;           // ex: titre de l'exercice / libellé du critère
}): Promise<SendEmailResult> {
  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
  if (!adminEmail) {
    console.warn("[mailer] ADMIN_NOTIFY_EMAIL absent — notif grille non envoyée");
    return { success: false, error: "ADMIN_NOTIFY_EMAIL manquant" };
  }
  const baseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
  const gridUrl = `${baseUrl}/admin/formations/${params.formationId}/evaluation-grid`;

  const safe = {
    trainer: escapeHtml(params.trainerNomComplet),
    formation: escapeHtml(params.formationNomLong),
    code: escapeHtml(params.formationCode),
    action: escapeHtml(params.action),
    detail: params.detail ? escapeHtml(params.detail) : "",
  };

  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2244;">
  <h1 style="font-size: 20px; margin: 0 0 16px;">✏️ Grille d'évaluation modifiée</h1>
  <p><strong>${safe.trainer}</strong> a modifié la grille d'évaluation de <strong>${safe.formation}</strong> (${safe.code}).</p>
  <table style="border-collapse: collapse; margin: 16px 0; background: #f8fafc; border-radius: 8px; padding: 12px; width: 100%; font-size: 14px;">
    <tr><td style="padding: 6px 12px; color: #727485;">Action</td><td style="padding: 6px 12px;">${safe.action}</td></tr>
    ${safe.detail ? `<tr><td style="padding: 6px 12px; color: #727485;">Détail</td><td style="padding: 6px 12px;">${safe.detail}</td></tr>` : ""}
  </table>
  <p style="font-size: 13px; color: #727485;">En tant qu'organisme de formation, vérifiez la cohérence de la grille avec les objectifs pédagogiques annoncés.</p>
  <p style="margin-top: 24px;">
    <a href="${gridUrl}" style="display: inline-block; padding: 10px 18px; background: #1f2244; color: white; text-decoration: none; border-radius: 999px; font-weight: 600;">
      Voir la grille
    </a>
  </p>
</body>
</html>`;

  const text = `Grille d'évaluation modifiée

${params.trainerNomComplet} a modifié la grille de ${params.formationNomLong} (${params.formationCode}).

Action : ${params.action}${params.detail ? `\nDétail : ${params.detail}` : ""}

Vérifiez la cohérence avec les objectifs pédagogiques : ${gridUrl}`;

  return sendEmail({
    to: adminEmail,
    subject: `Grille modifiée : ${params.formationCode} — par ${params.trainerNomComplet}`,
    html,
    text,
  });
}

/**
 * Notifie l'admin qu'un formateur a modifié les pré-requis d'une formation.
 * Garde-fou Qualiopi : l'organisme reste responsable de la cohérence du
 * positionnement / analyse du besoin avec les objectifs annoncés.
 */
export async function sendPrerequisEditedNotification(params: {
  trainerNomComplet: string;
  formationCode: string;
  formationNomLong: string;
  formationId: string;
}): Promise<SendEmailResult> {
  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
  if (!adminEmail) {
    console.warn("[mailer] ADMIN_NOTIFY_EMAIL absent — notif prérequis non envoyée");
    return { success: false, error: "ADMIN_NOTIFY_EMAIL manquant" };
  }
  const baseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
  const prerequisUrl = `${baseUrl}/admin/formations/${params.formationId}/prerequis`;

  const safe = {
    trainer: escapeHtml(params.trainerNomComplet),
    formation: escapeHtml(params.formationNomLong),
    code: escapeHtml(params.formationCode),
  };

  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2244;">
  <h1 style="font-size: 20px; margin: 0 0 16px;">✏️ Pré-requis modifiés</h1>
  <p><strong>${safe.trainer}</strong> a modifié les pré-requis (positionnement / analyse du besoin) de <strong>${safe.formation}</strong> (${safe.code}).</p>
  <p style="font-size: 13px; color: #727485;">En tant qu'organisme de formation, vérifiez la cohérence des questions de positionnement avec les objectifs pédagogiques annoncés.</p>
  <p style="margin-top: 24px;">
    <a href="${prerequisUrl}" style="display: inline-block; padding: 10px 18px; background: #1f2244; color: white; text-decoration: none; border-radius: 999px; font-weight: 600;">
      Voir les pré-requis
    </a>
  </p>
</body>
</html>`;

  const text = `Pré-requis modifiés

${params.trainerNomComplet} a modifié les pré-requis de ${params.formationNomLong} (${params.formationCode}).

Vérifiez la cohérence avec les objectifs pédagogiques : ${prerequisUrl}`;

  return sendEmail({
    to: adminEmail,
    subject: `Pré-requis modifiés : ${params.formationCode} — par ${params.trainerNomComplet}`,
    html,
    text,
  });
}

/**
 * Mail d'invitation à répondre à l'évaluation à chaud (fin de session).
 *
 * Le lien envoyé est l'URL publique anonyme du formulaire — la même pour tous
 * les stagiaires de la session. Le formulaire ne demande aucune identification.
 */
export async function sendSatisfactionSurveyInvite(params: {
  to: string;
  prenom: string;
  formationNomLong: string;
  surveyUrl: string;             // URL publique anonyme du formulaire (commune à tous les stagiaires de la session)
  replyTo?: string;
}): Promise<SendEmailResult> {
  const replyTo = params.replyTo || process.env.ADMIN_NOTIFY_EMAIL;
  const safe = {
    prenom: escapeHtml(params.prenom),
    formation: escapeHtml(params.formationNomLong),
    url: escapeHtml(params.surveyUrl),
  };
  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2244;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">Votre avis nous intéresse</h1>
  <p>Bonjour ${safe.prenom},</p>
  <p>Vous avez suivi la formation <strong>${safe.formation}</strong>.
  Pour nous aider à améliorer la qualité de nos prestations, nous vous invitons à répondre à un court
  questionnaire de satisfaction <strong>anonyme</strong> (≈ 3 minutes).</p>
  <p style="text-align: center; margin: 32px 0;">
    <a href="${safe.url}"
       style="display: inline-block; background: #1f2244; color: white; padding: 12px 24px;
              border-radius: 999px; text-decoration: none; font-weight: 600;">
      Accéder au questionnaire
    </a>
  </p>
  <p style="font-size: 12px; color: #727485;">
    Lien : <a href="${safe.url}">${safe.url}</a>
  </p>
  <p>Merci de votre participation !<br/>Noémie Marphay<br/><em>Les Ateliers du Stream</em></p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;"/>
  <p style="font-size: 11px; color: #9ca3af;">
    Le formulaire est anonyme : vos réponses ne sont pas associées à votre identité et nous servent uniquement à améliorer la qualité de nos formations.
  </p>
</body>
</html>`;
  const text = `Bonjour ${params.prenom},

Vous avez suivi la formation ${params.formationNomLong}. Pour nous aider à améliorer la qualité de nos prestations, merci de répondre à notre court questionnaire de satisfaction anonyme (≈ 3 min) :

${params.surveyUrl}

Le formulaire est anonyme : vos réponses ne sont pas associées à votre identité.

Merci de votre participation !
Noémie Marphay
Les Ateliers du Stream`;
  return sendEmail({
    to: params.to,
    subject: `Votre avis sur la formation ${params.formationNomLong}`,
    html,
    text,
    replyTo,
  });
}

/**
 * Mail d'invitation à l'évaluation à froid (3 mois après la formation).
 *
 * Contrairement au chaud (anonyme), le lien est PERSONNEL (magic-token) :
 * on peut tracker qui a répondu et relancer ensuite.
 */
export async function sendColdEvalInvite(params: {
  to: string;
  prenom: string;
  formationNomLong: string;
  surveyUrl: string;             // URL personnelle /eval-froid/[token]
  replyTo?: string;
}): Promise<SendEmailResult> {
  const replyTo = params.replyTo || process.env.ADMIN_NOTIFY_EMAIL;
  const safe = {
    prenom: escapeHtml(params.prenom),
    formation: escapeHtml(params.formationNomLong),
    url: escapeHtml(params.surveyUrl),
  };
  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2244;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">Quelques nouvelles depuis votre formation ?</h1>
  <p>Bonjour ${safe.prenom},</p>
  <p>Vous avez suivi la formation <strong>${safe.formation}</strong> il y a environ trois mois.
  Maintenant que vous avez eu le temps de mettre en pratique ce que vous avez appris,
  votre retour sur l&apos;<strong>impact dans votre travail au quotidien</strong> est précieux pour nous —
  il nous aide à améliorer nos contenus pour les prochains stagiaires.</p>
  <p>Le questionnaire prend environ 4 minutes :</p>
  <p style="text-align: center; margin: 32px 0;">
    <a href="${safe.url}"
       style="display: inline-block; background: #1f2244; color: white; padding: 12px 24px;
              border-radius: 999px; text-decoration: none; font-weight: 600;">
      Donner mon retour
    </a>
  </p>
  <p style="font-size: 12px; color: #727485;">
    Lien personnel : <a href="${safe.url}">${safe.url}</a>
  </p>
  <p>Merci d&apos;avance !<br/>Noémie Marphay<br/><em>Les Ateliers du Stream</em></p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;"/>
  <p style="font-size: 11px; color: #9ca3af;">
    Vos données sont utilisées uniquement pour évaluer l&apos;impact pédagogique et améliorer nos formations.
  </p>
</body>
</html>`;
  const text = `Bonjour ${params.prenom},

Vous avez suivi la formation ${params.formationNomLong} il y a environ trois mois. Maintenant que vous avez eu le temps de mettre en pratique ce que vous avez appris, votre retour sur l'impact dans votre travail au quotidien est précieux pour nous.

Merci de répondre à notre court questionnaire (≈ 4 min) :
${params.surveyUrl}

Noémie Marphay
Les Ateliers du Stream`;
  return sendEmail({
    to: params.to,
    subject: `${params.formationNomLong} — Quelques nouvelles depuis votre formation ?`,
    html,
    text,
    replyTo,
  });
}

/**
 * Mail de relance pour l'éval à froid. Le ton change légèrement selon que
 * c'est la 1re ou la 2e (et dernière) relance.
 */
export async function sendColdEvalReminder(params: {
  to: string;
  prenom: string;
  formationNomLong: string;
  surveyUrl: string;
  reminderNumber: 1 | 2;
  replyTo?: string;
}): Promise<SendEmailResult> {
  const replyTo = params.replyTo || process.env.ADMIN_NOTIFY_EMAIL;
  const safe = {
    prenom: escapeHtml(params.prenom),
    formation: escapeHtml(params.formationNomLong),
    url: escapeHtml(params.surveyUrl),
  };
  const isLast = params.reminderNumber === 2;
  const subject = isLast
    ? `Dernière relance — votre retour sur ${params.formationNomLong}`
    : `Petite relance — votre retour sur ${params.formationNomLong}`;
  const intro = isLast
    ? `C&apos;est notre <strong>dernier message</strong> à ce sujet, nous ne vous solliciterons plus ensuite. `
    : `Petit rappel amical : `;
  const introTxt = isLast
    ? `C'est notre dernier message à ce sujet, nous ne vous solliciterons plus ensuite. `
    : `Petit rappel amical : `;

  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2244;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">Votre avis nous manque !</h1>
  <p>Bonjour ${safe.prenom},</p>
  <p>${intro}nous serions ravis de recueillir votre retour sur la formation
  <strong>${safe.formation}</strong> et son impact dans votre quotidien.
  Le questionnaire prend environ 4 minutes :</p>
  <p style="text-align: center; margin: 32px 0;">
    <a href="${safe.url}"
       style="display: inline-block; background: #1f2244; color: white; padding: 12px 24px;
              border-radius: 999px; text-decoration: none; font-weight: 600;">
      Donner mon retour
    </a>
  </p>
  <p style="font-size: 12px; color: #727485;">
    Lien personnel : <a href="${safe.url}">${safe.url}</a>
  </p>
  <p>Merci !<br/>Noémie Marphay<br/><em>Les Ateliers du Stream</em></p>
</body>
</html>`;
  const text = `Bonjour ${params.prenom},

${introTxt}nous serions ravis de recueillir votre retour sur la formation ${params.formationNomLong} et son impact dans votre quotidien.

Le questionnaire prend environ 4 minutes :
${params.surveyUrl}

Merci !
Noémie Marphay
Les Ateliers du Stream`;
  return sendEmail({
    to: params.to,
    subject,
    html,
    text,
    replyTo,
  });
}

/**
 * Invitation à l'enquête de satisfaction commanditaire/entreprise (Qualiopi
 * indicateur 2), envoyée au référent qui a inscrit ses salariés, en même temps
 * que l'éval à froid stagiaire.
 */
export async function sendSponsorEvalInvite(params: {
  to: string;
  companyName?: string;
  contactName?: string;
  formationNomLong: string;
  surveyUrl: string;            // /eval-commanditaire/[token]
  replyTo?: string;
}): Promise<SendEmailResult> {
  const replyTo = params.replyTo || process.env.ADMIN_NOTIFY_EMAIL;
  const greeting = params.contactName?.trim() ? escapeHtml(params.contactName.trim()) : "Bonjour";
  const greetingTxt = params.contactName?.trim() ? params.contactName.trim() : "Bonjour";
  const safe = {
    formation: escapeHtml(params.formationNomLong),
    company: escapeHtml(params.companyName || "votre entreprise"),
    url: escapeHtml(params.surveyUrl),
  };
  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2244;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">Votre satisfaction en tant qu'entreprise</h1>
  <p>Bonjour ${greeting},</p>
  <p>${safe.company} a récemment inscrit un ou plusieurs salariés à la formation
  <strong>${safe.formation}</strong>. En tant qu'entreprise commanditaire, votre retour sur
  <strong>l'organisation, l'adéquation à vos besoins et l'impact</strong> de cette formation nous est
  précieux pour progresser.</p>
  <p>Le questionnaire prend environ 3 minutes :</p>
  <p style="text-align: center; margin: 32px 0;">
    <a href="${safe.url}" style="display: inline-block; background: #1f2244; color: white; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600;">
      Donner mon avis
    </a>
  </p>
  <p style="font-size: 12px; color: #727485;">Lien : <a href="${safe.url}">${safe.url}</a></p>
  <p>Merci d&apos;avance !<br/>Noémie Marphay<br/><em>Les Ateliers du Stream</em></p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;"/>
  <p style="font-size: 11px; color: #9ca3af;">
    Vos données sont utilisées uniquement pour évaluer la qualité de nos formations, conformément au RGPD.
  </p>
</body>
</html>`;
  const text = `${greetingTxt},

${params.companyName || "Votre entreprise"} a récemment inscrit un ou plusieurs salariés à la formation ${params.formationNomLong}. En tant qu'entreprise commanditaire, votre retour sur l'organisation, l'adéquation à vos besoins et l'impact de cette formation nous est précieux.

Merci de répondre à notre court questionnaire (≈ 3 min) :
${params.surveyUrl}

Noémie Marphay
Les Ateliers du Stream`;
  return sendEmail({
    to: params.to,
    subject: `${params.formationNomLong} — votre satisfaction en tant qu'entreprise`,
    html,
    text,
    replyTo,
  });
}

/**
 * Relance (J+7 / J+14) de l'enquête de satisfaction commanditaire.
 */
export async function sendSponsorEvalReminder(params: {
  to: string;
  contactName?: string;
  formationNomLong: string;
  surveyUrl: string;
  reminderNumber: 1 | 2;
  replyTo?: string;
}): Promise<SendEmailResult> {
  const replyTo = params.replyTo || process.env.ADMIN_NOTIFY_EMAIL;
  const greeting = params.contactName?.trim() ? escapeHtml(params.contactName.trim()) : "Bonjour";
  const greetingTxt = params.contactName?.trim() ? params.contactName.trim() : "Bonjour";
  const safe = {
    formation: escapeHtml(params.formationNomLong),
    url: escapeHtml(params.surveyUrl),
  };
  const isLast = params.reminderNumber === 2;
  const subject = isLast
    ? `Dernière relance — votre avis sur ${params.formationNomLong}`
    : `Petite relance — votre avis sur ${params.formationNomLong}`;
  const intro = isLast
    ? "C&apos;est notre dernier message à ce sujet, nous ne vous solliciterons plus ensuite. "
    : "Petit rappel amical : ";
  const introTxt = isLast
    ? "C'est notre dernier message à ce sujet, nous ne vous solliciterons plus ensuite. "
    : "Petit rappel amical : ";
  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2244;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">Votre avis nous manque !</h1>
  <p>Bonjour ${greeting},</p>
  <p>${intro}nous serions ravis de recueillir votre retour, en tant qu'entreprise, sur la formation
  <strong>${safe.formation}</strong>. Le questionnaire prend environ 3 minutes :</p>
  <p style="text-align: center; margin: 32px 0;">
    <a href="${safe.url}" style="display: inline-block; background: #1f2244; color: white; padding: 12px 24px; border-radius: 999px; text-decoration: none; font-weight: 600;">
      Donner mon avis
    </a>
  </p>
  <p style="font-size: 12px; color: #727485;">Lien : <a href="${safe.url}">${safe.url}</a></p>
  <p>Merci !<br/>Noémie Marphay<br/><em>Les Ateliers du Stream</em></p>
</body>
</html>`;
  const text = `${greetingTxt},

${introTxt}nous serions ravis de recueillir votre retour, en tant qu'entreprise, sur la formation ${params.formationNomLong}.

Le questionnaire prend environ 3 minutes :
${params.surveyUrl}

Merci !
Noémie Marphay
Les Ateliers du Stream`;
  return sendEmail({ to: params.to, subject, html, text, replyTo });
}

/**
 * Envoi convocation au stagiaire J-15 avant la session.
 * Joint la convocation PDF + le RI (si configuré).
 */
export async function sendConvocationToStagiaire(params: {
  to: string;
  prenom: string;
  nom: string;
  formationNomLong: string;
  sessionDateDebut: Date | string;
  sessionDateFin: Date | string;
  sessionLieu: string;
  sessionHoraires: string;
  convocationPdfBuffer: Buffer;
  convocationPdfFilename: string;
  riBuffer?: Buffer;
  riFilename?: string;
  replyTo?: string;
}): Promise<SendEmailResult> {
  const replyTo = params.replyTo || process.env.ADMIN_NOTIFY_EMAIL;
  const safe = {
    prenom: escapeHtml(params.prenom),
    formation: escapeHtml(params.formationNomLong),
    lieu: escapeHtml(params.sessionLieu || "Lieu à préciser"),
    horaires: escapeHtml(params.sessionHoraires || ""),
  };
  const dateDebut = fmtDateFr(params.sessionDateDebut);
  const dateFin = fmtDateFr(params.sessionDateFin);

  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2244;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">Convocation à la formation ${safe.formation}</h1>
  <p>Bonjour ${safe.prenom},</p>
  <p>Votre formation <strong>${safe.formation}</strong> approche !
  Vous trouverez ci-joint votre <strong>convocation officielle</strong> avec les modalités pratiques,
  ainsi que le règlement intérieur de l'organisme de formation.</p>

  <table style="border-collapse: collapse; margin: 16px 0; background: #f8fafc; border-radius: 8px; padding: 12px; width: 100%;">
    <tr><td style="padding: 8px 12px; color: #727485;">Période</td><td style="padding: 8px 12px;"><strong>Du ${dateDebut} au ${dateFin}</strong></td></tr>
    <tr><td style="padding: 8px 12px; color: #727485;">Lieu</td><td style="padding: 8px 12px;">${safe.lieu}</td></tr>
    ${safe.horaires ? `<tr><td style="padding: 8px 12px; color: #727485;">Horaires</td><td style="padding: 8px 12px;">${safe.horaires}</td></tr>` : ""}
  </table>

  <p style="background: #fef3c7; padding: 12px 16px; border-radius: 8px; border-left: 4px solid #f59e0b;">
    <strong>À faire avant le démarrage :</strong><br/>
    Lisez attentivement le règlement intérieur ci-joint. Si vous avez un besoin d'adaptation pédagogique
    (situation de handicap, contraintes spécifiques), contactez-nous au plus vite.
  </p>

  <p>Pour toute question, vous pouvez simplement répondre à ce mail.</p>
  <p>À très bientôt !<br/>Noémie Marphay<br/><em>Les Ateliers du Stream</em></p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;"/>
  <p style="font-size: 11px; color: #9ca3af;">
    Les Ateliers du Stream — Organisme de formation professionnelle continue, NDA N°75470196847.
  </p>
</body>
</html>`;

  const text = `Bonjour ${params.prenom},

Votre formation ${params.formationNomLong} approche. Vous trouverez ci-joint votre convocation officielle et le règlement intérieur.

Période : du ${dateDebut} au ${dateFin}
Lieu : ${params.sessionLieu || "Lieu à préciser"}${params.sessionHoraires ? `\nHoraires : ${params.sessionHoraires}` : ""}

À faire avant le démarrage :
Lisez attentivement le règlement intérieur ci-joint. Si vous avez un besoin d'adaptation pédagogique, contactez-nous au plus vite.

Pour toute question, répondez à ce mail.

À très bientôt !
Noémie Marphay
Les Ateliers du Stream`;

  const attachments: EmailAttachment[] = [
    { filename: params.convocationPdfFilename, content: params.convocationPdfBuffer.toString("base64") },
  ];
  if (params.riBuffer) {
    attachments.push({
      filename: params.riFilename || "Reglement-Interieur.pdf",
      content: params.riBuffer.toString("base64"),
    });
  }

  return sendEmail({
    to: params.to,
    subject: `Convocation — ${params.formationNomLong} (${dateDebut})`,
    html,
    text,
    replyTo,
    attachments,
  });
}

/**
 * Envoi convention/contrat de formation au stagiaire après signature du devis.
 * Joint en PDF :
 *   1. La convention (entreprise) ou le contrat (particulier) générée
 *   2. Les CGV de l'organisme
 *   3. Le Règlement Intérieur
 * Les CGV/RI sont fournies sous forme de buffer (téléchargées au préalable
 * depuis Drive par l'appelant).
 */
export async function sendContractToStagiaire(params: {
  to: string;
  prenom: string;
  nom: string;
  formationNomLong: string;
  sessionDateDebut: Date | string;
  sessionDateFin: Date | string;
  sessionLieu: string;
  documentType: "convention" | "contrat";
  contractPdfBuffer: Buffer;
  contractPdfFilename: string;
  cgvBuffer?: Buffer;
  cgvFilename?: string;
  riBuffer?: Buffer;
  riFilename?: string;
  replyTo?: string;
}): Promise<SendEmailResult> {
  const replyTo = params.replyTo || process.env.ADMIN_NOTIFY_EMAIL;
  const safe = {
    prenom: escapeHtml(params.prenom),
    nom: escapeHtml(params.nom),
    formation: escapeHtml(params.formationNomLong),
    lieu: escapeHtml(params.sessionLieu || "Lieu à préciser"),
  };
  const dateDebut = fmtDateFr(params.sessionDateDebut);
  const dateFin = fmtDateFr(params.sessionDateFin);

  // Accord genre : "convention" est féminin, "contrat" est masculin.
  const isContrat = params.documentType === "contrat";
  const docLabel = isContrat ? "contrat" : "convention";
  const docLabelCap = isContrat ? "Contrat" : "Convention";
  const article = isContrat ? "le" : "la";       // "le contrat" / "la convention"
  const articleCap = isContrat ? "Le" : "La";
  const signed = isContrat ? "signé" : "signée";

  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2244;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">Votre ${docLabel} de formation</h1>
  <p>Bonjour ${safe.prenom},</p>
  <p>Suite à la signature du devis pour la formation <strong>${safe.formation}</strong>,
  vous trouverez ci-joint votre <strong>${docLabel} de formation</strong> (déjà ${signed} côté Les Ateliers du Stream)
  ainsi que les pièces jointes obligatoires :</p>

  <ul style="padding-left: 20px;">
    <li>${docLabelCap} de formation professionnelle (à retourner ${signed})</li>
    <li>CGV (Conditions Générales de Vente)</li>
    <li>Règlement Intérieur de l'organisme</li>
  </ul>

  <table style="border-collapse: collapse; margin: 16px 0; background: #f8fafc; border-radius: 8px; padding: 12px; width: 100%;">
    <tr><td style="padding: 8px 12px; color: #727485;">Session</td><td style="padding: 8px 12px;"><strong>Du ${dateDebut} au ${dateFin}</strong></td></tr>
    <tr><td style="padding: 8px 12px; color: #727485;">Lieu</td><td style="padding: 8px 12px;">${safe.lieu}</td></tr>
  </table>

  <p><strong>Prochaines étapes :</strong></p>
  <ol style="padding-left: 20px;">
    <li>Lisez attentivement ${article} ${docLabel}, les CGV et le règlement intérieur.</li>
    <li>Retournez ${article} ${docLabel} ${signed} par retour de mail (ou par courrier).</li>
    <li>Vous recevrez ensuite votre convocation et le programme détaillé environ 15 jours avant le début de la formation.</li>
  </ol>

  <p>Pour toute question, vous pouvez simplement répondre à ce mail.</p>
  <p>Bien cordialement,<br/>Noémie Marphay<br/><em>Les Ateliers du Stream</em></p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;"/>
  <p style="font-size: 11px; color: #9ca3af;">
    Les Ateliers du Stream — Organisme de formation professionnelle continue, NDA N°75470196847.
  </p>
</body>
</html>`;
  void articleCap; // réservé si besoin de capitaliser dans une future variante

  const text = `Bonjour ${params.prenom},

Suite à la signature du devis pour la formation ${params.formationNomLong}, vous trouverez ci-joint votre ${docLabel} de formation (déjà ${signed} côté Les Ateliers du Stream) ainsi que les CGV et le règlement intérieur.

Session : du ${dateDebut} au ${dateFin}
Lieu : ${params.sessionLieu || "Lieu à préciser"}

Prochaines étapes :
1. Lisez attentivement ${article} ${docLabel}, les CGV et le règlement intérieur.
2. Retournez ${article} ${docLabel} ${signed} par retour de mail (ou par courrier).
3. Vous recevrez ensuite votre convocation et le programme détaillé ~15 jours avant le début.

Pour toute question, répondez à ce mail.

Bien cordialement,
Noémie Marphay
Les Ateliers du Stream`;

  const attachments: EmailAttachment[] = [
    { filename: params.contractPdfFilename, content: params.contractPdfBuffer.toString("base64") },
  ];
  if (params.cgvBuffer) {
    attachments.push({
      filename: params.cgvFilename || "CGV.pdf",
      content: params.cgvBuffer.toString("base64"),
    });
  }
  if (params.riBuffer) {
    attachments.push({
      filename: params.riFilename || "Reglement-Interieur.pdf",
      content: params.riBuffer.toString("base64"),
    });
  }

  return sendEmail({
    to: params.to,
    subject: `${docLabelCap} de formation — ${params.formationNomLong}`,
    html,
    text,
    replyTo,
    attachments,
  });
}

/**
 * Mail d'invitation à la fiche satisfaction formateur (J+1 après la fin de
 * session). Lien magic-token personnel.
 */
export async function sendTrainerEvalInvite(params: {
  to: string;
  prenom: string;
  formationNomLong: string;
  surveyUrl: string;
  replyTo?: string;
}): Promise<SendEmailResult> {
  const replyTo = params.replyTo || process.env.ADMIN_NOTIFY_EMAIL;
  const safe = {
    prenom: escapeHtml(params.prenom),
    formation: escapeHtml(params.formationNomLong),
    url: escapeHtml(params.surveyUrl),
  };
  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2244;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">Votre retour sur la session</h1>
  <p>Bonjour ${safe.prenom},</p>
  <p>Merci pour l&apos;animation de la formation <strong>${safe.formation}</strong>.</p>
  <p>Pour nous aider à améliorer la gestion administrative et le suivi pédagogique,
  nous vous invitons à remplir une <strong>courte fiche satisfaction formateur</strong> (≈ 3 minutes) :</p>
  <p style="text-align: center; margin: 32px 0;">
    <a href="${safe.url}"
       style="display: inline-block; background: #1f2244; color: white; padding: 12px 24px;
              border-radius: 999px; text-decoration: none; font-weight: 600;">
      Donner mon retour
    </a>
  </p>
  <p style="font-size: 12px; color: #727485;">
    Lien personnel : <a href="${safe.url}">${safe.url}</a>
  </p>
  <p>Merci !<br/>Noémie Marphay<br/><em>Les Ateliers du Stream</em></p>
</body>
</html>`;
  const text = `Bonjour ${params.prenom},

Merci pour l'animation de la formation ${params.formationNomLong}.

Pour nous aider à améliorer la gestion administrative et le suivi pédagogique, merci de remplir cette courte fiche satisfaction formateur (≈ 3 min) :
${params.surveyUrl}

Merci !
Noémie Marphay
Les Ateliers du Stream`;
  return sendEmail({
    to: params.to,
    subject: `Votre retour sur la session — ${params.formationNomLong}`,
    html,
    text,
    replyTo,
  });
}

/**
 * Mail de relance pour la fiche satisfaction formateur. Ton plus amical
 * pour la 1re relance, plus définitif pour la 2e (dernière).
 */
export async function sendTrainerEvalReminder(params: {
  to: string;
  prenom: string;
  formationNomLong: string;
  surveyUrl: string;
  reminderNumber: 1 | 2;
  replyTo?: string;
}): Promise<SendEmailResult> {
  const replyTo = params.replyTo || process.env.ADMIN_NOTIFY_EMAIL;
  const safe = {
    prenom: escapeHtml(params.prenom),
    formation: escapeHtml(params.formationNomLong),
    url: escapeHtml(params.surveyUrl),
  };
  const isLast = params.reminderNumber === 2;
  const subject = isLast
    ? `Dernière relance — votre fiche satisfaction formateur (${params.formationNomLong})`
    : `Petite relance — votre fiche satisfaction formateur (${params.formationNomLong})`;
  const intro = isLast
    ? `C&apos;est notre <strong>dernier message</strong> à ce sujet, nous ne vous solliciterons plus ensuite. `
    : `Petit rappel amical : `;
  const introTxt = isLast
    ? `C'est notre dernier message à ce sujet, nous ne vous solliciterons plus ensuite. `
    : `Petit rappel amical : `;

  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2244;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">Votre retour nous manque !</h1>
  <p>Bonjour ${safe.prenom},</p>
  <p>${intro}nous serions ravis de recueillir votre retour sur la session
  <strong>${safe.formation}</strong> que vous avez animée.
  La fiche prend environ 3 minutes :</p>
  <p style="text-align: center; margin: 32px 0;">
    <a href="${safe.url}"
       style="display: inline-block; background: #1f2244; color: white; padding: 12px 24px;
              border-radius: 999px; text-decoration: none; font-weight: 600;">
      Donner mon retour
    </a>
  </p>
  <p style="font-size: 12px; color: #727485;">
    Lien personnel : <a href="${safe.url}">${safe.url}</a>
  </p>
  <p>Merci !<br/>Noémie Marphay<br/><em>Les Ateliers du Stream</em></p>
</body>
</html>`;
  const text = `Bonjour ${params.prenom},

${introTxt}nous serions ravis de recueillir votre retour sur la session ${params.formationNomLong}.

La fiche prend environ 3 minutes :
${params.surveyUrl}

Merci !
Noémie Marphay
Les Ateliers du Stream`;
  return sendEmail({
    to: params.to,
    subject,
    html,
    text,
    replyTo,
  });
}

/**
 * Mail unique de fin de formation : envoie au stagiaire son certificat de
 * réalisation (obligatoire Qualiopi/OPCO) + son attestation de fin de
 * formation (acquis pédagogiques) en pièces jointes PDF.
 */
export async function sendEndOfTrainingDocs(params: {
  to: string;
  prenom: string;
  formationNomLong: string;
  sessionDateDebut: Date | string;
  sessionDateFin: Date | string;
  certificatPdfBuffer: Buffer;
  certificatPdfFilename: string;
  attestationPdfBuffer: Buffer;
  attestationPdfFilename: string;
  // Synthèse d'évaluation pratique (optionnelle) — c'est ce document qui détaille
  // les compétences évaluées et leur niveau d'acquisition, exercice par exercice.
  synthesePdfBuffer?: Buffer;
  synthesePdfFilename?: string;
  replyTo?: string;
}): Promise<SendEmailResult> {
  const replyTo = params.replyTo || process.env.ADMIN_NOTIFY_EMAIL;
  const safe = {
    prenom: escapeHtml(params.prenom),
    formation: escapeHtml(params.formationNomLong),
  };
  const dateDebut = fmtDateFr(params.sessionDateDebut);
  const dateFin = fmtDateFr(params.sessionDateFin);
  const hasSynthese = Boolean(params.synthesePdfBuffer && params.synthesePdfFilename);

  const syntheseLineHtml = hasSynthese
    ? `<li><strong>Synthèse d'évaluation</strong> — le détail des compétences travaillées et de leur niveau d'acquisition (acquis, en cours d'acquisition…), exercice par exercice.</li>`
    : "";
  const syntheseLineText = hasSynthese
    ? "\n- Synthèse d'évaluation — le détail des compétences travaillées et de leur niveau d'acquisition, exercice par exercice."
    : "";

  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2244;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">Vos documents de fin de formation</h1>
  <p>Bonjour ${safe.prenom},</p>
  <p>Vous venez de terminer la formation <strong>${safe.formation}</strong>
  (du ${dateDebut} au ${dateFin}). Merci pour votre engagement&nbsp;!</p>
  <p>Vous trouverez en pièces jointes&nbsp;:</p>
  <ul style="padding-left: 20px;">
    <li><strong>Certificat de réalisation</strong> — à transmettre à votre financeur (OPCO, AFDAS, France Travail…) pour clôturer votre dossier.</li>
    <li><strong>Attestation de fin de formation</strong> — document officiel attestant de votre participation et de la réalisation de la formation.</li>
    ${syntheseLineHtml}
  </ul>
  <p>Pour toute question, vous pouvez simplement répondre à ce mail.</p>
  <p>Bien cordialement,<br/>Noémie Marphay<br/><em>Les Ateliers du Stream</em></p>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;"/>
  <p style="font-size: 11px; color: #9ca3af;">
    Les Ateliers du Stream — Organisme de formation professionnelle continue, NDA N°75470196847.
  </p>
</body>
</html>`;

  const text = `Bonjour ${params.prenom},

Vous venez de terminer la formation ${params.formationNomLong} (du ${dateDebut} au ${dateFin}). Merci pour votre engagement !

Vous trouverez en pièces jointes :
- Certificat de réalisation — à transmettre à votre financeur (OPCO, AFDAS, France Travail…) pour clôturer votre dossier.
- Attestation de fin de formation — document officiel attestant de votre participation et de la réalisation de la formation.${syntheseLineText}

Pour toute question, répondez simplement à ce mail.

Bien cordialement,
Noémie Marphay
Les Ateliers du Stream`;

  const attachments: EmailAttachment[] = [
    { filename: params.certificatPdfFilename, content: params.certificatPdfBuffer.toString("base64") },
    { filename: params.attestationPdfFilename, content: params.attestationPdfBuffer.toString("base64") },
  ];
  if (params.synthesePdfBuffer && params.synthesePdfFilename) {
    attachments.push({
      filename: params.synthesePdfFilename,
      content: params.synthesePdfBuffer.toString("base64"),
    });
  }

  return sendEmail({
    to: params.to,
    subject: `Vos documents de fin de formation — ${params.formationNomLong}`,
    html,
    text,
    replyTo,
    attachments,
  });
}

/**
 * Relance automatique pour un stagiaire bloqué en statut intermédiaire
 * (devis_envoye OU convention_envoyee) depuis plus de 14 jours.
 *
 * Le ton est volontairement bienveillant et non-pushy : on demande s'il y a
 * un blocage, on rappelle le contexte, on propose de répondre simplement
 * au mail si besoin d'aide. L'envoi est limité à max 2 relances par
 * stagiaire pour ne pas spammer.
 */
export async function sendStagiaireBlockedRelance(params: {
  to: string;
  prenom: string;
  formationNomLong: string;
  sessionDateDebut: Date | string;
  blockedOn: "devis" | "convention";
  reminderNumber: 1 | 2;
  replyTo?: string;
}): Promise<SendEmailResult> {
  const replyTo = params.replyTo || process.env.ADMIN_NOTIFY_EMAIL || "formation@lesateliersdustream.fr";
  const safe = {
    prenom: escapeHtml(params.prenom),
    formation: escapeHtml(params.formationNomLong),
  };
  const dateDebut = fmtDateFr(params.sessionDateDebut);
  const docLabel = params.blockedOn === "devis" ? "devis" : "convention de formation";
  const docArticle = params.blockedOn === "devis" ? "votre devis" : "votre convention de formation";
  const isLast = params.reminderNumber === 2;

  const subject = isLast
    ? `Dernière relance — ${docLabel} en attente pour ${params.formationNomLong}`
    : `Petite relance — ${docLabel} en attente pour ${params.formationNomLong}`;

  const intro = isLast
    ? `Nous nous permettons une <strong>dernière relance</strong> à propos de`
    : `Nous nous permettons un petit rappel concernant`;
  const introTxt = isLast
    ? `Nous nous permettons une dernière relance à propos de`
    : `Nous nous permettons un petit rappel concernant`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1f2244;">
  <h1 style="font-size: 22px; margin: 0 0 16px;">${docLabel.charAt(0).toUpperCase()}${docLabel.slice(1)} en attente</h1>
  <p>Bonjour ${safe.prenom},</p>
  <p>${intro} ${docArticle} pour la formation
    <strong>${safe.formation}</strong> qui doit débuter le <strong>${dateDebut}</strong>.</p>
  <p>Nous n&apos;avons pas reçu votre retour signé à ce jour. Si vous rencontrez la moindre difficulté
    (document non reçu, question sur le financement, planning…), n&apos;hésitez pas à
    <strong>répondre directement à ce mail</strong> ou à nous contacter par téléphone.</p>
  <p style="background: #fafbff; border-left: 3px solid #7dcef5; padding: 12px 16px; font-size: 14px;">
    📩 Une réponse rapide nous permet de réserver votre place et de vous garantir le démarrage à la date prévue.
  </p>
  <p style="font-size: 12px; color: #727485;">
    Si vous avez déjà finalisé la signature, merci d&apos;ignorer ce message — il sera automatiquement
    pris en compte dans notre système.
  </p>
  <p>Bien à vous,<br/>Noémie Marphay<br/><em>Les Ateliers du Stream</em><br/>
    <span style="color: #727485; font-size: 12px;">06 46 65 65 77 · formation@lesateliersdustream.fr</span>
  </p>
</body>
</html>`;

  const text = `Bonjour ${params.prenom},

${introTxt} ${docArticle} pour la formation ${params.formationNomLong} qui doit débuter le ${dateDebut}.

Nous n'avons pas reçu votre retour signé à ce jour. Si vous rencontrez la moindre difficulté (document non reçu, question sur le financement, planning…), n'hésitez pas à répondre directement à ce mail ou à nous contacter par téléphone.

Une réponse rapide nous permet de réserver votre place et de vous garantir le démarrage à la date prévue.

Si vous avez déjà finalisé la signature, merci d'ignorer ce message.

Bien à vous,
Noémie Marphay
Les Ateliers du Stream
06 46 65 65 77 · formation@lesateliersdustream.fr`;

  return sendEmail({
    to: params.to,
    subject,
    html,
    text,
    replyTo,
  });
}
