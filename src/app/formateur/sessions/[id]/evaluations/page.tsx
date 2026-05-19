"use client";

import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

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

  useEffect(() => {
    if (!token) {
      setError("Token d'accès manquant dans l'URL");
      setLoading(false);
      return;
    }
    fetch(`/api/formateur/sessions/${id}/evaluations?token=${encodeURIComponent(token)}`)
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
      </div>

      <div className="overflow-x-auto border rounded-xl" style={{ borderColor: "#e5e7eb" }}>
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: "#f9fafb" }}>
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "#727485" }}>
                Stagiaire
              </th>
              {data.exercises.map((ex) => (
                <th
                  key={ex.id}
                  className="text-left px-3 py-2 text-xs font-semibold tracking-wide"
                  style={{ color: "#1f2244", minWidth: "140px" }}
                  title={ex.titre}
                >
                  <div className="font-jetbrains text-[10px]" style={{ color: "#727485" }}>
                    Exercice {ex.ordre} · {ex.totalCriteria} critère{ex.totalCriteria > 1 ? "s" : ""}
                  </div>
                  <div className="font-semibold text-xs" style={{ color: "#1f2244" }}>
                    {ex.titre}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.trainees.map((tr) => (
              <tr key={tr.id} className="border-t" style={{ borderColor: "#e5e7eb" }}>
                <td className="px-3 py-2 font-medium" style={{ color: "#1f2244" }}>
                  {tr.prenom} {tr.nom}
                </td>
                {data.exercises.map((ex) => {
                  const cell = cellMap.get(`${tr.id}::${ex.id}`);
                  if (!cell) return <td key={ex.id} className="px-3 py-2" />;
                  const chip = statusChip(cell);
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

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<div className="py-12 text-center font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>}>
      <EvaluationsMatrixInner id={id} />
    </Suspense>
  );
}
