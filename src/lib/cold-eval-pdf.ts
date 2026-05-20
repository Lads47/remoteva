// PDF de synthèse de l'évaluation à FROID.
//
// Réutilise buildSatisfactionPdf avec des titres / sous-titres adaptés —
// même mise en page (NPS histogramme, distributions, verbatims, pagination
// atomique par question, header sur pages internes, footer mentions légales).
//
// La signature de ColdEvalSynthesis est compatible avec SatisfactionSynthesis
// (le champ supplémentaire `perTrainee` n'est pas utilisé par le générateur PDF
// et est simplement ignoré).

import type { ColdEvalSynthesis } from "./cold-eval";
import { buildSatisfactionPdf } from "./satisfaction-pdf";
import type { SatisfactionSynthesis } from "./satisfaction";

export async function buildColdEvalPdf(
  synthesis: ColdEvalSynthesis
): Promise<{ buffer: Buffer; filename: string }> {
  // ColdEvalSynthesis a un superset des champs de SatisfactionSynthesis :
  // session, formation, totals, questions, stats. Le champ `perTrainee` en
  // plus n'est pas utilisé par le PDF — on cast pour passer.
  const compatSynth = synthesis as unknown as SatisfactionSynthesis;
  return buildSatisfactionPdf(compatSynth, {
    title: "Évaluation à froid — Synthèse",
    subject: `Évaluation à froid — ${synthesis.formation.nomLong}`,
    filenamePrefix: "Synthese_eval_a_froid_",
    metaTitlePrefix: "Synthèse éval à froid — ",
  });
}
