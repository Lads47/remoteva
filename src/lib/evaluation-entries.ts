// Saisie des évaluations par les formateurs (phase D.2).
//
// - getEvaluationMatrix : pour une session, renvoie pour chaque (stagiaire, exercice)
//   l'état d'avancement (vide / partielle / complète) + la note globale si présente.
// - getEvaluationDetail : pour un (stagiaire, exercice), renvoie la grille de
//   critères + les scores déjà saisis (ou vides).
// - upsertEvaluation : sauvegarde (création + update) une évaluation complète :
//   scores par critère + observations + globalNote.

import prisma from "./db";
import { isValidScore, type ScoreValue } from "./evaluation-grids";

// === Auth helper ===

export async function authTrainerForSession(token: string | null, sessionId: string) {
  if (!token) return null;
  const trainer = await prisma.trainer.findUnique({ where: { magicToken: token } });
  if (!trainer || !trainer.active) return null;
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { trainerId: true, formationId: true },
  });
  if (!session || session.trainerId !== trainer.id) return null;
  return { trainer, formationId: session.formationId };
}

// === Types renvoyés à l'UI ===

export type EvaluationStatus = "empty" | "partial" | "complete";

export interface MatrixCell {
  traineeId: string;
  exerciseId: string;
  status: EvaluationStatus;
  globalNote: string;          // "" | "acquis" | "en_cours" | "non_acquis"
  scoredCount: number;         // Nombre de critères notés
  totalCriteria: number;       // Nombre total de critères de l'exercice
}

export interface MatrixData {
  exercises: { id: string; titre: string; ordre: number; totalCriteria: number }[];
  trainees: { id: string; prenom: string; nom: string }[];
  cells: MatrixCell[];          // indexable via (traineeId, exerciseId)
}

/**
 * Renvoie la matrice [stagiaires × exercices] avec l'état de chaque cellule.
 * Filtre les exercices inactifs.
 */
export async function getEvaluationMatrix(sessionId: string): Promise<MatrixData> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      trainees: {
        orderBy: { createdAt: "asc" },
        select: { id: true, prenom: true, nom: true },
      },
      formation: {
        select: {
          evaluationExercises: {
            where: { active: true },
            orderBy: { ordre: "asc" },
            include: {
              criteria: { select: { id: true } },
            },
          },
        },
      },
    },
  });
  if (!session) {
    return { exercises: [], trainees: [], cells: [] };
  }

  const exercises = session.formation.evaluationExercises.map((e) => ({
    id: e.id,
    titre: e.titre,
    ordre: e.ordre,
    totalCriteria: e.criteria.length,
  }));
  const trainees = session.trainees;

  // Charge en une seule requête toutes les évaluations + leurs scores pour
  // les couples (stagiaire de cette session × exercice de cette formation).
  const traineeIds = trainees.map((t) => t.id);
  const exerciseIds = exercises.map((e) => e.id);
  const evaluations =
    traineeIds.length && exerciseIds.length
      ? await prisma.traineeExerciseEvaluation.findMany({
          where: {
            traineeId: { in: traineeIds },
            exerciseId: { in: exerciseIds },
          },
          include: { scores: { select: { score: true } } },
        })
      : [];

  // Indexe par (traineeId, exerciseId) pour lookup O(1)
  const map = new Map<string, (typeof evaluations)[number]>();
  for (const e of evaluations) {
    map.set(`${e.traineeId}::${e.exerciseId}`, e);
  }

  const cells: MatrixCell[] = [];
  for (const tr of trainees) {
    for (const ex of exercises) {
      const e = map.get(`${tr.id}::${ex.id}`);
      const scoredCount = e ? e.scores.filter((s) => s.score && s.score !== "").length : 0;
      const total = ex.totalCriteria;
      let status: EvaluationStatus = "empty";
      if (e && (scoredCount > 0 || e.globalNote || e.observations)) {
        status = scoredCount === total && total > 0 ? "complete" : "partial";
      }
      cells.push({
        traineeId: tr.id,
        exerciseId: ex.id,
        status,
        globalNote: e?.globalNote ?? "",
        scoredCount,
        totalCriteria: total,
      });
    }
  }

  return { exercises, trainees, cells };
}

// === Détail d'une évaluation ===

export interface CriterionWithScore {
  id: string;
  ordre: number;
  libelle: string;
  score: string;        // "" | acquis | en_cours | non_acquis
  comment: string;
}

export interface EvaluationDetail {
  evaluationId: string | null;   // null si pas encore sauvegardée
  trainee: { id: string; prenom: string; nom: string };
  exercise: { id: string; ordre: number; titre: string; description: string };
  criteria: CriterionWithScore[];
  globalNote: string;
  observations: string;
  evaluatedAt: Date | null;
  evaluatorName: string | null;
  driveFileId: string | null;
  driveWebUrl: string | null;
  driveSyncedAt: Date | null;
  driveSyncError: string | null;
}

/**
 * Renvoie le détail pour saisir/visualiser une évaluation.
 * Si l'évaluation n'existe pas encore : valeurs vides pour tous les critères.
 * Vérifie que le stagiaire appartient bien à une session de la formation où
 * vit l'exercice (cohérence).
 */
