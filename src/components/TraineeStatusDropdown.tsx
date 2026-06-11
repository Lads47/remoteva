"use client";

import { useState } from "react";
import {
  EVA_STATUSES,
  EVA_STATUS_LABELS,
  EVA_STATUS_COLORS,
  type EvaStatus,
} from "@/lib/appConfig-types";
import { apiFetch, apiErrorMessage } from "@/lib/api-client";

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
      const data = await apiFetch<{
        sellsySynced?: boolean;
        sellsyError?: string | null;
        endOfTrainingTriggered?: { emailSent?: boolean; error?: string; skipped?: boolean } | null;
      }>(`/api/admin/trainees/${traineeId}/status`, {
        method: "POST",
        body: { status: newStatus },
      });
      const sellsyNote = data.sellsySynced
        ? " · Sellsy synchronisé ✓"
        : data.sellsyError
        ? ` · Sellsy en erreur (${String(data.sellsyError).slice(0, 80)})`
        : "";
      // Auto-trigger fin de formation (statut → "termine") : feedback dédié
      let endOfTrainingNote = "";
      const eot = data.endOfTrainingTriggered;
      if (eot) {
        if (eot.skipped) endOfTrainingNote = " · Documents fin de formation déjà envoyés (skip)";
        else if (eot.emailSent) endOfTrainingNote = " · Certificat + attestation envoyés par mail ✓";
        else if (eot.error) endOfTrainingNote = ` · Échec docs fin de formation : ${String(eot.error).slice(0, 80)}`;
      }
      onFeedback?.({
        type: "success",
        text: `Statut → ${EVA_STATUS_LABELS[newStatus]}${sellsyNote}${endOfTrainingNote}`,
      });
      onChanged?.({
        newStatus,
        sellsySynced: !!data.sellsySynced,
        sellsyError: data.sellsyError ?? null,
      });
    } catch (err) {
      onFeedback?.({ type: "error", text: apiErrorMessage(err, "Erreur de connexion") });
    } finally {
      setLoading(false);
    }
  }

  const currentEva = (EVA_STATUSES as readonly string[]).includes(currentStatus)
    ? (currentStatus as EvaStatus)
    : null;
  const palette = currentEva ? EVA_STATUS_COLORS[currentEva] : { bg: "#e5e7eb", fg: "#374151" };

  // SVG chevron au foreground color, encodé en data-URI pour background-image.
  // Affichage cohérent quel que soit le bg (la flèche reprend la couleur du texte).
  const chevronColor = encodeURIComponent(palette.fg);
  const chevronSvg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' fill='none' stroke='${chevronColor}' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><path d='M1 1.5l5 5 5-5'/></svg>`;

  const sizePadding = compact ? "0.2rem 1.4rem 0.2rem 0.6rem" : "0.3rem 1.6rem 0.3rem 0.7rem";
  const fontSize = compact ? "11px" : "12px";

  return (
    <select
      value={currentStatus}
      onChange={(e) => handleChange(e.target.value as EvaStatus)}
      disabled={loading}
      onClick={(e) => e.stopPropagation()}
      className="font-jetbrains font-medium cursor-pointer disabled:opacity-50 transition-colors"
      style={{
        appearance: "none",
        WebkitAppearance: "none",
        MozAppearance: "none",
        backgroundColor: palette.bg,
        color: palette.fg,
        border: "none",
        outline: "none",
        borderRadius: "9999px",
        padding: sizePadding,
        fontSize,
        lineHeight: 1.2,
        backgroundImage: `url("${chevronSvg}")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: `right ${compact ? "6px" : "8px"} center`,
        backgroundSize: compact ? "9px 6px" : "10px 7px",
      }}
    >
      {EVA_STATUSES.map((s) => {
        const disabled = s === "devis_envoye" && !hasSellsyOpportunity && currentStatus !== "devis_envoye";
        return (
          <option key={s} value={s} disabled={disabled} style={{ color: "#1f2244", backgroundColor: "white" }}>
            {EVA_STATUS_LABELS[s]}
            {disabled ? " (utiliser le bouton)" : ""}
          </option>
        );
      })}
    </select>
  );
}
