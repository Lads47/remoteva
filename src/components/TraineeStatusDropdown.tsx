"use client";

import { useState } from "react";
import { EVA_STATUSES, EVA_STATUS_LABELS, type EvaStatus } from "@/lib/appConfig-types";

interface Props {
  traineeId: string;
  currentStatus: string;
  /** Vrai si une opportunité Sellsy existe déjà (sinon "devis_envoye" est verrouillé). */
  hasSellsyOpportunity: boolean;
  /** Confirme avant la transition (true par défaut). */
  confirmBeforeChange?: boolean;
  /** Style compact pour les tableaux (plus petit). */
  compact?: boolean;
  /** Callback déclenché après une transition réussie — utile pour rafraîchir la vue. */
  onChanged?: (result: {
    newStatus: EvaStatus;
    sellsySynced: boolean;
    sellsyError: string | null;
  }) => void;
  /** Callback pour afficher un feedback / une erreur dans le parent. */
  onFeedback?: (msg: { type: "success" | "error"; text: string }) => void;
}

export default function TraineeStatusDropdown({
  traineeId,
  currentStatus,
  hasSellsyOpportunity,
  confirmBeforeChange = true,
  compact = false,
  onChanged,
  onFeedback,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function handleChange(newStatus: EvaStatus) {
    if (newStatus === currentStatus) return;

    // Garde-fou : "devis_envoye" passe obligatoirement par le bouton dédié
    if (newStatus === "devis_envoye" && !hasSellsyOpportunity) {
      onFeedback?.({
        type: "error",
        text: "Utilise le bouton « Envoyer le devis » sur la fiche stagiaire — il crée la fiche Sellsy + le devis et envoie le mail.",
      });
      return;
    }

    if (confirmBeforeChange && !confirm(`Passer le statut à « ${EVA_STATUS_LABELS[newStatus]} » ?`)) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/trainees/${traineeId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        onFeedback?.({ type: "error", text: data.error || "Erreur" });
        return;
      }
      const sellsyNote = data.sellsySynced
        ? " · Sellsy synchronisé ✓"
        : data.sellsyError
        ? ` · Sellsy en erreur (${String(data.sellsyError).slice(0, 80)})`
        : "";
      onFeedback?.({
        type: "success",
        text: `Statut → ${EVA_STATUS_LABELS[newStatus]}${sellsyNote}`,
      });
      onChanged?.({
        newStatus,
        sellsySynced: !!data.sellsySynced,
        sellsyError: data.sellsyError ?? null,
      });
    } catch {
      onFeedback?.({ type: "error", text: "Erreur de connexion" });
    } finally {
      setLoading(false);
    }
  }

  const baseClassName = compact
    ? "text-xs px-2 py-1 rounded border cursor-pointer disabled:opacity-50"
    : "text-xs px-3 py-1.5 rounded-full border cursor-pointer disabled:opacity-50";

  return (
    <select
      value={currentStatus}
      onChange={(e) => handleChange(e.target.value as EvaStatus)}
      disabled={loading}
      className={baseClassName}
      style={{ borderColor: "#1f2244", color: "#1f2244", backgroundColor: "white" }}
      // Empêche le clic ligne (utile dans un tableau)
      onClick={(e) => e.stopPropagation()}
    >
      {EVA_STATUSES.map((s) => {
        const disabled = s === "devis_envoye" && !hasSellsyOpportunity && currentStatus !== "devis_envoye";
        return (
          <option key={s} value={s} disabled={disabled}>
            {EVA_STATUS_LABELS[s]}
            {disabled ? " (utiliser le bouton)" : ""}
          </option>
        );
      })}
    </select>
  );
}
