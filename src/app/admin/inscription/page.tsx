"use client";

// Page d'inscription EVA (Phase 4 réorganisation EVA).
// Politique :
//   - Inscription ouverte à tous.
//   - Emails @lesateliersdustream.fr : auto-validés (status="validated")
//     mais sans univers attribués tant qu'un super-admin n'a pas coché.
//   - Autres emails : status="pending", un super-admin doit valider.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

export default function InscriptionPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur d'inscription");
        return;
      }

      setSuccess(data.message || "Compte créé avec succès.");
      // Redirection vers la page de connexion après 2 secondes
      setTimeout(() => router.push("/admin/login"), 2500);
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
            <Image src="/logo-eva-v2.png" alt="EVA" width={40} height={40} className="h-10 w-auto" />
          </Link>
          <Link href="/admin/login" className="text-sm text-white/70 hover:text-white transition-colors">
            Se connecter
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-start justify-center px-4 pt-8 sm:pt-12">
        <div className="w-full text-center max-w-md mx-auto">
          <h1 className="font-[var(--font-montserrat)] font-semibold mb-8 whitespace-nowrap tracking-wide">
            <span className="text-3xl sm:text-5xl text-white">E</span>
            <span className="text-2xl sm:text-4xl" style={{ color: "#a0a3b5" }}>lectronic</span>{" "}
            <span className="text-3xl sm:text-5xl text-white">V</span>
            <span className="text-2xl sm:text-4xl" style={{ color: "#a0a3b5" }}>irtual</span>{" "}
            <span className="text-3xl sm:text-5xl text-white">A</span>
            <span className="text-2xl sm:text-4xl" style={{ color: "#a0a3b5" }}>ssistant</span>
          </h1>

          <p className="text-white/70 mb-8 text-lg">Création de compte</p>

          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-4 py-3 bg-white text-gray-900 rounded-full focus:outline-none focus:ring-2 focus:ring-opacity-50 placeholder-gray-400 shadow-lg"
                placeholder="Prénom"
              />
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-4 py-3 bg-white text-gray-900 rounded-full focus:outline-none focus:ring-2 focus:ring-opacity-50 placeholder-gray-400 shadow-lg"
                placeholder="Nom"
              />
            </div>

            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-5 py-3 bg-white text-gray-900 rounded-full focus:outline-none focus:ring-2 focus:ring-opacity-50 placeholder-gray-400 shadow-lg"
              placeholder="Email"
            />

            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-5 py-3 bg-white text-gray-900 rounded-full focus:outline-none focus:ring-2 focus:ring-opacity-50 placeholder-gray-400 shadow-lg"
              placeholder="Mot de passe (8 caractères min)"
            />

            {error && (
              <p className="text-sm text-red-300 text-center">{error}</p>
            )}
            {success && (
              <p className="text-sm text-green-300 text-center">{success}</p>
            )}

            <button
              type="submit"
              disabled={loading || !!success}
              className="w-full py-3 px-6 text-lg font-medium rounded-full shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#7dcef5", color: "#1f2244" }}
            >
              {loading ? "Création..." : "S'inscrire"}
            </button>
          </form>

          <div className="mt-6 p-4 rounded-lg bg-white/5 text-left">
            <p className="text-xs text-white/60">
              Votre compte sera mis en attente de validation par un super-administrateur.
              Les emails <span style={{ color: "#7dcef5" }}>@lesateliersdustream.fr</span>{" "}
              sont auto-validés.
            </p>
          </div>
        </div>
      </div>

      <footer className="border-t border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-sm text-white/50">
          <p>EVA - Electronic Virtual Assistant</p>
          <p className="text-xs mt-1">&copy; {new Date().getFullYear()}</p>
        </div>
      </footer>
    </main>
  );
}
