"use client";

// Page admin /admin/formations/non-evalues
// Liste les stagiaires "terminés" qui n'ont pas encore d'évaluation finale.
// Couvre Qualiopi indicateur 11 (évaluation des acquis) + 6 (atteinte objectifs).
//
// Pour chaque stagiaire on propose 2 chemins :
//   - Si la formation a une grille d'évaluation → lien vers la grille d'éval
//     (admin/formations/[id]/evaluation-grid → mais c'est plutôt la config)
//     Actuellement la grille remplie est côté formateur, donc on renvoie
//     vers la fiche stagiaire pour mettre un override manuel.
//   - Lien direct vers la fiche stagiaire pour saisir un override manuel
//     dans tous les cas (le champ objectifsAtteintsOverride est éditable
//     par l'admin sur /admin/formations/trainees/[id]).

import { useEffect, useState } from "react";
import Link from "next/link";

interface NonEvalueeTrainee {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  sessionId: string;
  sessionCode: string;
  sessionDateFin: string;
  formationCode: string;
  formationNomLong: string;
  formationHasGrid: boolean;
  evaluationsCount: number;
  expectedExercisesCount: number;
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysSince(s: string): number {
  const diff = Date.now() - new Date(s).getTime();
  return Math.floor(diff / (24 * 3600 * 1000));
}

export default function NonEvaluesPage() {
  const [list, setList] = useState<NonEvalueeTrainee[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/formations/non-evalues")
      .then((r) => r.json())
      .then((d) => setList(Array.isArray(d.trainees) ? d.trainees : []))
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <Link
        href="/admin/formations"
        className="text-xs font-jetbrains underline"
        style={{ color: "#727485" }}
      >
        ← Tableau de bord
      </Link>
      <h1 className="text-3xl font-bold mt-2" style={{ color: "#1f2244" }}>
        Stagiaires non évalués
      </h1>
      <p className="text-sm mt-1 font-jetbrains" style={{ color: "#727485" }}>
        Stagiaires en statut <strong>terminé</strong> qui n&apos;ont pas encore
        d&apos;évaluation finale (ni grille remplie, ni atteinte d&apos;objectifs saisie).
        À traiter pour fiabiliser le bilan Qualiopi (indicateurs 6 et 11).
      </p>

      {loading ? (
        <p className="mt-8 font-jetbrains text-sm" style={{ color: "#727485" }}>
          Chargement…
        </p>
      ) : list && list.length === 0 ? (
        <div
          className="mt-8 p-6 rounded-xl border text-center font-jetbrains text-sm"
          style={{ borderColor: "#86efac", backgroundColor: "#f0fdf4", color: "#166534" }}
        >
          ✓ Tous les stagiaires terminés sont évalués. Rien à faire.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {list?.map((t) => {
            const days = daysSince(t.sessionDateFin);
            const urgent = days > 30;
            return (
              <div
                key={t.id}
                className="p-4 rounded-xl border flex items-start justify-between gap-4 flex-wrap"
                style={{
                  borderColor: urgent ? "#fecaca" : "#e5e7eb",
                  backgroundColor: urgent ? "#fef2f2" : "white",
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-base" style={{ color: "#1f2244" }}>
                      {t.prenom} {t.nom}
                    </h3>
                    {urgent && (
                      <span
                        className="text-xs font-jetbrains px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: "#fecaca", color: "#991b1b" }}
                      >
                        ⚠ {days}j sans évaluation
                      </span>
                    )}
                    {!urgent && (
                      <span
                        className="text-xs font-jetbrains px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
                      >
                        {days}j depuis la fin
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-1 font-jetbrains" style={{ color: "#727485" }}>
                    {t.formationNomLong} · Session{" "}
                    <strong style={{ color: "#1f2244" }}>{t.sessionCode}</strong> · fin{" "}
                    {fmtDate(t.sessionDateFin)}
                  </div>
                  <div className="text-xs mt-1 font-jetbrains" style={{ color: "#727485" }}>
                    {t.formationHasGrid ? (
                      <>
                        <strong style={{ color: t.evaluationsCount === 0 ? "#991b1b" : "#92400e" }}>
                          {t.evaluationsCount}/{t.expectedExercisesCount}
                        </strong>{" "}
                        exercice{t.expectedExercisesCount > 1 ? "s" : ""} évalué{t.evaluationsCount > 1 ? "s" : ""}
                      </>
                    ) : (
                      <em style={{ color: "#9ca3af" }}>
                        Pas de grille d&apos;évaluation pour cette formation — saisir un override
                      </em>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Link
                    href={`/admin/formations/trainees/${t.id}`}
                    className="text-xs px-3 py-1.5 rounded-full text-white cursor-pointer"
                    style={{ backgroundColor: "#1f2244" }}
                  >
                    Évaluer →
                  </Link>
                  <Link
                    href={`/admin/formations/sessions/${t.sessionId}`}
                    className="text-xs px-3 py-1.5 rounded-full border cursor-pointer"
                    style={{ borderColor: "#d1d5db", color: "#374151" }}
                  >
                    Voir la session
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
