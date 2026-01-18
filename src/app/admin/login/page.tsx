"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

// Page de connexion admin - Design inspiré des Ateliers du Stream
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur de connexion");
        return;
      }

      // Redirection vers le dashboard
      router.push("/admin/dashboard");
    } catch {
      setError("Erreur de connexion au serveur");
    } finally {
      setLoading(false);
    }
  };

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
            href="/"
            className="text-sm text-white/70 hover:text-white transition-colors"
          >
            Accueil
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
            <p className="text-white/70 mb-12 text-lg">
              Connexion Administration
            </p>

            {/* Formulaire de connexion */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Email */}
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-5 py-4 text-lg bg-white text-gray-900 rounded-full focus:outline-none focus:ring-2 focus:ring-opacity-50 placeholder-gray-400 shadow-lg"
                  placeholder="Email"
                />
              </div>

              {/* Mot de passe */}
              <div className="relative">
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-5 py-4 text-lg bg-white text-gray-900 rounded-full focus:outline-none focus:ring-2 focus:ring-opacity-50 placeholder-gray-400 shadow-lg"
                  placeholder="Mot de passe"
                />
              </div>

              {/* Erreur */}
              {error && (
                <p className="text-sm text-red-300 text-center">{error}</p>
              )}

              {/* Bouton connexion */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 px-6 text-lg font-medium text-white rounded-full shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "#7dcef5", color: "#1f2244" }}
                onMouseOver={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = "#ffffff";
                  }
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = "#7dcef5";
                }}
              >
                {loading ? "Connexion..." : "Se connecter"}
              </button>
            </form>

            {/* Mot de passe oublié */}
            <p className="mt-6 text-sm text-white/50 text-center italic">
              Mot de passe oublié ? Contactez un administrateur.
            </p>
          </div>
        </div>
      </div>

      {/* Pied de page */}
      <footer className="border-t border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-sm text-white/50">
          <p>EVA - Electronic Virtual Assistant</p>
          <p className="text-xs mt-1">&copy; {new Date().getFullYear()}</p>
        </div>
      </footer>
    </main>
  );
}
