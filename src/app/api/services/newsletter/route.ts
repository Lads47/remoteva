import { NextRequest, NextResponse } from "next/server";
import {
  getLinkBySlug,
  isLinkValid,
  updateLinkConfig,
  NewsletterConfig,
  Conference,
  ConferenceStatus,
} from "@/lib/services";
import path from "path";
import fs from "fs";

const N8N_BASE_URL = process.env.N8N_BASE_URL || "https://n8n.srv950180.hstgr.cloud/webhook";

// POST /api/services/newsletter - Actions sur les conférences et newsletter
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { slug, action } = body;

    if (!slug) {
      return NextResponse.json(
        { error: "Slug requis" },
        { status: 400 }
      );
    }

    // Récupération du lien
    const link = await getLinkBySlug(slug);

    if (!link) {
      return NextResponse.json(
        { error: "Lien non trouvé" },
        { status: 404 }
      );
    }

    // Vérification de la validité
    if (!isLinkValid(link)) {
      return NextResponse.json(
        { error: "Lien expiré ou inactif" },
        { status: 403 }
      );
    }

    // Vérification du type de service
    if (link.serviceType !== "newsletter") {
      return NextResponse.json(
        { error: "Type de service incorrect" },
        { status: 400 }
      );
    }

    const currentConfig = link.config as NewsletterConfig;
    const conferences = currentConfig.conferences || [];

    // === Action: valider une conférence ===
    if (action === "validate_conference") {
      const { conference_id, summary } = body;

      if (!conference_id) {
        return NextResponse.json(
          { error: "conference_id requis" },
          { status: 400 }
        );
      }

      const confIndex = conferences.findIndex((c) => c.id === conference_id);
      if (confIndex === -1) {
        return NextResponse.json(
          { error: "Conférence non trouvée" },
          { status: 404 }
        );
      }

      conferences[confIndex] = {
        ...conferences[confIndex],
        summary_corrected: summary || conferences[confIndex].summary_corrected,
        status: "VALIDÉ" as ConferenceStatus,
      };

      const newConfig: NewsletterConfig = {
        ...currentConfig,
        conferences,
      };

      await updateLinkConfig(slug, newConfig);

      // Compter les conférences validées
      const validatedCount = conferences.filter((c) => c.status === "VALIDÉ").length;

      return NextResponse.json({
        success: true,
        conference: conferences[confIndex],
        validated_count: validatedCount,
        total_count: conferences.length,
        all_validated: validatedCount === conferences.length,
      });
    }

    // === Action: sauvegarder le mapping speakers d'une conférence ===
    if (action === "save_speaker_mapping") {
      const { conference_id, speaker_mapping_override } = body;

      if (!conference_id) {
        return NextResponse.json(
          { error: "conference_id requis" },
          { status: 400 }
        );
      }

      const confIndex = conferences.findIndex((c) => c.id === conference_id);
      if (confIndex === -1) {
        return NextResponse.json(
          { error: "Conférence non trouvée" },
          { status: 404 }
        );
      }

      conferences[confIndex] = {
        ...conferences[confIndex],
        speaker_mapping_override: speaker_mapping_override || {},
      };

      const newConfig: NewsletterConfig = {
        ...currentConfig,
        conferences,
      };

      await updateLinkConfig(slug, newConfig);

      return NextResponse.json({
        success: true,
        conference_id,
        speaker_mapping_override: conferences[confIndex].speaker_mapping_override,
      });
    }

    // === Action: générer et envoyer la newsletter ===
    if (action === "generate") {
      const { email, template_name, custom_text } = body;

      if (!email || !email.includes("@")) {
        return NextResponse.json(
          { error: "Email valide requis" },
          { status: 400 }
        );
      }

      // Récupérer les conférences validées
      const validatedConferences = conferences.filter(
        (c) => c.status === "VALIDÉ"
      );

      if (validatedConferences.length === 0) {
        return NextResponse.json(
          { error: "Aucune conférence validée" },
          { status: 400 }
        );
      }

      // 1. Utiliser le template local (V3.1 — plus de Drive/n8n)
      const templateHtml = getLocalFallbackTemplate();

      // 2. Générer les articles HTML pour chaque conférence validée
      let articlesHtml = "";
      for (const conf of validatedConferences) {
        const summary = conf.summary_corrected || conf.summary_ia || "";

        // Photo en base64 si disponible
        let imageHtml = "";
        if (conf.photo_path) {
          const photoFullPath = path.join(process.cwd(), conf.photo_path);
          if (fs.existsSync(photoFullPath)) {
            try {
              const photoBuffer = fs.readFileSync(photoFullPath);
              const base64 = photoBuffer.toString("base64");
              const ext = path.extname(photoFullPath).toLowerCase();
              const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
              imageHtml = `<img class="article-image" src="data:${mimeType};base64,${base64}" alt="${escapeHtml(conf.title)}" style="width:100%;max-width:600px;height:auto;display:block;margin:20px auto;border:1px solid #eeeeee;" />`;
            } catch (err) {
              console.warn(`Erreur lecture photo ${conf.photo_path}:`, err);
            }
          }
        }

        articlesHtml += `
    <article class="article" style="margin-bottom:50px;padding-bottom:30px;border-bottom:1px solid #cccccc;">
        <h2 class="article-title" style="font-size:24px;font-weight:bold;margin-bottom:20px;padding-bottom:10px;border-bottom:1px solid #eeeeee;">${escapeHtml(conf.title)}</h2>
        ${imageHtml}
        <div class="article-content" style="font-size:16px;text-align:justify;margin-top:20px;line-height:1.6;">
            <p>${escapeHtml(summary)}</p>
        </div>
    </article>`;
      }

      // 3. Assembler le HTML final
      const eventName = currentConfig.event_name || link.serviceName || "Newsletter";
      let finalHtml = templateHtml
        .replace(/\{\{EVENT_NAME\}\}/g, escapeHtml(eventName))
        .replace(/\{\{CONFERENCES\}\}/g, articlesHtml);

      // Texte personnalisé (édito) si fourni
      if (custom_text && custom_text.trim()) {
        const customHtml = `<div style="margin-bottom:40px;padding:20px;background-color:#f8f9fa;border-left:4px solid #667eea;font-size:16px;line-height:1.6;">${escapeHtml(custom_text)}</div>`;
        finalHtml = finalHtml.replace(/\{\{CUSTOM_TEXT\}\}/g, customHtml);
      } else {
        finalHtml = finalHtml.replace(/\{\{CUSTOM_TEXT\}\}/g, "");
      }

      // Sauvegarder le template choisi
      const newConfig: NewsletterConfig = {
        ...currentConfig,
        newsletter_template: selectedTemplate,
        generatedHtml: finalHtml,
      };
      await updateLinkConfig(slug, newConfig);

      // 4. Envoyer l'email via n8n
      try {
        const sendRes = await fetch(`${N8N_BASE_URL}/send-newsletter`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: email,
            subject: `Newsletter - ${eventName}`,
            html: finalHtml,
            custom_text: custom_text || "",
          }),
        });

        if (sendRes.ok) {
          return NextResponse.json({
            success: true,
            message: `Newsletter envoyée à ${email} avec ${validatedConferences.length} article(s)`,
            conferences_count: validatedConferences.length,
          });
        }

        return NextResponse.json({
          success: false,
          error: "Erreur lors de l'envoi de l'email via n8n",
        });
      } catch {
        return NextResponse.json({
          success: false,
          error: "Service d'envoi d'email indisponible (n8n)",
        });
      }
    }

    // === Ancien format : compatibilité (save/validate/generate simple) ===
    if (action === "save") {
      const { title, content, imageUrl } = body;
      const newConfig: NewsletterConfig = {
        ...currentConfig,
        title: title ?? currentConfig.title,
        content: content ?? currentConfig.content,
        imageUrl: imageUrl ?? currentConfig.imageUrl,
      };
      await updateLinkConfig(slug, newConfig);
      return NextResponse.json({ success: true, config: newConfig });
    }

    if (action === "validate") {
      const newConfig: NewsletterConfig = {
        ...currentConfig,
        validated: true,
      };
      await updateLinkConfig(slug, newConfig);
      return NextResponse.json({ success: true, config: newConfig });
    }

    return NextResponse.json(
      { error: `Action invalide: ${action}` },
      { status: 400 }
    );
  } catch (error) {
    console.error("Erreur service newsletter:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

// Échappe les caractères HTML dangereux
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

// Template local de fallback (même structure que newsletter_base.html d'ia-regie)
function getLocalFallbackTemplate(): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{EVENT_NAME}}</title>
    <style>
        body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #000000; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #ffffff; }
        .header { text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 2px solid #000000; }
        .header h1 { font-size: 32px; font-weight: bold; text-transform: uppercase; color: #000000; margin: 0; }
        .article { margin-bottom: 50px; padding-bottom: 30px; border-bottom: 1px solid #cccccc; }
        .article:last-child { border-bottom: none; }
        .article-title { font-size: 24px; font-weight: bold; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #eeeeee; }
        .article-image { width: 100%; max-width: 600px; height: auto; display: block; margin: 20px auto; border: 1px solid #eeeeee; }
        .article-content { font-size: 16px; text-align: justify; margin-top: 20px; line-height: 1.6; }
        .footer { text-align: center; padding: 30px 0; margin-top: 40px; border-top: 2px solid #000000; font-size: 12px; color: #666666; }
        @media (max-width: 600px) {
            .header h1 { font-size: 24px; }
            .article-title { font-size: 20px; }
            .article-content { font-size: 14px; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>{{EVENT_NAME}}</h1>
    </div>
    {{CONFERENCES}}
    <div class="footer">
        <p>Newsletter générée par EVA - Electronic Virtual Assistant</p>
    </div>
</body>
</html>`;
}
