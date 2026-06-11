"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type { PrerequisField } from "@/lib/formation-prerequis";
import { apiFetch, apiErrorMessage, isAbortError, ApiError } from "@/lib/api-client";

interface FormationLite {
  id: string;
  code: string;
  nomLong: string;
  configForm: string;
}

type FieldType = PrerequisField["type"];

const FIELD_TYPES: { value: FieldType; label: string; hint: string }[] = [
  { value: "yes_no", label: "Oui / Non", hint: "Question fermée binaire" },
  { value: "single_choice", label: "Choix unique", hint: "Liste de réponses, une seule au choix" },
  { value: "scale_1_5", label: "Échelle 1 → 5", hint: "Curseur entre deux labels (ex: Débutant → Avancé)" },
  { value: "text", label: "Texte court", hint: "Une ligne (titre, mot-clé...)" },
  { value: "textarea", label: "Texte long", hint: "Plusieurs lignes (attentes, projet...)" },
];

function uid(): string {
  return "q_" + Math.random().toString(36).slice(2, 10);
}

function emptyFieldOfType(type: FieldType): PrerequisField {
  const name = uid();
  if (type === "yes_no") return { name, label: "", type: "yes_no", required: true };
  if (type === "single_choice")
    return { name, label: "", type: "single_choice", options: ["Option 1"], required: true };
  if (type === "scale_1_5")
    return { name, label: "", type: "scale_1_5", leftLabel: "Faible", rightLabel: "Élevé", required: true };
  if (type === "text") return { name, label: "", type: "text", required: true };
  return { name, label: "", type: "textarea", required: true };
}

