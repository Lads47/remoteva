// Types + constantes partagés entre serveur et client.
// Pas d'import de modules serveur ici (Prisma, etc.) — ce fichier doit être bundlable côté client.

export type EvaStatus =
  | "inscrit"
  | "devis_envoye"
  | "devis_signe"
  | "convention_envoyee"
  | "convention_signee"
  | "valide"
  | "convoque"
  | "en_formation"
  | "termine"
  | "abandonne";

export const EVA_STATUSES: readonly EvaStatus[] = [
  "inscrit",
  "devis_envoye",
  "devis_signe",
  "convention_envoyee",
  "convention_signee",
  "valide",
  "convoque",
  "en_formation",
  "termine",
  "abandonne",
] as const;

export const EVA_STATUS_LABELS: Record<EvaStatus, string> = {
  inscrit: "Inscrit",
  devis_envoye: "Devis envoyé",
  devis_signe: "Devis signé",
  convention_envoyee: "Convention/contrat envoyé(e)",
  convention_signee: "Convention/contrat signé(e)",
  valide: "Validé",
  convoque: "Convoqué",
  en_formation: "En formation",
  termine: "Terminé",
  abandonne: "Abandonné",
};

export type SellsyStepMapping = Partial<Record<EvaStatus, number>>;

// Palette par statut (background + foreground), utilisée pour le dropdown chip.
export const EVA_STATUS_COLORS: Record<EvaStatus, { bg: string; fg: string }> = {
  inscrit:            { bg: "#e0e7ff", fg: "#3730a3" }, // indigo
  devis_envoye:       { bg: "#dbeafe", fg: "#1e40af" }, // bleu
  devis_signe:        { bg: "#cffafe", fg: "#155e75" }, // cyan
  convention_envoyee: { bg: "#fef3c7", fg: "#92400e" }, // ambre
  convention_signee:  { bg: "#fed7aa", fg: "#9a3412" }, // orange
  valide:             { bg: "#dcfce7", fg: "#166534" }, // vert
  convoque:           { bg: "#e9d5ff", fg: "#6b21a8" }, // violet
  en_formation:       { bg: "#bbf7d0", fg: "#14532d" }, // vert foncé
  termine:            { bg: "#d1d5db", fg: "#374151" }, // gris
  abandonne:          { bg: "#fee2e2", fg: "#991b1b" }, // rouge
};
