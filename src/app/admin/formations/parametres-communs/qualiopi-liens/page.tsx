"use client";

// Saisie des URL des documents Drive externes utiles pour les indicateurs
// Qualiopi qui restent gérés hors EVA Remote :
//   - Sheet de veille (ind. 25 socio-éco, 26 légale, 27 pédagogique/techno)
//   - Doc partenariats et acteurs socio-économiques (ind. 28)
//
// Affichés en lecture seule sur le dashboard /admin/formations.

import { useEffect, useState } from "react";

export default function QualiopiLiensPage() {
  const [veille, setVeille] = useState("");
  const [partenaires, setPartenaires] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/qualiopi-links")
      .then((r) => r.json())
      .then((d) => {
        setVeille(d.veille ?? "");
        setPartenaires(d.partenaires ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/qualiopi-links", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ veille, partenaires }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", msg: data.error || "Erreur" });
        return;
      }
      setFeedback({ type: "success", msg: "Liens enregistrés ✓" });
      setTimeout(() => setFeedback(null), 4000);
    } catch {
      setFeedback({ type: "error", msg: "Erreur de connexion" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12 font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-semibold mb-2" style={{ color: "#1f2244" }}>
        Documents Qualiopi externes
      </h2>
      <p className="text-sm font-jetbrains mb-6" style={{ color: "#727485" }}>
        Lie ici les documents Drive que tu maintiens en dehors d&apos;EVA Remote.
        Ils seront affichés en lecture seule sur le tableau de bord pour faciliter
        leur consultation pendant un audit.
      </p>

      <form onSubmit={handleSave} className="space-y-5">
        <div className="p-5 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}>
          <label className="block text-sm font-semibold mb-1" style={{ color: "#1f2244" }}>
            📊 Sheet de veille
          </label>
          <p className="text-xs font-jetbrains mb-3" style={{ color: "#727485" }}>
            Couvre les indicateurs <strong>25</strong> (veille socio-économique du métier),
            <strong> 26</strong> (veille légale et réglementaire) et <strong>27</strong> (veille
            pédagogique et technologique). Tu peux tout mettre dans un seul Sheet avec un
            onglet par type de veille.
          </p>
          <input
            type="url"
            value={veille}
            onChange={(e) => setVeille(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/.../edit"
            className="w-full px-3 py-2 rounded-lg border font-jetbrains text-xs"
            style={{ borderColor: "#d1d5db" }}
          />
        </div>

        <div className="p-5 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}>
          <label className="block text-sm font-semibold mb-1" style={{ color: "#1f2244" }}>
            ♿ Document partenaires handicap (PSH)
          </label>
          <p className="text-xs font-jetbrains mb-3" style={{ color: "#727485" }}>
            Couvre l&apos;indicateur <strong>28</strong> (mobilisation des acteurs socio-économiques),
            adapté au périmètre d&apos;activité de LADS : la dimension <em>handicap</em> est ce qui
            a été demandé à l&apos;audit initial. Liste des partenaires PSH (Cap Emploi, AGEFIPH,
            MDPH locale…). Si le périmètre s&apos;élargit, tu peux étoffer le doc avec d&apos;autres
            acteurs (prescripteurs, financeurs, réseaux professionnels).
          </p>
          <input
            type="url"
            value={partenaires}
            onChange={(e) => setPartenaires(e.target.value)}
            placeholder="https://docs.google.com/document/d/.../edit"
            className="w-full px-3 py-2 rounded-lg border font-jetbrains text-xs"
            style={{ borderColor: "#d1d5db" }}
          />
        </div>

        {feedback && (
          <div
            className={`p-3 rounded-lg text-sm font-jetbrains ${
              feedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
            }`}
          >
            {feedback.msg}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-full text-sm font-medium text-white disabled:opacity-50 cursor-pointer"
          style={{ backgroundColor: "#1f2244" }}
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </form>
    </div>
  );
}
