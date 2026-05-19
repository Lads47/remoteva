// Webhook Sellsy → EVA Remote.
//
// Sellsy envoie une requête HTTP POST en application/x-www-form-urlencoded
// avec un header X-Webhook-Signature = SHA1(SIGN_KEY + BODY_RAW).
//
// Pour l'instant on traite uniquement les événements opportunités :
//   - quand l'étape (step) d'une opportunité change côté Sellsy, on retrouve
//     le stagiaire correspondant via sellsyOpportunityId, on consulte le
//     mapping inverse (stepId → statut EVA) configuré dans /admin/formations/
//     sellsy-config, et on met à jour le statut EVA sans renvoyer vers
//     Sellsy (sinon boucle infinie).
//
// Config :
//   - Variable d'env SELLSY_WEBHOOK_SIGN_KEY : la clé donnée par Sellsy à la
//     création du webhook (Réglages > Portail développeurs > Webhooks).
//   - URL à mettre dans Sellsy : https://evaremote.com/api/webhooks/sellsy
//   - Action(s) à activer dans Sellsy : "opportunity.changed" (ou équivalent
//     selon les options disponibles).

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSellsyStepMapping, type EvaStatus } from "@/lib/appConfig";
import { getOpportunity } from "@/lib/sellsy";
import { recordTraineeEvent } from "@/lib/trainee";
import { generateAndMailContract } from "@/lib/trainee-documents";

// Inverse le mapping EvaStatus → stepId en un mapping stepId → EvaStatus
function invertStepMapping(mapping: Partial<Record<EvaStatus, number>>): Map<number, EvaStatus> {
  const out = new Map<number, EvaStatus>();
  for (const [status, stepId] of Object.entries(mapping)) {
    if (typeof stepId === "number") out.set(stepId, status as EvaStatus);
  }
  return out;
}

function verifySignature(rawBody: string, providedSig: string | null): boolean {
  const signKey = process.env.SELLSY_WEBHOOK_SIGN_KEY;
  if (!signKey) {
    // Pas de clé configurée : on rejette par défaut pour éviter d'accepter
    // n'importe quoi en prod. Pour le dev local, set la var à une valeur
    // factice.
    return false;
  }
  if (!providedSig) return false;
  const expected = createHash("sha1").update(signKey + rawBody).digest("hex");
  // Comparaison à temps constant pour éviter les timing attacks
  if (expected.length !== providedSig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ providedSig.charCodeAt(i);
  }
  return diff === 0;
}

interface ParsedPayload {
  event?: string;       // ex: "opportunity.changed", "opportunity.stepchange"
  objectType?: string;  // ex: "opportunity"
  objectId?: number;    // ID de l'objet (opportunité ici)
  // Sellsy peut envoyer beaucoup de champs ; on garde aussi l'ensemble brut
  // pour pouvoir logger / debug.
  raw: Record<string, string>;
}

function parseSellsyPayload(rawBody: string): ParsedPayload {
  const params = new URLSearchParams(rawBody);
  const raw: Record<string, string> = {};
  params.forEach((v, k) => { raw[k] = v; });

  // Sellsy v1 utilisait `notif` + `relatedid` + `relatedtype`. v2 peut
  // utiliser `event` ou `object_type` + `object_id`. On essaie plusieurs
  // variantes pour être robuste.
  const event = raw.event || raw.notif || raw.eventType;
  const objectType =
    raw.object_type || raw.relatedtype || raw.objectType || "";
  const objectIdStr = raw.object_id || raw.relatedid || raw.objectId || raw.id;
  const objectId = objectIdStr ? Number(objectIdStr) : undefined;

  return { event, objectType, objectId, raw };
}