export async function getEvaluationDetail(
  traineeId: string,
  exerciseId: string
): Promise<EvaluationDetail | null> {
  const trainee = await prisma.trainee.findUnique({
    where: { id: traineeId },
    select: {
      id: true,
      prenom: true,
      nom: true,
      session: { select: { formationId: true } },
    },
  });
  if (!trainee) return null;

  const exercise = await prisma.evaluationExercise.findUnique({
    where: { id: exerciseId },
    include: { criteria: { orderBy: { ordre: "asc" } } },
  });
  if (!exercise) return null;
  if (exercise.formationId !== trainee.session.formationId) return null;

  const evaluation = await prisma.traineeExerciseEvaluation.findUnique({
    where: { traineeId_exerciseId: { traineeId, exerciseId } },
    include: {
      scores: true,
      evaluator: { select: { prenom: true, nom: true } },
    },
  });

  const scoreMap = new Map<string, { score: string; comment: string }>();
  if (evaluation) {
    for (const s of evaluation.scores) {
      scoreMap.set(s.criterionId, { score: s.score, comment: s.comment });
    }
  }

  return {
    evaluationId: evaluation?.id ?? null,
    trainee: { id: trainee.id, prenom: trainee.prenom, nom: trainee.nom },
    exercise: {
      id: exercise.id,
      ordre: exercise.ordre,
      titre: exercise.titre,
      description: exercise.description,
    },
    criteria: exercise.criteria.map((c) => {
      const s = scoreMap.get(c.id);
      return {
        id: c.id,
        ordre: c.ordre,
        libelle: c.libelle,
        score: s?.score ?? "",
        comment: s?.comment ?? "",
      };
    }),
    globalNote: evaluation?.globalNote ?? "",
    observations: evaluation?.observations ?? "",
    evaluatedAt: evaluation?.evaluatedAt ?? null,
    evaluatorName: evaluation?.evaluator
      ? `${evaluation.evaluator.prenom} ${evaluation.evaluator.nom}`
      : null,
    driveFileId: evaluation?.driveFileId ?? null,
    driveWebUrl: evaluation?.driveWebUrl ?? null,
    driveSyncedAt: evaluation?.driveSyncedAt ?? null,
    driveSyncError: evaluation?.driveSyncError ?? null,
  };
}

// === Sauvegarde ===

export interface ScoreInput {
  criterionId: string;
  score: string;     // "" pour effacer, ou acquis|en_cours|non_acquis
  comment?: string;
}

export interface UpsertEvaluationInput {
  traineeId: string;
  exerciseId: string;
  evaluatorId: string | null;
  globalNote: string;       // "" | acquis | en_cours | non_acquis
  observations: string;
  scores: ScoreInput[];
}

/**
 * Upsert d'une évaluation : crée la fiche si absente, met à jour sinon.
 * Les scores sont remplacés (delete-all + insert) pour rester simple — pas
 * de gros volume par fiche (généralement < 20 critères).
 */
export async function upsertEvaluation(input: UpsertEvaluationInput): Promise<string> {
  // Valide les scores (les vides sont autorisés, valeurs non vides doivent matcher)
  for (const s of input.scores) {
    if (s.score !== "" && !isValidScore(s.score)) {
      throw new Error(`Score invalide pour le critère ${s.criterionId}: "${s.score}"`);
    }
  }
  if (input.globalNote !== "" && !isValidScore(input.globalNote)) {
    throw new Error(`Note globale invalide: "${input.globalNote}"`);
  }

  const result = await prisma.$transaction(async (tx) => {
    // Upsert fiche
    const evaluation = await tx.traineeExerciseEvaluation.upsert({
      where: {
        traineeId_exerciseId: {
          traineeId: input.traineeId,
          exerciseId: input.exerciseId,
        },
      },
      update: {
        evaluatorId: input.evaluatorId,
        globalNote: input.globalNote as ScoreValue | "",
        observations: input.observations,
        // Reset l'état Drive : à chaque modif, la sync précédente est obsolète
        driveSyncedAt: null,
        driveSyncError: null,
      },
      create: {
        traineeId: input.traineeId,
        exerciseId: input.exerciseId,
        evaluatorId: input.evaluatorId,
        globalNote: input.globalNote as ScoreValue | "",
        observations: input.observations,
      },
    });

    // Remplace les scores : delete + create (volume faible)
    await tx.traineeCriterionScore.deleteMany({ where: { evaluationId: evaluation.id } });

    // N'insère que les scores avec une valeur ou un commentaire (skip lignes vides)
    const toCreate = input.scores
      .filter((s) => s.score !== "" || (s.comment && s.comment.trim() !== ""))
      .map((s) => ({
        evaluationId: evaluation.id,
        criterionId: s.criterionId,
        score: s.score,
        comment: s.comment ?? "",
      }));
    if (toCreate.length > 0) {
      await tx.traineeCriterionScore.createMany({ data: toCreate });
    }
    return evaluation.id;
  });
  return result;
}
