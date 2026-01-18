import Link from "next/link";
import Image from "next/image";
import AccessSearch from "@/components/AccessSearch";

// Page d'accueil EVA - Design inspiré des Ateliers du Stream
export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col" style={{ backgroundColor: "#1f2244" }}>
      {/* En-tête */}
      <header className="border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 h-[72px] flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image
              src="/logo-eva-v2.png"
              alt="EVA"
              width={40}
              height={40}
              className="h-10 w-auto"
            />
          </Link>
          <Link
            href="/admin/login"
            className="text-sm text-white/70 hover:text-white transition-colors"
          >
            Administration
          </Link>
        </div>
      </header>

      {/* Contenu principal */}
      <div className="flex-1 flex items-start justify-center px-4 pt-8 sm:pt-12">
        <div className="w-full text-center">
          {/* Titre */}
          <h1 className="font-[var(--font-montserrat)] font-semibold mb-12 whitespace-nowrap tracking-wide">
            <span className="text-3xl sm:text-5xl text-white">E</span><span className="text-2xl sm:text-4xl" style={{ color: "#a0a3b5" }}>lectronic</span>{" "}
            <span className="text-3xl sm:text-5xl text-white">V</span><span className="text-2xl sm:text-4xl" style={{ color: "#a0a3b5" }}>irtual</span>{" "}
            <span className="text-3xl sm:text-5xl text-white">A</span><span className="text-2xl sm:text-4xl" style={{ color: "#a0a3b5" }}>ssistant</span>
          </h1>
          <div className="max-w-md mx-auto">
            <p className="text-white/70 mb-16 text-lg">
              Bienvenue sur EVA, votre espace dédié aux services en ligne des{" "}
              <a
                href="https://lesateliersdustream.fr/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium hover:underline"
                style={{ color: "#7dcef5" }}
              >
                Ateliers du Stream
              </a>.
            </p>

            {/* Zone de recherche */}
            <AccessSearch />
          </div>
        </div>
      </div>

      {/* Pied de page */}
      <footer className="border-t border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-sm text-white/50">
          <p>EVA - Electronic Virtual Assistant - le site evaremote.com &copy; {new Date().getFullYear()}</p>
        </div>
      </footer>
    </main>
  );
}
