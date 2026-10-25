import { describe, it, expect } from "vitest";
import { markerKind, previousVisitStarts, ONLINE_MS } from "@/lib/stat/live";

const now = new Date("2026-10-25T10:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("couleur des marqueurs", () => {
  it("orange si vu il y a moins de 2 min, même pour un nouveau", () => {
    expect(markerKind({ lastSeenAt: ago(30_000), visitNumber: 1 }, now)).toBe("en-ligne");
    expect(markerKind({ lastSeenAt: ago(ONLINE_MS - 1), visitNumber: 4 }, now)).toBe("en-ligne");
  });
  it("sinon bleu pour un nouveau, vert pour un récurrent", () => {
    expect(markerKind({ lastSeenAt: ago(ONLINE_MS), visitNumber: 1 }, now)).toBe("nouveau");
    expect(markerKind({ lastSeenAt: ago(3_600_000), visitNumber: 2 }, now)).toBe("recurrent");
  });
});

describe("visite précédente", () => {
  it("prend la plus récente des visites antérieures du même visiteur, jamais celle d'un autre", () => {
    const history = [
      { visitorId: "a", startedAt: new Date("2026-10-01T08:00:00Z") },
      { visitorId: "a", startedAt: new Date("2026-10-20T08:00:00Z") },
      { visitorId: "a", startedAt: new Date("2026-10-25T09:00:00Z") },
      { visitorId: "b", startedAt: new Date("2026-10-24T08:00:00Z") },
    ];
    const res = previousVisitStarts(
      [
        { id: "v3", visitorId: "a", startedAt: new Date("2026-10-25T09:00:00Z") },
        { id: "v1", visitorId: "a", startedAt: new Date("2026-10-01T08:00:00Z") },
        { id: "vc", visitorId: "c", startedAt: new Date("2026-10-25T09:00:00Z") },
      ],
      history
    );
    expect(res.get("v3")?.toISOString()).toBe("2026-10-20T08:00:00.000Z");
    expect(res.get("v1")).toBeNull();
    expect(res.get("vc")).toBeNull();
  });
});
