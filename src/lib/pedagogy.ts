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

// Note globale d'un exercice suggérée d'après les notes de ses critères.
// Système pondéré :
//   - Points : acquis=2, en_cours=1, non_acquis=0
//   - ratio >= 80 % ET aucun non_acquis -> "acquis"
//   - ratio >= 50 %                      -> "en_cours"
//   - sinon                              -> "non_acquis"
// Le « filet de sécurité » sur le non_acquis empêche de promouvoir à "acquis"
// si un critère bloquant reste non maîtrisé.
//
// Renvoie null tant qu'un critère n'est pas noté (ou s'il n'y en a aucun).
//
// Partagée par la fiche formateur (la suggestion affichée) et le serveur, qui
// l'APPLIQUE quand le formateur a noté tous les critères mais laissé la note
// globale vide (27/11 : session vMix de novembre, synthèse « non noté » alors
// que les critères étaient remplis — la synthèse, l'attestation et le
// dashboard ne lisent que la note globale).
export type NoteExercice = "acquis" | "en_cours" | "non_acquis";

export function suggererNoteGlobale(scores: string[]): NoteExercice | null {
  if (scores.length === 0) return null;
  if (scores.some((s) => s !== "acquis" && s !== "en_cours" && s !== "non_acquis")) return null;
  const points = scores.reduce((sum, s) => sum + (s === "acquis" ? 2 : s === "en_cours" ? 1 : 0), 0);
  const ratio = points / (scores.length * 2);
  const hasNonAcquis = scores.includes("non_acquis");
  if (ratio >= 0.8 && !hasNonAcquis) return "acquis";
  if (ratio >= 0.5) return "en_cours";
  return "non_acquis";
}

/**
 * La note globale à enregistrer : celle du formateur si elle est saisie, sinon
 * la suggestion quand TOUS les critères de l'exercice sont notés, sinon "".
 * `scoresParCritere` : le score de chaque critère de l'exercice ("" si non noté).
 */
export function noteGlobaleEffective(saisie: string, scoresParCritere: string[]): string {
  if (saisie) return saisie;
  return suggererNoteGlobale(scoresParCritere) ?? "";
}
