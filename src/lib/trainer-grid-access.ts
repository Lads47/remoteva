// ============================================================================
// Contrôle d'accès des formateurs à l'édition des grilles d'évaluation.
//
// Règle de périmètre (validée avec le client) :
//   Un formateur peut éditer la grille (exercices + critères) de TOUTE
//   formation où il a au moins une session assignée. Si la formation est
//   partagée avec d'autres formateurs, l'UI affiche un avertissement mais
//   l'édition reste autorisée.
//
// À chaque mutation, on notifie l'admin par mail (garde-fou Qualiopi :
// le donneur d'ordre reste responsable de la cohérence objectifs/évaluation).
//
// Auth : magic-token formateur (même mécanisme que le reste du portail).
// ============================================================================

import prisma from "./db";
import { sendGridEditedNotification } from "./mailer";

export interface TrainerGridAuth {
  trainer: { id: string; prenom: string; nom: string; email: string };
  formationId: string;
}

/**
 * Notifie l'admin qu'un formateur a modifié la grille. Best-effort :
 * on swallow toute erreur pour ne jamais bloquer la mutation.
 */
export async function notifyAdminGridEdit(
  auth: TrainerGridAuth,
  action: string,
  detail?: string
): Promise<void> {
  try {
    const formation = await prisma.formation.findUnique({
      where: { id: auth.formationId },
      select: { code: true, nomLong: true },
    });
    if (!formation) return;
    await sendGridEditedNotification({
      trainerNomComplet: `${auth.trainer.prenom} ${auth.trainer.nom}`,
      formationCode: formation.code,
      formationNomLong: formation.nomLong,
      formationId: auth.formationId,
      action,
      detail,
    });
  } catch (err) {
    console.warn("[trainer-grid-access] notif admin échouée:", err);
  }
}

/**
 * Vérifie qu'un formateur (par token) a accès à une formation donnée
 * (= au moins une session de cette formation lui est assignée).
 */
export async function authTrainerForFormation(
  token: string | null,
  formationId: string
): Promise<TrainerGridAuth | null> {
  if (!token) return null;
  const trainer = await prisma.trainer.findUnique({
    where: { magicToken: token },
    select: { id: true, prenom: true, nom: true, email: true, active: true },
  });
  if (!trainer || !trainer.active) return null;

  const session = await prisma.session.findFirst({
    where: { formationId, trainerId: trainer.id },
    select: { id: true },
  });
  if (!session) return null;

  return {
    trainer: { id: trainer.id, prenom: trainer.prenom, nom: trainer.nom, email: trainer.email },
    formationId,
  };
}

/**
 * Vérifie l'accès via un exercice (remonte exercice → formation → sessions).
 * Retourne l'auth + le formationId de l'exercice.
 */
export async function authTrainerForExercise(
  token: string | null,
  exerciseId: string
): Promise<TrainerGridAuth | null> {
  if (!token) return null;
  const exercise = await prisma.evaluationExercise.findUnique({
    where: { id: exerciseId },
    select: { formationId: true },
  });
  if (!exercise) return null;
  return authTrainerForFormation(token, exercise.formationId);
}

/**
 * Vérifie l'accès via un critère (remonte critère → exercice → formation).
 */
export async function authTrainerForCriterion(
  token: string | null,
  criterionId: string
): Promise<TrainerGridAuth | null> {
  if (!token) return null;
  const criterion = await prisma.evaluationCriterion.findUnique({
    where: { id: criterionId },
    select: { exercise: { select: { formationId: true } } },
  });
  if (!criterion) return null;
  return authTrainerForFormation(token, criterion.exercise.formationId);
}

/**
 * Indique si une formation est partagée avec d'autres formateurs que celui
 * fourni (= au moins une session assignée à un autre trainer). Sert à
 * afficher le bandeau d'avertissement côté portail.
 */
export async function isFormationSharedWithOtherTrainers(
  formationId: string,
  trainerId: string
): Promise<{ shared: boolean; otherTrainers: string[] }> {
  const sessions = await prisma.session.findMany({
    where: {
      formationId,
      trainerId: { not: null },
      NOT: { trainerId },
    },
    select: { trainer: { select: { prenom: true, nom: true } } },
  });
  const names = new Set<string>();
  for (const s of sessions) {
    if (s.trainer) names.add(`${s.trainer.prenom} ${s.trainer.nom}`);
  }
  return { shared: names.size > 0, otherTrainers: Array.from(names) };
}
