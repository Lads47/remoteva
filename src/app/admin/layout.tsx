"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

// Layout pour les pages admin - Design inspiré des Ateliers du Stream
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // Vérifie l'authentification au chargement
  useEffect(() => {
    // La page de login est accessible sans auth
    if (pathname === "/admin/login") {
      setIsAuthenticated(false);
      return;
    }

    // Vérifie si une session existe via un appel API
    fetch("/api/admin/links")
      .then((res) => {
        if (res.status === 401) {
          router.push("/admin/login");
          setIsAuthenticated(false);
        } else {
          setIsAuthenticated(true);
        }
      })
      .catch(() => {
        router.push("/admin/login");
        setIsAuthenticated(false);
      });
  }, [pathname, router]);

  // Déconnexion
  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
  };

  // Page de login: pas de navigation
  if (pathname === "/admin/login") {
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
    <div className="min-h-screen bg-white">
      {/* Barre de navigation */}
      <nav className="border-b border-white/10" style={{ backgroundColor: "#1f2244" }}>
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex justify-between h-[72px] items-center">
            {/* Logo et navigation */}
            <div className="flex items-center space-x-8">
              <Link href="/" className="flex items-center">
                <Image
                  src="/logo-eva-v2.png"
                  alt="EVA"
                  width={40}
                  height={40}
                  className="h-10 w-auto"
                />
              </Link>

              <div className="hidden sm:flex space-x-2">
                <Link
                  href="/admin/dashboard"
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    pathname === "/admin/dashboard"
                      ? "text-white"
                      : "text-white/70 hover:text-white"
                  }`}
                  style={pathname === "/admin/dashboard" ? { backgroundColor: "#7dcef5", color: "#1f2244" } : {}}
                >
                  Tableau de bord
                </Link>
                <Link
                  href="/admin/links"
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    pathname === "/admin/links"
                      ? "text-white"
                      : "text-white/70 hover:text-white"
                  }`}
                  style={pathname === "/admin/links" ? { backgroundColor: "#7dcef5", color: "#1f2244" } : {}}
                >
                  Liens clients
                </Link>
                <Link
                  href="/admin/users"
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    pathname === "/admin/users"
                      ? "text-white"
                      : "text-white/70 hover:text-white"
                  }`}
                  style={pathname === "/admin/users" ? { backgroundColor: "#7dcef5", color: "#1f2244" } : {}}
                >
                  Utilisateurs
                </Link>
              </div>
            </div>

            {/* Mon compte et déconnexion */}
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
