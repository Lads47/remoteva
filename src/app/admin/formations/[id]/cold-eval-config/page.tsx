"use client";

// Override par formation du questionnaire d'éval à FROID.
// Jumeau de /admin/formations/[id]/satisfaction-config (chaud).

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, apiErrorMessage, isAbortError, ApiError } from "@/lib/api-client";
import SatisfactionWysiwygEditor, {
  validateQuestions,
  type SatisfactionQuestion,
} from "@/components/admin/SatisfactionWysiwygEditor";

interface ConfigData {
  formation: { id: string; code: string; nomLong: string };
  override: SatisfactionQuestion[] | null;
  global: SatisfactionQuestion[];
  defaults: SatisfactionQuestion[];
}

export default function FormationColdEvalConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<ConfigData | null>(null);
  const [questions, setQuestions] = useState<SatisfactionQuestion[]>([]);
  const [usingOverride, setUsingOverride] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    apiFetch<ConfigData>(`/api/admin/formations/${id}/cold-eval-config`, { signal: ac.signal })
      .then((d) => {
        setData(d);
        if (d.override) {
          setQuestions(d.override);
          setUsingOverride(true);
        } else {
          setQuestions(d.global);
          setUsingOverride(false);
        }
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setError("Erreur de chargement");
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [id]);

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
      const d = await apiFetch<{ override: SatisfactionQuestion[] }>(`/api/admin/formations/${id}/cold-eval-config`, {
        method: "PUT",
        body: { questions },
      });
      setUsingOverride(true);
      setQuestions(d.override);
      setData((prev) => (prev ? { ...prev, override: d.override } : prev));
      setFeedback({ type: "success", msg: "Override enregistré pour cette formation ✓" });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      const errData = err instanceof ApiError ? (err.data as { issues?: string[] } | null) : null;
      const issuesText = errData && Array.isArray(errData.issues) ? `\n${errData.issues.join("\n")}` : "";
      setError(`${apiErrorMessage(err, "Erreur réseau")}${issuesText}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleResetToGlobal() {
    if (!data) return;
    if (!confirm("Supprimer l'override de cette formation et revenir au questionnaire global ?")) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/admin/formations/${id}/cold-eval-config`, {
        method: "PUT",
        body: { questions: null },
      });
      setUsingOverride(false);
      setQuestions(data.global);
      setData((prev) => (prev ? { ...prev, override: null } : prev));
      setFeedback({ type: "success", msg: "Override supprimé — la formation utilise maintenant le questionnaire global." });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setError(apiErrorMessage(err, "Erreur réseau"));
    } finally {
      setSaving(false);
    }
  }

  function loadDefaults() {
    if (!data) return;
    if (!confirm("Charger le questionnaire par défaut dans l'éditeur ? Cela n'enregistre pas — il faut cliquer sur Enregistrer ensuite.")) return;
    setQuestions(data.defaults);
    setError("");
    setFeedback({ type: "success", msg: "Questionnaire par défaut chargé dans l'éditeur (non encore enregistré)" });
    setTimeout(() => setFeedback(null), 4000);
  }

  if (loading) return <div className="py-12 text-center font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  if (!data) return <div className="py-12 text-center text-red-800">{error || "Erreur"}</div>;

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/formations/catalogue" className="text-xs font-jetbrains underline" style={{ color: "#727485" }}>
          ← Catalogue
        </Link>
        <div className="flex items-center gap-3 flex-wrap mt-2">
          <span className="px-2 py-0.5 rounded text-xs font-jetbrains" style={{ backgroundColor: "#1f2244", color: "white" }}>
            {data.formation.code}
          </span>
        </div>
        <h1 className="text-3xl font-bold mt-1" style={{ color: "#1f2244" }}>
          Questionnaire d&apos;évaluation à froid
        </h1>
        <p className="text-sm mt-1 font-jetbrains" style={{ color: "#727485" }}>
          {data.formation.nomLong}
        </p>
      </div>

      <div className={`mb-4 p-3 rounded-lg text-xs font-jetbrains ${usingOverride ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800"}`}>
        {usingOverride ? (
          <>
            ⚙ Cette formation utilise un <strong>questionnaire à froid personnalisé</strong> (override).
            Le bouton « ↺ Utiliser le questionnaire global » supprime cet override pour repartir du global défini dans{" "}
            <Link href="/admin/formations/parametres-communs/questionnaire-froid" className="underline" style={{ color: "#92400e" }}>
              Paramètres communs → 🌬 Éval à froid
            </Link>.
          </>
        ) : (
          <>
            🌐 Cette formation utilise le <strong>questionnaire à froid global</strong> (défini dans{" "}
            <Link href="/admin/formations/parametres-communs/questionnaire-froid" className="underline" style={{ color: "#3730a3" }}>
              Paramètres communs → 🌬 Éval à froid
            </Link>
            ). L&apos;éditeur ci-dessous est pré-rempli avec ce set global — modifie-le et clique sur
            « Enregistrer comme override » pour créer un questionnaire propre à cette formation.
          </>
        )}
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
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={loadDefaults}
            className="px-4 py-2 rounded-full text-sm font-medium border cursor-pointer"
            style={{ borderColor: "#727485", color: "#727485" }}
            disabled={saving}
          >
            Charger le questionnaire système
          </button>
          {usingOverride && (
            <button
              type="button"
              onClick={handleResetToGlobal}
              className="px-4 py-2 rounded-full text-sm font-medium border cursor-pointer"
              style={{ borderColor: "#92400e", color: "#92400e" }}
              disabled={saving}
            >
              ↺ Utiliser le questionnaire global
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 rounded-full text-sm font-medium text-white cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: "#1f2244" }}
        >
          {saving ? "Enregistrement..." : usingOverride ? "Enregistrer l'override" : "Enregistrer comme override"}
        </button>
      </div>
    </div>
  );
}
