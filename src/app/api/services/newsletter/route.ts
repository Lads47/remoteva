import { NextRequest, NextResponse } from "next/server";
import {
  getLinkBySlug,
  isLinkValid,
  updateLinkConfig,
  NewsletterConfig,
} from "@/lib/services";

// POST /api/services/newsletter - Met à jour et/ou génère la newsletter
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { slug, action, title, content, imageUrl } = body;

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

    // Action: sauvegarder le contenu
    if (action === "save") {
      const newConfig: NewsletterConfig = {
        ...currentConfig,
        title: title ?? currentConfig.title,
        content: content ?? currentConfig.content,
        imageUrl: imageUrl ?? currentConfig.imageUrl,
      };

      await updateLinkConfig(slug, newConfig);

      return NextResponse.json({ success: true, config: newConfig });
    }

    // Action: valider le résumé
    if (action === "validate") {
      const newConfig: NewsletterConfig = {
        ...currentConfig,
        validated: true,
      };

      await updateLinkConfig(slug, newConfig);

      return NextResponse.json({ success: true, config: newConfig });
    }

    // Action: générer le HTML de la newsletter
    if (action === "generate") {
      const html = generateNewsletterHtml({
        title: currentConfig.title || "Newsletter",
        content: currentConfig.content || "",
        imageUrl: currentConfig.imageUrl,
        clientName: link.clientName,
        serviceName: link.serviceName,
      });

      const newConfig: NewsletterConfig = {
        ...currentConfig,
        generatedHtml: html,
      };

      await updateLinkConfig(slug, newConfig);

      return NextResponse.json({
        success: true,
        html,
        config: newConfig,
      });
    }

    return NextResponse.json(
      { error: "Action invalide" },
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

// Génère le HTML de la newsletter
// Structure extensible pour brancher une API externe plus tard
function generateNewsletterHtml(data: {
  title: string;
  content: string;
  imageUrl?: string;
  clientName: string;
  serviceName: string;
}): string {
  const { title, content, imageUrl, clientName, serviceName } = data;

  // Template HTML responsive pour email
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e0e0e0;
    }
    .header h1 {
      color: #1a1a1a;
      font-size: 24px;
      margin: 0;
    }
    .header p {
      color: #666;
      font-size: 14px;
      margin: 10px 0 0;
    }
    .content {
      margin-bottom: 30px;
    }
    .content img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 20px 0;
    }
    .footer {
      text-align: center;
      padding-top: 20px;
      border-top: 1px solid #e0e0e0;
      color: #888;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(serviceName)} - ${escapeHtml(clientName)}</p>
    </div>
    <div class="content">
      ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="Image de la newsletter">` : ""}
      ${formatContent(content)}
    </div>
    <div class="footer">
      <p>Généré par EVA - Electronic Virtual Assistant</p>
      <p>&copy; ${new Date().getFullYear()}</p>
    </div>
  </div>
</body>
</html>`;
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

// Formate le contenu en paragraphes HTML
function formatContent(content: string): string {
  return content
    .split("\n\n")
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`)
    .join("\n");
}
