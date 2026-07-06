"use client";

// Synthèse admin de la satisfaction commanditaire/entreprise pour une session.

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, apiErrorMessage, isAbortError } from "@/lib/api-client";

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
interface PerContact {
  companyName: string;
  contactName: string;
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
  perContact: PerContact[];
}

function fmtDateFr(s: string) {
  return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}
function fmtDateTime(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function SponsorEvalSynthesisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Synthesis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const ac = new AbortController();
    apiFetch<Synthesis>(`/api/admin/sessions/${id}/sponsor-eval`, { signal: ac.signal })
      .then(setData)
      .catch((e) => {
        if (isAbortError(e)) return;
        setError(apiErrorMessage(e, "Erreur"));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [id]);

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
        Synthèse — Satisfaction entreprise
      </h1>
      <p className="text-sm font-jetbrains mb-6" style={{ color: "#727485" }}>
        {data.formation.nomLong} · Session {data.session.code} (du {fmtDateFr(data.session.dateDebut)} au {fmtDateFr(data.session.dateFin)})
      </p>

      {/* Totaux */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Entreprises invitées" value={String(data.totals.invited)} />
        <StatCard label="Réponses reçues" value={String(data.totals.submitted)} color="#166534" />
        <StatCard label="En attente" value={String(data.totals.pending)} color="#92400e" />
        <StatCard label="Taux de réponse" value={`${Math.round(data.totals.responseRate * 100)} %`} color="#3730a3" />
      </div>

      {data.totals.invited === 0 && (
        <div className="mb-6 p-4 rounded-xl text-sm font-jetbrains" style={{ backgroundColor: "#fffbeb", color: "#92400e" }}>
          Aucune enquête entreprise pour cette session. Elle part automatiquement, en même temps que l&apos;éval à froid,
          pour chaque inscription <strong>entreprise</strong> dont l&apos;<strong>e-mail du référent</strong> est renseigné.
        </div>
      )}

      {/* Stats par question */}
      {data.totals.submitted > 0 && (
        <div className="space-y-4 mb-8">
          {data.stats.map((s, i) => (
            <QuestionStat key={s.question.name || i} stat={s} />
          ))}
        </div>
      )}

      {/* Tableau par entreprise */}
      <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: "#1f2244" }}>
        Suivi par entreprise
      </h2>
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "#e5e7eb" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: "#fafbff" }}>
              <th className="text-left px-3 py-2 font-jetbrains text-xs" style={{ color: "#727485" }}>Entreprise</th>
              <th className="text-left px-3 py-2 font-jetbrains text-xs" style={{ color: "#727485" }}>Contact</th>
              <th className="text-left px-3 py-2 font-jetbrains text-xs" style={{ color: "#727485" }}>Invitée</th>
              <th className="text-left px-3 py-2 font-jetbrains text-xs" style={{ color: "#727485" }}>Relance 1</th>
              <th className="text-left px-3 py-2 font-jetbrains text-xs" style={{ color: "#727485" }}>Relance 2</th>
              <th className="text-left px-3 py-2 font-jetbrains text-xs" style={{ color: "#727485" }}>Répondu</th>
            </tr>
          </thead>
          <tbody>
            {data.perContact.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-4 text-center font-jetbrains text-xs" style={{ color: "#9ca3af" }}>Aucune entreprise invitée.</td></tr>
            ) : (
              data.perContact.map((c) => (
                <tr key={c.email} className="border-t" style={{ borderColor: "#f0f0f5" }}>
                  <td className="px-3 py-2" style={{ color: "#1f2244" }}>{c.companyName || "—"}</td>
                  <td className="px-3 py-2 font-jetbrains text-xs" style={{ color: "#727485" }}>{c.contactName || c.email}</td>
                  <td className="px-3 py-2 font-jetbrains text-xs" style={{ color: "#727485" }}>{fmtDateTime(c.invitedAt)}</td>
                  <td className="px-3 py-2 font-jetbrains text-xs" style={{ color: "#727485" }}>{fmtDateTime(c.reminder1At)}</td>
                  <td className="px-3 py-2 font-jetbrains text-xs" style={{ color: "#727485" }}>{fmtDateTime(c.reminder2At)}</td>
                  <td className="px-3 py-2 font-jetbrains text-xs">
                    {c.submittedAt ? (
                      <span style={{ color: "#166534" }}>✓ {fmtDateTime(c.submittedAt)}</span>
                    ) : (
                      <span style={{ color: "#9ca3af" }}>en attente</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="p-4 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
      <div className="text-2xl font-bold" style={{ color: color || "#1f2244" }}>{value}</div>
      <div className="text-xs font-jetbrains mt-1" style={{ color: "#727485" }}>{label}</div>
    </div>
  );
}

function QuestionStat({ stat }: { stat: Stat }) {
  const q = stat.question;
  if (q.type === "section_header") {
    return (
      <div className="pt-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#7dcef5" }}>{q.label}</h3>
      </div>
    );
  }
  return (
    <div className="p-4 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
      <p className="text-sm font-medium mb-3" style={{ color: "#1f2244" }}>{q.label}</p>

      {typeof stat.average === "number" && (
        <p className="text-sm font-jetbrains mb-2" style={{ color: "#1f2244" }}>
          Moyenne : <strong>{stat.average.toFixed(2)}</strong>
          {q.type === "likert_5" ? " / 5" : q.type === "scale_nps" ? " / 10" : ""}
          {typeof stat.npsScore === "number" && (
            <span style={{ color: "#3730a3" }}> · NPS {stat.npsScore > 0 ? "+" : ""}{stat.npsScore}
              {" "}({stat.npsPromoters}👍 / {stat.npsPassives}😐 / {stat.npsDetractors}👎)</span>
          )}
        </p>
      )}

      {stat.distribution && (q.type === "yes_no" || q.type === "single_choice") && (
        <ul className="space-y-1">
          {Object.entries(stat.distribution).map(([opt, n]) => (
            <li key={opt} className="flex justify-between text-sm font-jetbrains" style={{ color: "#727485" }}>
              <span>{opt}</span><span style={{ color: "#1f2244" }}>{n}</span>
            </li>
          ))}
        </ul>
      )}

      {stat.textResponses && stat.textResponses.length > 0 && (
        <ul className="space-y-2 mt-1">
          {stat.textResponses.map((t, i) => (
            <li key={i} className="text-sm p-2 rounded-lg" style={{ backgroundColor: "#f8fafc", color: "#1f2244" }}>“{t}”</li>
          ))}
        </ul>
      )}
      {stat.textResponses && stat.textResponses.length === 0 && (q.type === "text" || q.type === "textarea") && (
        <p className="text-xs font-jetbrains" style={{ color: "#9ca3af" }}>Aucune réponse texte.</p>
      )}
    </div>
  );
}
