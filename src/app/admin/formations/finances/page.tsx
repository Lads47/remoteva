"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface SessionFinanceRow {
  sessionId: string;
  code: string;
  dateDebut: string;
  dateFin: string;
  formationCode: string;
  formationNomLong: string;
  trainerNomComplet: string | null;
  trainerIsExternal: boolean;
  traineeCount: number;
  caHt: number;
  coutSousTraitanceHt: number;
  margeHt: number;
  margePct: number | null;
}

interface FinanceOverview {
  year: number;
  totalCaHt: number;
  totalCoutSousTraitanceHt: number;
  totalMargeHt: number;
  margeMoyennePct: number | null;
  sessionsCount: number;
  externalSessionsCount: number;
  sessions: SessionFinanceRow[];
}

interface Formation {
  id: string;
  code: string;
  nomLong: string;
}

function fmtEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function FinancesPage() {
  const [overview, setOverview] = useState<FinanceOverview | null>(null);
  const [yearsAvailable, setYearsAvailable] = useState<number[]>([]);
  const [formations, setFormations] = useState<Formation[]>([]);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedFormationId, setSelectedFormationId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/formations")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.formations)) setFormations(d.formations);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ year: String(selectedYear) });
    if (selectedFormationId) params.set("formationId", selectedFormationId);
    fetch(`/api/admin/formations/finances?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.overview) setOverview(d.overview);
        if (Array.isArray(d.yearsAvailable)) {
          setYearsAvailable(d.yearsAvailable.length ? d.yearsAvailable : [new Date().getFullYear()]);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedYear, selectedFormationId]);

  return (
    <div>
      <Link
        href="/admin/formations"
        className="text-xs font-jetbrains underline"
        style={{ color: "#727485" }}
      >
        ← Tableau de bord
      </Link>
      <div className="flex justify-between items-start mt-2 mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: "#1f2244" }}>
            Finances par session
          </h1>
          <p className="text-sm mt-1 font-jetbrains" style={{ color: "#727485" }}>
            CA HT par session, coûts de sous-traitance et marge brute. Les sessions
            terminées de l&apos;année sélectionnée uniquement.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <label className="text-xs font-jetbrains" style={{ color: "#727485" }}>
            Année
          </label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            className="px-3 py-1.5 rounded-lg border text-sm"
            style={{ borderColor: "#d1d5db" }}
          >
            {yearsAvailable.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <label className="text-xs font-jetbrains ml-2" style={{ color: "#727485" }}>
            Formation
          </label>
          <select
            value={selectedFormationId}
            onChange={(e) => setSelectedFormationId(e.target.value)}
            className="px-3 py-1.5 rounded-lg border text-sm"
            style={{ borderColor: "#d1d5db" }}
          >
            <option value="">Toutes</option>
            {formations.map((f) => (
              <option key={f.id} value={f.id}>
                {f.code}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div
          className="text-center py-12 font-jetbrains text-sm"
          style={{ color: "#727485" }}
        >
          Chargement...
        </div>
      ) : !overview ? (
        <div
          className="text-center py-12 font-jetbrains text-sm border rounded-lg"
          style={{ color: "#727485", borderColor: "#e5e7eb" }}
        >
          Aucune donnée disponible
        </div>
      ) : (
        <>
          {/* === KPI cards === */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard label="CA HT total" value={fmtEur(overview.totalCaHt)} />
            <StatCard
              label="Coûts sous-traitance HT"
              value={fmtEur(overview.totalCoutSousTraitanceHt)}
              color="#92400e"
              hint={
                overview.externalSessionsCount > 0
                  ? `sur ${overview.externalSessionsCount} session${overview.externalSessionsCount > 1 ? "s" : ""} externe${overview.externalSessionsCount > 1 ? "s" : ""}`
                  : "Aucun formateur externe"
              }
            />
            <StatCard
              label="Marge brute HT"
              value={fmtEur(overview.totalMargeHt)}
              color={overview.totalMargeHt >= 0 ? "#166534" : "#991b1b"}
            />
            <StatCard
              label="Marge moyenne"
              value={
                overview.margeMoyennePct !== null
                  ? `${overview.margeMoyennePct} %`
                  : "—"
              }
              color={
                overview.margeMoyennePct === null
                  ? "#727485"
                  : overview.margeMoyennePct >= 60
                  ? "#166534"
                  : overview.margeMoyennePct >= 30
                  ? "#92400e"
                  : "#991b1b"
              }
            />
          </div>

          {/* === Tableau par session === */}
          {overview.sessions.length === 0 ? (
            <div
              className="text-center py-8 font-jetbrains text-sm border rounded-lg"
              style={{ color: "#727485", borderColor: "#e5e7eb" }}
            >
              Aucune session terminée pour cette période
            </div>
          ) : (
            <div
              className="border rounded-lg overflow-hidden"
              style={{ borderColor: "#e5e7eb" }}
            >
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: "#fafbff" }}>
                  <tr>
                    <Th>Session</Th>
                    <Th>Dates</Th>
                    <Th>Formation</Th>
                    <Th>Formateur</Th>
                    <Th align="right">Stag.</Th>
                    <Th align="right">CA HT</Th>
                    <Th align="right">Coût ST</Th>
                    <Th align="right">Marge</Th>
                    <Th align="right">%</Th>
                  </tr>
                </thead>
                <tbody>
                  {overview.sessions.map((s) => (
                    <tr
                      key={s.sessionId}
                      className="border-t"
                      style={{ borderColor: "#e5e7eb" }}
                    >
                      <Td>
                        <Link
                          href={`/admin/formations/sessions/${s.sessionId}`}
                          className="font-jetbrains underline"
                          style={{ color: "#1f2244" }}
                        >
                          {s.code}
                        </Link>
                      </Td>
                      <Td>
                        <span className="text-xs font-jetbrains" style={{ color: "#727485" }}>
                          {fmtDate(s.dateDebut)} → {fmtDate(s.dateFin)}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-xs font-jetbrains" style={{ color: "#727485" }}>
                          {s.formationCode}
                        </span>
                      </Td>
                      <Td>
                        {s.trainerNomComplet ? (
                          <span className="text-xs">
                            {s.trainerNomComplet}
                            {s.trainerIsExternal && (
                              <span
                                className="ml-1.5 px-1.5 py-0.5 rounded text-xs font-jetbrains"
                                style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
                              >
                                ext
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: "#9ca3af" }}>
                            —
                          </span>
                        )}
                      </Td>
                      <Td align="right">{s.traineeCount}</Td>
                      <Td align="right">
                        <strong>{fmtEur(s.caHt)}</strong>
                      </Td>
                      <Td align="right">
                        {s.coutSousTraitanceHt > 0 ? (
                          <span style={{ color: "#92400e" }}>
                            {fmtEur(s.coutSousTraitanceHt)}
                          </span>
                        ) : (
                          <span style={{ color: "#d1d5db" }}>—</span>
                        )}
                      </Td>
                      <Td align="right">
                        <strong
                          style={{
                            color: s.margeHt >= 0 ? "#166534" : "#991b1b",
                          }}
                        >
                          {fmtEur(s.margeHt)}
                        </strong>
                      </Td>
                      <Td align="right">
                        {s.margePct !== null ? (
                          <span
                            className="font-jetbrains text-xs"
                            style={{
                              color:
                                s.margePct >= 60
                                  ? "#166534"
                                  : s.margePct >= 30
                                  ? "#92400e"
                                  : "#991b1b",
                            }}
                          >
                            {s.margePct} %
                          </span>
                        ) : (
                          <span style={{ color: "#d1d5db" }}>—</span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot
                  className="border-t-2"
                  style={{ borderColor: "#1f2244", backgroundColor: "#fafbff" }}
                >
                  <tr>
                    <Td colSpan={5}>
                      <strong>Total {overview.year}</strong>
                    </Td>
                    <Td align="right">
                      <strong>{fmtEur(overview.totalCaHt)}</strong>
                    </Td>
                    <Td align="right">
                      <strong style={{ color: "#92400e" }}>
                        {fmtEur(overview.totalCoutSousTraitanceHt)}
                      </strong>
                    </Td>
                    <Td align="right">
                      <strong
                        style={{
                          color: overview.totalMargeHt >= 0 ? "#166534" : "#991b1b",
                        }}
                      >
                        {fmtEur(overview.totalMargeHt)}
                      </strong>
                    </Td>
                    <Td align="right">
                      <strong style={{ color: "#1f2244" }}>
                        {overview.margeMoyennePct !== null
                          ? `${overview.margeMoyennePct} %`
                          : "—"}
                      </strong>
                    </Td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <p
            className="text-xs font-jetbrains mt-4"
            style={{ color: "#727485" }}
          >
            ℹ️ Le CA HT est calculé à partir du champ <em>montantHT</em> de chaque
            stagiaire. Les coûts de sous-traitance ne sont comptés que pour les
            sessions assignées à un formateur externe (Qualiopi ind. 27).
          </p>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string;
  color?: string;
  hint?: string;
}) {
  return (
    <div
      className="p-4 rounded-xl border"
      style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}
    >
      <div className="text-xs font-jetbrains" style={{ color: "#727485" }}>
        {label}
      </div>
      <div className="text-2xl font-bold mt-1" style={{ color: color || "#1f2244" }}>
        {value}
      </div>
      {hint && (
        <div
          className="text-xs font-jetbrains mt-1"
          style={{ color: color || "#727485" }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className="px-3 py-2 text-xs font-jetbrains font-medium"
      style={{
        color: "#727485",
        textAlign: align ?? "left",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  colSpan,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  colSpan?: number;
}) {
  return (
    <td
      className="px-3 py-2"
      colSpan={colSpan}
      style={{ textAlign: align ?? "left", color: "#1f2244" }}
    >
      {children}
    </td>
  );
}
