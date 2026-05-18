"use client";

import { Suspense, use, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Slot = "morning" | "afternoon";
type Status = "present" | "absent" | null;

interface AttendanceCell {
  date: string;
  slot: Slot;
  status: Status;
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
}

interface Payload {
  session: { id: string; code: string; dateDebut: string; dateFin: string; lieu: string };
  formation: { code: string; nomLong: string };
  trainer: { prenom: string; nom: string };
  grid: { slots: GridSlot[]; rows: TraineeRow[] };
}

// Heures considérées par demi-journée (modifiable au besoin)
const HOURS_PER_SLOT = 3.5;

// Coordonnées de l'organisme (modifier ici si elles changent)
const FOOTER_LINE1 = "Les Ateliers du Stream - Siège : 39 bis rue Robert Creuzet 47200 MARMANDE - Siret : 81950223800036 - APE : 59.11B - formation@lesateliersdustream.fr";
const FOOTER_LINE2 = "Tel : 06.46.65.65.77 – Organisme de formation professionnelle continue - NDA N°75470196847";
const SIGNATAIRE = "Mme Noémie Marphay";

function fmtDateLong(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function PrintInner({ id }: { id: string }) {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [data, setData] = useState<Payload | null>(null);
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

  // Regroupe les slots par jour : [{ date, morning?: GridSlot, afternoon?: GridSlot }]
  const days = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { date: string; morning: boolean; afternoon: boolean }>();
    for (const s of data.grid.slots) {
      if (!map.has(s.date)) map.set(s.date, { date: s.date, morning: false, afternoon: false });
      const day = map.get(s.date)!;
      if (s.slot === "morning") day.morning = true;
      if (s.slot === "afternoon") day.afternoon = true;
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  // Auto-trigger print
  useEffect(() => {
    if (!loading && data && !error) {
      const t = setTimeout(() => window.print(), 500);
      return () => clearTimeout(t);
    }
  }, [loading, data, error]);

  if (loading) return <p style={{ padding: 20 }}>Chargement...</p>;
  if (error || !data) return <p style={{ padding: 20, color: "#991b1b" }}>{error || "Erreur"}</p>;

  return (
    <div className="print-root">
      <style>{`
        @page { size: A4 portrait; margin: 15mm 15mm 20mm 15mm; }
        body { background: white !important; margin: 0; }
        .print-root { font-family: 'Open Sans', Arial, Helvetica, sans-serif; color: #1f2244; }
        .page { page-break-after: always; padding: 0; }
        .page:last-child { page-break-after: auto; }

        .top-row { display: flex; justify-content: flex-end; margin-bottom: 8px; }
        .logo {
          width: 50px; height: 50px; border-radius: 50%;
          background: #1f2244; color: white;
          display: flex; align-items: center; justify-content: center;
          font-size: 22px;
        }

        .title-box {
          border: 1.5px dashed #1f2244;
          padding: 14px 24px;
          text-align: center;
          margin: 0 30px 22px;
        }
        .title-box h1 {
          margin: 0;
          font-family: Georgia, 'Times New Roman', serif;
          font-style: italic;
          font-weight: bold;
          font-size: 22px;
          letter-spacing: 1px;
          color: #1f2244;
        }

        .info-box {
          border: 1.5px solid #1f2244;
          padding: 12px 14px;
          font-size: 11.5px;
          line-height: 1.7;
          margin-bottom: 18px;
        }
        .info-box .label { font-weight: 600; }
        .info-box .dotted {
          display: inline-block;
          flex: 1;
          border-bottom: 1px dotted #6b7280;
          margin-left: 6px;
          padding-bottom: 0;
          color: #1f2244;
        }
        .info-line { display: flex; align-items: baseline; }

        table.emargement {
          border-collapse: collapse; width: 100%;
          font-size: 11px; margin-bottom: 6px;
        }
        table.emargement th, table.emargement td {
          border: 1px solid #1f2244;
          padding: 6px 8px;
          text-align: center;
          vertical-align: middle;
        }
        table.emargement thead th {
          background: white;
          color: #1f2244;
          font-weight: 700;
          font-size: 10.5px;
          letter-spacing: 0.3px;
        }
        table.emargement td.name {
          text-align: left;
          font-weight: 600;
          width: 28%;
          height: 50px;
        }
        /* Cases signature : grandes, vides — le stagiaire signe dedans */
        table.emargement td.sig {
          width: 25%;
          height: 50px;
        }
        table.emargement td.hours {
          width: 22%;
          height: 50px;
        }
        table.emargement td.empty { background: white; }
        table.emargement tr.total td {
          height: 28px;
          font-weight: 700;
          letter-spacing: 0.3px;
        }
        table.emargement .absent {
          font-style: italic;
          font-weight: 700;
          letter-spacing: 1px;
          color: #991b1b;
          font-size: 12px;
        }
        .sig-hint {
          font-size: 10px;
          font-style: italic;
          color: #6b7280;
          margin-bottom: 12px;
        }

        .signature-block { margin-top: 22px; font-size: 11.5px; line-height: 1.8; }
        .signature-block strong { font-weight: 600; }
        .sig-zone {
          margin-top: 8px;
          height: 70px;
          border: 1px dashed #d1d5db;
        }

        .footer {
          position: fixed;
          bottom: 8mm; left: 15mm; right: 15mm;
          text-align: center;
          font-size: 9.5px;
          color: #1f2244;
          line-height: 1.5;
          border-top: 1px solid #e5e7eb;
          padding-top: 4px;
        }

        @media print {
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print" style={{ padding: 16 }}>
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

      {days.length === 0 && (
        <p style={{ padding: 20, color: "#777" }}>
          La session n&apos;a aucune demi-journée à émarger.
        </p>
      )}

      {days.map((day) => (
        <DayPage
          key={day.date}
          day={day}
          data={data}
        />
      ))}

      <div className="footer">
        {FOOTER_LINE1}
        <br />
        {FOOTER_LINE2}
      </div>
    </div>
  );
}

function DayPage({
  day,
  data,
}: {
  day: { date: string; morning: boolean; afternoon: boolean };
  data: Payload;
}) {
  const { session, formation, trainer, grid } = data;

  // Récupère les statuts du jour pour chaque stagiaire
  function statusOf(row: TraineeRow, slot: Slot): Status {
    const c = row.cells.find((c) => c.date === day.date && c.slot === slot);
    return c?.status ?? null;
  }

  function hoursOf(row: TraineeRow): number {
    let h = 0;
    if (statusOf(row, "morning") === "present") h += HOURS_PER_SLOT;
    if (statusOf(row, "afternoon") === "present") h += HOURS_PER_SLOT;
    return h;
  }

  const totalHeures = grid.rows.reduce((sum, row) => sum + hoursOf(row), 0);

  // Cellule signature : si "absent" → mention ABSENT figée ; sinon case vide
  // pour signature manuscrite du stagiaire le jour J.
  function renderSignCell(status: Status) {
    if (status === "absent") return <span className="absent">ABSENT</span>;
    return "";
  }

  function fmtHours(h: number): string {
    if (h === 0) return "—";
    const heures = Math.floor(h);
    const minutes = Math.round((h - heures) * 60);
    return minutes === 0 ? `${heures}h` : `${heures}h${String(minutes).padStart(2, "0")}`;
  }

  // Min 8 lignes pour respecter le template (cases vides en bas si moins de stagiaires)
  const minRows = 8;
  const filler = Math.max(0, minRows - grid.rows.length);

  return (
    <section className="page">
      <div className="top-row">
        <div className="logo" title="Les Ateliers du Stream">⌬</div>
      </div>

      <div className="title-box">
        <h1>ÉTAT D&apos;ÉMARGEMENT COLLECTIF</h1>
      </div>

      <div className="info-box">
        <InfoLine label="Intitulé et n° du stage" value={`${formation.nomLong} (${session.code})`} />
        <InfoLine label="Lieu du stage" value={session.lieu || ""} />
        <InfoLine label="Date de l’émargement" value={fmtDateLong(day.date)} />
        <InfoLine label="Nom du ou des formateurs" value={`${trainer.prenom} ${trainer.nom}`} />
        <InfoLine label="Client / Financeur du stage" value="" />
        <InfoLine label="Intitulé du module de formation" value={formation.nomLong} />
      </div>

      <table className="emargement">
        <thead>
          <tr>
            <th rowSpan={2} style={{ width: "30%" }}>NOMS - PRENOMS<br />DES STAGIAIRES</th>
            <th colSpan={2}>EMARGEMENT</th>
            <th rowSpan={2}>NOMBRE D’HEURES -<br />STAGIAIRES</th>
          </tr>
          <tr>
            <th>Matin</th>
            <th>Après-midi</th>
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row) => (
            <tr key={row.traineeId}>
              <td className="name">{row.prenom} {row.nom}</td>
              <td className="sig">{renderSignCell(statusOf(row, "morning"))}</td>
              <td className="sig">{renderSignCell(statusOf(row, "afternoon"))}</td>
              <td className="hours">{fmtHours(hoursOf(row))}</td>
            </tr>
          ))}
          {Array.from({ length: filler }).map((_, i) => (
            <tr key={`filler-${i}`}>
              <td className="name empty"></td>
              <td className="sig empty"></td>
              <td className="sig empty"></td>
              <td className="hours empty"></td>
            </tr>
          ))}
          <tr className="total">
            <td className="empty"></td>
            <td className="empty"></td>
            <td>TOTAL HEURES -<br />STAGIAIRES</td>
            <td>{fmtHours(totalHeures)}</td>
          </tr>
        </tbody>
      </table>

      <div className="sig-hint">
        Le stagiaire signe dans chaque case correspondant à sa demi-journée de présence. La mention
        « ABSENT » est portée par le formateur en cas d&apos;absence.
      </div>

      <div className="signature-block">
        Certifié exact par l’organisme,
        <br />
        par <strong>{SIGNATAIRE}</strong>
        <br />
        Date :
        <br />
        Signature du ou des formateurs :
        <div className="sig-zone" aria-hidden />
      </div>
    </section>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-line">
      <span className="label">{label} :</span>
      <span className="dotted">&nbsp;{value}</span>
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
