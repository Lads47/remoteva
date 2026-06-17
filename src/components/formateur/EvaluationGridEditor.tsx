"use client";

// Éditeur de grille d'évaluation (exercices + critères) partagé par le portail
// formateur. Le périmètre est la FORMATION : la grille s'applique à toutes les
// sessions de la formation. Les appels API passent par /api/formateur/formations/*.
//
// Utilisé par :
//   - /formateur/sessions/[id]/evaluation-grid (formationId résolu via la session)
//   - /formateur/formations/[id]/evaluation-grid (formationId direct)

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, apiFetch, apiErrorMessage } from "@/lib/api-client";

interface Criterion {
  id: string;
  exerciseId: string;
  ordre: number;
  libelle: string;
}

interface Exercise {
  id: string;
  formationId: string;
  ordre: number;
  titre: string;
  description: string;
  active: boolean;
  criteria: Criterion[];
  createdAt: string;
  updatedAt: string;
}

export default function EvaluationGridEditor({
  formationId,
  token,
  backHref,
  backLabel,
}: {
  formationId: string;
  token: string;
  backHref: string;
  backLabel: string;
}) {
  const [formation, setFormation] = useState<{ code: string; nomLong: string } | null>(null);
  const [shared, setShared] = useState(false);
  const [otherTrainers, setOtherTrainers] = useState<string[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [newExerciseTitle, setNewExerciseTitle] = useState("");
  const [addingExercise, setAddingExercise] = useState(false);

  const flash = useCallback((type: "success" | "error", msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  }, []);

  const refreshGrid = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const d = await apiFetch<{
          exercises?: Exercise[];
          formation?: { code: string; nomLong: string } | null;
          shared?: boolean;
          otherTrainers?: string[];
        }>(`/api/formateur/formations/${formationId}/exercises?token=${encodeURIComponent(token)}`, { signal });
        setExercises(d.exercises || []);
        setFormation(d.formation || null);
        setShared(Boolean(d.shared));
        setOtherTrainers(d.otherTrainers || []);
      } catch (err) {
        if (err instanceof ApiError && err.status !== null) {
          setError("Accès refusé ou erreur de chargement");
          return;
        }
        throw err;
      }
    },
    [formationId, token]
  );

  useEffect(() => {
    if (!token) {
      setError("Token manquant");
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    refreshGrid(ac.signal).finally(() => setLoading(false));
    return () => ac.abort();
  }, [token, refreshGrid]);

  async function addExercise() {
    const titre = newExerciseTitle.trim();
    if (!titre) return;
    setAddingExercise(true);
    try {
      await apiFetch(`/api/formateur/formations/${formationId}/exercises?token=${encodeURIComponent(token)}`, {
        method: "POST",
        body: { titre },
      });
      setNewExerciseTitle("");
      await refreshGrid();
      flash("success", "Exercice ajouté");
    } catch (err) {
      flash("error", apiErrorMessage(err, "Impossible de créer l'exercice"));
    } finally {
      setAddingExercise(false);
    }
  }

  async function updateExerciseField(exId: string, patch: Partial<Pick<Exercise, "titre" | "description" | "active">>) {
    try {
      await apiFetch(`/api/formateur/exercises/${exId}?token=${encodeURIComponent(token)}`, {
        method: "PUT",
        body: patch,
      });
    } catch {
      flash("error", "Échec mise à jour");
      return;
    }
    setExercises((prev) => prev.map((e) => (e.id === exId ? { ...e, ...patch } : e)));
  }

  async function deleteExerciseConfirmed(exId: string) {
    if (!confirm("Supprimer cet exercice et tous ses critères ? Les évaluations déjà saisies seront aussi perdues.")) return;
    try {
      await apiFetch(`/api/formateur/exercises/${exId}?token=${encodeURIComponent(token)}`, { method: "DELETE" });
    } catch {
      flash("error", "Échec suppression");
      return;
    }
    await refreshGrid();
    flash("success", "Exercice supprimé");
  }

  async function addCriterion(exId: string, libelle: string) {
    const l = libelle.trim();
    if (!l) return;
    try {
      await apiFetch(`/api/formateur/exercises/${exId}/criteria?token=${encodeURIComponent(token)}`, {
        method: "POST",
        body: { libelle: l },
      });
    } catch {
      flash("error", "Impossible d'ajouter le critère");
      return;
    }
    await refreshGrid();
  }

  async function updateCriterionLibelle(criterionId: string, libelle: string) {
    try {
      await apiFetch(`/api/formateur/criteria/${criterionId}?token=${encodeURIComponent(token)}`, {
        method: "PUT",
        body: { libelle },
      });
    } catch {
      flash("error", "Échec mise à jour critère");
      return;
    }
    setExercises((prev) =>
      prev.map((e) => ({
        ...e,
        criteria: e.criteria.map((c) => (c.id === criterionId ? { ...c, libelle } : c)),
      }))
    );
  }

  async function deleteCriterionConfirmed(criterionId: string) {
    if (!confirm("Supprimer ce critère ?")) return;
    try {
      await apiFetch(`/api/formateur/criteria/${criterionId}?token=${encodeURIComponent(token)}`, { method: "DELETE" });
    } catch {
      flash("error", "Échec suppression");
      return;
    }
    await refreshGrid();
  }

  if (loading) {
    return <div className="text-center py-12 font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  }
  if (error) {
    return (
      <div className="text-center py-12">
        <p className="font-jetbrains text-sm" style={{ color: "#991b1b" }}>{error}</p>
        <Link href={backHref} className="mt-4 inline-block underline text-sm" style={{ color: "#1f2244" }}>
          ← {backLabel}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link href={backHref} className="text-xs font-jetbrains underline" style={{ color: "#727485" }}>
        ← {backLabel}
      </Link>

      <div className="mt-2 mb-4">
        {formation && (
          <span className="px-2 py-0.5 rounded text-xs font-jetbrains" style={{ backgroundColor: "#1f2244", color: "white" }}>
            {formation.code}
          </span>
        )}
        <h1 className="text-2xl font-bold mt-2" style={{ color: "#1f2244" }}>
          Grille d&apos;évaluation pratique
        </h1>
        {formation && (
          <p className="text-sm mt-1 font-jetbrains" style={{ color: "#727485" }}>{formation.nomLong}</p>
        )}
      </div>

      {/* Avertissement formation partagée */}
      {shared && (
        <div className="mb-4 p-3 rounded-lg text-sm font-jetbrains" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
          ⚠️ Cette grille est partagée avec d&apos;autres formateurs intervenant sur la même formation
          {otherTrainers.length > 0 ? ` (${otherTrainers.join(", ")})` : ""}. Vos modifications
          s&apos;appliqueront aussi à leurs sessions.
        </div>
      )}

      {/* Note Qualiopi */}
      <div className="mb-4 p-3 rounded-lg text-xs font-jetbrains" style={{ backgroundColor: "#fafbff", color: "#727485" }}>
        Configure les exercices pratiques et leurs critères. Chaque stagiaire sera noté sur l&apos;échelle
        <span className="mx-1 px-1.5 py-0.5 rounded bg-green-50 text-green-800">Acquis</span>/
        <span className="mx-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800">En cours</span>/
        <span className="mx-1 px-1.5 py-0.5 rounded bg-red-50 text-red-800">Non acquis</span>.
        L&apos;organisme de formation est notifié de chaque modification.
      </div>

      {feedback && (
        <div className={`mb-4 p-3 rounded-lg text-sm font-jetbrains ${feedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {feedback.msg}
        </div>
      )}

      <div className="space-y-4">
        {exercises.length === 0 ? (
          <div className="text-center py-10 border rounded-xl font-jetbrains text-sm" style={{ borderColor: "#e5e7eb", color: "#727485" }}>
            Aucun exercice configuré. Ajoute le premier ci-dessous.
          </div>
        ) : (
          exercises.map((ex) => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              onUpdate={(patch) => updateExerciseField(ex.id, patch)}
              onDelete={() => deleteExerciseConfirmed(ex.id)}
              onAddCriterion={(libelle) => addCriterion(ex.id, libelle)}
              onUpdateCriterion={(critId, libelle) => updateCriterionLibelle(critId, libelle)}
              onDeleteCriterion={(critId) => deleteCriterionConfirmed(critId)}
            />
          ))
        )}
      </div>

      <div className="mt-6 p-4 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}>
        <h3 className="text-sm font-semibold mb-2" style={{ color: "#1f2244" }}>Ajouter un exercice</h3>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={newExerciseTitle}
            onChange={(e) => setNewExerciseTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addExercise();
              }
            }}
            placeholder='Ex : "Création d&apos;un agent IA"'
            className="flex-1 min-w-[260px] px-3 py-2 rounded-lg border text-sm font-jetbrains"
            style={{ borderColor: "#e5e7eb", color: "#1f2244" }}
          />
          <button
            onClick={addExercise}
            disabled={!newExerciseTitle.trim() || addingExercise}
            className="text-sm px-4 py-2 rounded-full cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: "#1f2244", color: "white" }}
          >
            {addingExercise ? "Ajout..." : "+ Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExerciseCard({
  exercise,
  onUpdate,
  onDelete,
  onAddCriterion,
  onUpdateCriterion,
  onDeleteCriterion,
}: {
  exercise: Exercise;
  onUpdate: (patch: Partial<Pick<Exercise, "titre" | "description" | "active">>) => void;
  onDelete: () => void;
  onAddCriterion: (libelle: string) => void;
  onUpdateCriterion: (critId: string, libelle: string) => void;
  onDeleteCriterion: (critId: string) => void;
}) {
  const [localTitle, setLocalTitle] = useState(exercise.titre);
  const [localDesc, setLocalDesc] = useState(exercise.description);
  const [newCriterion, setNewCriterion] = useState("");

  useEffect(() => {
    setLocalTitle(exercise.titre);
    setLocalDesc(exercise.description);
  }, [exercise.titre, exercise.description]);

  return (
    <div className="p-5 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-1">
          <span className="text-xs font-jetbrains px-2 py-0.5 rounded" style={{ backgroundColor: "#1f2244", color: "white" }}>
            Exercice {exercise.ordre}
          </span>
          <input
            type="text"
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={() => {
              if (localTitle !== exercise.titre && localTitle.trim()) onUpdate({ titre: localTitle.trim() });
            }}
            placeholder="Titre de l'exercice"
            className="mt-2 w-full text-lg font-semibold px-2 py-1 -mx-2 rounded hover:bg-gray-50 focus:bg-gray-50 outline-none"
            style={{ color: "#1f2244" }}
          />
          <textarea
            value={localDesc}
            onChange={(e) => setLocalDesc(e.target.value)}
            onBlur={() => {
              if (localDesc !== exercise.description) onUpdate({ description: localDesc });
            }}
            placeholder="Description / énoncé / contexte de l'exercice"
            className="mt-1 w-full text-sm font-jetbrains px-2 py-1 -mx-2 rounded hover:bg-gray-50 focus:bg-gray-50 outline-none resize-y"
            style={{ color: "#727485", minHeight: "6rem" }}
            rows={4}
          />
        </div>
        <button
          onClick={onDelete}
          className="text-xs px-2 py-1 rounded cursor-pointer"
          style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
          title="Supprimer cet exercice"
        >
          ×
        </button>
      </div>

      <div className="pl-4 border-l-2" style={{ borderColor: "#e5e7eb" }}>
        <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#727485" }}>
          Critères évalués ({exercise.criteria.length})
        </h4>
        {exercise.criteria.length === 0 ? (
          <p className="text-xs font-jetbrains italic mb-2" style={{ color: "#9ca3af" }}>
            Aucun critère. Ajoute le premier ci-dessous.
          </p>
        ) : (
          <ul className="space-y-1 mb-2">
            {exercise.criteria.map((c) => (
              <CriterionRow
                key={c.id}
                criterion={c}
                onUpdate={(libelle) => onUpdateCriterion(c.id, libelle)}
                onDelete={() => onDeleteCriterion(c.id)}
              />
            ))}
          </ul>
        )}
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            value={newCriterion}
            onChange={(e) => setNewCriterion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAddCriterion(newCriterion);
                setNewCriterion("");
              }
            }}
            placeholder='Ex : "Identifier un cas d&apos;usage pertinent"'
            className="flex-1 min-w-[220px] px-2 py-1 rounded border text-xs font-jetbrains"
            style={{ borderColor: "#e5e7eb", color: "#1f2244" }}
          />
          <button
            onClick={() => {
              onAddCriterion(newCriterion);
              setNewCriterion("");
            }}
            disabled={!newCriterion.trim()}
            className="text-xs px-3 py-1 rounded-full cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: "#7dcef5", color: "#1f2244" }}
          >
            + Critère
          </button>
        </div>
      </div>
    </div>
  );
}

function CriterionRow({
  criterion,
  onUpdate,
  onDelete,
}: {
  criterion: Criterion;
  onUpdate: (libelle: string) => void;
  onDelete: () => void;
}) {
  const [val, setVal] = useState(criterion.libelle);
  useEffect(() => setVal(criterion.libelle), [criterion.libelle]);

  return (
    <li className="flex items-center gap-1 group">
      <span className="text-xs font-jetbrains" style={{ color: "#9ca3af" }}>{criterion.ordre}.</span>
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          if (val !== criterion.libelle && val.trim()) onUpdate(val.trim());
        }}
        className="flex-1 px-2 py-1 rounded text-sm font-jetbrains hover:bg-gray-50 focus:bg-gray-50 outline-none"
        style={{ color: "#1f2244" }}
      />
      <button
        onClick={onDelete}
        className="text-xs px-2 rounded cursor-pointer opacity-50 group-hover:opacity-100"
        style={{ color: "#991b1b" }}
        title="Supprimer ce critère"
      >
        ×
      </button>
    </li>
  );
}
