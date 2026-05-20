"use client";

// Éditeur du questionnaire d'évaluation à FROID GLOBAL (utilisé par défaut
// sur toutes les formations). Réutilise le composant SatisfactionWysiwygEditor.

import { useEffect, useState } from "react";
import SatisfactionWysiwygEditor, {
  validateQuestions,
  type SatisfactionQuestion,
} from "@/components/admin/SatisfactionWysiwygEditor";

interface ConfigData {
  questions: SatisfactionQuestion[];
  defaults: SatisfactionQuestion[];
}

export default function ColdEvalConfigPage() {
  const [data, setData] = useState<ConfigData | null>(null);
  const [questions, setQuestions] = useState<SatisfactionQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/cold-eval-config")
      .then((r) => r.json())
      .then((d: ConfigData) => {
        setData(d);
        setQuestions(d.questions);
      })
      .catch(() => setError("Erreur de chargement"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setError("");
    setFeedback(null);
    const validation = validateQuestions(questions);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/admin/cold-eval-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions }),
      });
      const d = await r.json();
      if (!r.ok) {
        const issuesText = Array.isArray(d.issues) ? `\n${d.issues.join("\n")}` : "";
        setError(`${d.error || "Erreur"}${issuesText}`);
        return;
      }
      setData((prev) => (prev ? { ...prev, questions: d.questions } : prev));
      setQuestions(d.questions);
      setFeedback({ type: "success", msg: "Questionnaire enregistré ✓" });
      setTimeout(() => setFeedback(null), 4000);
    } catch {
      setError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  function resetToDefaults() {
    if (!data) return;
    if (!confirm("Réinitialiser le questionnaire à la version par défaut ? Les modifications non enregistrées seront perdues.")) {
      return;
    }
    setQuestions(data.defaults);
    setError("");
    setFeedback({ type: "success", msg: "Questionnaire par défaut chargé (non encore enregistré)" });
    setTimeout(() => setFeedback(null), 4000);
  }

  if (loading) return <div className="py-12 text-center font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  if (!data) return <div className="py-12 text-center text-red-800">{error || "Erreur"}</div>;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold" style={{ color: "#1f2244" }}>
          Questionnaire d&apos;évaluation à froid
        </h2>
        <p className="text-sm font-jetbrains mt-1" style={{ color: "#727485" }}>
          Envoyé automatiquement aux stagiaires <strong>3 mois après la fin</strong> de la session, avec relances
          à J+7 et J+14 en cas de non-réponse. Édite ici le set de questions <strong>global</strong> utilisé par défaut
          sur toutes les formations. Chaque formation peut ensuite définir son propre questionnaire (override).
        </p>
      </div>

      {feedback && (
        <div className={`mb-4 p-3 rounded-lg text-sm font-jetbrains ${feedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {feedback.msg}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm font-jetbrains bg-red-50 text-red-800 whitespace-pre-wrap">
          {error}
        </div>
      )}

      <SatisfactionWysiwygEditor questions={questions} onChange={setQuestions} />

      <div className="mt-6 flex justify-between items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={resetToDefaults}
          className="px-4 py-2 rounded-full text-sm font-medium border cursor-pointer"
          style={{ borderColor: "#d1d5db", color: "#374151" }}
          disabled={saving}
        >
          ↺ Charger le questionnaire par défaut
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 rounded-full text-sm font-medium text-white cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: "#1f2244" }}
        >
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
