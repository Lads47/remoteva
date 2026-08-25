import { describe, it, expect } from "vitest";
import { EVA_UNIVERSES, isEvaUniverse, universeForPath } from "@/lib/auth";

// Ces fonctions pilotent le GATING de TOUS les univers admin (blast radius max).
// Un univers mal enregistré ici = accès cassé ou ouvert sur tout le portail.
// Ces tests protègent l'ajout de futurs univers contre les régressions.

describe("EVA_UNIVERSES", () => {
  it("contient les univers attendus", () => {
    for (const u of ["lien", "newsletter", "flow", "stream", "formations", "scoring", "master", "pilot", "planning"]) {
      expect(EVA_UNIVERSES).toContain(u);
    }
  });
  it("ne contient pas de doublon", () => {
    expect(new Set(EVA_UNIVERSES).size).toBe(EVA_UNIVERSES.length);
  });
});

describe("isEvaUniverse", () => {
  it("accepte un univers valide", () => {
    expect(isEvaUniverse("master")).toBe(true);
    expect(isEvaUniverse("formations")).toBe(true);
  });
  it("rejette une valeur invalide ou non-string", () => {
    expect(isEvaUniverse("inexistant")).toBe(false);
    expect(isEvaUniverse("")).toBe(false);
    expect(isEvaUniverse(null)).toBe(false);
    expect(isEvaUniverse(42)).toBe(false);
  });
});

describe("universeForPath", () => {
  it("mappe chaque route admin vers son univers", () => {
    expect(universeForPath("/admin/lien")).toBe("lien");
    expect(universeForPath("/admin/newsletter")).toBe("newsletter");
    expect(universeForPath("/admin/flow")).toBe("flow");
    expect(universeForPath("/admin/formations")).toBe("formations");
    expect(universeForPath("/admin/reclamations")).toBe("formations");
    expect(universeForPath("/admin/master")).toBe("master");
    expect(universeForPath("/admin/pilot")).toBe("pilot");
  });

  it("gère les sous-routes imbriquées", () => {
    expect(universeForPath("/admin/master/cdc-juin/correction")).toBe("master");
    expect(universeForPath("/admin/formations/123/prerequis")).toBe("formations");
  });

  it("renvoie null pour les routes transverses (hub, compte, users, pending)", () => {
    expect(universeForPath("/admin")).toBeNull();
    expect(universeForPath("/admin/dashboard")).toBeNull();
    expect(universeForPath("/admin/account")).toBeNull();
    expect(universeForPath("/admin/users")).toBeNull();
    expect(universeForPath("/admin/pending")).toBeNull();
  });

  it("renvoie null pour une route inconnue", () => {
    expect(universeForPath("/admin/inexistant")).toBeNull();
  });

  // INVARIANT : tout univers renvoyé DOIT être un univers déclaré. Détecte un
  // typo dans universeForPath, ou un univers oublié dans EVA_UNIVERSES.
  it("ne renvoie jamais un univers absent de EVA_UNIVERSES", () => {
    const paths = [
      "/admin/lien", "/admin/newsletter", "/admin/flow",
      "/admin/formations", "/admin/reclamations", "/admin/master",
      "/admin/pilot",
    ];
    for (const p of paths) {
      const u = universeForPath(p);
      if (u !== null) expect(isEvaUniverse(u)).toBe(true);
    }
  });
});
