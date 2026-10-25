// Accueil public evaremote.com : le haut de la page de connexion (logo + titre EVA),
// un bouton Connexion, puis nos trois sites. Les univers ne sont plus exposés ici :
// on les retrouve après connexion, sur le hub /admin.
//
// Server component : un utilisateur déjà connecté voit « Univers » (le hub /admin)
// à la place de « Connexion ». Le logo de toutes les pages admin ramène ici.

import Link from "next/link";
import Image from "next/image";
import { getSession } from "@/lib/auth";

type Site = { name: string; tagline: string; domain: string; image: string };

const SITES: Site[] = [
  { name: "wisio", tagline: "Interactions live pour vos événements", domain: "wisio.io", image: "/sites/wisio.png" },
  { name: "Les Ateliers du Stream", tagline: "Captation vidéo et diffusion en direct", domain: "lesateliersdustream.fr", image: "/sites/lads.webp" },
  { name: "EVADIF", tagline: "EVA Pilot, la diffusion de vos médias", domain: "evadif.com", image: "/sites/evadif.png" },
];

export default async function HomePage() {
  const session = await getSession();
  const isLoggedIn = !!session && session.status === "validated";

  return (
    <main className="min-h-screen flex flex-col" data-theme="dark" style={{ backgroundColor: "var(--page)" }}>
      {/* En-tête : celui de la page de connexion, sans le lien Accueil */}
      <header className="border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 h-[72px] flex items-center">
          <Link href="/" className="flex items-center">
            <Image src="/logo-eva-v2.png" alt="EVA" width={40} height={40} className="h-10 w-auto" />
          </Link>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center px-4 pt-8 sm:pt-12 pb-16">
        <h1 className="font-[var(--font-montserrat)] font-semibold mb-12 whitespace-nowrap tracking-wide text-center">
          <span className="text-3xl sm:text-5xl text-white">E</span><span className="text-2xl sm:text-4xl" style={{ color: "var(--muted)" }}>lectronic</span>{" "}
          <span className="text-3xl sm:text-5xl text-white">V</span><span className="text-2xl sm:text-4xl" style={{ color: "var(--muted)" }}>irtual</span>{" "}
          <span className="text-3xl sm:text-5xl text-white">A</span><span className="text-2xl sm:text-4xl" style={{ color: "var(--muted)" }}>ssistant</span>
        </h1>

        <div className="w-full max-w-md">
          <Link
            href={isLoggedIn ? "/admin" : "/admin/login"}
            className="block w-full py-4 px-6 text-lg font-medium text-center rounded-full shadow-lg transition-colors bg-accent text-brand hover:bg-white"
          >
            {isLoggedIn ? "Univers" : "Connexion"}
          </Link>
        </div>

        {/* Nos trois sites */}
        <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
          {SITES.map((site) => (
            <a
              key={site.domain}
              href={`https://${site.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group block rounded-2xl overflow-hidden border border-white/10 transition-all hover:border-white/40 hover:-translate-y-1 hover:shadow-2xl"
              style={{ backgroundColor: "var(--surface)" }}
              aria-label={`${site.name} — ${site.domain} (nouvel onglet)`}
            >
              <div className="relative aspect-[2/1] overflow-hidden bg-white">
                <Image
                  src={site.image}
                  alt={`Page d'accueil de ${site.domain}`}
                  fill
                  sizes="(min-width: 768px) 33vw, 100vw"
                  className="object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
                />
              </div>
              <div className="px-5 py-4">
                <div className="font-semibold text-white">{site.name}</div>
                <div className="text-sm mt-0.5" style={{ color: "var(--muted)" }}>{site.tagline}</div>
                <div className="text-sm mt-2 transition-colors group-hover:text-white" style={{ color: "var(--accent)" }}>
                  {site.domain} ↗
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>

      <footer className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center text-sm text-white/50">
          Une production des Ateliers du Stream — evaremote.com © {new Date().getFullYear()}
        </div>
      </footer>
    </main>
  );
}