export default function PrerequisEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [formation, setFormation] = useState<FormationLite | null>(null);
  const [fields, setFields] = useState<PrerequisField[]>([]);
  const [usingDefault, setUsingDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    Promise.all([
      apiFetch<{ formations?: FormationLite[] }>(`/api/admin/formations`, { signal: ac.signal }),
      // L'API publique résout le schéma (configForm si valide, sinon fallback hardcoded).
      // On l'utilise pour pré-remplir l'éditeur quand le configForm est vide,
      // ce qui permet à l'admin de partir du défaut puis de l'éditer.
    ])
      .then(([data]) => {
        const found = (data.formations || []).find((f: FormationLite) => f.id === id);
        if (!found) {
          setError("Formation introuvable");
          return;
        }
        setFormation(found);
        return apiFetch<{ prerequisSchema?: PrerequisField[] }>(
          `/api/public/formations/${encodeURIComponent(found.code)}`,
          { signal: ac.signal }
        )
          .then((pub) => {
            const hasCustom =
              found.configForm && found.configForm.trim() !== "" && found.configForm.trim() !== "{}";
            setFields(Array.isArray(pub.prerequisSchema) ? pub.prerequisSchema : []);
            setUsingDefault(!hasCustom);
          })
          .catch((err) => {
            // Fidèle à l'ancien `if (!r.ok) return;` : une erreur HTTP ici est ignorée
            if (err instanceof ApiError && err.status !== null) return;
            throw err;
          });
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setError("Erreur de chargement");
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [id]);

  function updateField(index: number, patch: Partial<PrerequisField>) {
    setFields((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch } as PrerequisField;
      return next;
    });
    setUsingDefault(false);
  }

  function changeFieldType(index: number, newType: FieldType) {
    setFields((prev) => {
      const next = [...prev];
      const current = next[index];
      // On garde le name et le label, on remet à zéro le reste selon le nouveau type
      const replacement = emptyFieldOfType(newType);
      next[index] = { ...replacement, name: current.name, label: current.label, required: current.required };
      return next;
    });
    setUsingDefault(false);
  }

  function moveField(index: number, dir: -1 | 1) {
    setFields((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setUsingDefault(false);
  }

  function deleteField(index: number) {
    if (!confirm("Supprimer cette question ?")) return;
    setFields((prev) => prev.filter((_, i) => i !== index));
    setUsingDefault(false);
  }

  function addField() {
    setFields((prev) => [...prev, emptyFieldOfType("textarea")]);
    setUsingDefault(false);
  }

  async function handleSave() {
    if (!formation) return;
    // Validation minimale : chaque champ doit avoir un label
    for (const f of fields) {
      if (!f.label.trim()) {
        setFeedback({ type: "error", msg: "Toutes les questions doivent avoir un libellé" });
        setTimeout(() => setFeedback(null), 4000);
        return;
      }
      if (f.type === "single_choice" && f.options.length === 0) {
        setFeedback({ type: "error", msg: `La question "${f.label}" doit avoir au moins une option` });
        setTimeout(() => setFeedback(null), 4000);
        return;
      }
    }
    setSaving(true);
    try {
      const configForm = JSON.stringify({ prerequis: fields });
      await apiFetch("/api/admin/formations", {
        method: "PUT",
        body: { id: formation.id, configForm },
      });
      setFeedback({ type: "success", msg: "Pré-requis enregistrés" });
      setUsingDefault(false);
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setFeedback({ type: "error", msg: apiErrorMessage(err, "Erreur de connexion") });
    } finally {
      setSaving(false);
    }
  }

  async function handleResetDefault() {
    if (!formation) return;
    if (!confirm("Réinitialiser au schéma par défaut de cette formation ? Les questions personnalisées seront perdues.")) return;
    setSaving(true);
    try {
      await apiFetch("/api/admin/formations", {
        method: "PUT",
        body: { id: formation.id, configForm: "{}" },
      });
      // Recharger le schéma par défaut depuis l'API publique
      const pub = await apiFetch<{ prerequisSchema?: PrerequisField[] }>(
        `/api/public/formations/${encodeURIComponent(formation.code)}`
      );
      setFields(Array.isArray(pub.prerequisSchema) ? pub.prerequisSchema : []);
      setUsingDefault(true);
      setFeedback({ type: "success", msg: "Schéma par défaut restauré" });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setFeedback({ type: "error", msg: apiErrorMessage(err, "Erreur de connexion") });
    } finally {
      setSaving(false);
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
          ← Retour au catalogue
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <Link href="/admin/formations/catalogue" className="text-xs font-jetbrains underline" style={{ color: "#727485" }}>
          ← Catalogue
        </Link>
        <div className="flex items-center gap-3 flex-wrap mt-2">
          <span className="px-2 py-0.5 rounded text-xs font-jetbrains" style={{ backgroundColor: "#1f2244", color: "white" }}>
            {formation.code}
          </span>
        </div>
        <h1 className="text-3xl font-bold mt-1" style={{ color: "#1f2244" }}>
          Pré-requis · {formation.nomLong}
        </h1>
        <p className="text-sm mt-1 font-jetbrains" style={{ color: "#727485" }}>
          Édite les questions du formulaire d&apos;inscription pour cette formation (section &laquo; Pré-requis et analyse du besoin &raquo;).
        </p>
        {usingDefault && (
          <p className="mt-2 text-xs font-jetbrains px-3 py-2 rounded inline-block" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
            Schéma par défaut affiché. Modifie et enregistre pour le personnaliser.
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

      <div className="space-y-3 mb-6">
        {fields.length === 0 ? (
          <div className="text-center py-12 border rounded-lg font-jetbrains text-sm" style={{ borderColor: "#e5e7eb", color: "#727485" }}>
            Aucune question. Clique sur &laquo; + Ajouter une question &raquo; ci-dessous.
          </div>
        ) : (
          fields.map((field, index) => (
            <FieldEditor
              key={field.name}
              field={field}
              index={index}
              total={fields.length}
              onChange={(patch) => updateField(index, patch)}
              onChangeType={(t) => changeFieldType(index, t)}
              onMoveUp={() => moveField(index, -1)}
              onMoveDown={() => moveField(index, 1)}
              onDelete={() => deleteField(index)}
            />
          ))
        )}
      </div>

      <div className="flex justify-between items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={addField}
          className="px-4 py-2 rounded-full text-sm font-medium border cursor-pointer"
          style={{ borderColor: "#1f2244", color: "#1f2244" }}
        >
          + Ajouter une question
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleResetDefault}
            className="px-4 py-2 rounded-full text-sm font-medium border cursor-pointer hover:bg-gray-50"
            style={{ borderColor: "#d1d5db", color: "#374151" }}
            disabled={saving}
          >
            Réinitialiser au défaut
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-full text-sm font-medium text-white cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: "#1f2244" }}
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldEditor({
  field,
  index,
  total,
  onChange,
  onChangeType,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  field: PrerequisField;
  index: number;
  total: number;
  onChange: (patch: Partial<PrerequisField>) => void;
  onChangeType: (t: FieldType) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="p-4 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
      <div className="flex items-start gap-3 mb-3">
        <span className="text-xs font-jetbrains px-2 py-1 rounded mt-1" style={{ backgroundColor: "#f3f4f6", color: "#727485" }}>
          {index + 1}
        </span>
        <div className="flex-1">
          <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
            Libellé de la question <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value } as Partial<PrerequisField>)}
            placeholder="Ex: Quelle est votre expérience avec vMix ?"
            className="w-full px-3 py-2 border rounded-lg text-sm"
            style={{ borderColor: "#d1d5db" }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="text-xs px-2 py-1 rounded border cursor-pointer disabled:opacity-30"
            style={{ borderColor: "#e5e7eb", color: "#374151" }}
            title="Monter"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="text-xs px-2 py-1 rounded border cursor-pointer disabled:opacity-30"
            style={{ borderColor: "#e5e7eb", color: "#374151" }}
            title="Descendre"
          >
            ↓
          </button>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 cursor-pointer hover:bg-red-50"
          title="Supprimer"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>Type de réponse</label>
          <select
            value={field.type}
            onChange={(e) => onChangeType(e.target.value as FieldType)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
            style={{ borderColor: "#d1d5db" }}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <p className="text-xs mt-1 font-jetbrains" style={{ color: "#9ca3af" }}>
            {FIELD_TYPES.find((t) => t.value === field.type)?.hint}
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>Obligatoire ?</label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={field.required ?? false}
              onChange={(e) => onChange({ required: e.target.checked })}
            />
            <span style={{ color: "#1f2244" }}>Réponse requise</span>
          </label>
        </div>
      </div>

      {/* Champs spécifiques au type */}
      {field.type === "single_choice" && (
        <SingleChoiceOptions
          options={field.options}
          onChange={(options) => onChange({ options } as Partial<PrerequisField>)}
        />
      )}
      {field.type === "scale_1_5" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>Label gauche (1)</label>
            <input
              type="text"
              value={field.leftLabel}
              onChange={(e) => onChange({ leftLabel: e.target.value } as Partial<PrerequisField>)}
              placeholder="Ex: Débutant"
              className="w-full px-3 py-2 border rounded-lg text-sm"
              style={{ borderColor: "#d1d5db" }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>Label droite (5)</label>
            <input
              type="text"
              value={field.rightLabel}
              onChange={(e) => onChange({ rightLabel: e.target.value } as Partial<PrerequisField>)}
              placeholder="Ex: Avancé"
              className="w-full px-3 py-2 border rounded-lg text-sm"
              style={{ borderColor: "#d1d5db" }}
            />
          </div>
        </div>
      )}
      {(field.type === "text" || field.type === "textarea") && (
        <div className="mt-3">
          <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>Placeholder (optionnel)</label>
          <input
            type="text"
            value={field.placeholder ?? ""}
            onChange={(e) => onChange({ placeholder: e.target.value } as Partial<PrerequisField>)}
            placeholder="Ex: Listez les outils que vous utilisez..."
            className="w-full px-3 py-2 border rounded-lg text-sm"
            style={{ borderColor: "#d1d5db" }}
          />
        </div>
      )}
    </div>
  );
}

function SingleChoiceOptions({
  options,
  onChange,
}: {
  options: string[];
  onChange: (options: string[]) => void;
}) {
  return (
    <div className="mt-3">
      <label className="block text-xs font-medium mb-2" style={{ color: "#374151" }}>Options de réponse</label>
      <div className="space-y-2">
        {options.map((opt, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              type="text"
              value={opt}
              onChange={(e) => {
                const next = [...options];
                next[i] = e.target.value;
                onChange(next);
              }}
              className="flex-1 px-3 py-2 border rounded-lg text-sm"
              style={{ borderColor: "#d1d5db" }}
            />
            <button
              type="button"
              onClick={() => onChange(options.filter((_, j) => j !== i))}
              disabled={options.length === 1}
              className="text-xs px-2 py-1 rounded border border-red-200 text-red-600 cursor-pointer hover:bg-red-50 disabled:opacity-30"
              title="Supprimer l'option"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...options, ""])}
        className="mt-2 text-xs px-3 py-1 rounded-full border cursor-pointer"
        style={{ borderColor: "#1f2244", color: "#1f2244" }}
      >
        + Ajouter une option
      </button>
    </div>
  );
}
