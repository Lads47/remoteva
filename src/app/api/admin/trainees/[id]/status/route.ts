import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getTraineeById, recordTraineeEvent, updateTrainee, type TraineeUpdateInput } from "@/lib/trainee";
import { traineeStatusTransitionSchema } from "@/lib/validation";
import { getSellsyStepMapping, type EvaStatus } from "@/lib/appConfig";
import { updateOpportunityStep } from "@/lib/sellsy";
import { generateAndMailContract, generateAndMailEndOfTrainingDocs } from "@/lib/trainee-documents";
import prisma from "@/lib/db";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// Dates métier auto-renseignées selon le nouveau statut (transition manuelle)
const STATUS_TO_DATE_FIELD: Partial<Record<EvaStatus, keyof TraineeUpdateInput>> = {
  devis_envoye: "dateEnvoiDevis",
  devis_signe: "dateSignatureDevis",
  convention_envoyee: "dateEnvoiConvention",
  convention_signee: "dateSignatureConvention",
  convoque: "dateConvocation",
};

// POST /api/admin/trainees/[id]/status
// Change le statut EVA d'un stagiaire et synchronise l'étape de l'opportunité
// Sellsy (best-effort : la transition EVA aboutit même si Sellsy plante).
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await ctx.params;
    const body = await request.json();
    const parsed = traineeStatusTransitionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const newStatus = parsed.data.status as EvaStatus;

    const existing = await getTraineeById(id);
    if (!existing) {
      return NextResponse.json({ error: "Stagiaire introuvable" }, { status: 404 });
    }
    if (existing.status === newStatus) {
      return NextResponse.json({ trainee: existing, sellsySynced: false, note: "Statut inchangé" });
    }

    // Préparer la mise à jour : nouveau statut + date métier auto-renseignée (si pas déjà fixée)
    const updateInput: TraineeUpdateInput = { status: newStatus };
    const dateField = STATUS_TO_DATE_FIELD[newStatus];
    if (dateField && !(existing as unknown as Record<string, unknown>)[dateField]) {
      (updateInput as Record<string, unknown>)[dateField] = new Date();
    }

    const trainee = await updateTrainee(id, updateInput);
    await recordTraineeEvent(
      id,
      "status_change",
      `Statut → ${newStatus}`,
      { from: existing.status, to: newStatus }
    );

    // Sync Sellsy : si on a une opportunité et que le statut a un step mappé, on bascule.
    let sellsySynced = false;
    let sellsyError: string | null = null;
    if (existing.sellsyOpportunityId) {
      const mapping = await getSellsyStepMapping();
      const stepId = mapping[newStatus];
      if (stepId) {
        try {
          await updateOpportunityStep(existing.sellsyOpportunityId, stepId);
          sellsySynced = true;
          await recordTraineeEvent(
            id,
            "sellsy_synced",
            `Opportunité Sellsy basculée à l'étape ${stepId}`,
            { opportunityId: existing.sellsyOpportunityId, stepId, status: newStatus }
          );
        } catch (err) {
          sellsyError = err instanceof Error ? err.message : "Erreur inconnue";
          console.warn(`[status] échec sync Sellsy:`, err);
          await recordTraineeEvent(
            id,
            "sellsy_synced",
            `Échec sync Sellsy: ${sellsyError}`,
            { opportunityId: existing.sellsyOpportunityId, stepId, status: newStatus, error: sellsyError }
          );
        }
      }
    }

    // Trigger : à la signature du devis, génère automatiquement la
    // convention (entreprise) ou le contrat (particulier) et l'envoie par
    // mail avec CGV + RI en PJ. Best-effort : on log si ça échoue, sans
    // bloquer la transition de statut elle-même.
    let contractTriggered: { documentType?: string; driveWebUrl?: string | null; emailSent?: boolean; error?: string } | null = null;
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
          await recordTraineeEvent(
            id,
            "doc_generated",
            `Auto-trigger ${newStatus} : ${res.error}`,
            { status: newStatus, autoTrigger: "convention_contrat", error: res.error }
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur inconnue";
        console.warn("[status] generateAndMailContract a throw:", err);
        contractTriggered = { error: msg };
      }
    }

    // Trigger : au passage à "termine", génère automatiquement le certificat
    // de réalisation + l'attestation de fin de formation et les envoie au
    // stagiaire dans un mail unique avec les 2 PDF en pièces jointes.
    // Best-effort : on log les erreurs sans bloquer la transition de statut.
    // Skip si les 2 documents ont déjà été envoyés (cas où on rebascule
    // un stagiaire qui était déjà "termine" puis a été reset à un autre statut).
    let endOfTrainingTriggered: {
      emailSent?: boolean;
      error?: string;
      skipped?: boolean;
    } | null = null;
    if (newStatus === "termine" && existing.status !== "termine") {
      const sentDocs = await prisma.traineeDocument.count({
        where: {
          traineeId: id,
          type: { in: ["certificat", "attestation"] },
          sentAt: { not: null },
        },
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
            await recordTraineeEvent(
              id,
              "doc_generated",
              `Auto-trigger ${newStatus} : ${res.error}`,
              { status: newStatus, autoTrigger: "end_of_training", error: res.error }
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Erreur inconnue";
          console.warn("[status] generateAndMailEndOfTrainingDocs a throw:", err);
          endOfTrainingTriggered = { error: msg };
        }
      }
    }

    return NextResponse.json({ trainee, sellsySynced, sellsyError, contractTriggered, endOfTrainingTriggered });
  } catch (error) {
    console.error("[/api/admin/trainees/[id]/status] POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
