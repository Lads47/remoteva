// POST /api/admin/reclamations/[id]/send-response
//
// Envoie au réclamant le mail de réponse formelle saisi côté admin
// (responseContent + actionCorrective). Marque responseSentAt + bascule
// automatiquement le statut à "resolved" si ce n'est pas déjà le cas.

import { NextRequest, NextResponse } from "next/server";
import { getComplaintById, markResponseSent, updateComplaint } from "@/lib/complaint";
import { sendComplaintResponse } from "@/lib/mailer";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const c = await getComplaintById(id);
    if (!c) return NextResponse.json({ error: "Réclamation introuvable" }, { status: 404 });
    if (!c.responseContent || c.responseContent.trim().length < 10) {
      return NextResponse.json(
        { error: "Le contenu de la réponse est requis (au moins 10 caractères). Renseigne-le avant d'envoyer." },
        { status: 400 }
      );
    }

    const res = await sendComplaintResponse({
      to: c.authorEmail,
      authorName: c.authorName,
      complaintNumber: c.number,
      subject: c.subject,
      responseContent: c.responseContent,
      actionCorrective: c.actionCorrective || undefined,
    });
    if (!res.success) {
      return NextResponse.json(
        { success: false, error: res.error || "Échec d'envoi du mail" },
        { status: 502 }
      );
    }

    // Marque l'envoi + passe la réclamation à "resolved" si elle ne l'était pas
    await markResponseSent(id);
    if (c.status === "new" || c.status === "in_progress") {
      await updateComplaint(id, { status: "resolved" });
    }

    const updated = await getComplaintById(id);
    return NextResponse.json({ success: true, complaint: updated });
  } catch (error) {
    console.error("[/api/admin/reclamations/[id]/send-response] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
