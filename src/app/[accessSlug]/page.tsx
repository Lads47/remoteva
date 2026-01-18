import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getLinkBySlug, isLinkValid } from "@/lib/services";
import NewsletterService from "@/components/services/NewsletterService";
import DownloadService from "@/components/services/DownloadService";

interface PageProps {
  params: Promise<{ accessSlug: string }>;
}

// Page dynamique pour les accès clients - Design inspiré des Ateliers du Stream
export default async function ClientAccessPage({ params }: PageProps) {
  const { accessSlug } = await params;

  // Récupère le lien depuis la base de données
  const link = await getLinkBySlug(accessSlug);

  // Lien non trouvé
  if (!link) {
    notFound();
  }

  // Lien expiré ou inactif
  if (!isLinkValid(link)) {
    redirect(`/${accessSlug}/expired`);
  }

  // Affiche le service correspondant
  return (
    <div className="min-h-screen flex flex-col">
      {/* En-tête */}
      <header className="border-b border-white/10" style={{ backgroundColor: "#1f2244" }}>
        <div className="max-w-4xl mx-auto px-4 h-[72px] flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image
              src="/logo-eva-v2.png"
              alt="EVA"
              width={40}
              height={40}
              className="h-10 w-auto"
            />
          </Link>
          <div className="text-right">
            <p className="text-sm font-medium text-white truncate max-w-[200px] sm:max-w-none">
              {link.serviceName}
            </p>
            <p className="text-xs text-white/70 truncate max-w-[200px] sm:max-w-none">{link.clientName}</p>
          </div>
        </div>
      </header>

      {/* Contenu du service */}
      <main className="flex-1 bg-white">
        <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
          {link.serviceType === "newsletter" ? (
            <NewsletterService link={link} />
          ) : (
            <DownloadService link={link} />
          )}
        </div>
      </main>

      {/* Pied de page */}
      <footer className="border-t border-gray-100 bg-white">
        <div className="max-w-4xl mx-auto px-4 py-4 text-center text-sm" style={{ color: "#727485" }}>
          <p>EVA - Electronic Virtual Assistant</p>
        </div>
      </footer>
    </div>
  );
}
