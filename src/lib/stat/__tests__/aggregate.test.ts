import { describe, it, expect } from "vitest";
import { addDays, aggregateDay, daysBetween } from "@/lib/stat/aggregate";

const row = (visitorId: string, visitNumber: number, pageCount: number, durationSec: number, isBot = false) =>
  ({ visitorId, visitNumber, pageCount, durationSec, isBot });

describe("agrégat journalier", () => {
  it("compte visites, visiteurs distincts, nouveaux, rebonds et durée", () => {
    const a = aggregateDay([
      row("a", 1, 1, 10),
      row("a", 2, 3, 120),
      row("b", 4, 2, 50),
      row("c", 1, 1, 0),
    ]);
    expect(a).toEqual({
      visits: 4, pageviews: 7, visitors: 3, newVisitors: 2, bounces: 2,
      totalDurationSec: 180, botVisits: 0, botPageviews: 0,
    });
  });
  it("met les robots à part, sans les mêler aux humains", () => {
    const a = aggregateDay([row("a", 1, 2, 30), row("bot", 1, 5, 0, true), row("bot2", 1, 1, 0, true)]);
    expect(a.visits).toBe(1);
    expect(a.visitors).toBe(1);
    expect(a.bounces).toBe(0);
    expect(a.botVisits).toBe(2);
    expect(a.botPageviews).toBe(6);
  });
  it("jour vide", () => {
    expect(aggregateDay([]).visits).toBe(0);
  });
});

describe("calendrier", () => {
  it("passe les fins de mois et le changement d'heure", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-24", "2026-10-26")).toEqual(["2026-10-24", "2026-10-25", "2026-10-26"]);
  });
});
