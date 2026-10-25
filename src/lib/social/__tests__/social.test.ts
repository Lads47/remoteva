import { describe, it, expect } from "vitest";
import { decryptToken, encryptToken } from "@/lib/social/crypto";
import { ilYa, toColumns } from "@/lib/social/feed";
import { shouldRefresh, toMedia } from "@/lib/social/instagram";
import { isSafeMediaFile, safeName } from "@/lib/social/media";

const KEY = "cle-de-test-suffisamment-longue";

describe("chiffrement des jetons", () => {
  it("aller-retour, et un chiffré différent à chaque fois", () => {
    const a = encryptToken("IGAAjeton", KEY);
    const b = encryptToken("IGAAjeton", KEY);
    expect(a).not.toBe(b);
    expect(a).not.toContain("IGAAjeton");
    expect(decryptToken(a, KEY)).toBe("IGAAjeton");
  });
  it("refuse une mauvaise clé, un chiffré altéré, et l'absence de clé", () => {
    const enc = encryptToken("IGAAjeton", KEY);
    expect(() => decryptToken(enc, "une-autre-cle-tout-aussi-longue")).toThrow();
    const [v, iv, tag, data] = enc.split(".");
    const altere = [v, iv, tag, Buffer.from("x" + Buffer.from(data, "base64").toString("latin1"), "latin1").toString("base64")].join(".");
    expect(() => decryptToken(altere, KEY)).toThrow();
    expect(() => encryptToken("x", "")).toThrow(/SOCIAL_TOKEN_KEY/);
  });
});

describe("publications Instagram", () => {
  it("une vidéo affiche sa vignette, une image son média", () => {
    const base = { id: "1", permalink: "https://instagram.com/p/1", timestamp: "2026-10-25T08:00:00+0000" };
    expect(toMedia({ ...base, media_type: "VIDEO", media_url: "v.mp4", thumbnail_url: "t.jpg" }).imageUrl).toBe("t.jpg");
    expect(toMedia({ ...base, media_type: "IMAGE", media_url: "i.jpg", caption: "  Bonjour  " })).toMatchObject({ imageUrl: "i.jpg", caption: "Bonjour" });
    expect(toMedia({ ...base, media_type: "IMAGE", caption: "   " }).caption).toBeNull();
  });
  it("renouvelle le jeton à moins de 15 jours, ou quand l'échéance est inconnue", () => {
    const now = new Date("2026-10-25T12:00:00Z");
    expect(shouldRefresh(null, now)).toBe(true);
    expect(shouldRefresh(new Date("2026-11-05T12:00:00Z"), now)).toBe(true);
    expect(shouldRefresh(new Date("2026-12-20T12:00:00Z"), now)).toBe(false);
  });
});

describe("fichiers d'images", () => {
  it("noms sûrs uniquement : ni chemin ni remontée de dossier", () => {
    expect(safeName("ig_1789/../x")).toBe("ig_1789____x");
    expect(isSafeMediaFile("ig_123.jpg")).toBe(true);
    expect(isSafeMediaFile("../remoteva.db")).toBe(false);
    expect(isSafeMediaFile("ig_123.jpg/../x")).toBe(false);
    expect(isSafeMediaFile("ig_123.svg")).toBe(false);
  });
});

describe("fil de l'accueil", () => {
  it("répartit de gauche à droite : la plus récente en haut à gauche", () => {
    expect(toColumns([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 4, 7], [2, 5], [3, 6]]);
    expect(toColumns([], 3)).toEqual([[], [], []]);
  });
  it("ancienneté en français", () => {
    const now = new Date("2026-10-25T12:00:00Z");
    expect(ilYa(new Date("2026-10-25T11:59:30Z"), now)).toBe("à l'instant");
    expect(ilYa(new Date("2026-10-25T11:20:00Z"), now)).toBe("il y a 40 min");
    expect(ilYa(new Date("2026-10-25T07:00:00Z"), now)).toBe("il y a 5 h");
    expect(ilYa(new Date("2026-10-24T10:00:00Z"), now)).toBe("hier");
    expect(ilYa(new Date("2026-10-21T12:00:00Z"), now)).toBe("il y a 4 jours");
  });
});
