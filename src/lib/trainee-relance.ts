// Détection des stagiaires "bloqués" et tracking des relances automatiques.
//
// Un stagiaire est bloqué s'il est en statut `devis_envoye` OU
// `convention_envoyee` depuis plus de BLOCAGE_DAYS jours sans avancer.
//
// Anti-spam :
//   - Max MAX_RELANCES relances automatiques par stagiaire (toutes confondues)
//   - Min RELANCE_INTERVAL_DAYS jours entre 2 relances pour le même stagiaire
//
// Tracking : on enregistre chaque relance comme un TraineeEvent de type
// `relance_blocage_envoyee`. Le cron lit ces events pour décider de relancer
// ou pas. Pas de nouvelle colonne sur Trainee (TraineeEvent suffit).

import prisma from "./db";

const BLOCAGE_DAYS = 14;
const RELANCE_INTERVAL_DAYS = 7;
const MAX_RELANCES = 2;
const TRAINEE_EVENT_TYPE = "relance_blocage_envoyee";

// Statuts "bloqués" — intermédiaires entre l'envoi d'un doc et son retour signé
const BLOCKED_STATUSES = ["devis_envoye", "convention_envoyee"] as const;
type BlockedStatus = (typeof BLOCKED_STATUSES)[number];

export interface TraineeDueForRelance {
  id: string;
  email: string;
  prenom: string;
  nom: string;
  status: BlockedStatus;
  sessionDateDebut: Date;
  formationNomLong: string;
  reminderNumber: 1 | 2;       // numéro de la prochaine relance à envoyer
  blockedOn: "devis" | "convention";
}

/**
 * Renvoie les stagiaires qui doivent recevoir une relance maintenant :
 *   - statut bloqué depuis >= 14j (basé sur updatedAt qui est mis à jour à
 *     chaque changement de statut, donc reflète "depuis quand au statut actuel")
 *   - 0 ou 1 relance déjà envoyée (pas 2)
 *   - dernière relance >= 7j (ou aucune)
 *   - session future (pas la peine de relancer si la session est passée)
 */
export async function findTraineesDueForRelance(): Promise<TraineeDueForRelance[]> {
  const now = new Date();
  const blocageThreshold = new Date(now.getTime() - BLOCAGE_DAYS * 24 * 3600 * 1000);
  const relanceThreshold = new Date(now.getTime() - RELANCE_INTERVAL_DAYS * 24 * 3600 * 1000);

  const trainees = await prisma.trainee.findMany({
    where: {
      status: { in: [...BLOCKED_STATUSES] },
      updatedAt: { lte: blocageThreshold },
      // Session encore à venir : pas de relance sur session déjà commencée
      session: { dateDebut: { gte: now } },
      isTest: false, // pas de relance auto pour les stagiaires de test
    },
    select: {
      id: true,
      email: true,
      prenom: true,
      nom: true,
      status: true,
      session: {
        select: { dateDebut: true, formation: { select: { nomLong: true } } },
      },
      events: {
        where: { type: TRAINEE_EVENT_TYPE },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const due: TraineeDueForRelance[] = [];
  for (const t of trainees) {
    const nbRelances = t.events.length;
    if (nbRelances >= MAX_RELANCES) continue;

    // Si une relance existe, vérifier le délai minimum depuis la dernière
    if (nbRelances > 0 && t.events[0].createdAt > relanceThreshold) continue;

    const status = t.status as BlockedStatus;
    if (!BLOCKED_STATUSES.includes(status)) continue;

    due.push({
      id: t.id,
      email: t.email,
      prenom: t.prenom,
      nom: t.nom,
      status,
      sessionDateDebut: t.session.dateDebut,
      formationNomLong: t.session.formation.nomLong,
      reminderNumber: (nbRelances + 1) as 1 | 2,
      blockedOn: status === "devis_envoye" ? "devis" : "convention",
    });
  }
  return due;
}

/**
 * Enregistre qu'une relance a été envoyée pour ce stagiaire. À appeler
 * après l'envoi mail OK pour éviter de spammer si le mail échoue.
 */
export async function recordRelanceSent(
  traineeId: string,
  status: BlockedStatus,
  reminderNumber: 1 | 2
): Promise<void> {
  await prisma.traineeEvent.create({
    data: {
      traineeId,
      type: TRAINEE_EVENT_TYPE,
      message: `Relance automatique #${reminderNumber} envoyée (statut: ${status})`,
      payload: JSON.stringify({ status, reminderNumber, automated: true }),
    },
  });
}
