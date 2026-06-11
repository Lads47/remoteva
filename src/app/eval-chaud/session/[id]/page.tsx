"use client";

// Page publique anonyme du formulaire d'éval à chaud.
// Design aligné sur le formulaire d'inscription (src/app/formations/[code]/inscription/page.tsx) :
// header centré, sections en cards blanches numérotées, composants RadioCard / YesNoOption / Field.

import { use, useEffect, useState } from "react";
import { ApiError, apiFetch, apiErrorMessage, isAbortError } from "@/lib/api-client";

type QuestionType =
  | "section_header"
  | "likert_5"
  | "scale_nps"
  | "text"
  | "textarea"
  | "yes_no"
  | "single_choice";

interface Question {
  name: string;
  type: QuestionType;
  label: string;
  description?: string;
  required: boolean;
  options?: string[];
  leftLabel?: string;
  rightLabel?: string;
  placeholder?: string;
}

interface SurveyData {
  session: { id: string; code: string; dateDebut: string; dateFin: string };
  formation: { nomLong: string };
  questions: Question[];
}

function fmtDateFr(s: string) {
  return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

// Découpe la liste de questions en "sections" délimitées par les question_type === "section_header".
// Les questions avant le premier section_header sont regroupées dans une section anonyme.
interface SectionGroup {
  header: Question | null; // null pour la section anonyme initiale
  items: Question[];
}
function splitIntoSections(questions: Question[]): SectionGroup[] {
  const groups: SectionGroup[] = [];
  let current: SectionGroup = { header: null, items: [] };
  for (const q of questions) {
    if (q.type === "section_header") {
      if (current.items.length > 0 || current.header) groups.push(current);
      current = { header: q, items: [] };
    } else {
      current.items.push(q);
    }
  }
  if (current.items.length > 0 || current.header) groups.push(current);
  return groups.filter((g) => g.header || g.items.length > 0);
}

export default function PublicSurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [survey, setSurvey] = useState<SurveyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    apiFetch<SurveyData>(`/api/public/satisfaction/session/${id}`, { signal: ac.signal })
      .then((d) => setSurvey(d))
      .catch((err) => {
        if (isAbortError(err)) return;
        setLoadError(apiErrorMessage(err, "Session introuvable"));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [id]);

  function setAnswer(name: string, value: string) {
    setAnswers((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!survey || submitting) return;
    for (const q of survey.questions) {
      if (q.type === "section_header") continue;
      if (q.required && (!answers[q.name] || answers[q.name].trim() === "")) {
        setError(`Question requise non répondue : « ${q.label} »`);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
    }
    setError("");
    setSubmitting(true);
    try {
      await apiFetch(`/api/public/satisfaction/session/${id}`, {
        method: "POST",
        body: { answers },
      });
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      if (err instanceof ApiError && err.status !== null) {
        setError(apiErrorMessage(err, "Échec de l'envoi"));
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setError("Erreur réseau");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f8fafc" }}>
        <p className="font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</p>
      </div>
    );
  }

  if (loadError || !survey) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "#f8fafc" }}>
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold" style={{ color: "#1f2244" }}>Formulaire indisponible</h1>
          <p className="mt-2 text-sm font-jetbrains" style={{ color: "#727485" }}>
            {loadError || "Ce formulaire d'évaluation n'est pas accessible."}
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "#f8fafc" }}>
        <div className="max-w-xl bg-white rounded-2xl shadow-sm border p-8 text-center" style={{ borderColor: "#e5e7eb" }}>
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: "#dcfce7" }}>
            <svg className="w-8 h-8" fill="none" stroke="#166534" strokeWidth="3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: "#1f2244" }}>Merci pour vos réponses ✓</h1>
          <p className="mt-3 text-sm font-jetbrains" style={{ color: "#727485" }}>
            Vos retours sont précieux et nous aident à améliorer la qualité de nos formations.
          </p>
        </div>
      </div>
    );
  }

  const sections = splitIntoSections(survey.questions);
  const totalSections = sections.length;
  let cumulativeIndex = 0;

  return (
    <div className="min-h-screen py-10 px-4" style={{ backgroundColor: "#f8fafc" }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-widest font-jetbrains" style={{ color: "#7dcef5" }}>
            Évaluation à chaud · ≈ 3 minutes
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold" style={{ color: "#1f2244" }}>
            {survey.formation.nomLong}
          </h1>
          <p className="mt-3 text-sm font-jetbrains max-w-xl mx-auto" style={{ color: "#727485" }}>
            Session du {fmtDateFr(survey.session.dateDebut)} au {fmtDateFr(survey.session.dateFin)}
          </p>
        </div>

        {/* Bannière anonymat */}
        <div className="mb-6 p-4 rounded-xl border flex items-start gap-3" style={{ borderColor: "#fde68a", backgroundColor: "#fffbeb" }}>
          <span className="text-xl mt-0.5">🔒</span>
          <p className="text-sm font-jetbrains" style={{ color: "#92400e" }}>
            <strong>Ce formulaire est anonyme.</strong> Vos réponses ne sont pas associées à votre identité —
            elles servent uniquement à améliorer la qualité de nos formations.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-800 text-sm font-jetbrains">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {sections.map((group, sIdx) => {
            const sectionNumber = sIdx + 1;
            const title = group.header?.label || "Vos retours";
            const subtitle = group.header?.description;
            return (
              <Section key={sIdx} number={sectionNumber} total={totalSections} title={title} subtitle={subtitle}>
                <div className="space-y-6">
                  {group.items.map((q) => {
                    cumulativeIndex += 1;
                    return (
                      <QuestionField
                        key={q.name}
                        question={q}
                        index={cumulativeIndex}
                        value={answers[q.name] || ""}
                        onChange={(v) => setAnswer(q.name, v)}
                      />
                    );
                  })}
                </div>
              </Section>
            );
          })}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-full font-semibold text-white disabled:opacity-50 transition-opacity cursor-pointer"
            style={{ backgroundColor: "#1f2244" }}
          >
            {submitting ? "Envoi en cours..." : "Envoyer mes réponses"}
          </button>

          <p className="text-xs text-center font-jetbrains" style={{ color: "#9ca3af" }}>
            Vos réponses sont confidentielles et anonymisées dans nos rapports d&apos;analyse —
            utilisées uniquement pour améliorer la qualité de nos formations.
          </p>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Composants réutilisables (alignés sur le formulaire d'inscription)
// ============================================================================

function Section({
  number,
  total,
  title,
  subtitle,
  children,
}: {
  number: number;
  total: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border p-6 shadow-sm" style={{ borderColor: "#e5e7eb" }}>
      <div className="mb-4">
        <p className="text-xs uppercase tracking-widest font-jetbrains" style={{ color: "#9ca3af" }}>
          Étape {number} / {total}
        </p>
        <h2 className="text-lg font-semibold mt-0.5" style={{ color: "#1f2244" }}>{title}</h2>
        {subtitle && (
          <p className="text-xs font-jetbrains mt-1" style={{ color: "#727485" }}>{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div className="block text-sm font-medium mb-2" style={{ color: "#1f2244" }}>
      {children}
      {required && <span className="text-red-500"> *</span>}
    </div>
  );
}

function QuestionField({
  question,
  index,
  value,
  onChange,
}: {
  question: Question;
  index: number;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label required={question.required}>
        <span style={{ color: "#9ca3af" }}>{index}.</span> {question.label}
      </Label>
      {question.description && (
        <p className="text-xs font-jetbrains -mt-1 mb-2" style={{ color: "#9ca3af" }}>
          {question.description}
        </p>
      )}

      {question.type === "likert_5" && (
        <LikertField
          value={value}
          onChange={onChange}
          leftLabel={question.leftLabel}
          rightLabel={question.rightLabel}
        />
      )}

      {question.type === "scale_nps" && (
        <NpsField
          value={value}
          onChange={onChange}
          leftLabel={question.leftLabel}
          rightLabel={question.rightLabel}
        />
      )}

      {question.type === "yes_no" && (
        <div className="grid grid-cols-2 gap-2">
          <YesNoOption active={value === "Oui"} onClick={() => onChange(value === "Oui" ? "" : "Oui")} label="Oui" />
          <YesNoOption active={value === "Non"} onClick={() => onChange(value === "Non" ? "" : "Non")} label="Non" />
        </div>
      )}

      {question.type === "single_choice" && question.options && (
        <div className="space-y-2">
          {question.options.map((opt) => (
            <RadioCard
              key={opt}
              active={value === opt}
              onClick={() => onChange(value === opt ? "" : opt)}
              label={opt}
            />
          ))}
        </div>
      )}

      {question.type === "text" && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder || ""}
          className="w-full px-3 py-2.5 border rounded-xl text-sm"
          style={{ borderColor: "#d1d5db", backgroundColor: "white" }}
        />
      )}

      {question.type === "textarea" && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder || ""}
          rows={4}
          className="w-full px-3 py-2.5 border rounded-xl text-sm resize-y"
          style={{ borderColor: "#d1d5db", backgroundColor: "white" }}
        />
      )}
    </div>
  );
}

