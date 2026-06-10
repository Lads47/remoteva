import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  session: { findMany: vi.fn() },
  trainee: { findMany: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ default: prismaMock, prisma: prismaMock }));
vi.mock("@/lib/complaint", () => ({ getComplaintStats: vi.fn() }));

import {
  getActivityStats,
  getPedagogyStats,
  getSatisfactionChaudStats,
} from "@/lib/analytics";

beforeEach(() => {
  prismaMock.session.findMany.mockReset();
  prismaMock.trainee.findMany.mockReset();
});

// === Activité ===

describe("getActivityStats", () => {
  it("calcule heures réelles depuis l'émargement (1 demi-journée = 3,5 h)", async () => {
    prismaMock.session.findMany.mockResolvedValue([
      {
        formationId: "f1",
        formation: { dureeJours: 2 }, // nominal 14 h / stagiaire
        trainees: [
          // 4 demi-journées émargées → 14 h réalisées
          { id: "t1", psh: false, attendances: [{ id: "a1" }, { id: "a2" }, { id: "a3" }, { id: "a4" }] },
          // 2 demi-journées émargées → 7 h réalisées
          { id: "t2", psh: true, attendances: [{ id: "a5" }, { id: "a6" }] },
        ],
      },
    ]);

    const stats = await getActivityStats(2026);

    expect(stats.sessionsCount).toBe(1);
    expect(stats.traineesAccueillis).toBe(2);
    expect(stats.stagiairesPSH).toBe(1);
    expect(stats.heuresStagiairesNominales).toBe(28);
    expect(stats.heuresStagiairesRealisees).toBe(21);
    expect(stats.tauxAssiduiteMoyen).toBe(75); // 21/28
  });

  it("fallback sur les heures nominales si aucun émargement saisi", async () => {
    prismaMock.session.findMany.mockResolvedValue([
      {
        formationId: "f1",
        formation: { dureeJours: 3 },
        trainees: [{ id: "t1", psh: false, attendances: [] }],
      },
    ]);

    const stats = await getActivityStats(2026);

    expect(stats.heuresStagiairesRealisees).toBe(21); // 3 × 7
    expect(stats.heuresStagiairesNominales).toBe(21);
    expect(stats.tauxAssiduiteMoyen).toBe(100);
  });

  it("compte les formations distinctes sur plusieurs sessions", async () => {
    prismaMock.session.findMany.mockResolvedValue([
      { formationId: "f1", formation: { dureeJours: 1 }, trainees: [] },
      { formationId: "f1", formation: { dureeJours: 1 }, trainees: [] },
      { formationId: "f2", formation: { dureeJours: 1 }, trainees: [] },
    ]);

    const stats = await getActivityStats(2026);

    expect(stats.sessionsCount).toBe(3);
    expect(stats.formationsDistinctesCount).toBe(2);
    expect(stats.tauxAssiduiteMoyen).toBe(0); // aucun stagiaire → pas de division
  });
});

// === Satisfaction à chaud ===

function chaudSession(answersPerResponse: { questionName: string; value: string }[][], invited = 0) {
  return {
    _count: { trainees: invited },
    satisfactionResponses: answersPerResponse.map((answers) => ({ answers })),
  };
}

