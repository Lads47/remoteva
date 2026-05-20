"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Question {
  name: string;
  type: string;
  label: string;
  description?: string;
  required: boolean;
  options?: string[];
  leftLabel?: string;
  rightLabel?: string;
  placeholder?: string;
}

interface ConfigData {
  questions: Question[];
  defaults: Question[];
}

export default function SatisfactionConfigPage() {
  const [data, setData] = useState<ConfigData | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/satisfaction-config")
      .then((r) => r.json())
      .then((d: ConfigData) => {
        setData(d);
        setJsonText(JSON.stringify(d.questions, null, 2));
      })
      .catch(() => setError("Erreur de chargement"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setError("");
    setFeedback(null);
    // Validation JSON locale
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      setError(`JSON invalide : ${e instanceof Error ? e.message : "erreur de parsing"}`);
      return;
    }
    if (!Array.isArray(parsed)) {
      setError("La racine du JSON doit être un tableau de questions");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/admin/satisfaction-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: parsed }),
      });
      const d = await r.json();
      if (!r.ok) {
        const issuesText = Array.isArray(d.issues) ? `\n${d.issues.join("\n")}` : "";
        setError(`${d.error || "Erreur"}${issuesText}`);
        return;
      }
      setData((prev) => (prev ? { ...prev, questions: d.questions } : prev));
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
    if (!confirm("Réinitialiser le questionnaire à la version par défaut (13 questions / 5 sections) ? Les modifications non enregistrées seront perdues.")) {
      return;
    }
    setJsonText(JSON.stringify(data.defaults, null, 2));
    setError("");
    setFeedback({ type: "success", msg: "Questionnaire par défaut chargé (non encore enregistré)" });
  }

  if (loading) return <div className="py-12 text-center font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  if (!data) return <div className="py-12 text-center text-red-800">{error || "Erreur"}</div>;

  // Parse pour aperçu visuel (uniquement si le JSON est valide)
  let preview: Question[] | null = null;
  try {
    const p = JSON.parse(jsonText);
    if (Array.isArray(p)) preview = p as Question[];
  } catch {
    preview = null;
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/formations" className="text-xs font-jetbrains underline" style={{ color: "#727485" }}>
          ← Catalogue
        </Link>
        <h1 className="text-3xl font-bold mt-2" style={{ color: "#1f2244" }}>
          Questionnaire de satisfaction (éval à chaud)
        </h1>
        <p className="text-sm font-jetbrains mt-1" style={{ color: "#727485" }}>
          Édite ici le set de questions GLOBAL utilisé par défaut sur toutes les formations. Une formation peut ensuite avoir son propre questionnaire via le champ <code>satisfactionConfigForm</code> (override).
        </p>
      </div>

      <div className="mb-4 p-4 rounded-xl text-xs font-jetbrains" style={{ backgroundColor: "#fafbff", color: "#727485" }}>
        <strong style={{ color: "#1f2244" }}>Types de question disponibles</strong> :
        <ul className="mt-2 space-y-1">
          <li><code>section_header</code> : titre de section (label + description, pas une question)</li>
          <li><code>likert_5</code> : échelle 1-5 ({"leftLabel"} → {"rightLabel"})</li>
          <li><code>scale_nps</code> : échelle 0-10 (Net Promoter Score)</li>
          <li><code>single_choice</code> : choix unique parmi <code>options: ["...", "..."]</code></li>
          <li><code>yes_no</code> : Oui / Non</li>
          <li><code>text</code> : texte court (1 ligne) avec <code>placeholder</code> optionnel</li>
          <li><code>textarea</code> : texte long avec <code>placeholder</code> optionnel</li>
        </ul>
        <p className="mt-2">
          <strong style={{ color: "#1f2244" }}>Champs requis sur chaque question</strong> : <code>name</code> (id technique unique), <code>type</code>, <code>label</code>, <code>required</code>.
        </p>
      </div>

      {feedback && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm font-jetbrains ${
            feedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Éditeur JSON */}
        <div className="p-4 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "#1f2244" }}>
              JSON éditable
            </h2>
            <button
              type="button"
              onClick={resetToDefaults}
              className="text-xs px-3 py-1 rounded-full border cursor-pointer"
              style={{ borderColor: "#1f2244", color: "#1f2244" }}
            >
              ↺ Réinitialiser au défaut (13 questions)
            </button>
          </div>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={28}
            className="w-full text-xs font-jetbrains px-3 py-2 rounded border"
            style={{ borderColor: "#e5e7eb", color: "#1f2244", fontFamily: "monospace" }}
            spellCheck={false}
          />
          {error && (
            <pre className="mt-2 p-2 rounded text-xs font-jetbrains bg-red-50 text-red-800 whitespace-pre-wrap">
              {error}
            </pre>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-full text-sm font-medium text-white cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: "#1f2244" }}
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </div>

        {/* Aperçu visuel */}
        <div className="p-4 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-2" style={{ color: "#1f2244" }}>
            Aperçu visuel
          </h2>
          {preview ? (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
              {(() => {
                let idx = 0;
                return preview.map((q, i) => {
                  if (q.type === "section_header") {
                    return (
                      <div key={i} className="pt-2 pb-1 border-b" style={{ borderColor: "#e5e7eb" }}>
                        <div className="text-sm font-bold" style={{ color: "#1f2244" }}>
                          {q.label}
                        </div>
                        {q.description && (
                          <div className="text-xs font-jetbrains mt-0.5" style={{ color: "#727485" }}>
                            {q.description}
                          </div>
                        )}
                      </div>
                    );
                  }
                  idx++;
                  return (
                    <div key={i}>
                      <div className="text-sm font-medium" style={{ color: "#1f2244" }}>
                        <span style={{ color: "#9ca3af" }}>{idx}.</span> {q.label}
                        {q.required && <span style={{ color: "#ef4444" }}> *</span>}
                      </div>
                      {q.description && (
                        <p className="text-xs font-jetbrains mt-0.5" style={{ color: "#9ca3af" }}>{q.description}</p>
                      )}
                      <div className="text-[10px] font-jetbrains mt-0.5" style={{ color: "#727485" }}>
                        <code style={{ color: "#1f2244" }}>{q.type}</code>
                        {q.options && q.options.length > 0 && <span> · choix : {q.options.join(" / ")}</span>}
                        {(q.leftLabel || q.rightLabel) && <span> · {q.leftLabel || ""} → {q.rightLabel || ""}</span>}
                        {q.placeholder && <span> · placeholder : « {q.placeholder} »</span>}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          ) : (
            <p className="text-xs font-jetbrains italic" style={{ color: "#9ca3af" }}>
              Aperçu impossible : JSON invalide. Corrige l'erreur dans l'éditeur.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
