import { describe, it, expect } from "vitest";
import { config } from "@/proxy";

// Le proxy ne protège que les routes listées dans son `matcher`. Oublier d'y
// ajouter la route d'un nouvel univers = univers NON protégé (accessible sans
// le bon droit). Ce test garde la couverture.

describe("proxy matcher", () => {
  const matcher = config.matcher as string[];

  it("couvre chaque univers admin ayant des pages", () => {
    for (const u of ["lien", "newsletter", "flow", "formations", "master", "pilot"]) {
      expect(matcher).toContain(`/admin/${u}/:path*`);
    }
  });

  it("couvre le hub et les routes API/compte protégées", () => {
    expect(matcher).toContain("/admin");
    expect(matcher).toContain("/api/admin/:path*");
    expect(matcher).toContain("/api/account/:path*");
  });
});
