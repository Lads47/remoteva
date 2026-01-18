"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Composant de recherche pour accéder aux services clients
// Design inspiré des Ateliers du Stream
export default function AccessSearch() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!input.trim()) {
      setError("Veuillez entrer un lien ou un code");
      return;
    }

    let code = input.trim();

    // Si c'est une URL complète, extraire le code
    if (code.includes("/")) {
      // Extraire la dernière partie de l'URL
      const parts = code.split("/").filter(Boolean);
      code = parts[parts.length - 1];
    }

    // Nettoyer le code (minuscules, alphanumériques uniquement)
    code = code.toLowerCase().replace(/[^a-z0-9]/g, "");

    if (!code) {
      setError("Code invalide");
      return;
    }

    // Rediriger vers la page du service
    router.push(`/${code}`);
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError("");
            }}
            placeholder="Entrez votre lien ou code..."
            className="w-full px-5 py-4 pr-14 text-lg bg-white text-gray-900 rounded-full focus:outline-none focus:ring-2 focus:ring-opacity-50 placeholder-gray-400 shadow-lg"
          />
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-3 text-white rounded-full transition-colors"
            style={{ backgroundColor: "#1f2244" }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#7dcef5"}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = "#1f2244"}
            aria-label="Accéder"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
          </button>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-300 text-center">{error}</p>
        )}
      </form>

      <p className="mt-4 text-sm text-white/60 text-center italic">
        Saisissez le lien ou le code qui vous a été transmis
      </p>
    </div>
  );
}
