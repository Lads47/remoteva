"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

interface TrainerInfo {
  id: string;
  prenom: string;
  nom: string;
  isExternal: boolean;
}

interface TrainerSession {
  id: string;
  code: string;
  dateDebut: string;
  dateFin: string;
  status: string;
  capacite: number;
  formationCode: string;
  formationNomLong: string;
  traineeCount: number;
  trainerFeeAmount: number | null;
  trainerContractDriveFileId: string | null;
  trainerContractSentAt: string | null;
}

interface Summary {
  totalSessions: number;
  totalContractsGenerated: number;
  totalContractsHt: number;
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

function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  planned: { label: "Planifiée", color: "#1f2244", bg: "#e0e7ff" },
  open: { label: "Ouverte", color: "#166534", bg: "#dcfce7" },
  full: { label: "Complète", color: "#92400e", bg: "#fef3c7" },
  closed: { label: "Clôturée", color: "#727485", bg: "#e5e7eb" },
  cancelled: { label: "Annulée", color: "#991b1b", bg: "#fee2e2" },
};

export default function TrainerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [trainer, setTrainer] = useState<TrainerInfo | null>(null);
  const [sessions, setSessions] = useState<TrainerSession[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/trainers/${id}/sessions`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setError(d.error);
          return;
        }
        setTrainer(d.trainer);
        setSessions(d.sessions || []);
        setSummary(d.summary);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div
        className="text-center py-12 font-jetbrains text-sm"
        style={{ color: "#727485" }}
      >
        Chargement...
      </div>
    );
  }

  if (error || !trainer) {
    return (
      <div>
        <Link
          href="/admin/formations/trainers"
          className="text-xs font-jetbrains underline"
          style={{ color: "#727485" }}
        >
          ← Formateurs
        </Link>
        <div
          className="mt-4 p-4 rounded-lg text-sm bg-red-50 text-red-800"
        >
          {error || "Formateur introuvable"}
        </div>
      </div>
    );
  }

  const sessionsAvecContrat = sessions.filter(
    (s) => s.trainerContractDriveFileId !== null
  );

  return (
    <div>
      <Link
        href="/admin/formations/trainers"
        className="text-xs font-jetbrains underline"
        style={{ color: "#727485" }}
      >
        ← Formateurs
      </Link>

      <div className="mt-2 mb-6 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: "#1f2244" }}>
            {trainer.prenom} {trainer.nom}
          </h1>
          <div className="flex gap-2 mt-2">
            {trainer.isExternal ? (
              <span
                className="px-2 py-0.5 rounded text-xs font-jetbrains"
                style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
              >
                Formateur externe (sous-traitant)
              </span>
            ) : (
              <span
                className="px-2 py-0.5 rounded text-xs font-jetbrains"
                style={{ backgroundColor: "#e0e7ff", color: "#3730a3" }}
              >
                Formateur interne
              </span>
            )}
          </div>
        </div>
      </div>

      {/* === Summary cards === */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <SummaryCard
            label="Sessions animées"
            value={String(summary.totalSessions)}
          />
          {trainer.isExternal && (
            <>
              <SummaryCard
                label="Contrats de sous-traitance générés"
                value={`${summary.totalContractsGenerated} / ${summary.totalSessions}`}
                color={
                  summary.totalContractsGenerated === summary.totalSessions
                    ? "#166534"
                    : "#92400e"
                }
              />
              <SummaryCard
                label="Total HT contractualisé"
                value={fmtEur(summary.totalContractsHt)}
                color="#1f2244"
              />
            </>
          )}
        </div>
      )}

      {/* === Sessions table === */}
      <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: "#727485" }}>
        Historique des sessions
      </h2>

      {sessions.length === 0 ? (
        <div
          className="text-center py-8 border rounded-lg font-jetbrains text-sm"
          style={{ borderColor: "#e5e7eb", color: "#727485" }}
        >
          Aucune session animée pour l&apos;instant
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
                <Th>Formation</Th>
                <Th>Dates</Th>
                <Th>Statut</Th>
                <Th align="right">Stag.</Th>
                {trainer.isExternal && (
                  <>
                    <Th align="right">Montant HT</Th>
                    <Th>Contrat ST</Th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const st = STATUS_LABELS[s.status] ?? STATUS_LABELS.planned;
                return (
                  <tr
                    key={s.id}
                    className="border-t"
                    style={{ borderColor: "#e5e7eb" }}
                  >
                    <Td>
                      <Link
                        href={`/admin/formations/sessions/${s.id}`}
                        className="font-jetbrains underline"
                        style={{ color: "#1f2244" }}
                      >
                        {s.code}
                      </Link>
                    </Td>
                    <Td>
                      <span className="text-xs font-jetbrains" style={{ color: "#727485" }}>
                        {s.formationCode}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-xs font-jetbrains" style={{ color: "#727485" }}>
                        {fmtDate(s.dateDebut)} → {fmtDate(s.dateFin)}
                      </span>
                    </Td>
                    <Td>
                      <span
                        className="px-2 py-0.5 rounded text-xs font-jetbrains"
                        style={{ backgroundColor: st.bg, color: st.color }}
                      >
                        {st.label}
                      </span>
                    </Td>
                    <Td align="right">
                      {s.traineeCount}/{s.capacite}
                    </Td>
                    {trainer.isExternal && (
                      <>
                        <Td align="right">
                          {s.trainerFeeAmount ? (
                            <strong>{fmtEur(s.trainerFeeAmount)}</strong>
                          ) : (
                            <span style={{ color: "#d1d5db" }}>—</span>
                          )}
                        </Td>
                        <Td>
                          {s.trainerContractDriveFileId ? (
                            <div className="flex flex-col gap-0.5">
                              <a
                                href={`https://drive.google.com/file/d/${s.trainerContractDriveFileId}/view`}
                                target="_blank"
                                rel="noreferrer"
                                className="font-jetbrains text-xs underline"
                                style={{ color: "#1d4ed8" }}
                              >
                                📎 Voir le contrat
                              </a>
                              {s.trainerContractSentAt && (
                                <span
                                  className="text-xs font-jetbrains"
                                  style={{ color: "#727485" }}
                                >
                                  envoyé {fmtDateTime(s.trainerContractSentAt)}
                                </span>
                              )}
                            </div>
                          ) : s.trainerFeeAmount ? (
                            <span
                              className="font-jetbrains text-xs"
                              style={{ color: "#92400e" }}
                            >
                              ⚠ non généré
                            </span>
                          ) : (
                            <span style={{ color: "#d1d5db" }}>—</span>
                          )}
                        </Td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {trainer.isExternal && sessions.length > sessionsAvecContrat.length && (
        <p
          className="text-xs font-jetbrains mt-4"
          style={{ color: "#92400e" }}
        >
          ⚠ Certaines sessions n&apos;ont pas de contrat de sous-traitance généré.
          Utilise le bouton &quot;📎 Contrat ST&quot; depuis la liste des sessions
          pour régulariser.
        </p>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      className="p-4 rounded-xl border"
      style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}
    >
      <div className="text-xs font-jetbrains" style={{ color: "#727485" }}>
        {label}
      </div>
      <div
        className="text-2xl font-bold mt-1"
        style={{ color: color || "#1f2244" }}
      >
        {value}
      </div>
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
      style={{ color: "#727485", textAlign: align ?? "left" }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className="px-3 py-2"
      style={{ textAlign: align ?? "left", color: "#1f2244" }}
    >
      {children}
    </td>
  );
}
