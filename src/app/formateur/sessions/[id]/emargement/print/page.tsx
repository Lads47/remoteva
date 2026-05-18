"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Slot = "morning" | "afternoon";
type Status = "present" | "absent" | null;

interface AttendanceCell {
  date: string;
  slot: Slot;
  status: Status;
  signedAt?: string;
  signedByPrenomNom?: string;
}
interface TraineeRow {
  traineeId: string;
  prenom: string;
  nom: string;
  cells: AttendanceCell[];
}
interface GridSlot {
  date: string;
  slot: Slot;
  label: string;
}

function PrintInner({ id }: { id: string }) {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [data, setData] = useState<{
    grid: { slots: GridSlot[]; rows: TraineeRow[] };
    session: { code: string; dateDebut: string; dateFin: string };
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError("Lien invalide");
      setLoading(false);
      return;
    }
    fetch(`/api/formateur/sessions/${id}/attendance?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e.error || "Accès refusé");
        }
        return r.json();
      })
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, token]);

  // Auto-trigger print quand les données sont prêtes
  useEffect(() => {
    if (!loading && data && !error) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [loading, data, error]);

  if (loading) return <p style={{ padding: 20 }}>Chargement...</p>;
  if (error || !data) return <p style={{ padding: 20, color: "#991b1b" }}>{error || "Erreur"}</p>;

  const { grid, session } = data;
  const fmtDate = (s: string) => new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const labelStatus = (s: Status) => (s === "present" ? "P" : s === "absent" ? "A" : "");

  return (
    <div className="print-root">
      <style>{`
        @page { size: A4 landscape; margin: 12mm; }
        body { background: white !important; }
        .print-root { font-family: Arial, sans-serif; color: #111; padding: 10px; max-width: 100%; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .subtitle { font-size: 12px; color: #555; margin-bottom: 12px; }
        table { border-collapse: collapse; width: 100%; font-size: 11px; }
        th, td { border: 1px solid #999; padding: 4px 6px; text-align: center; }
        th { background: #eee; font-weight: 600; }
        td.name { text-align: left; font-weight: 600; max-width: 180px; }
        .legend { margin-top: 16px; font-size: 11px; color: #555; }
        .footer { margin-top: 24px; font-size: 11px; display: flex; justify-content: space-between; gap: 40px; }
        .sig-box { width: 30%; border-top: 1px solid #333; padding-top: 4px; }
        @media print {
          .no-print { display: none !important; }
          .print-root { padding: 0; }
        }
      `}</style>

      <div className="no-print" style={{ marginBottom: 12 }}>
        <button
          onClick={() => window.print()}
          style={{
            padding: "8px 14px",
            background: "#1f2244",
            color: "white",
            border: "none",
            borderRadius: 999,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          🖨️ Imprimer / Enregistrer en PDF
        </button>
      </div>

      <h1>Feuille d&apos;émargement — Session {session.code}</h1>
      <div className="subtitle">
        Du {fmtDate(session.dateDebut)} au {fmtDate(session.dateFin)}
      </div>

      <table>
        <thead>
          <tr>
            <th className="name">Stagiaire</th>
            {grid.slots.map((s) => (
              <th key={`${s.date}_${s.slot}`}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.length === 0 && (
            <tr>
              <td colSpan={1 + grid.slots.length} style={{ padding: 16, color: "#777" }}>
                Aucun stagiaire inscrit.
              </td>
            </tr>
          )}
          {grid.rows.map((row) => (
            <tr key={row.traineeId}>
              <td className="name">
                {row.prenom} {row.nom}
              </td>
              {grid.slots.map((s) => {
                const cell = row.cells.find((c) => c.date === s.date && c.slot === s.slot);
                return (
                  <td key={`${s.date}_${s.slot}`}>{labelStatus(cell?.status ?? null)}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="legend">
        Légende : <strong>P</strong> = Présent · <strong>A</strong> = Absent · case vide = non saisi.
      </p>

      <div className="footer">
        <div className="sig-box">
          <div>Signature du formateur</div>
        </div>
        <div className="sig-box">
          <div>Date / Lieu</div>
        </div>
      </div>
    </div>
  );
}

export default function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<p style={{ padding: 20 }}>Chargement...</p>}>
      <PrintInner id={id} />
    </Suspense>
  );
}
