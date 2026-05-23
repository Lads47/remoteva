// Hub d'accueil EVA — page d'arrivée après connexion (Phase 4 réorganisation).
// Server component : lit la session directement et filtre les tuiles selon
// les univers autorisés. Les super-admins voient toutes les tuiles + un
// accès "Super-administration" supplémentaire.
//
// Note : le proxy redirige déjà les comptes pending vers /admin/pending,
// donc cette page n'est rendue que pour des comptes validés ou super-admin.

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession, type EvaUniverse } from "@/lib/auth";

const EVA_DARK = "#1f2244";
const EVA_ACCENT = "#7dcef5";
const EVA_MUTED = "#727485";

type Tile = {
  universe: EvaUniverse;
  href: string;
  external?: boolean;
  title: string;
  description: string;
};

const TILES: Tile[] = [
  {
    universe: "lien",
    href: "/admin/lien",
    title: "EVA Lien",
    description:
      "Partage et téléchargement de fichiers volumineux via lien d'accès unique.",
  },
  {
    universe: "newsletter",
    href: "/admin/newsletter",
    title: "EVA Newsletter",
    description:
      "Résumés de conférences en direct, génération HTML, lexiques de préparation.",
  },
  {
    universe: "flow",
    href: "/admin/flow",
    title: "EVA Flow",
    description:
      "Captation vidéo : événements, conférences, réalisateurs, clés API.",
  },
  {
    universe: "stream",
    href: "https://gatesrt.evaremote.com",
    external: true,
    title: "EVA Stream",
    description:
      "Accès à Gate SRT (hébergé séparément). Ouvre dans un nouvel onglet.",
  },
  {
    universe: "formations",
    href: "/admin/formations",
    title: "EVA Formations",
    description:
      "Gestion Qualiopi complète : catalogue, sessions, stagiaires, formateurs, évaluations.",
  },
];

export default async function AdminHubPage() {
  const session = await getSession();

  // Défense en profondeur — normalement le proxy gère.
  if (!session) {
    redirect("/admin/login");
  }

  if (session.status === "pending") {
    redirect("/admin/pending");
  }

  const allowed = new Set<EvaUniverse>(session.universes || []);
  const visibleTiles = session.isSuperAdmin
    ? TILES
    : TILES.filter((t) => allowed.has(t.universe));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: EVA_DARK }}>
          Portail EVA
        </h1>
        <p className="mt-1 text-sm" style={{ color: EVA_MUTED }}>
          {session.isSuperAdmin
            ? "Vous êtes super-administrateur : tous les univers sont accessibles."
            : visibleTiles.length === 0
            ? "Aucun univers ne vous est encore attribué. Contactez un super-administrateur."
            : "Choisissez un univers pour accéder à ses outils."}
        </p>
      </div>

      {visibleTiles.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleTiles.map((tile) => (
            <HubTile key={tile.href} tile={tile} />
          ))}
        </div>
      )}

      {session.isSuperAdmin && (
        <div className="mt-8 pt-6 border-t" style={{ borderColor: "#e5e7eb" }}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: EVA_MUTED }}>
            Administration
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              href="/admin/users"
              className="block p-4 rounded-lg border hover:shadow-md transition-all"
              style={{ backgroundColor: "white", borderColor: "#e5e7eb" }}
            >
              <h3 className="font-medium" style={{ color: EVA_DARK }}>
                Utilisateurs
              </h3>
              <p className="text-sm mt-1" style={{ color: EVA_MUTED }}>
                Valider les comptes en attente, attribuer les univers, gérer
                les super-administrateurs.
              </p>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function HubTile({ tile }: { tile: Tile }) {
  const content = (
    <div
      className="group h-full p-6 rounded-lg border transition-all hover:shadow-md flex flex-col"
      style={{ backgroundColor: "white", borderColor: "#e5e7eb" }}
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
