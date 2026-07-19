// Vitrine publique evaremote.com — page d'accueil.
// Audit §4.3 : les 5 univers EVA restent visibles de tous comme une vitrine,
// mais l'accès réel dépend de la validation du compte.
//
// Server component : lit la session pour adapter les CTA (Se connecter /
// Créer un compte si visiteur, Mon espace si connecté) et la cible des
// tuiles (vraies routes si connecté, /admin/login sinon).

import Link from "next/link";
import Image from "next/image";
import { getSession } from "@/lib/auth";

const EVA_ACCENT = "#7dcef5";

type Tile = {
  title: string;
  description: string;
  // Cible pour un visiteur non connecté (q1a + q2b : tout vers /admin/login)
  publicHref: string;
  // Cible pour un user connecté (proxy filtrera selon univers autorisés)
  authedHref: string;
  // EVA Stream : externe pour les connectés (cohérent avec le hub)
  external?: boolean;
};

const TILES: Tile[] = [
  {
    title: "EVA Lien",
    description:
      "Partage et téléchargement de fichiers volumineux via lien d'accès unique.",
    publicHref: "/admin/login",
    authedHref: "/admin/lien",
  },
  {
    title: "EVA Newsletter",
    description:
      "Résumés de conférences en direct, génération HTML, lexiques de préparation.",
    publicHref: "/admin/login",
    authedHref: "/admin/newsletter",
  },
  {
    title: "EVA Flow",
    description:
      "Captation vidéo : événements, conférences, réalisateurs, clés API.",
    publicHref: "/admin/login",
    authedHref: "/admin/flow",
  },
  {
    title: "EVA Stream",
    description:
      "Accès à Gate SRT (hébergé séparément). Ouvre dans un nouvel onglet.",
    publicHref: "/admin/login",
    authedHref: "https://gatesrt.evaremote.com",
    external: true,
  },
  {
    title: "EVA Scoring",
    description:
      "Scoring beach tennis en direct (API MOVN → vMix / écran LED). Ouvre dans un nouvel onglet.",
    publicHref: "/admin/login",
    authedHref: "https://scoring.evaremote.com",
    external: true,
  },
  {
    title: "EVA Formations",
    description:
      "Gestion Qualiopi complète : catalogue, sessions, stagiaires, formateurs, évaluations.",
    publicHref: "/admin/login",
    authedHref: "/admin/formations",
  },
  {
    title: "EVA Master",
    description:
      "Captation → films, shorts, newsletter. Marquage des conférences et gestion des prestas.",
    publicHref: "/admin/login",
    authedHref: "/admin/master",
  },
];

export default async function HomePage() {
  const session = await getSession();
  const isLoggedIn = !!session && session.status === "validated";

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "#1f2244" }}
    >
      {/* En-tête */}
      <header className="border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 h-[72px] flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image
              src="/logo-eva-v2.png"
              alt="EVA"
              width={40}
              height={40}
              className="h-10 w-auto"
            />
          </Link>

          {/* CTA top-right */}
          {isLoggedIn ? (
            <Link
              href="/admin"
              className="px-4 py-2 rounded-full text-sm font-medium transition-colors"
              style={{ backgroundColor: EVA_ACCENT, color: "#1f2244" }}
            >
              Mon espace
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/admin/login"
                className="text-sm text-white/70 hover:text-white transition-colors px-3 py-2"
              >
                Se connecter
              </Link>
              <Link
                href="/admin/inscription"
                className="px-4 py-2 rounded-full text-sm font-medium transition-colors"
                style={{ backgroundColor: EVA_ACCENT, color: "#1f2244" }}
              >
                Créer un compte
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Branding + vitrine */}
      <div className="flex-1 flex flex-col items-center px-4 py-10 sm:py-14">
        <div className="text-center mb-10">
          <h1 className="font-[var(--font-montserrat)] font-semibold whitespace-nowrap tracking-wide">
            <span className="text-3xl sm:text-5xl text-white">E</span>
            <span className="text-2xl sm:text-4xl" style={{ color: "#a0a3b5" }}>lectronic</span>{" "}
            <span className="text-3xl sm:text-5xl text-white">V</span>
            <span className="text-2xl sm:text-4xl" style={{ color: "#a0a3b5" }}>irtual</span>{" "}
            <span className="text-3xl sm:text-5xl text-white">A</span>
            <span className="text-2xl sm:text-4xl" style={{ color: "#a0a3b5" }}>ssistant</span>
          </h1>
          <p className="text-sm sm:text-base text-white/60 mt-4">
            Le portail interne des{" "}
            <a
              href="https://lesateliersdustream.fr/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: EVA_ACCENT }}
            >
              Ateliers du Stream
            </a>
            .
          </p>
        </div>

        {/* Grille des 5 univers (glassmorphism) */}
        <div className="w-full max-w-6xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {TILES.map((tile) => (
            <VitrineTile key={tile.title} tile={tile} isLoggedIn={isLoggedIn} />
          ))}
        </div>
      </div>

      {/* Pied de page sobre */}
      <footer className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center text-sm text-white/50">
          <p>
            Une production des{" "}
            <a
              href="https://lesateliersdustream.fr/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: EVA_ACCENT }}
            >
              Ateliers du Stream
            </a>{" "}
            — evaremote.com © {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </main>
  );
}

function VitrineTile({
  tile,
  isLoggedIn,
}: {
  tile: Tile;
  isLoggedIn: boolean;
}) {
  const href = isLoggedIn ? tile.authedHref : tile.publicHref;
  const opensExternal = isLoggedIn && tile.external;

  const content = (
    <div
      className="group h-full p-6 rounded-xl border backdrop-blur-sm transition-all hover:bg-white/10 hover:border-white/30 flex flex-col"
      style={{
        backgroundColor: "rgba(255,255,255,0.05)",
        borderColor: "rgba(255,255,255,0.15)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">{tile.title}</h2>
        {opensExternal && (
          <span
            className="text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap"
            style={{ backgroundColor: EVA_ACCENT, color: "#1f2244" }}
          >
            ↗ externe
          </span>
        )}
      </div>
      <p className="text-sm mt-3 flex-1 text-white/70">{tile.description}</p>
      <div
        className="mt-4 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: EVA_ACCENT }}
      >
        {isLoggedIn ? "Entrer →" : "Se connecter →"}
      </div>
    </div>
  );

  if (opensExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="block h-full"
      >
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  );
}