function RadioCard({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2"
      style={{
        borderColor: active ? "#7dcef5" : "#e5e7eb",
        backgroundColor: active ? "#f0f9ff" : "white",
      }}
    >
      <span
        className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center"
        style={{ borderColor: active ? "#1f2244" : "#cbd5e1" }}
      >
        {active && <span className="block w-2 h-2 rounded-full" style={{ backgroundColor: "#1f2244" }} />}
      </span>
      <span className="flex-1 text-sm" style={{ color: "#1f2244" }}>
        {label}
      </span>
    </button>
  );
}

function YesNoOption({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-center py-3 rounded-xl border transition-all cursor-pointer text-sm font-medium"
      style={{
        borderColor: active ? "#7dcef5" : "#e5e7eb",
        backgroundColor: active ? "#f0f9ff" : "white",
        color: "#1f2244",
      }}
    >
      {label}
    </button>
  );
}

function LikertField({
  value,
  onChange,
  leftLabel,
  rightLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  leftLabel?: string;
  rightLabel?: string;
}) {
  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => {
          const active = value === String(n);
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(active ? "" : String(n))}
              className="aspect-square rounded-full border transition-all cursor-pointer text-base font-jetbrains font-semibold"
              style={{
                borderColor: active ? "#7dcef5" : "#e5e7eb",
                backgroundColor: active ? "#7dcef5" : "white",
                color: active ? "#1f2244" : "#727485",
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
      {(leftLabel || rightLabel) && (
        <div className="flex justify-between mt-2 text-xs font-jetbrains" style={{ color: "#9ca3af" }}>
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      )}
    </div>
  );
}

function NpsField({
  value,
  onChange,
  leftLabel,
  rightLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  leftLabel?: string;
  rightLabel?: string;
}) {
  return (
    <div>
      <div className="grid grid-cols-11 gap-1">
        {Array.from({ length: 11 }, (_, i) => i).map((n) => {
          const active = value === String(n);
          // Couleur de fond évoluant rouge → jaune → vert
          const bgInactive = n <= 6 ? "#fee2e2" : n <= 8 ? "#fef3c7" : "#dcfce7";
          const fgInactive = n <= 6 ? "#991b1b" : n <= 8 ? "#92400e" : "#166534";
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(active ? "" : String(n))}
              className="aspect-square rounded-lg border transition-all cursor-pointer text-sm font-jetbrains font-semibold"
              style={{
                borderColor: active ? fgInactive : "transparent",
                backgroundColor: active ? fgInactive : bgInactive,
                color: active ? "white" : fgInactive,
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
      {(leftLabel || rightLabel) && (
        <div className="flex justify-between mt-2 text-xs font-jetbrains" style={{ color: "#9ca3af" }}>
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      )}
    </div>
  );
}
