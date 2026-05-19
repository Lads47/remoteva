"use client";

import { use, useEffect, useState } from "react";

type QuestionType =
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
  required: boolean;
  options?: string[];
  leftLabel?: string;
  rightLabel?: string;
  placeholder?: string;
}

interface SurveyData {
  responseId: string;
  trainee: { prenom: string; nom: string };
  session: { code: string; dateDebut: string; dateFin: string };
  formation: { nomLong: string };
  questions: Question[];
  submittedAt: string | null;
}

function fmtDateFr(s: string) {
  return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

export default function PublicSurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [survey, setSurvey] = useState<SurveyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/public/satisfaction/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => null);
          throw new Error(d?.error || "Lien invalide");
        }
        return r.json();
      })
      .then((d: SurveyData) => {
        setSurvey(d);
        if (d.submittedAt) setDone(true);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!survey || submitting) return;
    // Validation
    for (const q of survey.questions) {
      if (q.required && (!answers[q.name] || answers[q.name].trim() === "")) {
        setError(`Question requise non répondue : ${q.label}`);
        return;
      }
    }
    setError("");
    setSubmitting(true);
    try {
      const r = await fetch(`/api/public/satisfaction/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        setError(d?.error || "Échec de l'envoi");
        return;
      }
      setDone(true);
    } catch {
      setError("Erreur réseau");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen py-10 px-4" style={{ backgroundColor: "#f8fafc" }}>
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm p-6 md:p-8 border" style={{ borderColor: "#e5e7eb" }}>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#1f2244" }}>
            Évaluation à chaud
          </h1>
          <p className="text-sm font-jetbrains mb-4" style={{ color: "#727485" }}>
            Les Ateliers du Stream
          </p>

          {loading && (
            <p className="text-sm font-jetbrains py-8 text-center" style={{ color: "#727485" }}>
              Chargement...
            </p>
          )}

          {!loading && error && !survey && (
            <div className="p-3 rounded text-sm font-jetbrains bg-red-50 text-red-800">{error}</div>
          )}

          {survey && done && (
            <div className="py-8 text-center">
              <div className="inline-block px-4 py-2 rounded-full bg-green-50 text-green-800 text-sm font-medium mb-3">
                ✓ Merci pour vos réponses !
              </div>
              <p className="text-sm font-jetbrains" style={{ color: "#727485" }}>
                Vos retours sont précieux pour nous aider à améliorer nos formations.
              </p>
            </div>
          )}

          {survey && !done && (
            <>
              <div className="mb-6 p-3 rounded-lg text-xs font-jetbrains" style={{ backgroundColor: "#fafbff", color: "#727485" }}>
                <strong style={{ color: "#1f2244" }}>{survey.trainee.prenom} {survey.trainee.nom}</strong> · {survey.formation.nomLong}
                <br />
                Session du {fmtDateFr(survey.session.dateDebut)} au {fmtDateFr(survey.session.dateFin)}
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {survey.questions.map((q, idx) => (
                  <QuestionField
                    key={q.name}
                    question={q}
                    index={idx + 1}
                    value={answers[q.name] || ""}
                    onChange={(v) => setAnswers({ ...answers, [q.name]: v })}
                  />
                ))}

                {error && (
                  <div className="p-3 rounded text-sm font-jetbrains bg-red-50 text-red-800">{error}</div>
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-3 rounded-full text-base font-medium text-white cursor-pointer disabled:opacity-50"
                    style={{ backgroundColor: "#1f2244" }}
                  >
                    {submitting ? "Envoi..." : "Envoyer mes réponses"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
        <p className="text-center text-xs font-jetbrains mt-4" style={{ color: "#9ca3af" }}>
          Vos réponses sont confidentielles et utilisées dans le cadre du suivi qualité Qualiopi.
        </p>
      </div>
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
      <label className="block text-sm font-medium mb-2" style={{ color: "#1f2244" }}>
        <span style={{ color: "#9ca3af" }}>{index}.</span> {question.label}
        {question.required && <span style={{ color: "#ef4444" }}> *</span>}
      </label>

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
        <div className="flex gap-2">
          {["Oui", "Non"].map((opt) => {
            const selected = value === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(selected ? "" : opt)}
                className="px-4 py-2 rounded-full text-sm cursor-pointer border transition-all"
                style={{
                  backgroundColor: selected ? "#1f2244" : "white",
                  color: selected ? "white" : "#1f2244",
                  borderColor: "#1f2244",
                  fontWeight: selected ? 600 : 400,
                }}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}

      {question.type === "single_choice" && question.options && (
        <div className="flex flex-wrap gap-2">
          {question.options.map((opt) => {
            const selected = value === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(selected ? "" : opt)}
                className="px-3 py-1.5 rounded-full text-sm cursor-pointer border transition-all"
                style={{
                  backgroundColor: selected ? "#1f2244" : "white",
                  color: selected ? "white" : "#1f2244",
                  borderColor: "#1f2244",
                  fontWeight: selected ? 600 : 400,
                }}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}

      {question.type === "text" && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder || ""}
          className="w-full px-3 py-2 rounded-lg border text-sm"
          style={{ borderColor: "#e5e7eb", color: "#1f2244" }}
        />
      )}

      {question.type === "textarea" && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={question.placeholder || ""}
          rows={4}
          className="w-full px-3 py-2 rounded-lg border text-sm resize-y"
          style={{ borderColor: "#e5e7eb", color: "#1f2244" }}
        />
      )}
    </div>
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
      <div className="flex gap-2 justify-between">
        {[1, 2, 3, 4, 5].map((n) => {
          const selected = value === String(n);
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(selected ? "" : String(n))}
              className="flex-1 px-2 py-3 rounded-lg cursor-pointer border transition-all"
              style={{
                backgroundColor: selected ? "#1f2244" : "white",
                color: selected ? "white" : "#1f2244",
                borderColor: selected ? "#1f2244" : "#e5e7eb",
                fontWeight: selected ? 700 : 500,
                fontSize: 16,
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
      {(leftLabel || rightLabel) && (
        <div className="flex justify-between mt-1 text-xs font-jetbrains" style={{ color: "#9ca3af" }}>
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
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 11 }, (_, i) => i).map((n) => {
          const selected = value === String(n);
          // Couleur dégradée du rouge au vert pour aider visuellement
          const color = n <= 6 ? "#fee2e2" : n <= 8 ? "#fef3c7" : "#dcfce7";
          const colorFg = n <= 6 ? "#991b1b" : n <= 8 ? "#92400e" : "#166534";
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(selected ? "" : String(n))}
              className="flex-1 min-w-[36px] px-2 py-2 rounded-lg cursor-pointer border transition-all"
              style={{
                backgroundColor: selected ? colorFg : color,
                color: selected ? "white" : colorFg,
                borderColor: selected ? colorFg : "transparent",
                fontWeight: selected ? 700 : 500,
                fontSize: 14,
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
      {(leftLabel || rightLabel) && (
        <div className="flex justify-between mt-1 text-xs font-jetbrains" style={{ color: "#9ca3af" }}>
          <span>{leftLabel}</span>
          <span>{rightLabel}</span>
        </div>
      )}
    </div>
  );
}
