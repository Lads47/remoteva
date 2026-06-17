"use client";

// Éditeur du schéma de pré-requis (liste de questions typées) partagé par :
//   - l'admin : /admin/formations/[id]/prerequis
//   - le formateur : /formateur/formations/[id]/prerequis
//
// Le composant est contrôlé : il reçoit `fields` et notifie chaque changement
// via `onChange`. La persistance (enregistrer / réinitialiser) reste au parent.

import { useState } from "react";
import type { PrerequisField } from "@/lib/formation-prerequis";

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

export default function PrerequisFieldsEditor({
  fields,
  onChange,
}: {
  fields: PrerequisField[];
  onChange: (fields: PrerequisField[]) => void;
}) {
  function updateField(index: number, patch: Partial<PrerequisField>) {
    const next = [...fields];
    next[index] = { ...next[index], ...patch } as PrerequisField;
    onChange(next);
  }

  function changeFieldType(index: number, newType: FieldType) {
    const next = [...fields];
    const current = next[index];
    // On garde le name et le label, on remet à zéro le reste selon le nouveau type
    const replacement = emptyFieldOfType(newType);
    next[index] = { ...replacement, name: current.name, label: current.label, required: current.required };
    onChange(next);
  }

  function moveField(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function deleteField(index: number) {
    if (!confirm("Supprimer cette question ?")) return;
    onChange(fields.filter((_, i) => i !== index));
  }

  function addField() {
    onChange([...fields, emptyFieldOfType("textarea")]);
  }

  return (
    <>
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

      <button
        type="button"
        onClick={addField}
        className="px-4 py-2 rounded-full text-sm font-medium border cursor-pointer"
        style={{ borderColor: "#1f2244", color: "#1f2244" }}
      >
        + Ajouter une question
      </button>
    </>
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
