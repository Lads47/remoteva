// EVA Master — Espace correction (EVA NL). Dérivé de NewsletterService : résumé
// éditable par conf, mapping speakers depuis les intervenants de la presta,
// « ouvrir toute la transcription », export HTML (PAS de SMTP). Câblé à
// MasterConference + stub EVA CORE. EVA Newsletter reste intact.

import { notFound } from "next/navigation";
import {
  getPrestaBySlug,
  parseSpeakers,
  parseMapping,
  parseTranscript,
  prestaIntervenants,
} from "@/lib/master";
import CorrectionBoard from "@/components/admin/master/CorrectionBoard";

export default async function CorrectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const presta = await getPrestaBySlug(slug);
  if (!presta) notFound();

  const intervenants = prestaIntervenants(presta.conferences);

  // On ne corrige pas les confs annulées (elles restent tracées côté presta).
  const initialConferences = presta.conferences
    .filter((c) => c.status !== "cancelled")
    .map((c) => ({
    id: c.id,
    position: c.position,
    title: c.title,
    status: c.status,
    speakers: parseSpeakers(c.speakers),
    summary: c.summary ?? "",
    transcript: parseTranscript(c.transcript),
    speakerMapping: parseMapping(c.speakerMapping),
  }));

  return (
    <CorrectionBoard
      presta={{ id: presta.id, slug: presta.slug, name: presta.name }}
      intervenants={intervenants}
      initialConferences={initialConferences}
    />
  );
}
