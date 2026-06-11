"use client";

// Page de présentation du QR code pour affichage en vidéoprojecteur.
// Le formateur ouvre cette URL sur l'écran de la salle ; les stagiaires
// scannent avec leur téléphone et tombent directement sur le formulaire
// anonyme (/eval-chaud/session/[id]).
//
// Pas d'authentification : l'URL est partagée par le formateur depuis
// son interface (qui elle est protégée par magic token).

import { use, useEffect, useState } from "react";
import { apiFetch, apiErrorMessage, isAbortError } from "@/lib/api-client";

interface SurveyMeta {
  session: { id: string; code: string; dateDebut: string; dateFin: string };
  formation: { nomLong: string };
}

function fmtDateFr(s: string) {
  return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

export default function PresentationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [meta, setMeta] = useState<SurveyMeta | null>(null);
  const [error, setError] = useState("");
  const [surveyUrl, setSurveyUrl] = useState("");

  useEffect(() => {
    setSurveyUrl(`${window.location.origin}/eval-chaud/session/${id}`);
    const ac = new AbortController();
    apiFetch<SurveyMeta>(`/api/public/satisfaction/session/${id}`, { signal: ac.signal })
      .then((d) => setMeta(d))
      .catch((err) => {
        if (isAbortError(err)) return;
        setError(apiErrorMessage(err, "Session introuvable"));
      });
    return () => ac.abort();
  }, [id]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "#f8fafc" }}>
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold" style={{ color: "#1f2244" }}>Session introuvable</h1>
          <p className="mt-2 text-sm font-jetbrains" style={{ color: "#727485" }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10" style={{ backgroundColor: "#f8fafc" }}>
      <div className="w-full max-w-3xl text-center">
        <p className="text-xs uppercase tracking-widest font-jetbrains" style={{ color: "#7dcef5" }}>
          Évaluation à chaud
        </p>
        <h1 className="mt-2 text-4xl sm:text-5xl font-bold" style={{ color: "#1f2244" }}>
          Donnez-nous votre avis
        </h1>
        {meta && (
          <p className="mt-3 text-base sm:text-lg font-jetbrains max-w-2xl mx-auto" style={{ color: "#727485" }}>
            <strong style={{ color: "#1f2244" }}>{meta.formation.nomLong}</strong>
            <br />
            Session du {fmtDateFr(meta.session.dateDebut)} au {fmtDateFr(meta.session.dateFin)}
          </p>
        )}

        <div
          className="mt-8 inline-block bg-white rounded-3xl shadow-lg p-6 sm:p-8 border"
          style={{ borderColor: "#e5e7eb" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/public/satisfaction/session/${id}/qr?size=720`}
            alt="QR code formulaire d'évaluation"
            className="w-72 h-72 sm:w-96 sm:h-96 mx-auto"
            style={{ borderRadius: 12 }}
          />
        </div>

        <div className="mt-8 inline-flex items-center gap-3 px-5 py-3 rounded-full" style={{ backgroundColor: "#1f2244" }}>
          <span className="text-2xl">📱</span>
          <p className="text-base sm:text-lg font-semibold text-white">
            Scannez le QR code avec votre téléphone
          </p>
        </div>

        <p className="mt-6 text-sm font-jetbrains max-w-xl mx-auto" style={{ color: "#727485" }}>
          Le formulaire est <strong>anonyme</strong> et prend <strong>≈ 3 minutes</strong>.
          Vos retours nous aident à améliorer la qualité de nos formations.
        </p>

        {surveyUrl && (
          <div className="mt-6">
            <p className="text-xs font-jetbrains mb-1" style={{ color: "#9ca3af" }}>
              Ou ouvrez directement ce lien :
            </p>
            <code
              className="inline-block text-xs font-jetbrains px-3 py-1.5 rounded-lg border break-all"
              style={{ borderColor: "#e5e7eb", color: "#1f2244", backgroundColor: "white" }}
            >
              {surveyUrl}
            </code>
          </div>
        )}
      </div>
    </div>
  );
}
