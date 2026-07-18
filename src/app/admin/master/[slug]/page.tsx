// EVA Master — page d'une presta (cœur du dev, §5 du CDC).
// Server component : charge la presta + confs + logs, délègue l'interaction
// (marquage local-first, envoi, sorties) au client PrestaBoard.

import { notFound } from "next/navigation";
import { getPrestaBySlug, parseSpeakers } from "@/lib/master";
import PrestaBoard from "@/components/admin/master/PrestaBoard";

export default async function PrestaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const presta = await getPrestaBySlug(slug);
  if (!presta) notFound();

  const initialConferences = presta.conferences.map((c) => ({
    id: c.id,
    position: c.position,
    title: c.title,
    speakers: parseSpeakers(c.speakers),
    status: c.status,
    startedAt: c.startedAt ? c.startedAt.toISOString() : null,
    endedAt: c.endedAt ? c.endedAt.toISOString() : null,
  }));

  const initialLogs = presta.vmixLogs.map((l) => ({
    id: l.id,
    filename: l.filename,
    size: l.size,
    sent: l.sent,
    uploadedAt: l.uploadedAt.toISOString(),
  }));

  return (
    <PrestaBoard
      presta={{
        id: presta.id,
        slug: presta.slug,
        name: presta.name,
        driveUrl: presta.driveUrl,
        driveStatus: presta.driveStatus,
      }}
      initialConferences={initialConferences}
      initialLogs={initialLogs}
    />
  );
}
