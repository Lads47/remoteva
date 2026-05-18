// Layout server-side qui définit le <title> de l'onglet navigateur en fonction
// de la formation. La page elle-même reste un client component (formulaire).

import type { Metadata } from "next";
import { getFormationByCode } from "@/lib/formation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const formation = await getFormationByCode(code);
  if (!formation || !formation.active) {
    return { title: "Inscription · EVA" };
  }
  return {
    title: `Inscription · ${formation.nomLong}`,
    description: `Formulaire d'inscription à la formation ${formation.nomLong} — Les Ateliers du Stream.`,
  };
}

export default function InscriptionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
