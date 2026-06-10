import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  session: { findMany: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ default: prismaMock, prisma: prismaMock }));

import { getFinancialStats, getYearsWithFinishedSessions } from "@/lib/finances";

function fakeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    code: "EVA-2026-001",
    dateDebut: new Date("2026-03-01"),
    dateFin: new Date("2026-03-05"),
    trainerFeeAmount: null,
    formation: { code: "OBS", nomLong: "Maîtriser OBS Studio" },
    trainer: { prenom: "Jean", nom: "Dupont", isExternal: false },
    trainees: [{ montantHT: 1000 }, { montantHT: 500 }],
    ...overrides,
  };
}

beforeEach(() => {
  prismaMock.session.findMany.mockReset();
});

describe("getFinancialStats", () => {
  it("calcule CA, marge et % pour un formateur interne (coût ST ignoré)", async () => {
    // Fee résiduel sur formateur interne → ne doit PAS compter en coût ST
    prismaMock.session.findMany.mockResolvedValue([
      fakeSession({ trainerFeeAmount: 400 }),
    ]);

    const stats = await getFinancialStats(2026);

    expect(stats.sessions).toHaveLength(1);
    const row = stats.sessions[0];
    expect(row.caHt).toBe(1500);
    expect(row.coutSousTraitanceHt).toBe(0);
    expect(row.margeHt).toBe(1500);
    expect(row.margePct).toBe(100);
    expect(row.trainerIsExternal).toBe(false);
    expect(stats.externalSessionsCount).toBe(0);
  });

  it("compte le coût ST pour un formateur externe", async () => {
    prismaMock.session.findMany.mockResolvedValue([
      fakeSession({
        trainer: { prenom: "Lia", nom: "Martin", isExternal: true },
        trainerFeeAmount: 600,
      }),
    ]);

    const stats = await getFinancialStats(2026);

    const row = stats.sessions[0];
    expect(row.coutSousTraitanceHt).toBe(600);
    expect(row.margeHt).toBe(900);
    expect(row.margePct).toBe(60);
    expect(stats.externalSessionsCount).toBe(1);
  });

  it("formateur externe sans fee saisi → coût 0", async () => {
    prismaMock.session.findMany.mockResolvedValue([
      fakeSession({
        trainer: { prenom: "Lia", nom: "Martin", isExternal: true },
        trainerFeeAmount: null,
      }),
    ]);

    const stats = await getFinancialStats(2026);
    expect(stats.sessions[0].coutSousTraitanceHt).toBe(0);
    expect(stats.externalSessionsCount).toBe(1);
  });

  it("margePct null quand le CA est 0 (pas de division par zéro)", async () => {
    prismaMock.session.findMany.mockResolvedValue([
      fakeSession({ trainees: [{ montantHT: null }, { montantHT: 0 }] }),
    ]);

    const stats = await getFinancialStats(2026);

    expect(stats.sessions[0].caHt).toBe(0);
    expect(stats.sessions[0].margePct).toBeNull();
    expect(stats.margeMoyennePct).toBeNull();
  });

  it("session sans formateur assigné → pas externe, coût 0", async () => {
    prismaMock.session.findMany.mockResolvedValue([
      fakeSession({ trainer: null, trainerFeeAmount: 300 }),
    ]);

    const stats = await getFinancialStats(2026);
    const row = stats.sessions[0];
    expect(row.trainerNomComplet).toBeNull();
    expect(row.trainerIsExternal).toBe(false);
    expect(row.coutSousTraitanceHt).toBe(0);
  });

  it("agrège correctement les totaux sur plusieurs sessions", async () => {
    prismaMock.session.findMany.mockResolvedValue([
      // interne : CA 1500, coût 0
      fakeSession(),
      // externe : CA 2000, coût 800
      fakeSession({
        id: "s2",
        trainer: { prenom: "Lia", nom: "Martin", isExternal: true },
        trainerFeeAmount: 800,
        trainees: [{ montantHT: 2000 }],
      }),
    ]);

    const stats = await getFinancialStats(2026);

    expect(stats.sessionsCount).toBe(2);
    expect(stats.externalSessionsCount).toBe(1);
    expect(stats.totalCaHt).toBe(3500);
    expect(stats.totalCoutSousTraitanceHt).toBe(800);
    expect(stats.totalMargeHt).toBe(2700);
    // 2700/3500 = 77.14% → arrondi à 1 décimale
    expect(stats.margeMoyennePct).toBe(77.1);
  });

  it("retourne un overview vide quand aucune session", async () => {
    prismaMock.session.findMany.mockResolvedValue([]);

    const stats = await getFinancialStats(2026);

    expect(stats.sessionsCount).toBe(0);
    expect(stats.totalCaHt).toBe(0);
    expect(stats.margeMoyennePct).toBeNull();
  });
});

describe("getYearsWithFinishedSessions", () => {
  it("retourne les années distinctes triées décroissantes", async () => {
    prismaMock.session.findMany.mockResolvedValue([
      { dateFin: new Date("2025-06-01") },
      { dateFin: new Date("2026-02-01") },
      { dateFin: new Date("2025-11-15") },
    ]);

    expect(await getYearsWithFinishedSessions()).toEqual([2026, 2025]);
  });
});
