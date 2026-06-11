"use client";

import { useEffect, useState } from "react";
import { EVA_STATUSES, EVA_STATUS_LABELS, type EvaStatus } from "@/lib/appConfig-types";
import { apiFetch, apiErrorMessage, isAbortError, ApiError } from "@/lib/api-client";

interface Pipeline {
  id: number;
  label: string;
}

interface Step {
  id: number;
  label: string;
  rank?: number;
}

export default function SellsyConfigPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState<number | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<EvaStatus, number>>>({});
  const [loading, setLoading] = useState(true);
  const [loadingSteps, setLoadingSteps] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Charge la config existante + la liste des pipelines.
  // Si aucun pipeline n'est encore configuré, on essaie de trouver automatiquement
  // celui nommé "Formation" parmi les pipelines retournés.
  useEffect(() => {
    const ac = new AbortController();
    Promise.all([
      apiFetch<{ error?: string; pipelineId?: number | null; mapping?: Partial<Record<EvaStatus, number>> }>("/api/admin/sellsy-config", { signal: ac.signal }),
      apiFetch<{ error?: string; pipelines?: Pipeline[] }>("/api/admin/sellsy/pipelines", { signal: ac.signal }),
    ])
      .then(([configData, pipelinesData]) => {
        if (configData.error) setError(configData.error);
        const pipelinesError = pipelinesData.error;
        if (pipelinesError) setError((prev) => prev || pipelinesError);

        const fetchedPipelines = (pipelinesData.pipelines ?? []) as Pipeline[];
        setPipelines(fetchedPipelines);

        let resolvedId: number | null = configData.pipelineId ?? null;
        if (resolvedId === null) {
          const auto = fetchedPipelines.find((p) => p.label.toLowerCase().includes("formation"));
          if (auto) resolvedId = auto.id;
        }
        setPipelineId(resolvedId);
        setMapping(configData.mapping ?? {});
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setError(apiErrorMessage(err, "Erreur de chargement"));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, []);

  // Quand pipelineId change, charge les steps correspondants
  useEffect(() => {
    if (!pipelineId) {
      setSteps([]);
      return;
    }
    setLoadingSteps(true);
    setError("");
    const ac = new AbortController();
    apiFetch<{ error?: string; steps?: Step[] }>(`/api/admin/sellsy/pipelines/${pipelineId}/steps`, { signal: ac.signal })
      .then((data) => {
        if (data.error) {
          setError(data.error);
          setSteps([]);
        } else {
          const list = (data.steps ?? []) as Step[];
          // Tri par rank si dispo
          list.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
          setSteps(list);
        }
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        // Fidèle à l'ancien comportement : une erreur HTTP vidait la liste des steps
        if (err instanceof ApiError && err.status !== null) setSteps([]);
        setError(apiErrorMessage(err, "Erreur de chargement des étapes"));
      })
      .finally(() => setLoadingSteps(false));
    return () => ac.abort();
  }, [pipelineId]);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/admin/sellsy-config", {
        method: "PUT",
        body: { pipelineId, mapping },
      });
      setFeedback({ type: "success", msg: "Configuration Sellsy enregistrée" });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setError(apiErrorMessage(err, "Erreur de connexion"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12 font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold" style={{ color: "#1f2244" }}>
          Intégration Sellsy
        </h2>
        <p className="text-sm mt-1 font-jetbrains" style={{ color: "#727485" }}>
          Connecte chaque statut EVA à l&apos;étape correspondante de ta pipeline Sellsy. À chaque
          changement de statut côté EVA, l&apos;opportunité Sellsy passera automatiquement à
          l&apos;étape associée.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-800 text-sm font-jetbrains">{error}</div>
      )}
      {feedback && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm font-jetbrains ${
            feedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {/* Pipeline (affichage seulement — auto-sélectionné) */}
      {pipelineId && (
        <div className="mb-6 p-4 rounded-xl border flex items-center justify-between flex-wrap gap-3" style={{ borderColor: "#e5e7eb", backgroundColor: "#f8fafc" }}>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "#727485" }}>
              Pipeline Sellsy synchronisé
            </div>
            <div className="text-sm font-jetbrains mt-0.5" style={{ color: "#1f2244" }}>
              {pipelines.find((p) => p.id === pipelineId)?.label ?? "Formation"} ({pipelineId})
            </div>
          </div>
        </div>
      )}

      {pipelines.length === 0 && !loading && (
        <div className="mb-6 p-3 rounded-lg bg-yellow-50 text-yellow-800 text-sm font-jetbrains">
          Aucun pipeline retourné par Sellsy. Vérifie que ton compte a bien un pipeline et que les
          credentials Sellsy sont configurés dans le <code className="font-jetbrains">.env</code>.
        </div>
      )}

      {/* Mapping des étapes */}
      {pipelineId && (
        <div className="mb-6 p-5 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: "#1f2244" }}>
            Mapping statuts EVA ↔ étapes Sellsy
          </h2>
          <p className="text-xs font-jetbrains mb-4" style={{ color: "#727485" }}>
            Tu peux laisser certains statuts non mappés (par ex. <em>convoqué</em>, <em>en formation</em>,
            <em>terminé</em>) — ces statuts purement pédagogiques ne touchent pas Sellsy.
          </p>

          {loadingSteps ? (
            <p className="font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement des étapes...</p>
          ) : steps.length === 0 ? (
            <p className="font-jetbrains text-sm" style={{ color: "#92400e" }}>
              Aucune étape retournée pour ce pipeline.
            </p>
          ) : (
            <div className="space-y-2">
              {EVA_STATUSES.map((status) => (
                <div
                  key={status}
                  className="flex items-center gap-3 py-2"
                  style={{ borderTop: status !== EVA_STATUSES[0] ? "1px solid #f3f4f6" : "none" }}
                >
                  <div className="w-48 flex-shrink-0">
                    <div className="text-sm font-medium" style={{ color: "#1f2244" }}>
                      {EVA_STATUS_LABELS[status]}
                    </div>
                    <div className="text-xs font-jetbrains" style={{ color: "#9ca3af" }}>
                      {status}
                    </div>
                  </div>
                  <select
                    value={mapping[status] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMapping((prev) => {
                        const next = { ...prev };
                        if (v === "") delete next[status];
                        else next[status] = parseInt(v, 10);
                        return next;
                      });
                    }}
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                    style={{ borderColor: "#d1d5db" }}
                  >
                    <option value="">— Non synchronisé avec Sellsy —</option>
                    {steps.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label} <span style={{ fontFamily: "monospace" }}>({s.id})</span>
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-full text-sm font-medium text-white cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: "#1f2244" }}
        >
          {saving ? "Enregistrement..." : "Enregistrer la configuration"}
        </button>
      </div>
    </div>
  );
}
