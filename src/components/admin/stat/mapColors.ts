import type { MarkerKind } from "@/lib/stat/live-types";

// Bleu = nouveau visiteur, vert = récurrent, orange = en ligne maintenant.
export const MARKER_COLORS: Record<MarkerKind, string> = {
  nouveau: "#3b82f6",
  recurrent: "#16a34a",
  "en-ligne": "#f97316",
};
