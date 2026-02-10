import prisma from "./db";

// Types de services disponibles
export type ServiceType = "newsletter" | "download";

// === TYPES CONFÉRENCES (compatible ia-regie event_data.json) ===

// Statut d'une conférence
export type ConferenceStatus =
  | "EN ATTENTE"        // Pas encore traitée
  | "TRAITEMENT EN COURS" // Transcription/résumé en cours
  | "RÉSUMÉ PRÊT"       // Résumé IA disponible
  | "BROUILLON"          // Client a commencé à modifier
  | "VALIDÉ";            // Client a validé

// Speaker du lexique (poussé par ia-regie)
export interface LexiconSpeaker {
  name: string;
  function?: string;      // Rôle/organisation
  variants?: string[];    // Noms alternatifs
}

// Conférence individuelle
export interface Conference {
  id: number;
  title: string;
  status: ConferenceStatus;
  summary_ia?: string;           // Résumé généré par l'IA
  summary_corrected?: string;    // Résumé corrigé par le client
  summary_style?: string;        // Style du résumé (journaliste, technique, etc.)
  summary_word_count?: number;   // Nombre de mots ciblé
  speakers_detected?: string[];  // SPEAKER_00, SPEAKER_01, etc.
  speaker_mapping_override?: Record<string, string>; // Override par conférence
  photo_path?: string;           // Chemin photo uploadée par le client
}

// Configuration pour le service Newsletter (enrichie avec conférences)
export interface NewsletterConfig {
  // Données événement (poussées par ia-regie via sync)
  event_name?: string;
  event_date?: string;
  lexicon_speakers?: LexiconSpeaker[];
  speaker_mapping?: Record<string, string>; // SPEAKER_00 → "Jean Dupont"
  newsletter_template?: string;

  // Liste des conférences
  conferences?: Conference[];

  // Ancien format (rétrocompatibilité)
  title?: string;
  content?: string;
  imageUrl?: string;
  validated?: boolean;
  generatedHtml?: string;
}

// Configuration pour le service Téléchargement
export interface DownloadConfig {
  files: Array<{
    id: string;
    name: string;
    path: string;
    size: number;
    type: string;
  }>;
}

// Union des configurations possibles
export type ServiceConfig = NewsletterConfig | DownloadConfig;

// Informations d'un lien d'accès
export interface AccessLinkInfo {
  id: string;
  slug: string;
  serviceType: ServiceType;
  clientName: string;
  serviceName: string;
  expiresAt: Date;
  isActive: boolean;
  config: ServiceConfig;
}

// Vérifie si un lien est valide (actif et non expiré)
export function isLinkValid(link: { isActive: boolean; expiresAt: Date }): boolean {
  const now = new Date();
  return link.isActive && link.expiresAt > now;
}

// Récupère un lien par son slug
export async function getLinkBySlug(slug: string): Promise<AccessLinkInfo | null> {
  const normalizedSlug = slug.toLowerCase();

  const link = await prisma.accessLink.findUnique({
    where: { slug: normalizedSlug },
  });

  if (!link) {
    return null;
  }

  return {
    id: link.id,
    slug: link.slug,
    serviceType: link.serviceType as ServiceType,
    clientName: link.clientName,
    serviceName: link.serviceName,
    expiresAt: link.expiresAt,
    isActive: link.isActive,
    config: JSON.parse(link.config) as ServiceConfig,
  };
}

// Met à jour la configuration d'un lien
export async function updateLinkConfig(
  slug: string,
  config: ServiceConfig
): Promise<void> {
  const normalizedSlug = slug.toLowerCase();

  await prisma.accessLink.update({
    where: { slug: normalizedSlug },
    data: { config: JSON.stringify(config) },
  });
}

// Liste tous les liens (pour l'admin)
export async function getAllLinks(): Promise<AccessLinkInfo[]> {
  const links = await prisma.accessLink.findMany({
    orderBy: { createdAt: "desc" },
  });

  return links.map((link) => ({
    id: link.id,
    slug: link.slug,
    serviceType: link.serviceType as ServiceType,
    clientName: link.clientName,
    serviceName: link.serviceName,
    expiresAt: link.expiresAt,
    isActive: link.isActive,
    config: JSON.parse(link.config) as ServiceConfig,
  }));
}

// Crée un nouveau lien
export async function createLink(data: {
  slug: string;
  serviceType: ServiceType;
  clientName: string;
  serviceName: string;
  expiresAt: Date;
  config?: ServiceConfig;
}): Promise<AccessLinkInfo> {
  const normalizedSlug = data.slug.toLowerCase().replace(/[^a-z0-9]/g, "");

  const defaultConfig: ServiceConfig =
    data.serviceType === "newsletter"
      ? { title: "", content: "", validated: false }
      : { files: [] };

  const link = await prisma.accessLink.create({
    data: {
      slug: normalizedSlug,
      serviceType: data.serviceType,
      clientName: data.clientName,
      serviceName: data.serviceName,
      expiresAt: data.expiresAt,
      config: JSON.stringify(data.config ?? defaultConfig),
    },
  });

  return {
    id: link.id,
    slug: link.slug,
    serviceType: link.serviceType as ServiceType,
    clientName: link.clientName,
    serviceName: link.serviceName,
    expiresAt: link.expiresAt,
    isActive: link.isActive,
    config: JSON.parse(link.config) as ServiceConfig,
  };
}

// Met à jour un lien existant
export async function updateLink(
  id: string,
  data: Partial<{
    slug: string;
    serviceType: ServiceType;
    clientName: string;
    serviceName: string;
    expiresAt: Date;
    isActive: boolean;
    config: ServiceConfig;
  }>
): Promise<void> {
  const updateData: Record<string, unknown> = {};

  if (data.slug !== undefined) {
    updateData.slug = data.slug.toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  if (data.serviceType !== undefined) {
    updateData.serviceType = data.serviceType;
  }
  if (data.clientName !== undefined) {
    updateData.clientName = data.clientName;
  }
  if (data.serviceName !== undefined) {
    updateData.serviceName = data.serviceName;
  }
  if (data.expiresAt !== undefined) {
    updateData.expiresAt = data.expiresAt;
  }
  if (data.isActive !== undefined) {
    updateData.isActive = data.isActive;
  }
  if (data.config !== undefined) {
    updateData.config = JSON.stringify(data.config);
  }

  await prisma.accessLink.update({
    where: { id },
    data: updateData,
  });
}

// Supprime un lien
export async function deleteLink(id: string): Promise<void> {
  await prisma.accessLink.delete({
    where: { id },
  });
}
