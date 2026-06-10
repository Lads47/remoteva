import { describe, expect, it } from "vitest";
import { computeObjectifs } from "../pedagogy";

describe("computeObjectifs", () => {
  describe("override manuel", () => {
    it("prime sur le calcul quand il est valide", () => {
      expect(
        computeObjectifs({ override: "non_atteints", expectedCount: 2, notes: ["acquis", "acquis"] })
      ).toBe("non_atteints");
      expect(
        computeObjectifs({ override: "atteints", expectedCount: 2, notes: [] })
      ).toBe("atteints");
      expect(
        computeObjectifs({ override: "partiellement_atteints", expectedCount: 0, notes: [] })
      ).toBe("partiellement_atteints");
    });

    it("est ignoré s'il est vide, null, undefined ou invalide", () => {
      const base = { expectedCount: 2, notes: ["acquis", "acquis"] };
      expect(computeObjectifs({ ...base, override: "" })).toBe("atteints");
      expect(computeObjectifs({ ...base, override: null })).toBe("atteints");
      expect(computeObjectifs({ ...base, override: undefined })).toBe("atteints");
      expect(computeObjectifs({ ...base, override: "n'importe quoi" })).toBe("atteints");
    });
  });

  describe("cas non évaluables", () => {
    it("retourne '' si aucun exercice attendu", () => {
      expect(computeObjectifs({ expectedCount: 0, notes: [] })).toBe("");
    });

    it("retourne '' si aucune note saisie", () => {
      expect(computeObjectifs({ expectedCount: 3, notes: [] })).toBe("");
    });
  });

  describe("calcul pondéré", () => {
    it("tous acquis → atteints", () => {
      expect(
        computeObjectifs({ expectedCount: 3, notes: ["acquis", "acquis", "acquis"] })
      ).toBe("atteints");
    });

    it("un seul exercice acquis → atteints", () => {
      expect(computeObjectifs({ expectedCount: 1, notes: ["acquis"] })).toBe("atteints");
    });

    it("4 acquis + 1 en_cours sur 5 → partiellement (ratio 0.9 mais pas complet)", () => {
      expect(
        computeObjectifs({
          expectedCount: 5,
          notes: ["acquis", "acquis", "acquis", "acquis", "en_cours"],
        })
      ).toBe("partiellement_atteints");
    });

    it("1 acquis + 1 non_acquis sur 2 → partiellement (ratio exactement 0.5)", () => {
      expect(
        computeObjectifs({ expectedCount: 2, notes: ["acquis", "non_acquis"] })
      ).toBe("partiellement_atteints");
    });

    it("1 en_cours sur 2 attendus → non_atteints (ratio 0.25)", () => {
      expect(computeObjectifs({ expectedCount: 2, notes: ["en_cours"] })).toBe("non_atteints");
    });

    it("2 acquis sur 3 attendus, 1 sans note → partiellement (ratio 0.67, pas complet)", () => {
      expect(
        computeObjectifs({ expectedCount: 3, notes: ["acquis", "acquis"] })
      ).toBe("partiellement_atteints");
    });

    it("tous non_acquis → non_atteints", () => {
      expect(
        computeObjectifs({ expectedCount: 2, notes: ["non_acquis", "non_acquis"] })
      ).toBe("non_atteints");
    });

    it("les notes inconnues comptent 0 point mais comptent comme notées", () => {
      // 1 acquis + 1 note invalide sur 2 → ratio 0.5 → partiellement
      expect(
        computeObjectifs({ expectedCount: 2, notes: ["acquis", "exotique"] })
      ).toBe("partiellement_atteints");
    });
  });
});
