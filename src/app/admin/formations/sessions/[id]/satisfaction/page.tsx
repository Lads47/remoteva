"use client";

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
interface Synthesis {
  session: { id: string; code: string; dateDebut: string; dateFin: string };
  formation: { nomLong: string };
  totals: { invited: number; submitted: number; pending: number; responseRate: number };
  questions: Question[];
  stats: Stat[];
  responses: Array<{ submittedAt: string | null; answers: Record<string, string> }>;
}

function fmtDateFr(s: string) {
  return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

export default function SatisfactionAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Synthesis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string; url?: string } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/sessions/${id}/satisfaction`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Erreur");
        return r.json();
      })
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function archive() {
    if (archiving) return;
    setArchiving(true);
    setFeedback(null);
    try {
      const r = await fetch(`/api/admin/sessions/${id}/satisfaction`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) {
        setFeedback({ type: "error", msg: d.error || "Échec" });
        return;
      }
      setFeedback({
        type: "success",
        msg: `PDF archivé dans Drive (03_EVALUATIONS)`,
        url: d.driveWebUrl,
      });
    } catch {
      setFeedback({ type: "error", msg: "Erreur réseau" });
    } finally {
      setArchiving(false);
    }
  }

  if (loading) return <div className="py-12 text-center font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  if (error || !data)
    return (
      <div className="py-12 text-center">
        <p className="font-jetbrains text-sm" style={{ color: "#991b1b" }}>{error || "Erreur"}</p>
      </div>
    );

  return (
    <div>
      <Link href={`/admin/formations/sessions/${id}`} className="text-xs font-jetbrains underline" style={{ color: "#727485" }}>
        ← Retour à la session
      </Link>
      <h1 className="text-3xl font-bold mt-2 mb-1" style={{ color: "#1f2244" }}>
        Synthèse — Évaluation à chaud
      </h1>
      <p className="text-sm font-jetbrains mb-6" style={{ color: "#727485" }}>
        {data.formation.nomLong} · Session {data.session.code} (du {fmtDateFr(data.session.dateDebut)} au {fmtDateFr(data.session.dateFin)})
      </p>

      {/* Totaux */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Stat label="Invitations envoyées" value={String(data.totals.invited)} />
        <Stat label="Réponses reçues" value={String(data.totals.submitted)} color="#166534" />
        <Stat label="En attente" value={String(data.totals.pending)} color="#92400e" />
        <Stat label="Taux de réponse" value={`${Math.round(data.totals.responseRate * 100)} %`} color="#3730a3" />
      </div>

      {/* Actions PDF */}
      <div className="mb-6 p-4 rounded-xl border flex gap-2 flex-wrap items-center" style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}>
        <a
          href={`/api/admin/sessions/${id}/satisfaction`}
          onClick={(e) => {
            e.preventDefault();
            fetch(`/api/admin/sessions/${id}/satisfaction`, { method: "PUT" })
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
        {feedback && (
          <div
            className={`text-xs font-jetbrains px-3 py-1.5 rounded-full ${
              feedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
            }`}
          >
            {feedback.msg}
            {feedback.url && (
              <a href={feedback.url} target="_blank" rel="noreferrer" className="ml-2 underline">Drive ↗</a>
            )}
          </div>
        )}
      </div>

      {/* Stats par question */}
      <h2 className="text-lg font-semibold mb-3" style={{ color: "#1f2244" }}>Réponses par question</h2>
      <div className="space-y-4">
        {data.stats.map((stat, i) => (
          <QuestionStatCard key={i} stat={stat} />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
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
            Score NPS<br />
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
                <span className="font-jetbrains w-8" style={{ color: "#1f2244" }}>{label}</span>
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
