"use client";

// Éditeur WYSIWYG des questions de satisfaction.
// Pattern aligné sur l'éditeur de pré-requis (src/app/admin/formations/[id]/prerequis/page.tsx) :
//   - liste verticale de questions, éditées inline dans des cards
//   - boutons ↑/↓ pour réordonner, ✕ pour supprimer
//   - ajout d'une question via un sélecteur de type
//   - validation locale (label non vide, options non vides pour single_choice, etc.)
//
// L'éditeur est volontairement contrôlé : le parent gère le state (questions, dirty flag)
// et le persiste via son propre endpoint API. Ça permet de partager le composant entre
//   - /admin/formations/parametres-communs/questionnaire (config GLOBALE)
//   - /admin/formations/[id]/satisfaction-config (override PAR FORMATION)

import { useState } from "react";

export type SatisfactionQuestionType =
  | "section_header"
  | "likert_5"
  | "scale_nps"
  | "text"
  | "textarea"
  | "yes_no"
  | "single_choice";

export interface SatisfactionQuestion {
  name: string;
  type: SatisfactionQuestionType;
  label: string;
  description?: string;
  required: boolean;
  options?: string[];
  leftLabel?: string;
  rightLabel?: string;
  placeholder?: string;
}

const TYPES: { value: SatisfactionQuestionType; label: string; hint: string }[] = [
  { value: "section_header", label: "Titre de section", hint: "Encart visuel (titre + description). Pas une question." },
  { value: "likert_5", label: "Échelle 1 → 5 (Likert)", hint: "5 boutons numérotés avec labels gauche/droite." },
  { value: "scale_nps", label: "Échelle 0 → 10 (NPS)", hint: "11 boutons (0 à 10). Net Promoter Score." },
  { value: "yes_no", label: "Oui / Non", hint: "Question fermée binaire." },
  { value: "single_choice", label: "Choix unique", hint: "Liste de réponses prédéfinies, une seule au choix." },
  { value: "text", label: "Texte court", hint: "Une ligne (mot-clé, nom...)." },
  { value: "textarea", label: "Texte long", hint: "Plusieurs lignes (commentaire libre)." },
];

function uid(): string {
  return "q_" + Math.random().toString(36).slice(2, 10);
}

