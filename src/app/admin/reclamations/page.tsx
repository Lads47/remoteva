"use client";

// Admin · Liste des réclamations (Qualiopi indicateur 32).
// Stats agrégées en haut + tableau filtrable par statut.

import { useEffect, useState } from "react";
import Link from "next/link";

type ComplaintStatus = "new" | "in_progress" | "resolved" | "closed";

const STATUS_LABELS: Record<ComplaintStatus, string> = {
  new: "Nouvelle",
  in_progress: "En cours",
  resolved: "Résolue",
  closed: "Clôturée",
};

const STATUS_COLORS: Record<ComplaintStatus, { bg: string; fg: string }> = {
  new: { bg: "#fee2e2", fg: "#991b1b" },
  in_progress: { bg: "#fef3c7", fg: "#92400e" },
  resolved: { bg: "#dcfce7", fg: "#166534" },
  closed: { bg: "#e5e7eb", fg: "#374151" },
};

interface Complaint {
  id: string;
  number: string;
  authorName: string;
  authorCompany: string;
  authorEmail: string;
  subject: string;
  status: ComplaintStatus;
  resolvedAt: string | null;
  responseSentAt: string | null;
  createdAt: string;
  formationNomLong: string | null;
}

interface Stats {
  year: number;
  total: number;
  byStatus: Record<ComplaintStatus, number>;
  resolved: number;
  unresolved: number;
  resolutionRate: number;
  averageResolutionDays: number;
  overdue: number;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function daysSince(s: string): number {
  return Math.floor((Date.now() - new Date(s).getTime()) / (24 * 3600 * 1000));
}

export default function ReclamationsListPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<ComplaintStatus | "all">("all");

  function load() {
    setLoading(true);
    const url = filter === "all"
      ? "/api/admin/reclamations"
      : `/api/admin/reclamations?status=${filter}`;
    fetch(url)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Erreur");
        return r.json();
      })
      .then((d) => {
        setComplaints(d.complaints);
        setStats(d.stats);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [filter]);

  if (loading && !stats) {
    return <div className="text-center py-12 font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  }
  if (error && !stats) {
    return <div className="text-center py-12 font-jetbrains text-sm" style={{ color: "#991b1b" }}>{error}</div>;
  }

  return (
    <div>
      <Link href="/admin/formations" className="text-xs font-jetbrains underline" style={{ color: "#727485" }}>
        ← Catalogue formations
      </Link>
      <div className="mt-2 mb-8">
        <h1 className="text-3xl font-bold" style={{ color: "#1f2244" }}>
          ⚠ Réclamations
        </h1>
        <p className="text-sm mt-1 font-jetbrains" style={{ color: "#727485" }}>
          Qualiopi indicateur 32 — engagement de traitement sous 30 jours.
          {" "}<Link href="/reclamation" target="_blank" className="underline">Voir le formulaire public ↗</Link>
        </p>
      </div>

      {/* Stats annuelles */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <StatCard label={`Total ${stats.year}`} value={String(stats.total)} />
          <StatCard label="Résolues" value={String(stats.resolved)} color="#166534" />
          <StatCard label="En cours / nouvelles" value={String(stats.unresolved)} color="#92400e" />
          <StatCard label="Taux de résolution" value={`${Math.round(stats.resolutionRate * 100)} %`} color="#3730a3" />
          <StatCard label="Délai moyen" value={`${stats.averageResolutionDays} j`} color="#727485" />
        </div>
      )}

      {stats && stats.overdue > 0 && (
        <div className="mb-6 p-3 rounded-lg text-sm font-jetbrains" style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}>
          ⚠ <strong>{stats.overdue} réclamation{stats.overdue > 1 ? "s" : ""} en retard</strong>
          {" "}(ouverte{stats.overdue > 1 ? "s" : ""} depuis plus de 30 jours). Engagement Qualiopi non respecté.
        </div>
      )}

      {/* Filtres */}
      <div className="mb-4 flex gap-2 flex-wrap">
        {(["all", "new", "in_progress", "resolved", "closed"] as const).map((f) => {
          const isActive = filter === f;
          const label = f === "all" ? "Toutes" : STATUS_LABELS[f as ComplaintStatus];
          const count = f === "all" ? stats?.total ?? 0 : stats?.byStatus[f as ComplaintStatus] ?? 0;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer transition-colors"
              style={{
                borderColor: isActive ? "#1f2244" : "#e5e7eb",
                backgroundColor: isActive ? "#1f2244" : "white",
                color: isActive ? "white" : "#1f2244",
              }}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Tableau */}
      {complaints.length === 0 ? (
        <div className="text-center py-12 border rounded-xl font-jetbrains text-sm" style={{ borderColor: "#e5e7eb", color: "#727485" }}>
          Aucune réclamation {filter !== "all" ? `avec ce statut.` : "pour le moment."}
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden" style={{ borderColor: "#e5e7eb" }}>
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: "#f9fafb" }}>
              <tr>
                <Th>N°</Th>
                <Th>Objet</Th>
                <Th>Auteur</Th>
                <Th>Statut</Th>
                <Th>Reçue</Th>
                <Th>Délai</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {complaints.map((c) => {
                const palette = STATUS_COLORS[c.status];
                const days = daysSince(c.createdAt);
                const isOverdue = !c.resolvedAt && days > 30;
                return (
                  <tr key={c.id} className="border-t" style={{ borderColor: "#e5e7eb" }}>
                    <td className="px-3 py-3 font-jetbrains text-xs" style={{ color: "#1f2244" }}>{c.number}</td>
                    <td className="px-3 py-3">
                      <div className="font-medium" style={{ color: "#1f2244" }}>{c.subject}</div>
                      {c.formationNomLong && (
                        <div className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>{c.formationNomLong}</div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <div style={{ color: "#1f2244" }}>{c.authorName}</div>
                      {c.authorCompany && <div className="text-xs" style={{ color: "#9ca3af" }}>{c.authorCompany}</div>}
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs font-jetbrains px-2 py-0.5 rounded-full" style={{ backgroundColor: palette.bg, color: palette.fg }}>
                        {STATUS_LABELS[c.status]}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs font-jetbrains" style={{ color: "#727485" }}>{fmtDate(c.createdAt)}</td>
                    <td className="px-3 py-3 text-xs font-jetbrains">
                      <span style={{ color: isOverdue ? "#991b1b" : "#727485", fontWeight: isOverdue ? 600 : 400 }}>
                        {c.resolvedAt ? `Résolu en ${Math.floor((new Date(c.resolvedAt).getTime() - new Date(c.createdAt).getTime()) / (24 * 3600 * 1000))}j` : `${days}j ${isOverdue ? "⚠" : ""}`}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`/admin/reclamations/${c.id}`}
                        className="text-xs px-3 py-1.5 rounded-full border cursor-pointer"
                        style={{ borderColor: "#1f2244", color: "#1f2244" }}
                      >
                        Traiter →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "#727485" }}>
      {children}
    </th>
  );
}
