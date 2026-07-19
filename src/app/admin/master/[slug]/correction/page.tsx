// EVA Master — Espace correction (EVA NL). Stub étape 3 : le rebranchement de
// NewsletterService (mapping speakers, transcription intégrale, export HTML)
// est l'objet de l'étape 7. On évite juste le 404 depuis la page presta.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getPrestaBySlug } from "@/lib/master";

export default async function CorrectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const presta = await getPrestaBySlug(slug);
  if (!presta) notFound();

  return (
    <div className="space-y-4">
      <Link href={`/admin/master/${slug}`} className="text-sm" style={{ color: "#727485" }}>
        ← Retour à la presta
      </Link>
      <div>
        <p className="text-xs uppercase tracking-wide" style={{ color: "#727485" }}>
          EVA Master · espace correction
        </p>
        <h1 className="text-2xl font-bold" style={{ color: "#1f2244" }}>
          {presta.name}
        </h1>
      </div>
      <p
        className="text-sm p-4 rounded-lg border border-dashed"
        style={{ borderColor: "#e5e7eb", color: "#727485" }}
      >
        Espace correction (EVA NL) — rebranchement de NewsletterService : mapping
        speakers par conférence, « ouvrir toute la transcription », export HTML
        (sans envoi SMTP). Prévu à l&apos;étape 7.
      </p>
    </div>
  );
}
