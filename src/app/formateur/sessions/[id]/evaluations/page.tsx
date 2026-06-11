"use client";

import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError, apiFetch, apiErrorMessage, isAbortError } from "@/lib/api-client";

interface ExerciseLite {
  id: string;
  titre: string;
  ordre: number;
  totalCriteria: number;
}

interface TraineeLite {
  id: string;
  prenom: string;
  nom: string;
}

interface MatrixCell {
  traineeId: string;
  exerciseId: string;
  status: "empty" | "partial" | "complete";
  globalNote: string;
  scoredCount: number;
  totalCriteria: number;
}

interface MatrixData {
  exercises: ExerciseLite[];
  trainees: TraineeLite[];
  cells: MatrixCell[];
}

function statusChip(cell: MatrixCell) {
  if (cell.status === "empty") {
    return { bg: "#f3f4f6", color: "#9ca3af", label: "—" };
  }
  if (cell.status === "complete") {
    if (cell.globalNote === "acquis") return { bg: "#dcfce7", color: "#166534", label: "Acquis" };
    if (cell.globalNote === "en_cours") return { bg: "#fef3c7", color: "#92400e", label: "En cours" };
    if (cell.globalNote === "non_acquis") return { bg: "#fee2e2", color: "#991b1b", label: "Non acquis" };
    return { bg: "#dcfce7", color: "#166534", label: "Complet" };
  }
  // partial
  return {
    bg: "#dbeafe",
    color: "#1e40af",
    label: `${cell.scoredCount}/${cell.totalCriteria}`,
  };
}

