"use client";

// Layout de l'univers EVA Lien (Phase 1 réorganisation EVA).
// Page d'atterrissage temporaire : la route /admin/lien est créée mais
// les pages métier (gestion des liens "download") restent à /admin/links.
// Le vrai regroupement de routes est prévu en Phase 2.

import Link from "next/link";

export default function LienLayout({ children }: { children: React.ReactNode }) {
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
          EVA Lien
        </h1>
        <p className="text-sm mt-1" style={{ color: "#727485" }}>
          Partage et téléchargement de fichiers volumineux via lien d&apos;accès unique.
        </p>
      </div>
      <div>{children}</div>
    </div>
  );
}