// POST /api/webhooks/sellsy
export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Body illisible" }, { status: 400 });
  }

  const sig = request.headers.get("x-webhook-signature");
  if (!verifySignature(rawBody, sig)) {
    console.warn("[sellsy-webhook] Signature invalide ou manquante");
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  const payload = parseSellsyPayload(rawBody);
  console.log("[sellsy-webhook] received", {
    event: payload.event,
    objectType: payload.objectType,
    objectId: payload.objectId,
    rawKeys: Object.keys(payload.raw),
  });

  // On ne traite pour l'instant que les opportunités. Si on reçoit autre chose
  // on log et on répond 200 (Sellsy attend juste un 2xx, peu importe le
  // contenu).
  const objectTypeLower = (payload.objectType || "").toLowerCase();
  if (objectTypeLower !== "opportunity" && objectTypeLower !== "opportunities") {
    return NextResponse.json({ received: true, ignored: "type non supporté" });
  }
  if (!payload.objectId) {
    return NextResponse.json({ received: true, ignored: "objectId manquant" });
  }

  // 1. Trouve le stagiaire EVA correspondant
  const trainee = await prisma.trainee.findFirst({
    where: { sellsyOpportunityId: payload.objectId },
  });
  if (!trainee) {
    console.log(`[sellsy-webhook] aucune trainee avec sellsyOpportunityId=${payload.objectId}`);
    return NextResponse.json({ received: true, ignored: "trainee introuvable" });
  }

  // 2. Récupère l'opportunité Sellsy à jour pour connaître le step actuel
  let currentStepId: number | null = null;
  try {
    const opp = await getOpportunity(payload.objectId);
    currentStepId = opp.step?.id ?? null;
  } catch (err) {
    console.warn(`[sellsy-webhook] Échec getOpportunity ${payload.objectId}:`, err);
    return NextResponse.json({ received: true, ignored: "Sellsy GET échoué" });
  }
  if (!currentStepId) {
    return NextResponse.json({ received: true, ignored: "step absent" });
  }

  // 3. Mapping inverse stepId → statut EVA
  const mapping = await getSellsyStepMapping();
  const reverse = invertStepMapping(mapping);
  const newEvaStatus = reverse.get(currentStepId);
  if (!newEvaStatus) {
    console.log(`[sellsy-webhook] step ${currentStepId} non mappé à un statut EVA, ignoré`);
    return NextResponse.json({ received: true, ignored: "step non mappé" });
  }

  // 4. Si le statut EVA est déjà aligné, no-op pour éviter le ping-pong
  if (trainee.status === newEvaStatus) {
    return NextResponse.json({ received: true, ignored: "statut déjà aligné" });
  }

  // 5. Met à jour le statut EVA SANS appeler updateOpportunityStep (sinon
  //    boucle infinie : Sellsy nous notifie → on update Sellsy → Sellsy nous
  //    notifie à nouveau...). On va directement à prisma.update.
  const dateFieldMap: Partial<Record<EvaStatus, string>> = {
    devis_envoye: "dateEnvoiDevis",
    devis_signe: "dateSignatureDevis",
    convention_envoyee: "dateEnvoiConvention",
    convention_signee: "dateSignatureConvention",
    convoque: "dateConvocation",
  };
  const dateField = dateFieldMap[newEvaStatus];
  const data: Record<string, unknown> = { status: newEvaStatus };
  if (dateField && !(trainee as Record<string, unknown>)[dateField]) {
    data[dateField] = new Date();
  }
  await prisma.trainee.update({ where: { id: trainee.id }, data });

  await recordTraineeEvent(
    trainee.id,
    "status_change",
    `Statut → ${newEvaStatus} (depuis Sellsy webhook, étape ${currentStepId})`,
    { from: trainee.status, to: newEvaStatus, source: "sellsy_webhook", stepId: currentStepId }
  );

  console.log(
    `[sellsy-webhook] trainee ${trainee.id} : ${trainee.status} → ${newEvaStatus} (step ${currentStepId})`
  );

  // Trigger : si le nouveau statut est devis_signe, génère convention/contrat
  // et envoie le mail avec CGV + RI. Best-effort, ne bloque pas le 200.
  let contractTriggered: unknown = null;
  if (newEvaStatus === "devis_signe") {
    try {
      const res = await generateAndMailContract(trainee.id);
      contractTriggered = res.ok
        ? { documentType: res.documentType, emailSent: res.emailSent }
        : { error: res.error };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      console.warn("[sellsy-webhook] generateAndMailContract a throw:", err);
      contractTriggered = { error: msg };
    }
  }

  return NextResponse.json({
    received: true,
    updated: true,
    trainee: { id: trainee.id, from: trainee.status, to: newEvaStatus, stepId: currentStepId },
    contractTriggered,
  });
}

// Permet aussi un GET pour tests (renvoie un 200 "ok") — Sellsy n'utilise pas
// GET mais c'est pratique pour vérifier l'URL côté navigateur.
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "sellsy-webhook",
    message: "Endpoint actif. Envoyer un POST avec X-Webhook-Signature.",
  });
}