function EvaluationsMatrixInner({ id }: { id: string }) {
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Exercices repliés : on stocke leur id dans un Set, persisté en localStorage
  // par session pour conserver le choix entre navigations.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const collapseKey = `eval-matrix-collapsed-${id}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(collapseKey);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setCollapsed(new Set(arr));
      }
    } catch {
      // ignore parse errors
    }
  }, [collapseKey]);

  function persistCollapsed(next: Set<string>) {
    setCollapsed(next);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(collapseKey, JSON.stringify([...next]));
      } catch {
        // ignore quota errors
      }
    }
  }

  function toggleCollapse(exId: string) {
    const next = new Set(collapsed);
    if (next.has(exId)) next.delete(exId);
    else next.add(exId);
    persistCollapsed(next);
  }

  function collapseAll() {
    if (!data) return;
    persistCollapsed(new Set(data.exercises.map((e) => e.id)));
  }

  function expandAll() {
    persistCollapsed(new Set());
  }

  function focusOn(exId: string) {
    if (!data) return;
    const next = new Set(data.exercises.map((e) => e.id).filter((id) => id !== exId));
    persistCollapsed(next);
  }

  useEffect(() => {
    if (!token) {
      setError("Token d'accès manquant dans l'URL");
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    apiFetch<MatrixData>(`/api/formateur/sessions/${id}/evaluations?token=${encodeURIComponent(token)}`, {
      signal: ac.signal,
    })
      .then(setData)
      .catch((err) => {
        if (isAbortError(err)) return;
        setError(apiErrorMessage(err, "Erreur de chargement"));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [id, token]);

  if (loading) {
    return <div className="text-center py-12 font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  }
  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="font-jetbrains text-sm" style={{ color: "#991b1b" }}>{error || "Données indisponibles"}</p>
        <Link
          href={`/formateur/sessions/${id}?token=${encodeURIComponent(token)}`}
          className="mt-4 inline-block underline text-sm"
          style={{ color: "#1f2244" }}
        >
          ← Retour à la session
        </Link>
      </div>
    );
  }

  if (data.exercises.length === 0) {
    return (
      <div>
        <Header sessionId={id} token={token} />
        <div className="text-center py-12 border rounded-xl font-jetbrains text-sm" style={{ borderColor: "#e5e7eb", color: "#727485" }}>
          Aucune grille d&apos;évaluation pratique n&apos;a été configurée pour cette formation.
          <br />
          Demande à l&apos;administrateur de la définir dans <code>/admin/formations</code> → « Grille éval ».
        </div>
      </div>
    );
  }

  if (data.trainees.length === 0) {
    return (
      <div>
        <Header sessionId={id} token={token} />
        <div className="text-center py-12 border rounded-xl font-jetbrains text-sm" style={{ borderColor: "#e5e7eb", color: "#727485" }}>
          Aucun stagiaire inscrit dans cette session.
        </div>
      </div>
    );
  }

  // Lookup cell
  const cellMap = new Map<string, MatrixCell>();
  for (const c of data.cells) {
    cellMap.set(`${c.traineeId}::${c.exerciseId}`, c);
  }

  return (
    <div>
      <Header sessionId={id} token={token} />

      <div className="mb-4 p-3 rounded-lg text-xs font-jetbrains" style={{ backgroundColor: "#fafbff", color: "#727485" }}>
        Clique sur une cellule pour évaluer un stagiaire sur un exercice. La couleur indique le résultat final saisi
        (<span className="px-1.5 py-0.5 rounded" style={{ backgroundColor: "#dcfce7", color: "#166534" }}>Acquis</span> /
        <span className="px-1.5 py-0.5 rounded ml-1" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>En cours</span> /
        <span className="px-1.5 py-0.5 rounded ml-1" style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}>Non acquis</span>),
        bleu si l&apos;évaluation est partielle, gris si rien n&apos;a été saisi.
        Tu peux <strong>replier/déplier</strong> chaque colonne d&apos;exercice en cliquant sur son en-tête.
      </div>

      {/* Barre de contrôle pli/dépli */}
      <div className="mb-3 flex items-center gap-2 flex-wrap text-xs font-jetbrains">
        <span style={{ color: "#727485" }}>Vue :</span>
        <button
          onClick={expandAll}
          disabled={collapsed.size === 0}
          className="px-3 py-1 rounded-full cursor-pointer disabled:opacity-40"
          style={{ backgroundColor: "#f3f4f6", color: "#1f2244" }}
        >
          Tout déplier
        </button>
        <button
          onClick={collapseAll}
          disabled={collapsed.size === data.exercises.length}
          className="px-3 py-1 rounded-full cursor-pointer disabled:opacity-40"
          style={{ backgroundColor: "#f3f4f6", color: "#1f2244" }}
        >
          Tout replier
        </button>
        <span style={{ color: "#9ca3af" }}>·</span>
        <span style={{ color: "#727485" }}>Focus :</span>
        {data.exercises.map((ex) => {
          const isFocused = collapsed.size === data.exercises.length - 1 && !collapsed.has(ex.id);
          return (
            <button
              key={ex.id}
              onClick={() => focusOn(ex.id)}
              className="px-3 py-1 rounded-full cursor-pointer transition-all"
              style={{
                backgroundColor: isFocused ? "#1f2244" : "#f3f4f6",
                color: isFocused ? "white" : "#1f2244",
                fontWeight: isFocused ? 600 : 400,
              }}
              title={ex.titre}
            >
              Ex. {ex.ordre}
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto border rounded-xl" style={{ borderColor: "#e5e7eb" }}>
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: "#f9fafb" }}>
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "#727485" }}>
                Stagiaire
              </th>
              {data.exercises.map((ex) => {
                const isCollapsed = collapsed.has(ex.id);
                return (
                  <th
                    key={ex.id}
                    onClick={() => toggleCollapse(ex.id)}
                    className="text-left px-2 py-2 text-xs font-semibold tracking-wide cursor-pointer select-none hover:bg-gray-100 transition-colors"
                    style={{
                      color: "#1f2244",
                      minWidth: isCollapsed ? "44px" : "140px",
                      maxWidth: isCollapsed ? "44px" : undefined,
                      width: isCollapsed ? "44px" : undefined,
                    }}
                    title={isCollapsed ? `Déplier : ${ex.titre}` : `Replier : ${ex.titre}`}
                  >
                    {isCollapsed ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs font-jetbrains" style={{ color: "#727485" }}>▶</span>
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-jetbrains"
                          style={{ backgroundColor: "#1f2244", color: "white" }}
                        >
                          {ex.ordre}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-start gap-1">
                        <span className="text-xs font-jetbrains mt-0.5" style={{ color: "#727485" }}>▼</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-jetbrains text-[10px]" style={{ color: "#727485" }}>
                            Exercice {ex.ordre} · {ex.totalCriteria} critère{ex.totalCriteria > 1 ? "s" : ""}
                          </div>
                          <div className="font-semibold text-xs" style={{ color: "#1f2244" }}>
                            {ex.titre}
                          </div>
                        </div>
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.trainees.map((tr) => (
              <tr key={tr.id} className="border-t" style={{ borderColor: "#e5e7eb" }}>
                <td className="px-3 py-2" style={{ color: "#1f2244" }}>
                  <div className="font-medium">
                    {tr.prenom} {tr.nom}
                  </div>
                  <TraineeGlobalActions sessionId={id} traineeId={tr.id} token={token} />
                </td>
                {data.exercises.map((ex) => {
                  const cell = cellMap.get(`${tr.id}::${ex.id}`);
                  if (!cell) return <td key={ex.id} className="px-3 py-2" />;
                  const chip = statusChip(cell);
                  const isCollapsed = collapsed.has(ex.id);
                  if (isCollapsed) {
                    return (
                      <td key={ex.id} className="px-1 py-2">
                        <Link
                          href={`/formateur/sessions/${id}/evaluations/${tr.id}/${ex.id}?token=${encodeURIComponent(token)}`}
                          className="block mx-auto rounded-full cursor-pointer hover:opacity-80"
                          style={{
                            backgroundColor: chip.bg,
                            width: "14px",
                            height: "14px",
                          }}
                          title={`${chip.label} — ${ex.titre}`}
                          aria-label={`${chip.label} — ${ex.titre}`}
                        />
                      </td>
                    );
                  }
                  return (
                    <td key={ex.id} className="px-2 py-2">
                      <Link
                        href={`/formateur/sessions/${id}/evaluations/${tr.id}/${ex.id}?token=${encodeURIComponent(token)}`}
                        className="block text-center px-3 py-1.5 rounded-full text-xs font-jetbrains cursor-pointer hover:opacity-80"
                        style={{ backgroundColor: chip.bg, color: chip.color }}
                      >
                        {chip.label}
                      </Link>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Header({ sessionId, token }: { sessionId: string; token: string }) {
  return (
    <div className="mb-6">
      <Link
        href={`/formateur/sessions/${sessionId}?token=${encodeURIComponent(token)}`}
        className="text-xs font-jetbrains underline"
        style={{ color: "#727485" }}
      >
        ← Retour à la session
      </Link>
      <h1 className="text-3xl font-bold mt-2" style={{ color: "#1f2244" }}>
        Évaluations pratiques
      </h1>
    </div>
  );
}

// Boutons d'actions globales par stagiaire (sur la matrice) : aperçu du PDF
// global et archivage dans 03_EVALUATIONS/<Stagiaire>/ sur Drive.
function TraineeGlobalActions({
  sessionId,
  traineeId,
  token,
}: {
  sessionId: string;
  traineeId: string;
  token: string;
}) {
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [driveUrl, setDriveUrl] = useState<string | null>(null);

  async function syncGlobal() {
    if (syncing) return;
    setSyncing(true);
    setStatus(null);
    try {
      const d = await apiFetch<{ success?: boolean; error?: string; driveWebUrl?: string | null } | null>(
        `/api/formateur/sessions/${sessionId}/evaluations/${traineeId}/global-pdf?token=${encodeURIComponent(token)}`,
        { method: "POST" }
      );
      if (!d?.success) {
        setStatus({ type: "error", msg: d?.error || "Échec de l'archivage" });
        return;
      }
      setDriveUrl(d.driveWebUrl ?? null);
      setStatus({ type: "success", msg: "Synthèse archivée dans Drive" });
    } catch (err) {
      if (err instanceof ApiError && err.status !== null) {
        setStatus({ type: "error", msg: apiErrorMessage(err, "Échec de l'archivage") });
      } else {
        setStatus({ type: "error", msg: "Erreur réseau" });
      }
    } finally {
      setSyncing(false);
      setTimeout(() => setStatus(null), 6000);
    }
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <a
        href={`/api/formateur/sessions/${sessionId}/evaluations/${traineeId}/global-pdf?token=${encodeURIComponent(token)}`}
        target="_blank"
        rel="noreferrer"
        className="text-[10px] font-jetbrains px-2 py-0.5 rounded-full border cursor-pointer hover:bg-gray-50"
        style={{ borderColor: "#e5e7eb", color: "#1f2244" }}
        title="Aperçu PDF complet de tous les exercices de ce stagiaire"
      >
        📄 Synthèse PDF
      </a>
      <button
        onClick={syncGlobal}
        disabled={syncing}
        className="text-[10px] font-jetbrains px-2 py-0.5 rounded-full cursor-pointer disabled:opacity-50"
        style={{ backgroundColor: "#7dcef5", color: "#1f2244" }}
        title="Génère et archive le PDF dans 03_EVALUATIONS sur Drive"
      >
        {syncing ? "..." : "↑ Drive"}
      </button>
      {driveUrl && (
        <a
          href={driveUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] font-jetbrains px-2 py-0.5 rounded-full border cursor-pointer"
          style={{ borderColor: "#166534", color: "#166534", backgroundColor: "#dcfce7" }}
        >
          ✓ Drive ↗
        </a>
      )}
      {status && (
        <span
          className={`text-[10px] font-jetbrains px-2 py-0.5 rounded ${
            status.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {status.msg}
        </span>
      )}
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="min-h-screen py-10 px-4" style={{ backgroundColor: "#f8fafc" }}>
      <div className="max-w-6xl mx-auto">
        <Suspense fallback={<div className="py-12 text-center font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>}>
          <EvaluationsMatrixInner id={id} />
        </Suspense>
      </div>
    </div>
  );
}
