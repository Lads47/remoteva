"use client";

// Grille d'évaluation VIERGE (exercices + critères) au format tableau, à
// imprimer / exporter en PDF pour la présenter à l'auditeur Qualiopi.
// Reprend la structure du PDF de synthèse stagiaire mais sans aucune note :
// on montre la grille et l'échelle utilisées (Acquis / En cours / Non acquis).

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, isAbortError } from "@/lib/api-client";

interface Criterion {
  id: string;
  ordre: number;
  libelle: string;
}
interface Exercise {
  id: string;
  ordre: number;
  titre: string;
  description: string;
  active: boolean;
  criteria: Criterion[];
}
interface FormationLite {
  id: string;
  code: string;
  nomLong: string;
}

export default function EvaluationGridBlankPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [formation, setFormation] = useState<FormationLite | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const ac = new AbortController();
    Promise.all([
      apiFetch<{ formations?: FormationLite[] }>(`/api/admin/formations`, { signal: ac.signal }),
      apiFetch<{ exercises?: Exercise[] }>(`/api/admin/formations/${id}/exercises`, { signal: ac.signal }),
    ])
      .then(([fs, ex]) => {
        const found = (fs.formations || []).find((f: FormationLite) => f.id === id);
        if (!found) { setError("Formation introuvable"); return; }
        setFormation(found);
        setExercises((ex.exercises || []).filter((e: Exercise) => e.active));
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setError("Erreur de chargement");
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [id]);

  if (loading) return <div className="p-12 text-center font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  if (error || !formation) {
    return (
      <div className="p-12 text-center">
        <p className="font-jetbrains text-sm" style={{ color: "#991b1b" }}>{error}</p>
        <Link href={`/admin/formations/${id}/evaluation-grid`} className="underline text-sm" style={{ color: "#1f2244" }}>
          ← Retour à la grille
        </Link>
      </div>
    );
  }

  const totalCriteres = exercises.reduce((n, e) => n + e.criteria.length, 0);

  return (
    <div className="print-root">
      {/* Barre d'action — masquée à l'impression */}
      <div className="no-print" style={{ position: "sticky", top: 0, background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 100 }}>
        <Link href={`/admin/formations/${id}/evaluation-grid`} className="text-xs font-jetbrains underline" style={{ color: "#727485" }}>
          ← Retour à la grille
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="px-4 py-2 rounded-full text-sm font-medium text-white cursor-pointer"
          style={{ backgroundColor: "#1f2244" }}
        >
          🖨️ Imprimer / PDF
        </button>
      </div>

      {/* Contenu imprimable */}
      <div className="print-content">
        <div className="grid-page">
          <header className="doc-header">
            <h1 className="doc-title">Grille d&apos;évaluation des compétences</h1>
            <p className="doc-subtitle">{formation.nomLong}</p>
            <p className="doc-meta">Formation {formation.code} · Les Ateliers du Stream</p>
          </header>

          {/* Bloc d'identification vierge */}
          <div className="ident">
            <span>Stagiaire&nbsp;: <span className="blank">&nbsp;</span></span>
            <span>Formateur·rice&nbsp;: <span className="blank">&nbsp;</span></span>
            <span>Date&nbsp;: <span className="blank blank-sm">&nbsp;</span></span>
          </div>

          <p className="legend">
            Chaque critère est évalué selon l&apos;échelle&nbsp;:
            <strong> Acquis</strong> · <strong>En cours d&apos;acquisition</strong> · <strong>Non acquis</strong>.
            Grille type&nbsp;: {exercises.length} exercice{exercises.length > 1 ? "s" : ""},
            {" "}{totalCriteres} critère{totalCriteres > 1 ? "s" : ""} au total.
          </p>

          {exercises.length === 0 ? (
            <p className="empty">Aucun exercice actif dans cette grille.</p>
          ) : (
            exercises.map((e) => (
              <section key={e.id} className="exercise-block">
                <div className="exercise-head">
                  <span className="exercise-number">Exercice {e.ordre}</span>
                  <h2 className="exercise-title">{e.titre}</h2>
                </div>
                {e.description && <p className="exercise-desc">{e.description}</p>}
                <table className="grid-table">
                  <thead>
                    <tr>
                      <th className="col-crit">Critère évalué</th>
                      <th className="col-eval">Acquis</th>
                      <th className="col-eval">En cours d&apos;acquisition</th>
                      <th className="col-eval">Non acquis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.criteria.length === 0 ? (
                      <tr><td colSpan={4} className="no-crit">Aucun critère défini pour cet exercice.</td></tr>
                    ) : (
                      e.criteria.map((c) => (
                        <tr key={c.id}>
                          <td className="col-crit">{c.libelle}</td>
                          <td className="col-eval"></td>
                          <td className="col-eval"></td>
                          <td className="col-eval"></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                <div className="appreciation">
                  Appréciation globale de l&apos;exercice&nbsp;: <span className="blank">&nbsp;</span>
                </div>
              </section>
            ))
          )}

          <footer className="doc-footer">
            Les Ateliers du Stream · 39 bis rue Robert Creuzet 47200 MARMANDE · SIRET 81950223800036 · NDA 75470196847
          </footer>
        </div>
      </div>

      <style jsx global>{`
        :root { color-scheme: light; }
        body { background: #f3f4f6; margin: 0; }
        .print-root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2244; }

        .grid-page {
          width: 210mm;
          min-height: 297mm;
          padding: 18mm 16mm 24mm;
          margin: 16px auto;
          background: white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          position: relative;
          box-sizing: border-box;
        }

        .doc-header { border-bottom: 2px solid #1f2244; padding-bottom: 12px; margin-bottom: 16px; }
        .doc-title { font-size: 24px; font-weight: 700; margin: 0; color: #1f2244; }
        .doc-subtitle { font-size: 14px; margin: 4px 0 0; color: #1f2244; font-style: italic; }
        .doc-meta { font-size: 11px; color: #727485; margin: 4px 0 0; font-family: "JetBrains Mono", monospace; }

        .ident {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 24px;
          font-size: 12px;
          color: #1f2244;
          margin-bottom: 12px;
        }
        .blank {
          display: inline-block;
          min-width: 180px;
          border-bottom: 1px solid #9ca3af;
        }
        .blank-sm { min-width: 110px; }

        .legend {
          font-size: 12px;
          line-height: 1.5;
          color: #374151;
          background: #f8fafc;
          border-left: 3px solid #7dcef5;
          padding: 8px 12px;
          border-radius: 4px;
          margin: 0 0 18px;
        }
        .empty { font-size: 13px; color: #727485; }

        .exercise-block { margin-bottom: 20px; page-break-inside: avoid; }
        .exercise-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
        .exercise-number {
          font-family: "JetBrains Mono", monospace;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: white;
          background: #1f2244;
          padding: 2px 7px;
          border-radius: 4px;
          white-space: nowrap;
        }
        .exercise-title { font-size: 16px; font-weight: 700; color: #1f2244; margin: 0; }
        .exercise-desc { font-size: 12px; color: #727485; margin: 0 0 8px; white-space: pre-wrap; }

        .grid-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .grid-table th, .grid-table td {
          border: 1px solid #cbd5e1;
          padding: 6px 8px;
          vertical-align: top;
        }
        .grid-table thead th {
          background: #1f2244;
          color: white;
          font-weight: 600;
          text-align: center;
          font-size: 11px;
        }
        .grid-table th.col-crit, .grid-table td.col-crit { text-align: left; width: 55%; }
        .grid-table .col-eval { width: 15%; text-align: center; height: 26px; }
        .no-crit { color: #9ca3af; font-style: italic; text-align: center; }

        .appreciation {
          font-size: 12px;
          color: #1f2244;
          margin-top: 6px;
          display: flex;
          align-items: flex-end;
          gap: 6px;
        }
        .appreciation .blank { flex: 1; min-width: 0; }

        .doc-footer {
          margin-top: 24px;
          font-size: 9px;
          text-align: center;
          color: #9ca3af;
          font-family: "JetBrains Mono", monospace;
          border-top: 1px solid #e5e7eb;
          padding-top: 8px;
        }

        @media print {
          body { background: white; }
          body * { visibility: hidden; }
          .print-content, .print-content * { visibility: visible; }
          .print-content { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .grid-page {
            width: auto;
            min-height: auto;
            margin: 0;
            box-shadow: none;
            padding: 14mm 12mm 16mm;
          }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
    </div>
  );
}