describe("getSatisfactionChaudStats", () => {
  it("classe le NPS : ≥9 promoteur, 7-8 passif, <7 détracteur", async () => {
    prismaMock.session.findMany.mockResolvedValue([
      chaudSession(
        [
          [{ questionName: "recommandation_nps", value: "10" }],
          [{ questionName: "recommandation_nps", value: "9" }],
          [{ questionName: "recommandation_nps", value: "7" }],
          [{ questionName: "recommandation_nps", value: "3" }],
        ],
        4
      ),
    ]);

    const stats = await getSatisfactionChaudStats(2026);

    expect(stats.npsPromoters).toBe(2);
    expect(stats.npsPassives).toBe(1);
    expect(stats.npsDetractors).toBe(1);
    expect(stats.npsTotal).toBe(4);
    expect(stats.npsScore).toBe(25); // (2-1)/4 = 25
    expect(stats.responseRate).toBe(1);
  });

  it("npsScore null sans aucune réponse NPS", async () => {
    prismaMock.session.findMany.mockResolvedValue([chaudSession([], 5)]);

    const stats = await getSatisfactionChaudStats(2026);

    expect(stats.npsScore).toBeNull();
    expect(stats.invitedTotal).toBe(5);
    expect(stats.submittedTotal).toBe(0);
    expect(stats.responseRate).toBe(0);
  });

  it("moyenne Likert sur les questions du set chaud uniquement", async () => {
    prismaMock.session.findMany.mockResolvedValue([
      chaudSession(
        [
          [
            { questionName: "satisfaction_globale", value: "5" },
            { questionName: "attentes", value: "4" },
            { questionName: "commentaire_libre", value: "super" }, // ignoré
          ],
        ],
        1
      ),
    ]);

    const stats = await getSatisfactionChaudStats(2026);

    expect(stats.globalCount).toBe(2);
    expect(stats.globalAverage).toBe(4.5);
  });

  it("ignore les valeurs hors bornes ou non numériques", async () => {
    prismaMock.session.findMany.mockResolvedValue([
      chaudSession(
        [
          [
            { questionName: "recommandation_nps", value: "11" },   // hors bornes
            { questionName: "recommandation_nps", value: "abc" },  // non numérique
            { questionName: "satisfaction_globale", value: "6" },  // hors bornes Likert
            { questionName: "satisfaction_globale", value: "0" },  // hors bornes Likert
          ],
        ],
        1
      ),
    ]);

    const stats = await getSatisfactionChaudStats(2026);

    expect(stats.npsTotal).toBe(0);
    expect(stats.npsScore).toBeNull();
    expect(stats.globalCount).toBe(0);
    expect(stats.globalAverage).toBeNull();
  });
});

// === Pédagogie ===

function pedagogyTrainee(opts: {
  override?: string | null;
  expectedExerciseIds?: string[];
  evaluations?: { exerciseId: string; globalNote: string | null }[];
}) {
  return {
    id: "t",
    objectifsAtteintsOverride: opts.override ?? null,
    exerciseEvaluations: opts.evaluations ?? [],
    session: {
      formation: {
        evaluationExercises: (opts.expectedExerciseIds ?? []).map((id) => ({ id })),
      },
    },
  };
}

describe("getPedagogyStats", () => {
  it("répartit les stagiaires selon le verdict pondéré", async () => {
    prismaMock.trainee.findMany.mockResolvedValue([
      // tous acquis → atteints
      pedagogyTrainee({
        expectedExerciseIds: ["e1", "e2"],
        evaluations: [
          { exerciseId: "e1", globalNote: "acquis" },
          { exerciseId: "e2", globalNote: "acquis" },
        ],
      }),
      // 1 acquis + 1 en_cours → partiellement (ratio 0.75, pas complet)
      pedagogyTrainee({
        expectedExerciseIds: ["e1", "e2"],
        evaluations: [
          { exerciseId: "e1", globalNote: "acquis" },
          { exerciseId: "e2", globalNote: "en_cours" },
        ],
      }),
      // override manuel prime malgré les notes acquises
      pedagogyTrainee({
        override: "non_atteints",
        expectedExerciseIds: ["e1"],
        evaluations: [{ exerciseId: "e1", globalNote: "acquis" }],
      }),
      // aucune note → non évalué
      pedagogyTrainee({ expectedExerciseIds: ["e1"] }),
      // aucun exercice attendu → non évalué
      pedagogyTrainee({}),
    ]);

    const stats = await getPedagogyStats(2026);

    expect(stats.traineesTotal).toBe(5);
    expect(stats.atteints).toBe(1);
    expect(stats.partiellementAtteints).toBe(1);
    expect(stats.nonAtteints).toBe(1);
    expect(stats.nonEvalues).toBe(2);
    expect(stats.tauxAtteinte).toBe(33); // 1/3 évalués
  });

  it("dédoublonne les évaluations multiples d'un même exercice", async () => {
    prismaMock.trainee.findMany.mockResolvedValue([
      pedagogyTrainee({
        expectedExerciseIds: ["e1"],
        evaluations: [
          { exerciseId: "e1", globalNote: "non_acquis" },
          { exerciseId: "e1", globalNote: "acquis" }, // dernière note conservée
        ],
      }),
    ]);

    const stats = await getPedagogyStats(2026);

    expect(stats.atteints).toBe(1);
    expect(stats.nonAtteints).toBe(0);
  });

  it("tauxAtteinte = 0 quand personne n'est évalué", async () => {
    prismaMock.trainee.findMany.mockResolvedValue([
      pedagogyTrainee({ expectedExerciseIds: ["e1"] }),
    ]);

    const stats = await getPedagogyStats(2026);

    expect(stats.nonEvalues).toBe(1);
    expect(stats.tauxAtteinte).toBe(0);
  });
});
