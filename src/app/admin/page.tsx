"use client";

// Hub d'accueil EVA — page d'arrivée après connexion.
// Présente les 5 univers EVA sous forme de tuiles uniformes.
// Phase 1 : structure visuelle uniquement, aucune logique de permission.
// Les routes /admin/lien et /admin/newsletter sont des pages d'atterrissage
// temporaires en attendant le regroupement des routes en Phase 2.

import Link from "next/link";

const EVA_DARK = "#1f2244";
const EVA_ACCENT = "#7dcef5";
const EVA_MUTED = "#727485";

type Tile = {
  href: string;
  external?: boolean;
  title: string;
  description: string;
};

const TILES: Tile[] = [
  {
    href: "/admin/lien",
    title: "EVA Lien",
    description:
      "Partage et téléchargement de fichiers volumineux via lien d'accès unique.",
  },
  {
    href: "/admin/newsletter",
    title: "EVA Newsletter",
    description:
      "Résumés de conférences en direct, génération HTML, lexiques de préparation.",
  },
  {
    href: "/admin/flow",
    title: "EVA Flow",
    description:
      "Captation vidéo : événements, conférences, réalisateurs, clés API.",
  },
  {
    href: "https://gatesrt.evaremote.com",
    external: true,
    title: "EVA Stream",
    description:
      "Accès à Gate SRT (hébergé séparément). Ouvre dans un nouvel onglet.",
  },
  {
    href: "/admin/formations",
    title: "EVA Formations",
    description:
      "Gestion Qualiopi complète : catalogue, sessions, stagiaires, formateurs, évaluations.",
  },
];

export default function AdminHubPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: EVA_DARK }}>
          Portail EVA
        </h1>
        <p className="mt-1 text-sm" style={{ color: EVA_MUTED }}>
          Choisissez un univers pour accéder à ses outils.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {TILES.map((tile) => (
          <HubTile key={tile.href} tile={tile} />
        ))}
      </div>
    </div>
  );
}

function HubTile({ tile }: { tile: Tile }) {
  const content = (
    <div
      className="group h-full p-6 rounded-lg border transition-all hover:shadow-md flex flex-col"
      style={{
        backgroundColor: "white",
        borderColor: "#e5e7eb",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold" style={{ color: EVA_DARK }}>
          {tile.title}
        </h2>
        {tile.external && (
          <span
            className="text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap"
            style={{ backgroundColor: EVA_ACCENT, color: EVA_DARK }}
          >
            Lien externe ↗
          </span>
        )}
      </div>
      <p className="text-sm mt-3 flex-1" style={{ color: EVA_MUTED }}>
        {tile.description}
      </p>
      <div
        className="mt-4 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: EVA_DARK }}
      >
        Entrer →
      </div>
    </div>
  );

  if (tile.external) {
    return (
      <a
        href={tile.href}
        target="_blank"
        rel="noopener noreferrer"
        className="block h-full"
      >
        {content}
      </a>
    );
  }

  return (
    <Link href={tile.href} className="block h-full">
      {content}
    </Link>
  );
}
