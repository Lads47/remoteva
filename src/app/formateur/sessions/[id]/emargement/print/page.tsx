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
  const queryDay = params.get("day");

  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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
      .then((d: Payload) => setData(d))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, token]);

  // Liste des jours uniques de la session
  const days = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    for (const s of data.grid.slots) set.add(s.date);
    return Array.from(set).sort();
  }, [data]);

  // Au premier chargement, pré-sélectionne le jour : ?day=... s'il est valide, sinon le 1er
  useEffect(() => {
    if (!data) return;
    if (selectedDay && days.includes(selectedDay)) return;
    const initial = queryDay && days.includes(queryDay) ? queryDay : days[0] ?? null;
    setSelectedDay(initial);
  }, [data, days, queryDay, selectedDay]);

  if (loading) return <p style={{ padding: 20 }}>Chargement...</p>;
  if (error || !data) return <p style={{ padding: 20, color: "#991b1b" }}>{error || "Erreur"}</p>;

  return (
    <div className="print-root">
      <style>{`
        :root { --eva-blue: #1f2244; }

        @page { size: A4 portrait; margin: 0; }
        body { background: #f1f5f9 !important; margin: 0; }

        .print-root {
          font-family: var(--font-geist-sans), 'Geist Sans', Arial, Helvetica, sans-serif;
          color: var(--eva-blue);
        }

        /* En mode écran : on simule une feuille A4 centrée avec un peu d'ombre */
        .page {
          width: 210mm;
          min-height: 297mm;
          margin: 24px auto;
          padding: 15mm 15mm 25mm 15mm;
          background: white;
          box-shadow: 0 2px 20px rgba(31, 34, 68, 0.15);
          position: relative;
          box-sizing: border-box;
        }

        @media print {
          body { background: white !important; }
          .page {
            width: auto;
            min-height: 0;
            margin: 0;
            padding: 15mm 15mm 20mm 15mm;
            box-shadow: none;
          }
          .no-print { display: none !important; }
        }

        .top-row { display: flex; justify-content: flex-end; margin-bottom: 28px; }
        .logo {
          height: 56px; width: auto;
          object-fit: contain;
        }

        .title-box {
          border: 1.5px dashed var(--eva-blue);
          padding: 14px 24px;
          text-align: center;
          margin: 0 30px 22px;
        }
        .title-box h1 {
          margin: 0;
          font-family: var(--font-montserrat), Georgia, 'Times New Roman', serif;
          font-style: italic;
          font-weight: 700;
          font-size: 22px;
          letter-spacing: 1px;
          color: var(--eva-blue);
        }

        .info-box {
          border: 1.5px solid var(--eva-blue);
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
          color: var(--eva-blue);
        }
        .info-line { display: flex; align-items: baseline; }

        table.emargement {
          border-collapse: collapse; width: 100%;
          font-size: 11.5px;
          margin-bottom: 8px;
        }
        table.emargement th, table.emargement td {
          border: 1px solid var(--eva-blue);
          padding: 6px 8px;
          text-align: center;
          vertical-align: middle;
        }
        table.emargement thead th {
          background: white;
          color: var(--eva-blue);
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
        table.emargement td.sig { width: 25%; height: 50px; }
        table.emargement td.hours { width: 22%; height: 50px; }
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

        .signature-block {
          margin-top: 18px;
          font-size: 11.5px;
          line-height: 1.8;
        }
        .signature-block strong { font-weight: 600; }
        .sig-zone {
          margin-top: 8px;
          height: 70px;
          border: 1px dashed #d1d5db;
        }

        .footer {
          position: absolute;
          bottom: 10mm; left: 15mm; right: 15mm;
          text-align: center;
          font-size: 9px;
          color: var(--eva-blue);
          line-height: 1.5;
          font-family: var(--font-jetbrains-mono), 'JetBrains Mono', monospace;
          border-top: 1px solid #e5e7eb;
          padding-top: 4px;
        }

        /* Barre d'outils (uniquement écran) */
        .toolbar {
          max-width: 210mm;
          margin: 24px auto 0;
          padding: 12px 16px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.06);
          display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
        }
        .toolbar label {
          font-size: 13px; color: var(--eva-blue); font-weight: 600;
        }
        .toolbar select {
          padding: 6px 10px;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          font-size: 13px;
          font-family: inherit;
          color: var(--eva-blue);
          background: white;
        }
        .toolbar button {
          margin-left: auto;
          padding: 8px 14px;
          background: var(--eva-blue);
          color: white;
          border: none; border-radius: 999px;
          cursor: pointer; font-size: 13px;
        }
      `}</style>

      {/* Barre d'outils (écran uniquement) */}
      <div className="toolbar no-print">
        <label htmlFor="day-select">Jour :</label>
        <select
          id="day-select"
          value={selectedDay ?? ""}
          onChange={(e) => setSelectedDay(e.target.value)}
        >
          {days.map((d) => (
            <option key={d} value={d}>
              {fmtDateLong(d)}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => window.print()}>
          🖨️ Imprimer / Enregistrer en PDF
        </button>
      </div>

      {selectedDay && <DayPage day={selectedDay} data={data} />}
    </div>
  );
}

function DayPage({ day, data }: { day: string; data: Payload }) {
  const { session, formation, trainer, grid } = data;

  function statusOf(row: TraineeRow, slot: Slot): Status {
    const c = row.cells.find((c) => c.date === day && c.slot === slot);
    return c?.status ?? null;
  }

  function hoursOf(row: TraineeRow): number {
    let h = 0;
    if (statusOf(row, "morning") === "present") h += HOURS_PER_SLOT;
    if (statusOf(row, "afternoon") === "present") h += HOURS_PER_SLOT;
    return h;
  }

  const totalHeures = grid.rows.reduce((sum, row) => sum + hoursOf(row), 0);

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

  const trainerFullName = `${trainer.prenom} ${trainer.nom}`;

  return (
    <section className="page">
      <div className="top-row">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-lads-fonce.svg" alt="Les Ateliers du Stream" className="logo" />
      </div>

      <div className="title-box">
        <h1>ÉTAT D&apos;ÉMARGEMENT COLLECTIF</h1>
      </div>

      <div className="info-box">
        <InfoLine label="Intitulé et n° du stage" value={`${formation.nomLong} (${session.code})`} />
        <InfoLine label="Lieu du stage" value={session.lieu || ""} />
        <InfoLine label="Date de l’émargement" value={fmtDateLong(day)} />
        <InfoLine label="Nom du ou des formateurs" value={trainerFullName} />
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
          {grid.rows.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: 20, color: "#777", fontStyle: "italic" }}>
                Aucun stagiaire inscrit à cette session.
              </td>
            </tr>
          )}
          {grid.rows.map((row) => (
            <tr key={row.traineeId}>
              <td className="name">{row.prenom} {row.nom}</td>
              <td className="sig">{renderSignCell(statusOf(row, "morning"))}</td>
              <td className="sig">{renderSignCell(statusOf(row, "afternoon"))}</td>
              <td className="hours">{fmtHours(hoursOf(row))}</td>
            </tr>
          ))}
          {grid.rows.length > 0 && (
            <tr className="total">
              <td></td>
              <td></td>
              <td>TOTAL HEURES -<br />STAGIAIRES</td>
              <td>{fmtHours(totalHeures)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="sig-hint">
        Le stagiaire signe dans chaque case correspondant à sa demi-journée de présence. La mention
        « ABSENT » est portée par le formateur en cas d&apos;absence.
      </div>

      <div className="signature-block">
        Certifié exact par l’organisme,
        <br />
        par <strong>{trainerFullName}</strong>
        <br />
        Date : {fmtDateLong(day)}
        <br />
        Signature du ou des formateurs :
        <div className="sig-zone" aria-hidden />
      </div>

      <div className="footer">
        {FOOTER_LINE1}
        <br />
        {FOOTER_LINE2}
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
