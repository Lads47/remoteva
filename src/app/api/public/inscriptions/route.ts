import { NextRequest, NextResponse } from "next/server";
import { publicInscriptionSchema } from "@/lib/validation";
import { getSessionById } from "@/lib/session";
import { createTrainee, recordTraineeEvent } from "@/lib/trainee";
import { detectOpcoBySiret } from "@/lib/opco";

// POST /api/public/inscriptions
// Crée un Trainee en statut "inscrit", déclenche la détection OPCO si entreprise.
// Aucune authentification : route publique appelée par le formulaire d'inscription.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = publicInscriptionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const data = parsed.data;

    // Vérifier que la session existe et est ouverte
    const session = await getSessionById(data.sessionId);
    if (!session) {
      return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
    }
    if (session.status !== "open") {
      return NextResponse.json(
        { error: "Cette session n'accepte plus d'inscriptions" },
        { status: 409 }
      );
    }
    if (session.traineeCount >= session.capacite) {
      return NextResponse.json({ error: "Session complète" }, { status: 409 });
    }

    // Détection OPCO best-effort (entreprise uniquement)
    let opcoDetecte = "";
    let opcoPayload: Record<string, unknown> = {};
    if (data.inscriptionType === "entreprise" && data.siret) {
      const det = await detectOpcoBySiret(data.siret);
      opcoDetecte = det.opco;
      opcoPayload = { ape: det.ape, idcc: det.idcc, opco: det.opco };
    }

    // Si l'user a coché "non" pour adaptations, on stocke chaîne vide.
    // Si "oui" sans précision, on stocke un marqueur explicite (le client devrait fournir un texte
    // grâce à la validation, mais on garde la robustesse).
    const besoinsAdaptationStored = data.aBesoinsAdaptation
      ? data.besoinsAdaptation || "(non précisé)"
      : "";

    // Sortir "attentes" et "projets/projet" des préreq pour les ranger dans le champ dédié.
    const attentes = String(data.prerequis?.attentes ?? "");
    const prerequisRest = { ...data.prerequis };
    delete prerequisRest.attentes;

    const trainee = await createTrainee({
      sessionId: data.sessionId,
      nom: data.nom,
      prenom: data.prenom,
      email: data.email,
      telephone: data.telephone,
      inscriptionType: data.inscriptionType,
      raisonSociale: data.raisonSociale,
      siret: data.siret,
      adresseSiege: data.adresseSiege,
      domaineActivite: data.domaineActivite,
      contactAdmin: data.contactAdmin,
      adressePostale: data.adressePostale,
      statutActuel: data.statutActuel,
      modeFinancement: data.modeFinancement,
      opcoDetecte,
      psh: data.psh,
      besoinsAdaptation: besoinsAdaptationStored,
      evalEntree: JSON.stringify(prerequisRest),
      attentes,
    });

    await recordTraineeEvent(trainee.id, "status_change", "Inscription créée", {
      status: "inscrit",
      source: "public_form",
    });
    await recordTraineeEvent(trainee.id, "rgpd_consent", "Consentement RGPD donné", {
      timestamp: new Date().toISOString(),
    });
    if (data.inscriptionType === "entreprise") {
      await recordTraineeEvent(
        trainee.id,
        "opco_detected",
        opcoDetecte ? `OPCO détecté: ${opcoDetecte}` : "Détection OPCO échouée",
        opcoPayload
      );
    }

    return NextResponse.json(
      {
        success: true,
        traineeId: trainee.id,
        opcoDetecte: opcoDetecte || null,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[/api/public/inscriptions] POST error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
