// Verdict d'atteinte des objectifs pédagogiques d'un stagiaire.
//
// Algo pondéré partagé entre :
//   - le dashboard Qualiopi (analytics.getPedagogyStats)
//   - les résultats publics par formation (analytics.getFormationPublicResults)
//   - l'attestation de fin de formation (trainee-documents)
//
// Règles :
//   - acquis = 2 pts, en_cours = 1 pt, non_acquis / sans note = 0 pt
//   - "atteints"               : tous les exercices attendus notés "acquis"
//   - "partiellement_atteints" : ratio de points ≥ 50 %
//   - "non_atteints"           : ratio < 50 %
//   - ""                       : non évaluable (aucun exercice attendu, ou
//                                aucune note saisie)
//   - Un override manuel valide prime toujours sur le calcul.

export type ObjectifsValue = "atteints" | "partiellement_atteints" | "non_atteints" | "";

export interface ComputeObjectifsInput {
  /** Override manuel saisi par l'admin — prime sur le calcul s'il est valide. */
  override?: string | null;
  /** Nombre d'exercices actifs attendus pour la formation. */
  expectedCount: number;
  /** Notes globales non vides saisies (une par exercice noté). */
  notes: Iterable<string>;
}

export function computeObjectifs({ override, expectedCount, notes }: ComputeObjectifsInput): ObjectifsValue {
  if (override === "atteints" || override === "partiellement_atteints" || override === "non_atteints") {
    return override;
  }
  if (expectedCount === 0) return "";

  let acquis = 0;
  let enCours = 0;
  let nonAcquis = 0;
  let noted = 0;
  for (const note of notes) {
    noted++;
    if (note === "acquis") acquis++;
    else if (note === "en_cours") enCours++;
    else if (note === "non_acquis") nonAcquis++;
  }
  if (noted === 0) return "";

  const sansNote = expectedCount - noted;
  const points = acquis * 2 + enCours;
  const ratio = points / (expectedCount * 2);
  const isComplete = sansNote === 0 && nonAcquis === 0 && enCours === 0;
  if (ratio >= 0.8 && isComplete) return "atteints";
  if (ratio >= 0.5) return "partiellement_atteints";
  return "non_atteints";
}
