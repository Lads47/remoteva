"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface FormationLite {
  id: string;
  code: string;
  nomLong: string;
}

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

export default function EvaluationGridEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [formation, setFormation] = useState<FormationLite | null>(null);
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

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/formations/${id}/exercises`);
      if (!r.ok) {
        setError("Erreur de chargement");
        return;
      }
      const d = await r.json();
      setExercises(d.exercises || []);
    } catch {
      setError("Erreur réseau");
    }
  }, [id]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/formations`).then((r) => r.json()),
      fetch(`/api/admin/formations/${id}/exercises`).then((r) => r.json()),
    ])
      .then(([fs, ex]) => {
        const found = (fs.formations || []).find((f: FormationLite) => f.id === id);
        if (!found) {
          setError("Formation introuvable");
          return;
        }
        setFormation(found);
        setExercises(ex.exercises || []);
      })
      .catch(() => setError("Erreur de chargement"))
      .finally(() => setLoading(false));
  }, [id]);

  async function addExercise() {
    const titre = newExerciseTitle.trim();
    if (!titre) return;
    setAddingExercise(true);
    try {
      const r = await fetch(`/api/admin/formations/${id}/exercises`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titre }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        flash("error", d?.error || "Impossible de créer l'exercice");
        return;
      }
      setNewExerciseTitle("");
      await refresh();
      flash("success", "Exercice ajouté");
    } finally {
      setAddingExercise(false);
    }
  }

  async function updateExerciseField(exId: string, patch: Partial<Pick<Exercise, "titre" | "description" | "active">>) {
    try {
      const r = await fetch(`/api/admin/exercises/${exId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) {
        flash("error", "Échec mise à jour");
        return;
      }
      // Pas de refresh global : on patche en local pour éviter le flicker
      setExercises((prev) => prev.map((e) => (e.id === exId ? { ...e, ...patch } : e)));
    } catch {
      flash("error", "Erreur réseau");
    }
  }

  async function deleteExerciseConfirmed(exId: string) {
    if (!confirm("Supprimer cet exercice et tous ses critères ? Les évaluations déjà saisies seront aussi perdues.")) return;
    try {
      const r = await fetch(`/api/admin/exercises/${exId}`, { method: "DELETE" });
      if (!r.ok) {
        flash("error", "Échec suppression");
        return;
      }
      await refresh();
      flash("success", "Exercice supprimé");
    } catch {
      flash("error", "Erreur réseau");
    }
  }

  async function moveExercise(exId: string, direction: -1 | 1) {
    const idx = exercises.findIndex((e) => e.id === exId);
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= exercises.length) return;
    const reordered = [...exercises];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(newIdx, 0, moved);
    setExercises(reordered);
    try {
      await fetch(`/api/admin/formations/${id}/exercises`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: reordered.map((e) => e.id) }),
      });
    } catch {
      flash("error", "Échec du réordonnancement");
      refresh();
    }
  }

  async function addCriterion(exId: string, libelle: string) {
    const l = libelle.trim();
    if (!l) return;
    try {
      const r = await fetch(`/api/admin/exercises/${exId}/criteria`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ libelle: l }),
      });
      if (!r.ok) {
        flash("error", "Impossible d'ajouter le critère");
        return;
      }
      await refresh();
    } catch {
      flash("error", "Erreur réseau");
    }
  }

  async function updateCriterionLibelle(criterionId: string, libelle: string) {
    try {
      const r = await fetch(`/api/admin/criteria/${criterionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ libelle }),
      });
      if (!r.ok) {
        flash("error", "Échec mise à jour critère");
        return;
      }
      setExercises((prev) =>
        prev.map((e) => ({
          ...e,
          criteria: e.criteria.map((c) => (c.id === criterionId ? { ...c, libelle } : c)),
        }))
      );
    } catch {
      flash("error", "Erreur réseau");
    }
  }

  async function deleteCriterion(criterionId: string) {
    if (!confirm("Supprimer ce critère ?")) return;
    try {
      const r = await fetch(`/api/admin/criteria/${criterionId}`, { method: "DELETE" });
      if (!r.ok) {
        flash("error", "Échec suppression");
        return;
      }
      await refresh();
    } catch {
      flash("error", "Erreur réseau");
    }
  }

  async function moveCriterion(exId: string, criterionId: string, direction: -1 | 1) {
    const ex = exercises.find((e) => e.id === exId);
    if (!ex) return;
    const idx = ex.criteria.findIndex((c) => c.id === criterionId);
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= ex.criteria.length) return;
    const reordered = [...ex.criteria];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(newIdx, 0, moved);
    setExercises((prev) => prev.map((e) => (e.id === exId ? { ...e, criteria: reordered } : e)));
    try {
      await fetch(`/api/admin/exercises/${exId}/criteria`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: reordered.map((c) => c.id) }),
      });
    } catch {
      flash("error", "Échec réordonnancement");
      refresh();
    }
  }

  if (loading) {
    return <div className="text-center py-12 font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  }
  if (error || !formation) {
    return (
      <div className="text-center py-12">
        <p className="font-jetbrains text-sm" style={{ color: "#727485" }}>{error || "Formation introuvable"}</p>
        <Link href="/admin/formations/catalogue" className="mt-4 inline-block underline text-sm" style={{ color: "#1f2244" }}>
          ← Catalogue
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin/formations/catalogue" className="text-xs font-jetbrains underline" style={{ color: "#727485" }}>
          ← Catalogue
        </Link>
        <div className="flex items-center gap-3 flex-wrap mt-2">
          <span className="px-2 py-0.5 rounded text-xs font-jetbrains" style={{ backgroundColor: "#1f2244", color: "white" }}>
            {formation.code}
          </span>
        </div>
        <h1 className="text-3xl font-bold mt-1" style={{ color: "#1f2244" }}>
          Grille d&apos;évaluation pratique
        </h1>
        <p className="text-sm mt-1 font-jetbrains" style={{ color: "#727485" }}>
          {formation.nomLong}
        </p>
      </div>

      <div className="mb-6 p-4 rounded-xl text-xs font-jetbrains" style={{ backgroundColor: "#fafbff", color: "#727485" }}>
        Configure ici les <strong style={{ color: "#1f2244" }}>exercices pratiques</strong> évalués pendant la formation,
        et pour chaque exercice les <strong style={{ color: "#1f2244" }}>critères</strong> que le formateur notera.
        Pendant la session, chaque stagiaire sera noté sur chaque critère selon l&apos;échelle
        <span className="mx-1 px-1.5 py-0.5 rounded bg-green-50 text-green-800">Acquis</span>
        /
        <span className="mx-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800">En cours</span>
        /
        <span className="mx-1 px-1.5 py-0.5 rounded bg-red-50 text-red-800">Non acquis</span>.
        Un PDF de synthèse par stagiaire sera archivé dans <code>03_EVALUATIONS</code> du dossier Drive de la session.
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

      {/* Liste exercices */}
      <div className="space-y-4">
        {exercises.length === 0 ? (
          <div className="text-center py-10 border rounded-xl font-jetbrains text-sm" style={{ borderColor: "#e5e7eb", color: "#727485" }}>
            Aucun exercice configuré. Ajoute le premier ci-dessous.
          </div>
        ) : (
          exercises.map((ex, idx) => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              isFirst={idx === 0}
              isLast={idx === exercises.length - 1}
              onUpdate={(patch) => updateExerciseField(ex.id, patch)}
              onDelete={() => deleteExerciseConfirmed(ex.id)}
              onMove={(d) => moveExercise(ex.id, d)}
              onAddCriterion={(libelle) => addCriterion(ex.id, libelle)}
              onUpdateCriterion={(critId, libelle) => updateCriterionLibelle(critId, libelle)}
              onDeleteCriterion={(critId) => deleteCriterion(critId)}
              onMoveCriterion={(critId, d) => moveCriterion(ex.id, critId, d)}
            />
          ))
        )}
      </div>

      {/* Ajout exercice */}
      <div className="mt-6 p-4 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}>
        <h3 className="text-sm font-semibold mb-2" style={{ color: "#1f2244" }}>
          Ajouter un exercice
        </h3>
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
            placeholder='Ex : "Captation multicaméra live"'
            className="flex-1 min-w-[280px] px-3 py-2 rounded-lg border text-sm font-jetbrains"
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
  isFirst,
  isLast,
  onUpdate,
  onDelete,
  onMove,
  onAddCriterion,
  onUpdateCriterion,
  onDeleteCriterion,
  onMoveCriterion,
}: {
  exercise: Exercise;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (patch: Partial<Pick<Exercise, "titre" | "description" | "active">>) => void;
  onDelete: () => void;
  onMove: (d: -1 | 1) => void;
  onAddCriterion: (libelle: string) => void;
  onUpdateCriterion: (critId: string, libelle: string) => void;
  onDeleteCriterion: (critId: string) => void;
  onMoveCriterion: (critId: string, d: -1 | 1) => void;
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
        <div className="flex flex-col gap-1">
          <button
            onClick={() => onMove(-1)}
            disabled={isFirst}
            className="text-xs px-2 py-1 rounded cursor-pointer disabled:opacity-30"
            style={{ backgroundColor: "#f3f4f6", color: "#1f2244" }}
            title="Monter"
          >
            ↑
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={isLast}
            className="text-xs px-2 py-1 rounded cursor-pointer disabled:opacity-30"
            style={{ backgroundColor: "#f3f4f6", color: "#1f2244" }}
            title="Descendre"
          >
            ↓
          </button>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-jetbrains px-2 py-0.5 rounded" style={{ backgroundColor: "#1f2244", color: "white" }}>
              Exercice {exercise.ordre}
            </span>
            {!exercise.active && (
              <span className="text-xs font-jetbrains px-2 py-0.5 rounded bg-gray-100" style={{ color: "#727485" }}>
                Masqué
              </span>
            )}
          </div>
          <input
            type="text"
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={() => {
              if (localTitle !== exercise.titre && localTitle.trim()) onUpdate({ titre: localTitle.trim() });
            }}
            placeholder="Titre de l'exercice"
            className="w-full text-lg font-semibold px-2 py-1 -mx-2 rounded hover:bg-gray-50 focus:bg-gray-50 outline-none"
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
            style={{ color: "#727485", minHeight: "8rem" }}
            rows={6}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1 text-xs font-jetbrains cursor-pointer" style={{ color: "#727485" }}>
            <input
              type="checkbox"
              checked={exercise.active}
              onChange={(e) => onUpdate({ active: e.target.checked })}
            />
            Actif
          </label>
          <button
            onClick={onDelete}
            className="text-xs px-2 py-1 rounded cursor-pointer"
            style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
            title="Supprimer cet exercice"
          >
            ×
          </button>
        </div>
      </div>

      {/* Critères */}
      <div className="ml-10 pl-4 border-l-2" style={{ borderColor: "#e5e7eb" }}>
        <h4 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#727485" }}>
          Critères évalués ({exercise.criteria.length})
        </h4>
        {exercise.criteria.length === 0 ? (
          <p className="text-xs font-jetbrains italic mb-2" style={{ color: "#9ca3af" }}>
            Aucun critère pour l&apos;instant. Ajoute le premier ci-dessous.
          </p>
        ) : (
          <ul className="space-y-1 mb-2">
            {exercise.criteria.map((c, idx) => (
              <CriterionRow
                key={c.id}
                criterion={c}
                isFirst={idx === 0}
                isLast={idx === exercise.criteria.length - 1}
                onUpdate={(libelle) => onUpdateCriterion(c.id, libelle)}
                onDelete={() => onDeleteCriterion(c.id)}
                onMove={(d) => onMoveCriterion(c.id, d)}
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
            placeholder='Ex : "Maîtrise des transitions vidéo"'
            className="flex-1 min-w-[240px] px-2 py-1 rounded border text-xs font-jetbrains"
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
  isFirst,
  isLast,
  onUpdate,
  onDelete,
  onMove,
}: {
  criterion: Criterion;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (libelle: string) => void;
  onDelete: () => void;
  onMove: (d: -1 | 1) => void;
}) {
  const [val, setVal] = useState(criterion.libelle);
  useEffect(() => setVal(criterion.libelle), [criterion.libelle]);

  return (
    <li className="flex items-center gap-1 group">
      <button
        onClick={() => onMove(-1)}
        disabled={isFirst}
        className="text-xs px-1 rounded cursor-pointer disabled:opacity-30 opacity-50 group-hover:opacity-100"
        style={{ color: "#727485" }}
        title="Monter"
      >
        ↑
      </button>
      <button
        onClick={() => onMove(1)}
        disabled={isLast}
        className="text-xs px-1 rounded cursor-pointer disabled:opacity-30 opacity-50 group-hover:opacity-100"
        style={{ color: "#727485" }}
        title="Descendre"
      >
        ↓
      </button>
      <span className="text-xs font-jetbrains" style={{ color: "#9ca3af" }}>
        {criterion.ordre}.
      </span>
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
