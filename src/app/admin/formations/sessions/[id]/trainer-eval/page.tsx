"use client";

// Synthèse de la fiche satisfaction formateur pour une session (côté admin).
// Une seule réponse par session (1 formateur), donc affichage simple :
//   - Statut envoi (invité / relancé / répondu)
//   - Actions manuelles : forcer envoi initial, relancer
//   - Réponses du formateur question par question

import { use, useEffect, useState } from "react";
import Link from "next/link";

type QuestionType =
  | "section_header"
  | "likert_4"
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
  leftLabel?: string;
  rightLabel?: string;
  options?: string[];
}

interface TrainerInfo {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  invitedAt: string | null;
  reminder1At: string | null;
  reminder2At: string | null;
  submittedAt: string | null;
}

interface Synthesis {
  session: { id: string; code: string; dateDebut: string; dateFin: string };
  formation: { nomLong: string };
  trainer: TrainerInfo | null;
  questions: Question[];
  answers: Record<string, string>;
}

function fmtDateFr(s: string) {
  return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}
function fmtDateTime(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function TrainerEvalSessionAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Synthesis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  function load() {
    setLoading(true);
    fetch(`/api/admin/sessions/${id}/trainer-eval`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Erreur");
        return r.json();
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [id]);

  async function action(mode: "send_initial" | "send_reminder") {
    if (mode === "send_initial" && !confirm("Envoyer la fiche satisfaction formateur maintenant (sans attendre le cron J+1) ?")) return;
    if (mode === "send_reminder" && !confirm("Envoyer une relance au formateur ?")) return;
    setActing(true);
    setFeedback(null);
    try {
      const r = await fetch(`/api/admin/sessions/${id}/trainer-eval/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) {
        setFeedback({ type: "error", msg: d.error || "Échec" });
      } else {
        setFeedback({
          type: "success",
          msg: mode === "send_initial"
            ? `✓ Mail initial envoyé à ${d.email}`
            : `✓ Relance ${d.reminderNumber} envoyée à ${d.email}`,
        });
        load();
      }
    } catch {
      setFeedback({ type: "error", msg: "Erreur réseau" });
    } finally {
      setActing(false);
    }
  }

  if (loading) return <div className="py-12 text-center font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  if (error || !data) {
    return (
      <div className="py-12 text-center">
        <p className="font-jetbrains text-sm" style={{ color: "#991b1b" }}>{error || "Erreur"}</p>
      </div>
    );
  }

  return (
    <div>
      <Link href={`/admin/formations/sessions/${id}`} className="text-xs font-jetbrains underline" style={{ color: "#727485" }}>
        ← Retour à la session
      </Link>
      <h1 className="text-3xl font-bold mt-2 mb-1" style={{ color: "#1f2244" }}>
        Fiche satisfaction formateur
      </h1>
      <p className="text-sm font-jetbrains mb-6" style={{ color: "#727485" }}>
        {data.formation.nomLong} · Session {data.session.code} (du {fmtDateFr(data.session.dateDebut)} au {fmtDateFr(data.session.dateFin)})
      </p>

      {feedback && (
        <div className={`mb-4 p-3 rounded-lg text-sm font-jetbrains ${feedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {feedback.msg}
        </div>
      )}

      {!data.trainer && (
        <div className="p-6 rounded-xl border text-center font-jetbrains text-sm" style={{ borderColor: "#fde68a", backgroundColor: "#fffbeb", color: "#92400e" }}>
          Aucun formateur assigné à cette session. La fiche ne peut pas être envoyée.
        </div>
      )}

      {data.trainer && (
        <>
          {/* Bloc statut formateur */}
          <div className="mb-6 p-5 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "#1f2244" }}>
                Formateur
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <div className="font-medium" style={{ color: "#1f2244" }}>
                  {data.trainer.prenom} {data.trainer.nom}
                </div>
                <div className="text-xs font-jetbrains mt-0.5" style={{ color: "#9ca3af" }}>
                  {data.trainer.email}
                </div>
              </div>
              <div className="text-xs font-jetbrains" style={{ color: "#727485" }}>
                <div>Invité : {fmtDateTime(data.trainer.invitedAt)}</div>
                <div>Relance 1 (J+7) : {fmtDateTime(data.trainer.reminder1At)}</div>
                <div>Relance 2 (J+14) : {fmtDateTime(data.trainer.reminder2At)}</div>
                <div>
                  Répondu :{" "}
                  {data.trainer.submittedAt ? (
                    <span style={{ color: "#166534" }}>✓ {fmtDateTime(data.trainer.submittedAt)}</span>
                  ) : data.trainer.invitedAt ? (
                    <span style={{ color: "#92400e" }}>en attente</span>
                  ) : (
                    <span style={{ color: "#9ca3af" }}>pas encore invité</span>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-2 flex-wrap">
              {!data.trainer.invitedAt && (
                <button
                  onClick={() => action("send_initial")}
                  disabled={acting}
                  className="text-xs px-3 py-1.5 rounded-full cursor-pointer disabled:opacity-50"
                  style={{ backgroundColor: "#7dcef5", color: "#1f2244" }}
                >
                  {acting ? "Envoi..." : "Envoyer maintenant (sans attendre J+1)"}
                </button>
              )}
              {data.trainer.invitedAt && !data.trainer.submittedAt && (
                <button
                  onClick={() => action("send_reminder")}
                  disabled={acting}
                  className="text-xs px-3 py-1.5 rounded-full border cursor-pointer disabled:opacity-50"
                  style={{ borderColor: "#1f2244", color: "#1f2244" }}
                >
                  {acting ? "Envoi..." : data.trainer.reminder1At ? "Relancer (J+14)" : "Relancer (J+7)"}
                </button>
              )}
            </div>
          </div>

          {/* Réponses */}
          {data.trainer.submittedAt && Object.keys(data.answers).length > 0 ? (
            <div>
              <h2 className="text-lg font-semibold mb-3" style={{ color: "#1f2244" }}>Réponses</h2>
              <div className="space-y-4">
                {data.questions.map((q, i) => <QuestionAnswerCard key={i} q={q} answer={data.answers[q.name] || ""} />)}
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-xl border text-center font-jetbrains text-sm" style={{ borderColor: "#e5e7eb", color: "#9ca3af" }}>
              Le formateur n&apos;a pas encore rempli sa fiche.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function QuestionAnswerCard({ q, answer }: { q: Question; answer: string }) {
  if (q.type === "section_header") {
    return (
      <div className="pt-3 pb-1 border-b" style={{ borderColor: "#e5e7eb" }}>
        <h3 className="text-base font-bold" style={{ color: "#1f2244" }}>{q.label}</h3>
        {q.description && (
          <p className="text-xs font-jetbrains mt-1" style={{ color: "#727485" }}>{q.description}</p>
        )}
      </div>
    );
  }
  return (
    <div className="p-4 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
      <h3 className="font-medium mb-2" style={{ color: "#1f2244" }}>{q.label}</h3>
      {answer ? (
        <div className="text-sm font-jetbrains p-3 rounded-lg" style={{ backgroundColor: "#fafbff", color: "#1f2244" }}>
          {q.type === "likert_4" || q.type === "likert_5" ? (
            <span>
              <strong>{answer}</strong>
              {q.type === "likert_4" ? "/4" : "/5"}
              {(q.leftLabel || q.rightLabel) && (
                <span style={{ color: "#9ca3af" }}> ({q.leftLabel} → {q.rightLabel})</span>
              )}
            </span>
          ) : q.type === "textarea" || q.type === "text" ? (
            <span>« {answer} »</span>
          ) : (
            <span>{answer}</span>
          )}
        </div>
      ) : (
        <p className="text-xs italic font-jetbrains" style={{ color: "#9ca3af" }}>
          Pas de réponse.
        </p>
      )}
    </div>
  );
}
