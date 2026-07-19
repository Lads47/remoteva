"use client";

// Layout admin minimaliste (Phase 1 réorganisation EVA).
// L'ancienne barre de navigation unique (Tableau de bord, Liens, Formations,
// Utilisateurs, Gate SRT) a été retirée : chaque univers porte désormais
// sa propre navigation contextuelle dans son layout dédié.
// Ne restent ici que le logo (retour au hub), "Mon compte" et "Déconnexion".

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ApiError, apiFetch, isAbortError } from "@/lib/api-client";

// Thème par univers (design tokens — voir globals.css).
// "light" = défaut ; passer une valeur à "dark" bascule TOUT l'univers concerné
// (fond, cartes, texte) sans toucher aux autres. Réversible d'un mot.
const UNIVERSE_THEME: Record<string, "light" | "dark"> = {
  master: "dark", // pilote — passer à "light" pour revenir au thème clair
};
// Exceptions par page (priment sur le thème d'univers).
// Ex : l'espace correction de Master reste en clair même si Master est en sombre.
function pageThemeOverride(pathname: string): "light" | "dark" | null {
  if (pathname.startsWith("/admin/master/") && pathname.endsWith("/correction")) {
    return "light";
  }
  return null;
}
function themeForPath(pathname: string): "light" | "dark" {
  const override = pageThemeOverride(pathname);
  if (override) return override;
  const seg = pathname.split("/")[2]; // /admin/<univers>/...
  return UNIVERSE_THEME[seg] ?? "light";
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const theme = themeForPath(pathname);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // Vérifie l'authentification au chargement
  useEffect(() => {
    // Pages publiques (sans auth) : login + inscription
    if (pathname === "/admin/login" || pathname === "/admin/inscription") {
      setIsAuthenticated(false);
      return;
    }

    // Vérifie si une session existe via un appel API
    const ac = new AbortController();
    apiFetch("/api/admin/links", { signal: ac.signal })
      .then(() => {
        setIsAuthenticated(true);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        if (err instanceof ApiError && err.status !== null && err.status !== 401) {
          // Réponse serveur autre que 401 : la session existe
          setIsAuthenticated(true);
          return;
        }
        router.push("/admin/login");
        setIsAuthenticated(false);
      });
    return () => ac.abort();
  }, [pathname, router]);

  // Déconnexion
  const handleLogout = async () => {
    // Même si l'appel échoue, on renvoie vers le login
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/admin/login");
  };

  // Pages publiques sans navigation admin
  if (pathname === "/admin/login" || pathname === "/admin/inscription") {
    return <>{children}</>;
  }

  // Chargement
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-pulse" style={{ color: "#727485" }}>Chargement...</div>
      </div>
    );
  }

  // Non authentifié
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen" data-theme={theme} style={{ backgroundColor: "var(--page)" }}>
      {/* Bandeau minimaliste : logo (retour au hub) + Mon compte + Déconnexion */}
      {/* Nav = chrome de marque (navy constant), OK sur thème clair comme sombre */}
      <nav className="border-b border-white/10" style={{ backgroundColor: "var(--brand)" }}>
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex justify-between h-[72px] items-center">
            <Link href="/admin" className="flex items-center" title="Retour au hub">
              <Image
                src="/logo-eva-v2.png"
                alt="EVA"
                width={40}
                height={40}
                className="h-10 w-auto"
              />
            </Link>

            <div className="flex items-center gap-2">
              <Link
                href="/admin/account"
                className={`text-sm px-3 py-2 rounded-full transition-colors ${
                  pathname === "/admin/account"
                    ? "text-white"
                    : "text-white/70 hover:text-white"
                }`}
                style={pathname === "/admin/account" ? { backgroundColor: "#7dcef5", color: "#1f2244" } : {}}
              >
                Mon compte
              </Link>
              <button
                onClick={handleLogout}
                className="text-sm text-white/70 hover:text-white px-3 py-2 transition-colors"
              >
                Déconnexion
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Contenu */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}
