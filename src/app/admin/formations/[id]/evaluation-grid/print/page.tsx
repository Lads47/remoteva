"use client";

// Aperçu imprimable A4 des énoncés d'exercices à distribuer aux stagiaires.
// Couvre Qualiopi indicateur 11 (transparence sur les modalités d'évaluation).
//
// Format : 1 exercice par page (page-break-after) pour avoir un visuel propre.
// Bouton "Imprimer" en haut, masqué à l'impression via @media print.

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, isAbortError } from "@/lib/api-client";

interface Exercise {
  id: string;
  ordre: number;
  titre: string;
  description: string;
  active: boolean;
}
interface FormationLite {
  id: string;
  code: string;
  nomLong: string;
}

export default function EvaluationGridPrintPage({ params }: { params: Promise<{ id: string }> }) {
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

  return (
    <div className="print-root">
      {/* Barre d'action — masquée à l'impression */}
      <div className="no-print" style={{ position: "sticky", top: 0, background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 100 }}>
        <Link href={`/admin/formations/${id}/evaluation-grid`} className="text-xs font-jetbrains underline" style={{ color: "#727485" }}>
          ← Retour à la grille
        </Link>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 rounded-full text-sm font-medium text-white cursor-pointer"
            style={{ backgroundColor: "#1f2244" }}
          >
            🖨️ Imprimer / PDF
          </button>
        </div>
      </div>

      {/* Contenu imprimable */}
      <div className="print-content">
        {/* Page de garde */}
        <section className="exercise-page">
          <header className="doc-header">
            <h1 className="doc-title">Exercices pratiques d&apos;évaluation</h1>
            <p className="doc-subtitle">{formation.nomLong}</p>
            <p className="doc-meta">Formation {formation.code} · Les Ateliers du Stream</p>
          </header>

          <div className="intro">
            <p>
              Vous trouverez dans ce document les énoncés des <strong>{exercises.length} exercice{exercises.length > 1 ? "s" : ""} pratique{exercises.length > 1 ? "s" : ""}</strong> que vous serez amené·e à réaliser au cours de la formation.
            </p>
            <p>
              Chaque exercice sera évalué par votre formateur·rice sur la base de critères de compétences précis. Cet exercice est avant tout une mise en situation pour vous permettre d&apos;appliquer et de consolider les acquis.
            </p>
            <p style={{ marginTop: 24, fontSize: 13, color: "#727485" }}>
              Sommaire :
            </p>
            <ol className="toc">
              {exercises.map((e) => (
                <li key={e.id}><strong>Exercice {e.ordre}</strong> — {e.titre}</li>
              ))}
            </ol>
          </div>
        </section>

        {/* Une page par exercice */}
        {exercises.map((e) => (
          <section key={e.id} className="exercise-page">
            <header className="doc-header doc-header-compact">
              <p className="doc-meta">{formation.code} · {formation.nomLong}</p>
            </header>
            <div className="exercise-number">Exercice {e.ordre}</div>
            <h2 className="exercise-title">{e.titre}</h2>
            {e.description && (
              <div className="exercise-desc">
                <h3>Énoncé</h3>
                <p style={{ whiteSpace: "pre-wrap" }}>{e.description}</p>
              </div>
            )}
            <footer className="doc-footer">
              Les Ateliers du Stream · 39 bis rue Robert Creuzet 47200 MARMANDE · SIRET 81950223800036 · NDA 75470196847
            </footer>
          </section>
        ))}
      </div>

      <style jsx global>{`
        :root { color-scheme: light; }
        body { background: #f3f4f6; margin: 0; }
        .print-root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2244; }

        /* Page A4 simulée à l'écran */
        .exercise-page {
          width: 210mm;
          min-height: 297mm;
          padding: 20mm 18mm;
          margin: 16px auto;
          background: white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
          page-break-after: always;
          position: relative;
          box-sizing: border-box;
        }
        .exercise-page:last-child { page-break-after: auto; }

        .doc-header { border-bottom: 2px solid #1f2244; padding-bottom: 12px; margin-bottom: 24px; }
        .doc-header-compact { border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 32px; }
        .doc-title { font-size: 26px; font-weight: 700; margin: 0; color: #1f2244; }
        .doc-subtitle { font-size: 14px; margin: 4px 0 0; color: #1f2244; font-style: italic; }
        .doc-meta { font-size: 11px; color: #727485; margin: 4px 0 0; font-family: "JetBrains Mono", monospace; }

        .intro p { font-size: 14px; line-height: 1.6; color: #374151; }

        .toc { font-size: 14px; line-height: 1.8; color: #1f2244; padding-left: 20px; }

        .exercise-number {
          font-family: "JetBrains Mono", monospace;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: #7dcef5;
          margin-bottom: 6px;
        }
        .exercise-title { font-size: 22px; font-weight: 700; color: #1f2244; margin: 0 0 24px; line-height: 1.3; }

        .exercise-desc h3, .exercise-criteria h3 {
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #727485;
          margin: 0 0 8px;
          padding-bottom: 4px;
          border-bottom: 1px solid #e5e7eb;
        }
        .exercise-desc { margin-bottom: 24px; }
        .exercise-desc p { font-size: 14px; line-height: 1.6; color: #1f2244; margin: 0; }

        .doc-footer {
          position: absolute;
          bottom: 12mm;
          left: 18mm;
          right: 18mm;
          font-size: 9px;
          text-align: center;
          color: #9ca3af;
          font-family: "JetBrains Mono", monospace;
          border-top: 1px solid #e5e7eb;
          padding-top: 8px;
        }

        @media print {
          body { background: white; }
          /* Masque toute la chrome admin (sidebar, header…) lors de l'impression */
          body * { visibility: hidden; }
          .print-content, .print-content * { visibility: visible; }
          .print-content {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print { display: none !important; }
          .exercise-page {
            width: auto;
            min-height: auto;
            margin: 0;
            box-shadow: none;
            padding: 18mm 16mm 22mm;
          }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
    </div>
  );
}
