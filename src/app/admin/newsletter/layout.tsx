"use client";

// Layout de l'univers EVA Newsletter (Phase 1 réorganisation EVA).
// Page d'atterrissage temporaire : les pages métier (liens newsletter,
// préparation, lexiques) restent à leurs URLs actuelles. Le regroupement
// effectif est prévu en Phase 2.

import Link from "next/link";

export default function NewsletterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin"
          className="text-xs underline"
          style={{ color: "#727485" }}
        >
          ← Hub EVA
        </Link>
        <h1 className="text-3xl font-bold mt-2" style={{ color: "#1f2244" }}>
          EVA Newsletter
        </h1>
        <p className="text-sm mt-1" style={{ color: "#727485" }}>
          Résumés de conférences en direct, génération HTML, lexiques de préparation.
        </p>
      </div>
      <div>{children}</div>
    </div>
  );
}
