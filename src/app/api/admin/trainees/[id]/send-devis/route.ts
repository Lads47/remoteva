import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getTraineeWithDetails, updateTrainee, recordTraineeEvent } from "@/lib/trainee";
import { getFormationById } from "@/lib/formation";
import { getSellsyPipelineId, getSellsyStepMapping } from "@/lib/appConfig";
import { parseFrenchAddress } from "@/lib/address";
import {
  createCompany,
  createIndividual,
  addCompanyAddress,
  addIndividualAddress,
  createOpportunity,
  createEstimate,
  downloadEstimatePdf,
  updateOpportunityStep,
} from "@/lib/sellsy";
import { sendDevisToStagiaire } from "@/lib/mailer";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// POST /api/admin/trainees/[id]/send-devis
// Orchestre : création contact Sellsy → opportunité → devis → envoi mail au stagiaire avec PDF
// → passage du Trainee en statut "devis_envoye" + bascule du step Sellsy.
//
// Idempotent : si une étape a déjà été faite (IDs Sellsy stockés sur le trainee), on la saute.
// En cas d'échec partiel, l'état est sauvegardé étape par étape pour pouvoir reprendre.
export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await ctx.params;
    const trainee = await getTraineeWithDetails(id);
    if (!trainee) {
      return NextResponse.json({ error: "Stagiaire introuvable" }, { status: 404 });
    }

    // Récupère la formation complète (pour avoir le prix HT, le service Sellsy, etc.)
    const formation = await getFormationById(trainee.formation.id);
    if (!formation) {
      return NextResponse.json({ error: "Formation introuvable" }, { status: 404 });
    }
    if (!formation.sellsyServiceId) {
      return NextResponse.json(
        { error: `Service Sellsy non configuré pour la formation ${formation.code}. Renseigne-le dans le catalogue.` },
        { status: 400 }
      );
    }

    // Récupère la config Sellsy
    const pipelineId = await getSellsyPipelineId();
    if (!pipelineId) {
      return NextResponse.json(
        { error: "Pipeline Sellsy non configuré. Va dans Catalogue → Config Sellsy." },
        { status: 400 }
      );
    }
    const stepMapping = await getSellsyStepMapping();
    const stepInscrit = stepMapping.inscrit;
    const stepDevisEnvoye = stepMapping.devis_envoye;
    if (!stepInscrit) {
      return NextResponse.json(
        { error: "Le statut 'Inscrit' n'a pas d'étape Sellsy mappée. Va dans Config Sellsy." },
        { status: 400 }
      );
    }

    const isEntreprise = trainee.inscriptionType === "entreprise";
    let companyId = trainee.sellsyCompanyId;
    let individualId = trainee.sellsyIndividualId;
    let opportunityId = trainee.sellsyOpportunityId;
    let estimateId = trainee.sellsyEstimateId;

    // === 1. Contact Sellsy (company ou individual) + adresse ===
    if (isEntreprise && !companyId) {
      const company = await createCompany({
        name: trainee.raisonSociale || `${trainee.prenom} ${trainee.nom}`,
        siret: trainee.siret,
        email: trainee.email,
        phoneNumber: trainee.telephone,
      });
      companyId = company.id;
      await updateTrainee(trainee.id, { sellsyCompanyId: companyId });
      await recordTraineeEvent(trainee.id, "sellsy_synced", `Fiche entreprise Sellsy créée (${companyId})`, {
        type: "company_created",
        sellsyCompanyId: companyId,
      });

      // Adresse du siège
      const addr = parseFrenchAddress(trainee.adresseSiege);
      if (addr.postalCode) {
        await addCompanyAddress(companyId, {
          name: trainee.raisonSociale,
          addressLine1: addr.addressLine1,
          postalCode: addr.postalCode,
          city: addr.city,
        });
      }
    } else if (!isEntreprise && !individualId) {
      const individual = await createIndividual({
        firstName: trainee.prenom,
        lastName: trainee.nom,
        email: trainee.email,
        phoneNumber: trainee.telephone,
      });
      individualId = individual.id;
      await updateTrainee(trainee.id, { sellsyIndividualId: individualId });
      await recordTraineeEvent(trainee.id, "sellsy_synced", `Fiche particulier Sellsy créée (${individualId})`, {
        type: "individual_created",
        sellsyIndividualId: individualId,
      });

      const addr = parseFrenchAddress(trainee.adressePostale);
      if (addr.postalCode) {
        await addIndividualAddress(individualId, {
          name: `${trainee.prenom} ${trainee.nom}`,
          addressLine1: addr.addressLine1,
          postalCode: addr.postalCode,
          city: addr.city,
        });
      }
    }

    const relatedType: "company" | "individual" = isEntreprise ? "company" : "individual";
    const relatedId = isEntreprise ? companyId! : individualId!;

    // === 2. Opportunité ===
    if (!opportunityId) {
      const opportunityName = buildOpportunityName({
        codeOpportunite: formation.codeOpportunite,
        formationCode: formation.code,
        sessionCode: trainee.session.code,
        prenom: trainee.prenom,
        nom: trainee.nom,
      });
      const opp = await createOpportunity({
        name: opportunityName,
        pipelineId,
        stepId: stepInscrit,
        relatedType,
        relatedId,
      });
      opportunityId = opp.id;
      await updateTrainee(trainee.id, { sellsyOpportunityId: opportunityId });
      await recordTraineeEvent(trainee.id, "sellsy_synced", `Opportunité Sellsy créée (${opportunityId}): ${opportunityName}`, {
        type: "opportunity_created",
        sellsyOpportunityId: opportunityId,
        name: opportunityName,
      });
    }

    // === 3. Devis ===
    if (!estimateId) {
      const subject = `${formation.nomLong} — ${trainee.prenom} ${trainee.nom} — ${trainee.session.code}`;
      const estimate = await createEstimate({
        subject,
        serviceId: formation.sellsyServiceId,
        unitAmountHT: formation.prixHT,
        relatedType,
        relatedId,
        opportunityId,
      });
      estimateId = estimate.id;
      await updateTrainee(trainee.id, { sellsyEstimateId: estimateId });
      await recordTraineeEvent(trainee.id, "sellsy_synced", `Devis Sellsy créé (${estimateId})`, {
        type: "estimate_created",
        sellsyEstimateId: estimateId,
        subject,
      });
    }

    // === 4. Téléchargement PDF + envoi mail ===
    const pdf = await downloadEstimatePdf(estimateId);
    const mailRes = await sendDevisToStagiaire({
      to: trainee.email,
      prenom: trainee.prenom,
      nom: trainee.nom,
      formationNomLong: formation.nomLong,
      sessionDateDebut: trainee.session.dateDebut,
      sessionDateFin: trainee.session.dateFin,
      sessionLieu: trainee.session.lieu,
      modeFinancement: trainee.modeFinancement,
      pdfBuffer: pdf.buffer,
      pdfFilename: pdf.filename,
    });
    await recordTraineeEvent(
      trainee.id,
      mailRes.success ? "email_sent" : "email_failed",
      mailRes.success
        ? `Mail devis envoyé au stagiaire (${trainee.email})`
        : `Échec mail devis: ${mailRes.error}`,
      { type: "devis_stagiaire", to: trainee.email, messageId: mailRes.messageId }
    );

    // === 5. Bascule du step Sellsy + statut EVA ===
    if (stepDevisEnvoye) {
      try {
        await updateOpportunityStep(opportunityId, stepDevisEnvoye);
        await recordTraineeEvent(trainee.id, "sellsy_synced", `Opportunité passée à l'étape "Devis envoyé" (${stepDevisEnvoye})`, {
          type: "opportunity_step_updated",
          stepId: stepDevisEnvoye,
        });
      } catch (err) {
        console.warn("[send-devis] Échec update step Sellsy:", err);
        await recordTraineeEvent(trainee.id, "sellsy_synced", `Échec update step Sellsy: ${err instanceof Error ? err.message : "?"}`, {
          type: "opportunity_step_failed",
        });
      }
    }

    await updateTrainee(trainee.id, {
      status: "devis_envoye",
      dateEnvoiDevis: new Date(),
    });
    await recordTraineeEvent(trainee.id, "status_change", "Statut → Devis envoyé", {
      status: "devis_envoye",
    });

    return NextResponse.json({
      success: true,
      sellsy: {
        companyId,
        individualId,
        opportunityId,
        estimateId,
      },
      emailSent: mailRes.success,
    });
  } catch (error) {
    console.error("[/api/admin/trainees/[id]/send-devis] error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildOpportunityName(params: {
  codeOpportunite: string;
  formationCode: string;
  sessionCode: string;
  prenom: string;
  nom: string;
}): string {
  const code = params.codeOpportunite || params.formationCode;
  // Évite la duplication si le sessionCode commence par le formationCode (ex: "vMixJ1-2026-05")
  // → on extrait juste la partie temporelle "2026-05" (ou "2026-05-2" si collision).
  const prefix = params.formationCode + "-";
  const sessionSuffix = params.sessionCode.startsWith(prefix)
    ? params.sessionCode.slice(prefix.length)
    : params.sessionCode;
  return `${code} ${sessionSuffix} · ${params.nom.toUpperCase()} ${params.prenom}`;
}
