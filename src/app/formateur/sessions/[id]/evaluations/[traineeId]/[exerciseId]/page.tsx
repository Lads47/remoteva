"use client";

import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

type Score = "" | "acquis" | "en_cours" | "non_acquis";

interface Criterion {
  id: string;
  ordre: number;
  libelle: string;
  score: Score;
  comment: string;
}

interface EvaluationDetail {
  trainee: { id: string; prenom: string; nom: string };
  exercise: { id: string; ordre: number; titre: string; description: string };
  criteria: Criterion[];
  globalNote: Score;
  observations: string;
  evaluatedAt: string | null;
  evaluatorName: string | null;
}

const SCORE_OPTIONS: { value: Score; label: string; bg: string; color: string }[] = [
  { value: "acquis", label: "Acquis", bg: "#dcfce7", color: "#166534" },
  { value: "en_cours", label: "En cours d'acquisition", bg: "#fef3c7", color: "#92400e" },
  { value: "non_acquis", label: "Non acquis", bg: "#fee2e2", color: "#991b1b" },
];

function EvaluationFormInner({
  sessionId,
  traineeId,
  exerciseId,
}: {
  sessionId: string;
  traineeId: string;
  exerciseId: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [data, setData] = useState<EvaluationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Token d'accès manquant");
      setLoading(false);
      return;
    }
    fetch(
      `/api/formateur/sessions/${sessionId}/evaluations/${traineeId}/${exerciseId}?token=${encodeURIComponent(token)}`
    )
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => null);
          throw new Error(d?.error || "Erreur de chargement");
        }
        return r.json();
      })
      .then((d: EvaluationDetail) => setData(d))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sessionId, traineeId, exerciseId, token]);

  function patchCriterion(critId: string, patch: Partial<Pick<Criterion, "score" | "comment">>) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        criteria: prev.criteria.map((c) => (c.id === critId ? { ...c, ...patch } : c)),
      };
    });
  }

  async function save({ andReturn }: { andReturn: boolean }) {
    if (!data || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const r = await fetch(
        `/api/formateur/sessions/${sessionId}/evaluations/${traineeId}/${exerciseId}?token=${encodeURIComponent(token)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            globalNote: data.globalNote,
            observations: data.observations,
            scores: data.criteria.map((c) => ({
              criterionId: c.id,
              score: c.score,
              comment: c.comment,
            })),
          }),
        }
      );
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        setFeedback({ type: "error", msg: d?.error || "Échec de la sauvegarde" });
        return;
      }
      const d = await r.json();
      if (d.evaluation) setData(d.evaluation);
      setFeedback({ type: "success", msg: "Évaluation enregistrée" });
      if (andReturn) {
        setTimeout(() => {
          router.push(`/formateur/sessions/${sessionId}/evaluations?token=${encodeURIComponent(token)}`);
        }, 600);
      } else {
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch {
      setFeedback({ type: "error", msg: "Erreur réseau" });
    } finally {
      setSaving(false);
    }
  }

  // Auto-fill globalNote si tous les critères sont notés et homogènes ou si on
  // souhaite proposer une suggestion. Pour l'instant : on laisse le formateur
  // poser la note de synthèse.

  if (loading) {
    return <div className="text-center py-12 font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  }
  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="font-jetbrains text-sm" style={{ color: "#991b1b" }}>{error || "Évaluation indisponible"}</p>
        <Link
          href={`/formateur/sessions/${sessionId}/evaluations?token=${encodeURIComponent(token)}`}
          className="mt-4 inline-block underline text-sm"
          style={{ color: "#1f2244" }}
        >
          ← Retour à la matrice
        </Link>
      </div>
    );
  }

  const scoredCount = data.criteria.filter((c) => c.score !== "").length;

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link
          href={`/formateur/sessions/${sessionId}/evaluations?token=${encodeURIComponent(token)}`}
          className="text-xs font-jetbrains underline"
          style={{ color: "#727485" }}
        >
          ← Retour à la matrice
        </Link>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className="px-2 py-0.5 rounded text-xs font-jetbrains" style={{ backgroundColor: "#1f2244", color: "white" }}>
            Exercice {data.exercise.ordre}
          </span>
          <span className="text-sm font-jetbrains" style={{ color: "#727485" }}>
            {data.trainee.prenom} {data.trainee.nom}
          </span>
        </div>
        <h1 className="text-2xl font-bold mt-1" style={{ color: "#1f2244" }}>
          {data.exercise.titre}
        </h1>
        {data.exercise.description && (
          <p className="text-sm mt-2 font-jetbrains whitespace-pre-line" style={{ color: "#727485" }}>
            {data.exercise.description}
          </p>
        )}
        {data.evaluatedAt && (
          <p className="text-xs mt-2 font-jetbrains" style={{ color: "#9ca3af" }}>
            Dernière saisie : {new Date(data.evaluatedAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            {data.evaluatorName ? ` · par ${data.evaluatorName}` : ""}
          </p>
        )}
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

      {/* Critères */}
      <div className="space-y-3 mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "#1f2244" }}>
          Critères évalués ({scoredCount}/{data.criteria.length})
        </h2>
        {data.criteria.length === 0 ? (
          <p className="text-sm font-jetbrains italic" style={{ color: "#9ca3af" }}>
            Aucun critère défini pour cet exercice.
          </p>
        ) : (
          data.criteria.map((c) => (
            <div key={c.id} className="p-4 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-xs font-jetbrains" style={{ color: "#9ca3af" }}>{c.ordre}.</span>
                <p className="font-medium" style={{ color: "#1f2244" }}>{c.libelle}</p>
              </div>
              <div className="flex gap-2 flex-wrap mb-2">
                {SCORE_OPTIONS.map((opt) => {
                  const selected = c.score === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => patchCriterion(c.id, { score: selected ? "" : opt.value })}
                      className="text-xs px-3 py-1.5 rounded-full cursor-pointer border transition-all"
                      style={{
                        backgroundColor: selected ? opt.bg : "white",
                        color: selected ? opt.color : "#727485",
                        borderColor: selected ? opt.color : "#e5e7eb",
                        fontWeight: selected ? 600 : 400,
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                value={c.comment}
                onChange={(e) => patchCriterion(c.id, { comment: e.target.value })}
                placeholder="Commentaire (optionnel)"
                className="w-full text-xs font-jetbrains px-2 py-1 rounded border"
                style={{ borderColor: "#e5e7eb", color: "#1f2244" }}
              />
            </div>
          ))
        )}
      </div>

      {/* Note de synthèse + observations */}
      <div className="p-5 rounded-xl border mb-6" style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: "#1f2244" }}>
          Synthèse de l&apos;exercice
        </h2>
        <label className="block text-xs font-jetbrains mb-2" style={{ color: "#727485" }}>
          Note globale du formateur sur l&apos;exercice
        </label>
        <div className="flex gap-2 flex-wrap mb-4">
          {SCORE_OPTIONS.map((opt) => {
            const selected = data.globalNote === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() =>
                  setData((prev) => (prev ? { ...prev, globalNote: selected ? "" : opt.value } : prev))
                }
                className="text-sm px-4 py-2 rounded-full cursor-pointer border transition-all"
                style={{
                  backgroundColor: selected ? opt.bg : "white",
                  color: selected ? opt.color : "#727485",
                  borderColor: selected ? opt.color : "#e5e7eb",
                  fontWeight: selected ? 600 : 400,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <label className="block text-xs font-jetbrains mb-2" style={{ color: "#727485" }}>
          Observations du formateur (visibles dans le PDF de synthèse)
        </label>
        <textarea
          value={data.observations}
          onChange={(e) => setData((prev) => (prev ? { ...prev, observations: e.target.value } : prev))}
          placeholder="Points forts, difficultés rencontrées, suites pédagogiques proposées..."
          rows={4}
          className="w-full text-sm font-jetbrains px-3 py-2 rounded border resize-y"
          style={{ borderColor: "#e5e7eb", color: "#1f2244" }}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => save({ andReturn: false })}
          disabled={saving}
          className="text-sm px-5 py-2 rounded-full cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: "#7dcef5", color: "#1f2244" }}
        >
          {saving ? "Sauvegarde..." : "Enregistrer"}
        </button>
        <button
          onClick={() => save({ andReturn: true })}
          disabled={saving}
          className="text-sm px-5 py-2 rounded-full cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: "#1f2244", color: "white" }}
        >
          {saving ? "Sauvegarde..." : "Enregistrer & retour"}
        </button>
        <Link
          href={`/formateur/sessions/${sessionId}/evaluations?token=${encodeURIComponent(token)}`}
          className="text-sm px-5 py-2 rounded-full border cursor-pointer"
          style={{ borderColor: "#e5e7eb", color: "#727485" }}
        >
          Annuler
        </Link>
      </div>
    </div>
  );
}

export default function Page({
  params,
}: {
  params: Promise<{ id: string; traineeId: string; exerciseId: string }>;
}) {
  const { id, traineeId, exerciseId } = use(params);
  return (
    <Suspense fallback={<div className="py-12 text-center font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>}>
      <EvaluationFormInner sessionId={id} traineeId={traineeId} exerciseId={exerciseId} />
    </Suspense>
  );
}