function makeEmpty(type: SatisfactionQuestionType): SatisfactionQuestion {
  const name = uid();
  const base = { name, label: "", required: type === "section_header" ? false : true };
  switch (type) {
    case "section_header":
      return { ...base, type, description: "" };
    case "likert_5":
      return { ...base, type, leftLabel: "Pas du tout", rightLabel: "Totalement" };
    case "scale_nps":
      return { ...base, type, leftLabel: "Pas du tout", rightLabel: "Tout à fait" };
    case "yes_no":
      return { ...base, type };
    case "single_choice":
      return { ...base, type, options: ["Option 1"] };
    case "text":
    case "textarea":
      return { ...base, type };
  }
}

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------
export default function SatisfactionWysiwygEditor({
  questions,
  onChange,
}: {
  questions: SatisfactionQuestion[];
  onChange: (next: SatisfactionQuestion[]) => void;
}) {
  const [addType, setAddType] = useState<SatisfactionQuestionType>("likert_5");

  function update(index: number, patch: Partial<SatisfactionQuestion>) {
    const next = [...questions];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function changeType(index: number, newType: SatisfactionQuestionType) {
    const replacement = makeEmpty(newType);
    const current = questions[index];
    const next = [...questions];
    next[index] = {
      ...replacement,
      name: current.name,
      label: current.label,
      description: current.description,
      required: newType === "section_header" ? false : current.required,
    };
    onChange(next);
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function remove(index: number) {
    if (!confirm("Supprimer cette question ?")) return;
    onChange(questions.filter((_, i) => i !== index));
  }

  function add() {
    onChange([...questions, makeEmpty(addType)]);
  }

  // Compteur de questions "vraies" (hors section_header) pour l'affichage
  let counter = 0;

  return (
    <div>
      <div className="space-y-3 mb-4">
        {questions.length === 0 ? (
          <div className="text-center py-12 border rounded-xl font-jetbrains text-sm" style={{ borderColor: "#e5e7eb", color: "#727485" }}>
            Aucune question pour le moment. Ajoute-en une via le bloc ci-dessous.
          </div>
        ) : (
          questions.map((q, index) => {
            const isHeader = q.type === "section_header";
            if (!isHeader) counter += 1;
            return (
              <QuestionEditor
                key={q.name}
                q={q}
                index={index}
                total={questions.length}
                questionNumber={isHeader ? null : counter}
                onChange={(patch) => update(index, patch)}
                onChangeType={(t) => changeType(index, t)}
                onMoveUp={() => move(index, -1)}
                onMoveDown={() => move(index, 1)}
                onDelete={() => remove(index)}
              />
            );
          })
        )}
      </div>

      <div className="p-4 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}>
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
              Ajouter une question / un titre
            </label>
            <select
              value={addType}
              onChange={(e) => setAddType(e.target.value as SatisfactionQuestionType)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
              style={{ borderColor: "#d1d5db" }}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <p className="text-xs mt-1 font-jetbrains" style={{ color: "#9ca3af" }}>
              {TYPES.find((t) => t.value === addType)?.hint}
            </p>
          </div>
          <button
            type="button"
            onClick={add}
            className="px-4 py-2 rounded-full text-sm font-medium border cursor-pointer"
            style={{ borderColor: "#1f2244", color: "#1f2244" }}
          >
            + Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card d'édition d'une question
// ---------------------------------------------------------------------------
function QuestionEditor({
  q,
  index,
  total,
  questionNumber,
  onChange,
  onChangeType,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  q: SatisfactionQuestion;
  index: number;
  total: number;
  questionNumber: number | null;
  onChange: (patch: Partial<SatisfactionQuestion>) => void;
  onChangeType: (t: SatisfactionQuestionType) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const isHeader = q.type === "section_header";
  return (
    <div
      className="p-4 rounded-xl border"
      style={{
        borderColor: isHeader ? "#7dcef5" : "#e5e7eb",
        backgroundColor: isHeader ? "#f0f9ff" : "white",
      }}
    >
      <div className="flex items-start gap-3 mb-3">
        <span
          className="text-xs font-jetbrains px-2 py-1 rounded mt-1 whitespace-nowrap"
          style={{
            backgroundColor: isHeader ? "#1f2244" : "#f3f4f6",
            color: isHeader ? "white" : "#727485",
          }}
        >
          {isHeader ? "Section" : `Q${questionNumber}`}
        </span>
        <div className="flex-1">
          <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
            {isHeader ? "Titre de la section" : "Libellé de la question"} <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={q.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder={isHeader ? "Ex: Recommandation" : "Ex: Le formateur a-t-il bien expliqué les notions ?"}
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
          <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>Type</label>
          <select
            value={q.type}
            onChange={(e) => onChangeType(e.target.value as SatisfactionQuestionType)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
            style={{ borderColor: "#d1d5db" }}
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <p className="text-xs mt-1 font-jetbrains" style={{ color: "#9ca3af" }}>
            {TYPES.find((t) => t.value === q.type)?.hint}
          </p>
        </div>
        {!isHeader && (
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>Obligatoire ?</label>
            <label className="inline-flex items-center gap-2 text-sm mt-2">
              <input
                type="checkbox"
                checked={q.required}
                onChange={(e) => onChange({ required: e.target.checked })}
              />
              <span style={{ color: "#1f2244" }}>Réponse requise</span>
            </label>
          </div>
        )}
      </div>

      {/* Description (utile pour section_header ; optionnelle pour les questions) */}
      <div className="mt-3">
        <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
          {isHeader ? "Description de la section (sous le titre)" : "Texte d'aide (optionnel, sous le libellé)"}
        </label>
        <input
          type="text"
          value={q.description ?? ""}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder={isHeader ? "Ex: Aidez-nous à savoir si vous nous recommanderiez à un proche" : "Ex: Décrivez en quelques mots..."}
          className="w-full px-3 py-2 border rounded-lg text-sm"
          style={{ borderColor: "#d1d5db" }}
        />
      </div>

      {/* Champs spécifiques par type */}
      {(q.type === "likert_5" || q.type === "scale_nps") && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
              Label gauche {q.type === "likert_5" ? "(1)" : "(0)"}
            </label>
            <input
              type="text"
              value={q.leftLabel ?? ""}
              onChange={(e) => onChange({ leftLabel: e.target.value })}
              placeholder="Ex: Pas du tout"
              className="w-full px-3 py-2 border rounded-lg text-sm"
              style={{ borderColor: "#d1d5db" }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
              Label droite {q.type === "likert_5" ? "(5)" : "(10)"}
            </label>
            <input
              type="text"
              value={q.rightLabel ?? ""}
              onChange={(e) => onChange({ rightLabel: e.target.value })}
              placeholder="Ex: Totalement"
              className="w-full px-3 py-2 border rounded-lg text-sm"
              style={{ borderColor: "#d1d5db" }}
            />
          </div>
        </div>
      )}

      {q.type === "single_choice" && (
        <SingleChoiceOptions
          options={q.options ?? []}
          onChange={(options) => onChange({ options })}
        />
      )}

      {(q.type === "text" || q.type === "textarea") && (
        <div className="mt-3">
          <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>Placeholder (optionnel)</label>
          <input
            type="text"
            value={q.placeholder ?? ""}
            onChange={(e) => onChange({ placeholder: e.target.value })}
            placeholder="Ex: Quelques mots..."
            className="w-full px-3 py-2 border rounded-lg text-sm"
            style={{ borderColor: "#d1d5db" }}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sous-éditeur d'options pour single_choice
// ---------------------------------------------------------------------------
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
              placeholder={`Option ${i + 1}`}
              className="flex-1 px-3 py-2 border rounded-lg text-sm"
              style={{ borderColor: "#d1d5db" }}
            />
            <button
              type="button"
              onClick={() => onChange(options.filter((_, j) => j !== i))}
              disabled={options.length <= 1}
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

// ---------------------------------------------------------------------------
// Validation utilisable par le parent avant un PUT
// ---------------------------------------------------------------------------
export function validateQuestions(questions: SatisfactionQuestion[]): string | null {
  const seenNames = new Set<string>();
  for (const q of questions) {
    if (!q.label.trim()) {
      return q.type === "section_header"
        ? "Chaque titre de section doit avoir un libellé."
        : "Chaque question doit avoir un libellé.";
    }
    if (q.type !== "section_header") {
      if (!q.name.trim()) return `Question « ${q.label} » : identifiant manquant.`;
      if (seenNames.has(q.name)) return `Identifiant en double : ${q.name} (doublon dans la liste).`;
      seenNames.add(q.name);
    }
    if (q.type === "single_choice") {
      const opts = (q.options ?? []).filter((o) => o.trim() !== "");
      if (opts.length === 0) return `Question « ${q.label} » : au moins une option requise.`;
    }
  }
  return null;
}
