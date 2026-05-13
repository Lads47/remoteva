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
