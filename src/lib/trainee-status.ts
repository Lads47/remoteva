// Transition de statut d'un stagiaire, avec ses effets de bord :
//   - renseigne la date métier correspondante (si pas déjà fixée) ;
//   - synchronise l'étape de l'opportunité Sellsy (best-effort, sortant) ;
//   - déclenche la génération + envoi de la convention/contrat au passage
//     "devis_signe", et des documents de fin au passage "termine".
//
// Logique factorisée depuis /api/admin/trainees/[id]/status pour être
// réutilisée par le dépôt d'un document signé (/upload-signed), afin qu'un
// seul endroit pilote ces effets de bord.

import prisma from "./db";
import { getTraineeById, recordTraineeEvent, updateTrainee, type TraineeInfo, type TraineeUpdateInput } from "./trainee";
import { getSellsyStepMapping, type EvaStatus } from "./appConfig";
import { updateOpportunityStep } from "./sellsy";
import { generateAndMailContract, generateAndMailEndOfTrainingDocs } from "./trainee-documents";

// Dates métier auto-renseignées selon le nouveau statut.
const STATUS_TO_DATE_FIELD: Partial<Record<EvaStatus, keyof TraineeUpdateInput>> = {
  devis_envoye: "dateEnvoiDevis",
  devis_signe: "dateSignatureDevis",
  convention_envoyee: "dateEnvoiConvention",
  convention_signee: "dateSignatureConvention",
  convoque: "dateConvocation",
};

export type ContractTriggered = {
  documentType?: string;
  driveWebUrl?: string | null;
  emailSent?: boolean;
  error?: string;
} | null;

export type EndOfTrainingTriggered = {
  emailSent?: boolean;
  error?: string;
  skipped?: boolean;
} | null;

export type TransitionResult =
  | { kind: "not_found" }
  | { kind: "unchanged"; trainee: TraineeInfo }
  | {
      kind: "changed";
      trainee: TraineeInfo;
      sellsySynced: boolean;
      sellsyError: string | null;
      contractTriggered: ContractTriggered;
      endOfTrainingTriggered: EndOfTrainingTriggered;
    };

export async function transitionTraineeStatus(id: string, newStatus: EvaStatus): Promise<TransitionResult> {
  const existing = await getTraineeById(id);
  if (!existing) return { kind: "not_found" };
  if (existing.status === newStatus) return { kind: "unchanged", trainee: existing };

  // Nouveau statut + date métier auto-renseignée (si pas déjà fixée).
  const updateInput: TraineeUpdateInput = { status: newStatus };
  const dateField = STATUS_TO_DATE_FIELD[newStatus];
  if (dateField && !(existing as unknown as Record<string, unknown>)[dateField]) {
    (updateInput as Record<string, unknown>)[dateField] = new Date();
  }

  const trainee = await updateTrainee(id, updateInput);
  await recordTraineeEvent(id, "status_change", `Statut → ${newStatus}`, {
    from: existing.status,
    to: newStatus,
  });

  // Sync Sellsy : si opportunité + step mappé, on bascule (best-effort).
  let sellsySynced = false;
  let sellsyError: string | null = null;
  if (existing.sellsyOpportunityId) {
    const mapping = await getSellsyStepMapping();
    const stepId = mapping[newStatus];
    if (stepId) {
      try {
        await updateOpportunityStep(existing.sellsyOpportunityId, stepId);
        sellsySynced = true;
        await recordTraineeEvent(id, "sellsy_synced", `Opportunité Sellsy basculée à l'étape ${stepId}`, {
          opportunityId: existing.sellsyOpportunityId,
          stepId,
          status: newStatus,
        });
      } catch (err) {
        sellsyError = err instanceof Error ? err.message : "Erreur inconnue";
        console.warn("[trainee-status] échec sync Sellsy:", err);
        await recordTraineeEvent(id, "sellsy_synced", `Échec sync Sellsy: ${sellsyError}`, {
          opportunityId: existing.sellsyOpportunityId,
          stepId,
          status: newStatus,
          error: sellsyError,
        });
      }
    }
  }

  // Trigger "devis_signe" → convention/contrat (best-effort).
  let contractTriggered: ContractTriggered = null;
  if (newStatus === "devis_signe" && existing.status !== "devis_signe") {
    try {
      const res = await generateAndMailContract(id);
      if (res.ok) {
        contractTriggered = {
          documentType: res.documentType,
          driveWebUrl: res.driveWebUrl,
          emailSent: res.emailSent,
        };
      } else {
        contractTriggered = { error: res.error };
        await recordTraineeEvent(id, "doc_generated", `Auto-trigger ${newStatus} : ${res.error}`, {
          status: newStatus,
          autoTrigger: "convention_contrat",
          error: res.error,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      console.warn("[trainee-status] generateAndMailContract a throw:", err);
      contractTriggered = { error: msg };
    }
  }

  // Trigger "termine" → certificat + attestation (best-effort, skip si déjà envoyés).
  let endOfTrainingTriggered: EndOfTrainingTriggered = null;
  if (newStatus === "termine" && existing.status !== "termine") {
    const sentDocs = await prisma.traineeDocument.count({
      where: { traineeId: id, type: { in: ["certificat", "attestation"] }, sentAt: { not: null } },
    });
    if (sentDocs >= 2) {
      endOfTrainingTriggered = { skipped: true };
      await recordTraineeEvent(
        id,
        "doc_generated",
        `Auto-trigger ${newStatus} skipped : certificat + attestation déjà envoyés`,
        { status: newStatus, autoTrigger: "end_of_training", skipped: true }
      );
    } else {
      try {
        const res = await generateAndMailEndOfTrainingDocs(id);
        if (res.ok) {
          endOfTrainingTriggered = { emailSent: res.emailSent };
        } else {
          endOfTrainingTriggered = { error: res.error };
          await recordTraineeEvent(id, "doc_generated", `Auto-trigger ${newStatus} : ${res.error}`, {
            status: newStatus,
            autoTrigger: "end_of_training",
            error: res.error,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur inconnue";
        console.warn("[trainee-status] generateAndMailEndOfTrainingDocs a throw:", err);
        endOfTrainingTriggered = { error: msg };
      }
    }
  }

  return { kind: "changed", trainee, sellsySynced, sellsyError, contractTriggered, endOfTrainingTriggered };
}
