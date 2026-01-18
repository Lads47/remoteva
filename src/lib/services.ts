import prisma from "./db";

// Types de services disponibles
export type ServiceType = "newsletter" | "download";

// Configuration pour le service Newsletter
export interface NewsletterConfig {
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
