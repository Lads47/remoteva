"use client";

// Synthèse de l'éval à froid pour une session, côté admin.
// Stats par question + tableau par stagiaire (invité / relancé / répondu)
// avec actions manuelles (envoi initial anticipé + relance individuelle).

import { use, useEffect, useState } from "react";
import Link from "next/link";

interface Question {
  name: string;
  type: string;
  label: string;
  description?: string;
}
interface Stat {
  question: Question;
  average?: number;
  distribution?: Record<string, number>;
  textResponses?: string[];
  npsScore?: number;
  npsPromoters?: number;
  npsPassives?: number;
  npsDetractors?: number;
}
interface PerTrainee {
  traineeId: string;
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
  totals: { invited: number; submitted: number; pending: number; responseRate: number };
  questions: Question[];
  stats: Stat[];
  perTrainee: PerTrainee[];
}

function fmtDateFr(s: string) {
  return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}
function fmtDateShort(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function ColdEvalSessionAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Synthesis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [pdfFeedback, setPdfFeedback] = useState<{ type: "success" | "error"; msg: string; url?: string } | null>(null);

  function load() {
    setLoading(true);
    fetch(`/api/admin/sessions/${id}/cold-eval`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Erreur");
        return r.json();
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [id]);

  async function sendInitial(traineeId?: string) {
    if (!confirm(traineeId
      ? "Envoyer le questionnaire à froid à ce stagiaire (en plus du cron auto) ?"
      : "Envoyer le questionnaire à froid à tous les stagiaires de cette session (en plus du cron auto) ?"
    )) return;
    setActing(traineeId || "all");
    setFeedback(null);
    try {
      const r = await fetch(`/api/admin/sessions/${id}/cold-eval/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "send_initial", traineeId: traineeId ?? null }),
      });
      const d = await r.json();
      if (!r.ok) {
        setFeedback({ type: "error", msg: d.error || "Échec" });
      } else {
        setFeedback({ type: "success", msg: `✓ ${d.sent}/${d.total} mail(s) envoyé(s)` });
        load();
      }
    } catch {
      setFeedback({ type: "error", msg: "Erreur réseau" });
    } finally {
      setActing(null);
    }
  }

  async function archive() {
    if (archiving) return;
    setArchiving(true);
    setPdfFeedback(null);
    try {
      const r = await fetch(`/api/admin/sessions/${id}/cold-eval`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) {
        setPdfFeedback({ type: "error", msg: d.error || "Échec" });
        return;
      }
      setPdfFeedback({
        type: "success",
        msg: "PDF archivé dans Drive (03_EVALUATIONS)",
        url: d.driveWebUrl,
      });
    } catch {
      setPdfFeedback({ type: "error", msg: "Erreur réseau" });
    } finally {
      setArchiving(false);
    }
  }

  async function sendReminder(traineeId: string) {
    if (!confirm("Envoyer une relance à ce stagiaire ?")) return;
    setActing(traineeId);
    setFeedback(null);
    try {
      const r = await fetch(`/api/admin/sessions/${id}/cold-eval/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "send_reminder", traineeId }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) {
        setFeedback({ type: "error", msg: d.error || "Échec" });
      } else {
        setFeedback({ type: "success", msg: `✓ Relance ${d.reminderNumber} envoyée à ${d.email}` });
        load();
      }
    } catch {
      setFeedback({ type: "error", msg: "Erreur réseau" });
    } finally {
      setActing(null);
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
        Synthèse — Évaluation à froid
      </h1>
      <p className="text-sm font-jetbrains mb-6" style={{ color: "#727485" }}>
        {data.formation.nomLong} · Session {data.session.code} (du {fmtDateFr(data.session.dateDebut)} au {fmtDateFr(data.session.dateFin)})
      </p>

      {feedback && (
        <div className={`mb-4 p-3 rounded-lg text-sm font-jetbrains ${feedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {feedback.msg}
        </div>
      )}

      {/* Totaux */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Invitations envoyées" value={String(data.totals.invited)} />
        <StatCard label="Réponses reçues" value={String(data.totals.submitted)} color="#166534" />
        <StatCard label="En attente" value={String(data.totals.pending)} color="#92400e" />
        <StatCard label="Taux de réponse" value={`${Math.round(data.totals.responseRate * 100)} %`} color="#3730a3" />
      </div>

      {/* Actions PDF */}
      <div className="mb-6 p-4 rounded-xl border flex gap-2 flex-wrap items-center" style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}>
        <a
          href={`/api/admin/sessions/${id}/cold-eval`}
          onClick={(e) => {
            e.preventDefault();
            fetch(`/api/admin/sessions/${id}/cold-eval`, { method: "PUT" })
              .then((r) => r.blob())
              .then((blob) => window.open(URL.createObjectURL(blob), "_blank"));
          }}
          className="text-xs px-3 py-1.5 rounded-full border cursor-pointer"
          style={{ borderColor: "#1f2244", color: "#1f2244" }}
        >
          📄 Aperçu PDF
        </a>
        <button
          onClick={archive}
          disabled={archiving || data.totals.submitted === 0}
          className="text-xs px-3 py-1.5 rounded-full cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: "#7dcef5", color: "#1f2244" }}
        >
          {archiving ? "Génération..." : "Générer & archiver dans Drive (03_EVALUATIONS)"}
        </button>
        {pdfFeedback && (
          <div
            className={`text-xs font-jetbrains px-3 py-1.5 rounded-full ${
              pdfFeedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
            }`}
          >
            {pdfFeedback.msg}
            {pdfFeedback.url && (
              <a href={pdfFeedback.url} target="_blank" rel="noreferrer" className="ml-2 underline">Drive ↗</a>
            )}
          </div>
        )}
      </div>

      {/* Tableau par stagiaire */}
      <div className="mb-8 p-5 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "#1f2244" }}>
            Suivi par stagiaire
          </h2>
          <button
            onClick={() => sendInitial()}
            disabled={acting !== null}
            className="text-xs px-3 py-1.5 rounded-full cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: "#7dcef5", color: "#1f2244" }}
            title="Force l'envoi à tous les stagiaires non encore invités, sans attendre le cron auto"
          >
            {acting === "all" ? "Envoi..." : "Forcer l'envoi initial (tous)"}
          </button>
        </div>
        <p className="text-xs font-jetbrains mb-3" style={{ color: "#727485" }}>
          Les invitations partent automatiquement <strong>3 mois après la fin de session</strong>, puis relances
          à J+7 et J+14 si pas de réponse. Tu peux aussi forcer l&apos;envoi ou relancer manuellement ici.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-jetbrains" style={{ color: "#727485" }}>
                <th className="text-left py-2 pr-3">Stagiaire</th>
                <th className="text-left py-2 pr-3">Invité</th>
                <th className="text-left py-2 pr-3">Relance 1</th>
                <th className="text-left py-2 pr-3">Relance 2</th>
                <th className="text-left py-2 pr-3">Répondu</th>
                <th className="text-right py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.perTrainee.map((t) => (
                <tr key={t.traineeId} className="border-t" style={{ borderColor: "#e5e7eb" }}>
                  <td className="py-2 pr-3">
                    <div style={{ color: "#1f2244" }}>{t.prenom} {t.nom}</div>
                    <div className="text-xs font-jetbrains" style={{ color: "#9ca3af" }}>{t.email}</div>
                  </td>
                  <td className="py-2 pr-3 text-xs font-jetbrains" style={{ color: t.invitedAt ? "#1f2244" : "#9ca3af" }}>
                    {fmtDateShort(t.invitedAt)}
                  </td>
                  <td className="py-2 pr-3 text-xs font-jetbrains" style={{ color: t.reminder1At ? "#1f2244" : "#9ca3af" }}>
                    {fmtDateShort(t.reminder1At)}
                  </td>
                  <td className="py-2 pr-3 text-xs font-jetbrains" style={{ color: t.reminder2At ? "#1f2244" : "#9ca3af" }}>
                    {fmtDateShort(t.reminder2At)}
                  </td>
                  <td className="py-2 pr-3">
                    {t.submittedAt ? (
                      <span className="text-xs font-jetbrains px-2 py-0.5 rounded-full" style={{ backgroundColor: "#dcfce7", color: "#166534" }}>
                        ✓ {fmtDateShort(t.submittedAt)}
                      </span>
                    ) : t.invitedAt ? (
                      <span className="text-xs font-jetbrains" style={{ color: "#92400e" }}>en attente</span>
                    ) : (
                      <span className="text-xs font-jetbrains" style={{ color: "#9ca3af" }}>pas invité</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {t.submittedAt ? (
                      <span className="text-xs font-jetbrains" style={{ color: "#9ca3af" }}>—</span>
                    ) : t.invitedAt ? (
                      <button
                        onClick={() => sendReminder(t.traineeId)}
                        disabled={acting !== null}
                        className="text-xs px-2.5 py-1 rounded-full border cursor-pointer disabled:opacity-50"
                        style={{ borderColor: "#1f2244", color: "#1f2244" }}
                      >
                        {acting === t.traineeId ? "Envoi..." : t.reminder1At ? "Relance 2" : "Relance 1"}
                      </button>
                    ) : (
                      <button
                        onClick={() => sendInitial(t.traineeId)}
                        disabled={acting !== null}
                        className="text-xs px-2.5 py-1 rounded-full cursor-pointer disabled:opacity-50"
                        style={{ backgroundColor: "#7dcef5", color: "#1f2244" }}
                      >
                        {acting === t.traineeId ? "Envoi..." : "Inviter"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {data.perTrainee.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center font-jetbrains text-xs" style={{ color: "#9ca3af" }}>
                  Aucun stagiaire dans cette session.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stats par question */}
      <h2 className="text-lg font-semibold mb-3" style={{ color: "#1f2244" }}>Réponses par question</h2>
      {data.totals.submitted === 0 ? (
        <div className="p-6 rounded-xl border text-center font-jetbrains text-sm" style={{ borderColor: "#e5e7eb", color: "#9ca3af" }}>
          Aucune réponse reçue pour le moment. Les stats apparaîtront ici dès que les stagiaires auront répondu.
        </div>
      ) : (
        <div className="space-y-4">
          {data.stats.map((stat, i) => (
            <QuestionStatCard key={i} stat={stat} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="p-4 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
      <div className="text-xs font-jetbrains" style={{ color: "#727485" }}>{label}</div>
      <div className="text-2xl font-bold mt-1" style={{ color: color || "#1f2244" }}>{value}</div>
    </div>
  );
}

function QuestionStatCard({ stat }: { stat: Stat }) {
  const q = stat.question;
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

      {q.type === "scale_nps" && stat.npsScore !== undefined && (
        <div className="mb-2 p-3 rounded bg-amber-50 flex items-center gap-3">
          <div className="text-3xl font-bold" style={{ color: "#92400e" }}>{stat.npsScore}</div>
          <div className="text-xs font-jetbrains" style={{ color: "#92400e" }}>
            Score NPS à froid<br />
            {stat.npsPromoters} promoteurs · {stat.npsPassives} passifs · {stat.npsDetractors} détracteurs
          </div>
        </div>
      )}

      {stat.average !== undefined && (
        <p className="text-xs font-jetbrains mb-2" style={{ color: "#727485" }}>
          Moyenne : <strong>{stat.average.toFixed(2)}</strong>{q.type === "scale_nps" ? "/10" : "/5"}
        </p>
      )}

      {stat.distribution && (
        <div className="space-y-1">
          {Object.entries(stat.distribution).map(([label, count]) => {
            const total = Object.values(stat.distribution!).reduce((a, b) => a + b, 0);
            const pct = total > 0 ? count / total : 0;
            return (
              <div key={label} className="flex items-center gap-2 text-xs">
                <span className="font-jetbrains w-32" style={{ color: "#1f2244" }}>{label}</span>
                <div className="flex-1 h-3 rounded bg-gray-100 overflow-hidden">
                  <div className="h-full" style={{ width: `${pct * 100}%`, backgroundColor: "#7dcef5" }} />
                </div>
                <span className="font-jetbrains text-xs" style={{ color: "#727485" }}>
                  {count} ({Math.round(pct * 100)}%)
                </span>
              </div>
            );
          })}
        </div>
      )}

      {stat.textResponses && stat.textResponses.length > 0 && (
        <ul className="space-y-1.5 mt-2">
          {stat.textResponses.map((t, i) => (
            <li key={i} className="text-sm p-2 rounded font-jetbrains" style={{ backgroundColor: "#fafbff", color: "#1f2244" }}>
              « {t} »
            </li>
          ))}
        </ul>
      )}

      {stat.textResponses && stat.textResponses.length === 0 && !stat.distribution && (
        <p className="text-xs font-jetbrains italic" style={{ color: "#9ca3af" }}>
          Aucune réponse.
        </p>
      )}
    </div>
  );
}
