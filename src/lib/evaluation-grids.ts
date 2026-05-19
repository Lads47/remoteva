// CRUD des grilles d'évaluation pratique (Qualiopi).
//
// Hiérarchie : Formation > Exercices > Critères
//   - Un exercice = un module pratique évalué (ex : "Captation multicaméra live")
//   - Un critère = un point évalué dans cet exercice (ex : "Maîtrise des transitions")
//   - Échelle de notation : "acquis" | "en_cours" | "non_acquis" (3-niveau Qualiopi)
//
// La saisie des notes côté formateur est dans `evaluation-entries.ts` (phase D.2).

import prisma from "./db";

// === Échelle de notation ===
export const SCORE_VALUES = ["acquis", "en_cours", "non_acquis"] as const;
export type ScoreValue = (typeof SCORE_VALUES)[number];

export const SCORE_LABELS: Record<ScoreValue, string> = {
  acquis: "Acquis",
  en_cours: "En cours d'acquisition",
  non_acquis: "Non acquis",
};

export function isValidScore(s: string): s is ScoreValue {
  return (SCORE_VALUES as readonly string[]).includes(s);
}

// === Types ===
export interface CriterionInfo {
  id: string;
  exerciseId: string;
  ordre: number;
  libelle: string;
}

export interface ExerciseInfo {
  id: string;
  formationId: string;
  ordre: number;
  titre: string;
  description: string;
  active: boolean;
  criteria: CriterionInfo[];
  createdAt: Date;
  updatedAt: Date;
}

// === Exercices ===

export async function listExercisesByFormation(formationId: string): Promise<ExerciseInfo[]> {
  const exercises = await prisma.evaluationExercise.findMany({
    where: { formationId },
    orderBy: { ordre: "asc" },
    include: {
      criteria: { orderBy: { ordre: "asc" } },
    },
  });
  return exercises.map((e) => ({
    id: e.id,
    formationId: e.formationId,
    ordre: e.ordre,
    titre: e.titre,
    description: e.description,
    active: e.active,
    criteria: e.criteria.map((c) => ({
      id: c.id,
      exerciseId: c.exerciseId,
      ordre: c.ordre,
      libelle: c.libelle,
    })),
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  }));
}

export async function getExerciseById(id: string): Promise<ExerciseInfo | null> {
  const e = await prisma.evaluationExercise.findUnique({
    where: { id },
    include: { criteria: { orderBy: { ordre: "asc" } } },
  });
  if (!e) return null;
  return {
    id: e.id,
    formationId: e.formationId,
    ordre: e.ordre,
    titre: e.titre,
    description: e.description,
    active: e.active,
    criteria: e.criteria.map((c) => ({
      id: c.id,
      exerciseId: c.exerciseId,
      ordre: c.ordre,
      libelle: c.libelle,
    })),
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export interface CreateExerciseInput {
  formationId: string;
  titre: string;
  description?: string;
  ordre?: number;          // Si omis : auto-append en fin de liste
}

export async function createExercise(input: CreateExerciseInput): Promise<ExerciseInfo> {
  // Si ordre non fourni : max(ordre) + 1
  let ordre = input.ordre;
  if (ordre === undefined) {
    const last = await prisma.evaluationExercise.findFirst({
      where: { formationId: input.formationId },
      orderBy: { ordre: "desc" },
      select: { ordre: true },
    });
    ordre = (last?.ordre ?? 0) + 1;
  }
  const e = await prisma.evaluationExercise.create({
    data: {
      formationId: input.formationId,
      titre: input.titre.trim(),
      description: (input.description ?? "").trim(),
      ordre,
    },
    include: { criteria: { orderBy: { ordre: "asc" } } },
  });
  return {
    id: e.id,
    formationId: e.formationId,
    ordre: e.ordre,
    titre: e.titre,
    description: e.description,
    active: e.active,
    criteria: [],
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export interface UpdateExerciseInput {
  titre?: string;
  description?: string;
  ordre?: number;
  active?: boolean;
}

export async function updateExercise(id: string, input: UpdateExerciseInput): Promise<ExerciseInfo | null> {
  const data: Record<string, unknown> = {};
  if (input.titre !== undefined) data.titre = input.titre.trim();
  if (input.description !== undefined) data.description = input.description.trim();
  if (input.ordre !== undefined) data.ordre = input.ordre;
  if (input.active !== undefined) data.active = input.active;
  const e = await prisma.evaluationExercise.update({
    where: { id },
    data,
    include: { criteria: { orderBy: { ordre: "asc" } } },
  });
  return {
    id: e.id,
    formationId: e.formationId,
    ordre: e.ordre,
    titre: e.titre,
    description: e.description,
    active: e.active,
    criteria: e.criteria.map((c) => ({
      id: c.id,
      exerciseId: c.exerciseId,
      ordre: c.ordre,
      libelle: c.libelle,
    })),
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export async function deleteExercise(id: string): Promise<void> {
  // Cascade : supprime aussi les critères + évaluations liées.
  await prisma.evaluationExercise.delete({ where: { id } });
}

// Réordonne une liste d'exercices pour une formation. `orderedIds` doit
// contenir tous les exercices de la formation dans l'ordre voulu.
export async function reorderExercises(formationId: string, orderedIds: string[]): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((id, idx) =>
      prisma.evaluationExercise.updateMany({
        where: { id, formationId },
        data: { ordre: idx + 1 },
      })
    )
  );
}

// === Critères ===

export interface CreateCriterionInput {
  exerciseId: string;
  libelle: string;
  ordre?: number;
}

export async function createCriterion(input: CreateCriterionInput): Promise<CriterionInfo> {
  let ordre = input.ordre;
  if (ordre === undefined) {
    const last = await prisma.evaluationCriterion.findFirst({
      where: { exerciseId: input.exerciseId },
      orderBy: { ordre: "desc" },
      select: { ordre: true },
    });
    ordre = (last?.ordre ?? 0) + 1;
  }
  const c = await prisma.evaluationCriterion.create({
    data: {
      exerciseId: input.exerciseId,
      libelle: input.libelle.trim(),
      ordre,
    },
  });
  return { id: c.id, exerciseId: c.exerciseId, ordre: c.ordre, libelle: c.libelle };
}

export interface UpdateCriterionInput {
  libelle?: string;
  ordre?: number;
}

export async function updateCriterion(id: string, input: UpdateCriterionInput): Promise<CriterionInfo> {
  const data: Record<string, unknown> = {};
  if (input.libelle !== undefined) data.libelle = input.libelle.trim();
  if (input.ordre !== undefined) data.ordre = input.ordre;
  const c = await prisma.evaluationCriterion.update({ where: { id }, data });
  return { id: c.id, exerciseId: c.exerciseId, ordre: c.ordre, libelle: c.libelle };
}

export async function deleteCriterion(id: string): Promise<void> {
  await prisma.evaluationCriterion.delete({ where: { id } });
}

// Réordonne les critères d'un exercice.
export async function reorderCriteria(exerciseId: string, orderedIds: string[]): Promise<void> {
  await prisma.$transaction(
    orderedIds.map((id, idx) =>
      prisma.evaluationCriterion.updateMany({
        where: { id, exerciseId },
        data: { ordre: idx + 1 },
      })
    )
  );
}
