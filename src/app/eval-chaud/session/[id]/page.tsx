"use client";

import { use, useEffect, useState } from "react";

interface InvitationListData {
  session: { code: string; dateDebut: string; dateFin: string };
  formation: { nomLong: string };
  invitations: Array<{ prenom: string; nom: string; magicToken: string; submittedAt: string | null }>;
  message?: string;
}

function fmtDateFr(s: string) {
  return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

export default function SelectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<InvitationListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/public/satisfaction/session/${id}`)
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => null);
          throw new Error(d?.error || "Erreur de chargement");
        }
        return r.json();
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="min-h-screen py-10 px-4" style={{ backgroundColor: "#f8fafc" }}>
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-sm p-6 border" style={{ borderColor: "#e5e7eb" }}>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#1f2244" }}>
            Évaluation à chaud
          </h1>
          <p className="text-sm font-jetbrains mb-4" style={{ color: "#727485" }}>
            Les Ateliers du Stream
          </p>

          {loading && (
            <p className="text-sm font-jetbrains py-8 text-center" style={{ color: "#727485" }}>
              Chargement...
            </p>
          )}

          {error && (
            <div className="p-3 rounded text-sm font-jetbrains bg-red-50 text-red-800">{error}</div>
          )}

          {data && data.message && data.invitations.length === 0 && (
            <div className="p-3 rounded text-sm font-jetbrains bg-amber-50 text-amber-800">
              {data.message}
            </div>
          )}

          {data && data.invitations.length > 0 && (
            <>
              <div className="mb-4 p-3 rounded-lg text-xs font-jetbrains" style={{ backgroundColor: "#fafbff", color: "#727485" }}>
                <strong style={{ color: "#1f2244" }}>{data.formation.nomLong}</strong><br />
                Session du {fmtDateFr(data.session.dateDebut)} au {fmtDateFr(data.session.dateFin)}
              </div>
              <p className="text-sm font-medium mb-3" style={{ color: "#1f2244" }}>
                Sélectionne ton nom :
              </p>
              <ul className="space-y-2">
                {data.invitations.map((inv) => {
                  const done = !!inv.submittedAt;
                  return (
                    <li key={inv.magicToken}>
                      {done ? (
                        <div
                          className="block w-full text-left px-4 py-3 rounded-xl border cursor-not-allowed"
                          style={{ borderColor: "#e5e7eb", color: "#9ca3af", backgroundColor: "#f9fafb" }}
                        >
                          <div className="font-medium">{inv.prenom} {inv.nom}</div>
                          <div className="text-xs font-jetbrains mt-0.5">
                            ✓ A déjà répondu
                          </div>
                        </div>
                      ) : (
                        <a
                          href={`/eval-chaud/${inv.magicToken}`}
                          className="block w-full text-left px-4 py-3 rounded-xl border hover:bg-gray-50 transition-colors cursor-pointer"
                          style={{ borderColor: "#1f2244", color: "#1f2244", backgroundColor: "white" }}
                        >
                          <div className="font-medium">{inv.prenom} {inv.nom}</div>
                          <div className="text-xs font-jetbrains mt-0.5" style={{ color: "#727485" }}>
                            Cliquer pour répondre →
                          </div>
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
        <p className="text-center text-xs font-jetbrains mt-4" style={{ color: "#9ca3af" }}>
          Vos réponses sont confidentielles et utilisées dans le cadre du suivi qualité Qualiopi.
        </p>
      </div>
    </div>
  );
}
