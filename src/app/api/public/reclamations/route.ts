// POST /api/public/reclamations
//
// Endpoint public de soumission d'une réclamation (Qualiopi indicateur 32).
// Pas d'authentification — quiconque peut signaler un dysfonctionnement.
// Validation Zod côté serveur, et envoi de 2 mails :
//   1. Accusé de réception au réclamant
//   2. Alerte interne à Noémie avec lien direct vers le traitement admin

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createComplaint } from "@/lib/complaint";
import { sendComplaintAcknowledgement, sendComplaintAdminAlert } from "@/lib/mailer";

const schema = z.object({
  authorName: z.string().trim().min(1, "Le nom est requis"),
  authorCompany: z.string().trim().optional(),
  authorRole: z.string().trim().optional(),
  authorEmail: z.string().trim().email("Adresse email invalide"),
  concernedName: z.string().trim().optional(),
  concernedCompany: z.string().trim().optional(),
  concernedRole: z.string().trim().optional(),
  subject: z.string().trim().min(3, "L'objet doit faire au moins 3 caractères"),
  description: z.string().trim().min(20, "La description doit faire au moins 20 caractères pour qu'on puisse comprendre la situation"),
  // Pré-remplissage si formulaire ouvert depuis un mail / QR avec contexte
  sessionId: z.string().trim().optional(),
  traineeId: z.string().trim().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation échouée", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const created = await createComplaint(parsed.data);

    // Envoi des 2 mails en parallèle, best-effort (on ne fait pas échouer
    // la soumission si Resend plante — la réclamation reste en BDD).
    const base = process.env.PUBLIC_BASE_URL || "https://evaremote.com";
    const adminUrl = `${base}/admin/reclamations/${created.id}`;

    const [ackRes, alertRes] = await Promise.all([
      sendComplaintAcknowledgement({
        to: parsed.data.authorEmail,
        authorName: parsed.data.authorName,
        complaintNumber: created.number,
        subject: parsed.data.subject,
      }).catch((err: unknown) => ({
        success: false,
        error: err instanceof Error ? err.message : "Erreur inconnue",
      })),
      sendComplaintAdminAlert({
        complaintNumber: created.number,
        authorName: parsed.data.authorName,
        authorEmail: parsed.data.authorEmail,
        subject: parsed.data.subject,
        description: parsed.data.description,
        adminUrl,
      }).catch((err: unknown) => ({
        success: false,
        error: err instanceof Error ? err.message : "Erreur inconnue",
      })),
    ]);

    if (!ackRes.success) {
      console.warn(`[/api/public/reclamations] ack mail KO pour ${parsed.data.authorEmail}:`, ackRes.error);
    }
    if (!alertRes.success) {
      console.warn("[/api/public/reclamations] alert admin KO:", alertRes.error);
    }

    return NextResponse.json({
      success: true,
      number: created.number,
      acknowledgementSent: ackRes.success,
    });
  } catch (error) {
    console.error("[/api/public/reclamations] POST error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
