"use client";

import { use, useEffect, useState } from "react";
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
  formation: { id: string; code: string; nomLong: string };
  override: Question[] | null;
  global: Question[];
  defaults: Question[];
}

export default function FormationSatisfactionConfigPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<ConfigData | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [usingOverride, setUsingOverride] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/formations/${id}/satisfaction-config`)
      .then((r) => r.json())
      .then((d: ConfigData) => {
        setData(d);
        if (d.override) {
          setJsonText(JSON.stringify(d.override, null, 2));
          setUsingOverride(true);
        } else {
          // Pas d'override : on pré-remplit avec le global pour faciliter
          // l'édition. L'utilisateur peut Enregistrer pour créer un override.
          setJsonText(JSON.stringify(d.global, null, 2));
          setUsingOverride(false);
        }
      })
      .catch(() => setError("Erreur de chargement"))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave() {
    setError("");
    setFeedback(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      setError(`JSON invalide : ${e instanceof Error ? e.message : "erreur"}`);
      return;
    }
    if (!Array.isArray(parsed)) {
      setError("La racine du JSON doit être un tableau");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/formations/${id}/satisfaction-config`, {
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
      setUsingOverride(true);
      setData((prev) => prev ? { ...prev, override: d.override } : prev);
      setFeedback({ type: "success", msg: "Override enregistré pour cette formation ✓" });
      setTimeout(() => setFeedback(null), 4000);
    } catch {
      setError("Erreur réseau");
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
      const r = await fetch(`/api/admin/formations/${id}/satisfaction-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: null }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || "Erreur");
        return;
      }
      setUsingOverride(false);
      setJsonText(JSON.stringify(data.global, null, 2));
      setData((prev) => prev ? { ...prev, override: null } : prev);
      setFeedback({ type: "success", msg: "Override supprimé — la formation utilise maintenant le questionnaire global." });
      setTimeout(() => setFeedback(null), 4000);
    } catch {
      setError("Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  function loadDefaults() {
    if (!data) return;
    if (!confirm("Charger le questionnaire par défaut (13 questions / 5 sections) dans l'éditeur ? Cela n'enregistre pas — il faut cliquer sur Enregistrer ensuite.")) return;
    setJsonText(JSON.stringify(data.defaults, null, 2));
    setError("");
  }

  if (loading) return <div className="py-12 text-center font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  if (!data) return <div className="py-12 text-center text-red-800">{error || "Erreur"}</div>;

  let preview: Question[] | null = null;
  try {
    const p = JSON.parse(jsonText);
    if (Array.isArray(p)) preview = p as Question[];
  } catch {}

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/formations" className="text-xs font-jetbrains underline" style={{ color: "#727485" }}>
          ← Catalogue
        </Link>
        <div className="flex items-center gap-3 flex-wrap mt-2">
          <span className="px-2 py-0.5 rounded text-xs font-jetbrains" style={{ backgroundColor: "#1f2244", color: "white" }}>
            {data.formation.code}
          </span>
        </div>
        <h1 className="text-3xl font-bold mt-1" style={{ color: "#1f2244" }}>
          Questionnaire de satisfaction
        </h1>
        <p className="text-sm mt-1 font-jetbrains" style={{ color: "#727485" }}>
          {data.formation.nomLong}
        </p>
      </div>

      <div className={`mb-4 p-3 rounded-lg text-xs font-jetbrains ${usingOverride ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800"}`}>
        {usingOverride ? (
          <>
            ⚙ Cette formation utilise un <strong>questionnaire personnalisé</strong> (override). Si tu cliques sur « ↺ Utiliser le questionnaire global », l&apos;override sera supprimé et la formation héritera du questionnaire global défini dans{" "}
            <Link href="/admin/formations/satisfaction-config" className="underline" style={{ color: "#92400e" }}>Catalogue → 📝 Questionnaire éval à chaud</Link>.
          </>
        ) : (
          <>
            🌐 Cette formation utilise le <strong>questionnaire global</strong> (défini dans{" "}
            <Link href="/admin/formations/satisfaction-config" className="underline" style={{ color: "#3730a3" }}>Catalogue → 📝 Questionnaire éval à chaud</Link>
            ). Le JSON ci-dessous est pré-rempli avec ce set global — édite et clique sur « Enregistrer » pour créer un override propre à cette formation.
          </>
        )}
      </div>

      {feedback && (
        <div className={`mb-4 p-3 rounded-lg text-sm font-jetbrains ${feedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {feedback.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Éditeur */}
        <div className="p-4 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "#1f2244" }}>
              JSON éditable
            </h2>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={loadDefaults}
                className="text-xs px-3 py-1 rounded-full border cursor-pointer"
                style={{ borderColor: "#727485", color: "#727485" }}
              >
                Charger le défaut système
              </button>
              {usingOverride && (
                <button
                  type="button"
                  onClick={handleResetToGlobal}
                  className="text-xs px-3 py-1 rounded-full border cursor-pointer"
                  style={{ borderColor: "#92400e", color: "#92400e" }}
                >
                  ↺ Utiliser le questionnaire global
                </button>
              )}
            </div>
          </div>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            rows={28}
            className="w-full text-xs px-3 py-2 rounded border"
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
              {saving ? "Enregistrement..." : usingOverride ? "Enregistrer l'override" : "Enregistrer comme override"}
            </button>
          </div>
        </div>

        {/* Aperçu */}
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
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          ) : (
            <p className="text-xs font-jetbrains italic" style={{ color: "#9ca3af" }}>
              Aperçu impossible : JSON invalide.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
