import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  getLinkBySlug,
  updateLinkConfig,
  createLink,
  NewsletterConfig,
  Conference,
  LexiconSpeaker,
} from "@/lib/services";

// POST /api/events/[slug]/sync
// Reçoit les données d'ia-regie et crée/met à jour l'espace client
// 1er appel (préparation) : crée le lien + conférences (titres)
// Appels suivants (live/post) : met à jour résumés, speakers, statuts
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const normalizedSlug = slug.toLowerCase().replace(/[^a-z0-9]/g, "");

    if (!normalizedSlug) {
      return NextResponse.json(
        { error: "Slug invalide" },
        { status: 400 }
      );
    }

    const body = await request.json();

    // Validation du payload
    if (!body.event) {
      return NextResponse.json(
        { error: "Payload invalide: 'event' requis" },
        { status: 400 }
      );
    }

    const {
      event,
      conferences: incomingConferences,
    }: {
      event: {
        name?: string;
        date?: string;
        lexicon?: {
          speakers?: LexiconSpeaker[];
        };
        speaker_mapping?: Record<string, string>;
        newsletter_template?: string;
      };
      conferences?: Array<{
        id: number;
        title: string;
        status?: string;
        summary_ia?: string;
        speakers_detected?: string[];
        speaker_mapping_override?: Record<string, string>;
        summary_style?: string;
        summary_word_count?: number;
      }>;
    } = body;

    // Vérifier si le lien existe déjà
    const existingLink = await getLinkBySlug(normalizedSlug);

    if (existingLink) {
      // === MISE À JOUR d'un événement existant ===
      const currentConfig = existingLink.config as NewsletterConfig;
      const currentConferences = currentConfig.conferences || [];

      // Mettre à jour les métadonnées événement
      const updatedConfig: NewsletterConfig = {
        ...currentConfig,
        event_name: event.name || currentConfig.event_name,
        event_date: event.date || currentConfig.event_date,
        newsletter_template: event.newsletter_template || currentConfig.newsletter_template,
      };

      // Mettre à jour le lexique et le mapping si fournis
      if (event.lexicon?.speakers) {
        updatedConfig.lexicon_speakers = event.lexicon.speakers;
      }
      if (event.speaker_mapping) {
        updatedConfig.speaker_mapping = event.speaker_mapping;
      }

      // Mettre à jour les conférences
      if (incomingConferences && incomingConferences.length > 0) {
        const mergedConferences: Conference[] = [];

        for (const incoming of incomingConferences) {
          // Chercher si la conférence existe déjà
          const existing = currentConferences.find((c) => c.id === incoming.id);

          if (existing) {
            // Merge : ia-regie met à jour les champs IA, on préserve les corrections client
            mergedConferences.push({
              ...existing,
              title: incoming.title || existing.title,
              // Ne mettre à jour le résumé IA que si ia-regie en envoie un nouveau
              summary_ia: incoming.summary_ia || existing.summary_ia,
              // Ne PAS écraser summary_corrected (c'est le client qui le modifie)
              // Ne PAS écraser photo_path (c'est le client qui uploade)
              // Mettre à jour le statut seulement si le client n'a pas encore validé
              status:
                existing.status === "VALIDÉ" || existing.status === "BROUILLON"
                  ? existing.status // Préserver le statut client
                  : (incoming.status as Conference["status"]) || existing.status,
              speakers_detected: incoming.speakers_detected || existing.speakers_detected,
              speaker_mapping_override:
                incoming.speaker_mapping_override || existing.speaker_mapping_override,
              summary_style: incoming.summary_style || existing.summary_style,
              summary_word_count: incoming.summary_word_count || existing.summary_word_count,
            });
          } else {
            // Nouvelle conférence
            mergedConferences.push({
              id: incoming.id,
              title: incoming.title,
              status: (incoming.status as Conference["status"]) || "EN ATTENTE",
              summary_ia: incoming.summary_ia,
              speakers_detected: incoming.speakers_detected,
              speaker_mapping_override: incoming.speaker_mapping_override,
              summary_style: incoming.summary_style || "journaliste",
              summary_word_count: incoming.summary_word_count || 200,
            });
          }
        }

        // Garder les conférences existantes qui ne sont pas dans le payload
        for (const existing of currentConferences) {
          if (!mergedConferences.find((c) => c.id === existing.id)) {
            mergedConferences.push(existing);
          }
        }

        // Trier par ID
        mergedConferences.sort((a, b) => a.id - b.id);
        updatedConfig.conferences = mergedConferences;
      }

      // Mettre à jour aussi le serviceName si event_name change
      if (event.name && event.name !== existingLink.serviceName) {
        await prisma.accessLink.update({
          where: { slug: normalizedSlug },
          data: {
            serviceName: event.name,
            config: JSON.stringify(updatedConfig),
          },
        });
      } else {
        await updateLinkConfig(normalizedSlug, updatedConfig);
      }

      return NextResponse.json({
        success: true,
        action: "updated",
        slug: normalizedSlug,
        url: `${getBaseUrl(request)}/${normalizedSlug}`,
        conferences_count: updatedConfig.conferences?.length || 0,
      });
    } else {
      // === CRÉATION d'un nouvel événement ===
      const conferences: Conference[] = (incomingConferences || []).map((c) => ({
        id: c.id,
        title: c.title,
        status: (c.status as Conference["status"]) || "EN ATTENTE",
        summary_ia: c.summary_ia,
        speakers_detected: c.speakers_detected,
        speaker_mapping_override: c.speaker_mapping_override,
        summary_style: c.summary_style || "journaliste",
        summary_word_count: c.summary_word_count || 200,
      }));

      // Trier par ID
      conferences.sort((a, b) => a.id - b.id);

      const config: NewsletterConfig = {
        event_name: event.name || "",
        event_date: event.date || new Date().toISOString().split("T")[0],
        lexicon_speakers: event.lexicon?.speakers || [],
        speaker_mapping: event.speaker_mapping || {},
        newsletter_template: event.newsletter_template || "newsletter_base.html",
        conferences,
      };

      // Créer le lien avec une expiration de 90 jours par défaut
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 90);

      await createLink({
        slug: normalizedSlug,
        serviceType: "newsletter",
        clientName: event.name || normalizedSlug,
        serviceName: event.name || normalizedSlug,
        expiresAt,
        config,
      });

      return NextResponse.json({
        success: true,
        action: "created",
        slug: normalizedSlug,
        url: `${getBaseUrl(request)}/${normalizedSlug}`,
        conferences_count: conferences.length,
        expires_at: expiresAt.toISOString(),
      });
    }
  } catch (error) {
    console.error("Erreur sync événement:", error);
    return NextResponse.json(
      { error: "Erreur serveur: " + (error as Error).message },
      { status: 500 }
    );
  }
}

// GET /api/events/[slug]/sync - Récupérer l'état actuel (utile pour debug)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const link = await getLinkBySlug(slug);

    if (!link) {
      return NextResponse.json(
        { error: "Événement non trouvé" },
        { status: 404 }
      );
    }

    const config = link.config as NewsletterConfig;

    return NextResponse.json({
      slug: link.slug,
      event_name: config.event_name,
      event_date: config.event_date,
      is_active: link.isActive,
      expires_at: link.expiresAt,
      conferences_count: config.conferences?.length || 0,
      conferences: config.conferences?.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        has_summary_ia: !!c.summary_ia,
        has_summary_corrected: !!c.summary_corrected,
        has_photo: !!c.photo_path,
      })),
    });
  } catch (error) {
    console.error("Erreur lecture événement:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

// Utilitaire : récupérer l'URL de base
function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}
