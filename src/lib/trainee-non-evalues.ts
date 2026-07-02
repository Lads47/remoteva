// Détection des stagiaires "terminés" qui n'ont PAS été évalués.
//
// Définition d'un stagiaire non évalué :
//   - status = "termine" (le formateur a marqué la session comme terminée
//     pour ce stagiaire, OU la session est passée et le stagiaire a émargé)
//   - objectifsAtteintsOverride vide (pas d'override manuel)
//   - aucune évaluation pratique avec globalNote remplie pour la formation
//
// Important pour Qualiopi indicateur 11 + 6 : un stagiaire doit être évalué
// pour qu'on puisse délivrer l'attestation. Si la formation n'a pas de
// grilles d'évaluation, le formateur doit poser l'override manuel.

import prisma from "./db";

export interface NonEvalueeTrainee {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  sessionId: string;
  sessionCode: string;
  sessionDateFin: Date;
  formationCode: string;
  formationNomLong: string;
  formationHasGrid: boolean;        // la formation a-t-elle des grilles configurées ?
  evaluationsCount: number;          // nb d'évaluations existantes (peut être 0)
  expectedExercisesCount: number;    // nb d'exercices actifs attendus
}

/**
 * Renvoie la liste de tous les stagiaires "terminés" qui n'ont pas
 * d'évaluation finale (ni grille remplie, ni override manuel).
 *
 * Trié par sessionDateFin desc (plus récent en premier) — le formateur
 * voit en haut les évaluations les plus urgentes.
 */
export async function findNonEvaluesTrainees(): Promise<NonEvalueeTrainee[]> {
  const trainees = await prisma.trainee.findMany({
    where: {
      status: "termine",
      objectifsAtteintsOverride: "",
      isTest: false,
    },
    select: {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      session: {
        select: {
          id: true,
          code: true,
          dateFin: true,
          formation: {
            select: {
              code: true,
              nomLong: true,
              evaluationExercises: {
                where: { active: true },
                select: { id: true },
              },
            },
          },
        },
      },
      exerciseEvaluations: {
        where: {
          exercise: { active: true },
          globalNote: { not: "" },
        },
        select: { id: true },
      },
    },
    orderBy: { session: { dateFin: "desc" } },
  });

  const result: NonEvalueeTrainee[] = [];
  for (const t of trainees) {
    const expected = t.session.formation.evaluationExercises.length;
    const noted = t.exerciseEvaluations.length;

    // Cas non évalué :
    //   - Formation SANS grille : pas d'override → non évalué
    //   - Formation AVEC grille : 0 évaluation OU évaluations partielles
    //     (on considère "incomplet" si noted < expected)
    const isNonEvalue = expected === 0 ? true : noted < expected;
    if (!isNonEvalue) continue;

    result.push({
      id: t.id,
      prenom: t.prenom,
      nom: t.nom,
      email: t.email,
      sessionId: t.session.id,
      sessionCode: t.session.code,
      sessionDateFin: t.session.dateFin,
      formationCode: t.session.formation.code,
      formationNomLong: t.session.formation.nomLong,
      formationHasGrid: expected > 0,
      evaluationsCount: noted,
      expectedExercisesCount: expected,
    });
  }
  return result;
}

/**
 * Compteur léger pour le dashboard (n'inclut pas la liste).
 */
export async function countNonEvalues(): Promise<number> {
  const list = await findNonEvaluesTrainees();
  return list.length;
}
