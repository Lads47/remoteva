import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Espace formateur — Les Ateliers du Stream",
  description: "Espace personnel formateur : sessions, stagiaires, pré-requis.",
};

export default function FormateurLayout({ children }: { children: React.ReactNode }) {
  return children;
}
