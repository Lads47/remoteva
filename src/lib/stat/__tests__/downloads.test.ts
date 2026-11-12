import { describe, it, expect } from "vitest";
import { parseLigne } from "@/lib/stat/downloads";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const ligne = (o: Partial<{ quand: string; methode: string; uri: string; statut: string; octets: string; fin: string; ua: string }> = {}) =>
  [
    o.quand ?? "2026-11-12T08:15:00+00:00",
    o.methode ?? "GET",
    o.uri ?? "/eva-pilot/EvaPilot-Setup-1.0.23.exe",
    o.statut ?? "200",
    o.octets ?? "160785125",
    o.fin ?? "OK",
    o.ua ?? CHROME,
  ].join("\t");

describe("journal des téléchargements EVAPILOT", () => {
  it("compte un installeur reçu jusqu'au bout par un navigateur", () => {
    const t = parseLigne(ligne());
    expect(t).toMatchObject({ file: "EvaPilot-Setup-1.0.23.exe", version: "1.0.23" });
    expect(t?.at.toISOString()).toBe("2026-11-12T08:15:00.000Z");
    expect(t?.id).toHaveLength(32);
  });

  it("ignore un téléchargement interrompu, partiel ou en erreur", () => {
    expect(parseLigne(ligne({ fin: "" }))).toBeNull(); // coupé en route
    expect(parseLigne(ligne({ statut: "206" }))).toBeNull(); // reprise partielle
    expect(parseLigne(ligne({ statut: "404" }))).toBeNull();
    expect(parseLigne(ligne({ methode: "HEAD" }))).toBeNull();
  });

  it("ignore les mises à jour du logiciel (sans navigateur) et les robots", () => {
    expect(parseLigne(ligne({ ua: "-" }))).toBeNull();
    expect(parseLigne(ligne({ ua: "" }))).toBeNull();
    expect(parseLigne(ligne({ ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }))).toBeNull();
    expect(parseLigne(ligne({ ua: "curl/8.4.0" }))).toBeNull();
  });

  it("ignore tout ce qui n'est pas un installeur EVAPILOT", () => {
    expect(parseLigne(ligne({ uri: "/eva-pilot/latest.json" }))).toBeNull();
    expect(parseLigne(ligne({ uri: "/eva-pilot/../EvaPilot-Setup-1.0.23.exe" }))).toBeNull();
    expect(parseLigne(ligne({ uri: "/eva-pilot/autre.exe" }))).toBeNull();
    expect(parseLigne("ligne cassée")).toBeNull();
    expect(parseLigne(ligne({ quand: "pas une date" }))).toBeNull();
  });

  it("même ligne = même empreinte : rejouer ne compte pas deux fois", () => {
    expect(parseLigne(ligne())?.id).toBe(parseLigne(ligne())?.id);
    expect(parseLigne(ligne())?.id).not.toBe(parseLigne(ligne({ quand: "2026-11-12T08:15:01+00:00" }))?.id);
  });
});
