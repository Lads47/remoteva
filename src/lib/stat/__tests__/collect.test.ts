import { describe, it, expect } from "vitest";
import { parsePayload, MAX_BODY_BYTES } from "@/lib/stat/payload";
import { originAllowed, type StatSiteInfo } from "@/lib/stat/sites";
import { clientIp, truncateIp } from "@/lib/stat/ip";
import { parseUa } from "@/lib/stat/ua";
import { cleanReferrer, hashId, parisDay, RateLimiter, retentionCutoff } from "@/lib/stat/util";

const ID = "0f8e2b4a-1c3d-4e5f-8a9b-0c1d2e3f4a5b";
const base = { s: "lads", v: ID, se: ID, p: ID };

describe("validation du payload", () => {
  it("accepte une page vue complète", () => {
    const m = parsePayload(JSON.stringify({ ...base, t: "pageview", u: "/formations", ti: "Formations", r: "https://google.com/", us: "newsletter", w: 1920, l: "fr-FR" }));
    expect(m?.t).toBe("pageview");
  });
  it("accepte heartbeat, leave et event", () => {
    expect(parsePayload(JSON.stringify({ ...base, t: "heartbeat", d: 30 }))?.t).toBe("heartbeat");
    expect(parsePayload(JSON.stringify({ ...base, t: "leave", d: 45 }))?.t).toBe("leave");
    expect(parsePayload(JSON.stringify({ ...base, t: "event", n: "inscription_formation", pr: { formation: "ia" }, u: "/" }))?.t).toBe("event");
  });
  it("refuse un type inconnu, un chemin relatif, un id malformé, du JSON cassé", () => {
    expect(parsePayload(JSON.stringify({ ...base, t: "click", u: "/" }))).toBeNull();
    expect(parsePayload(JSON.stringify({ ...base, t: "pageview", u: "formations" }))).toBeNull();
    expect(parsePayload(JSON.stringify({ ...base, v: "a;drop", t: "pageview", u: "/" }))).toBeNull();
    expect(parsePayload("{pas du json")).toBeNull();
  });
  it("refuse un corps trop gros et une durée hors bornes", () => {
    expect(parsePayload("x".repeat(MAX_BODY_BYTES + 1))).toBeNull();
    expect(parsePayload(JSON.stringify({ ...base, t: "heartbeat", d: -1 }))).toBeNull();
    expect(parsePayload(JSON.stringify({ ...base, t: "heartbeat", d: 999999 }))).toBeNull();
  });
  it("refuse plus de 10 propriétés et un nom d'événement exotique", () => {
    const pr = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, i]));
    expect(parsePayload(JSON.stringify({ ...base, t: "event", n: "x", pr, u: "/" }))).toBeNull();
    expect(parsePayload(JSON.stringify({ ...base, t: "event", n: "<script>", u: "/" }))).toBeNull();
  });
});

describe("contrôle d'origine", () => {
  const site: StatSiteInfo = { id: "s", slug: "lads", name: "LADS", domains: ["lesateliersdustream.fr", "www.lesateliersdustream.fr"] };
  it("accepte les domaines déclarés en https", () => {
    expect(originAllowed(site, "https://lesateliersdustream.fr", false)).toBe(true);
    expect(originAllowed(site, "https://www.lesateliersdustream.fr", false)).toBe(true);
  });
  it("refuse le reste", () => {
    expect(originAllowed(site, null, false)).toBe(false);
    expect(originAllowed(site, "http://lesateliersdustream.fr", false)).toBe(false);
    expect(originAllowed(site, "https://wisio.io", false)).toBe(false);
    expect(originAllowed(site, "https://lesateliersdustream.fr.evil.com", false)).toBe(false);
    expect(originAllowed(site, "https://evil-lesateliersdustream.fr", false)).toBe(false);
    expect(originAllowed(site, "https://lesateliersdustream.fr:8443", false)).toBe(false);
    expect(originAllowed(site, "https://lesateliersdustream.fr/chemin", false)).toBe(false);
  });
  it("localhost seulement hors production", () => {
    expect(originAllowed(site, "http://localhost:5500", true)).toBe(true);
    expect(originAllowed(site, "http://localhost:5500", false)).toBe(false);
  });
});

describe("IP", () => {
  it("tronque IPv4 en /24 et IPv6 en /48", () => {
    expect(truncateIp("86.243.12.207")).toBe("86.243.12.0");
    expect(truncateIp("2a01:cb1d:8c3:5f00:1234:5678:9abc:def0")).toBe("2a01:cb1d:8c3::");
    expect(truncateIp("2001:db8::1")).toBe("2001:db8:0::");
    expect(truncateIp("::ffff:86.243.12.207")).toBe("86.243.12.0");
    expect(truncateIp("pas-une-ip")).toBeNull();
  });
  it("prend X-Real-Ip, sinon la dernière entrée de X-Forwarded-For", () => {
    expect(clientIp(new Headers({ "x-real-ip": "86.243.12.207", "x-forwarded-for": "1.1.1.1" }))).toBe("86.243.12.207");
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 86.243.12.207" }))).toBe("86.243.12.207");
    expect(clientIp(new Headers({ "x-real-ip": "n'importe quoi" }))).toBeNull();
    expect(clientIp(new Headers())).toBeNull();
  });
});

describe("User-Agent et robots", () => {
  it("reconnaît un navigateur de bureau, un mobile et une tablette", () => {
    const desk = parseUa("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36");
    expect(desk).toMatchObject({ os: "Windows", browser: "Chrome", deviceType: "desktop", isBot: false });
    const phone = parseUa("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1");
    expect(phone.deviceType).toBe("mobile");
    const tab = parseUa("Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1");
    expect(tab.deviceType).toBe("tablette");
  });
  it("marque les robots", () => {
    expect(parseUa("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)").isBot).toBe(true);
    expect(parseUa("curl/8.4.0").isBot).toBe(true);
    expect(parseUa(null).isBot).toBe(true);
    expect(parseUa("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0.0.0 Safari/537.36", true).isBot).toBe(true);
  });
});

describe("utilitaires", () => {
  it("hashId dépend du site : même navigateur, ids différents d'un site à l'autre", () => {
    expect(hashId("a", ID)).not.toBe(hashId("b", ID));
    expect(hashId("a", ID)).toBe(hashId("a", ID));
    expect(hashId("a", ID)).not.toContain(ID);
  });
  it("parisDay suit le fuseau de Paris", () => {
    expect(parisDay(new Date("2026-10-24T22:30:00Z"))).toBe("2026-10-25"); // 00:30 heure d'été
    expect(parisDay(new Date("2026-12-31T22:59:00Z"))).toBe("2026-12-31"); // 23:59 heure d'hiver
  });
  it("le référent interne est ignoré, l'externe perd sa query string", () => {
    const domains = ["wisio.io", "www.wisio.io"];
    expect(cleanReferrer("https://www.wisio.io/tarifs", domains)).toBeNull();
    expect(cleanReferrer("https://www.google.com/search?q=wisio", domains)).toEqual({ referrer: "https://www.google.com/search", referrerHost: "google.com" });
    expect(cleanReferrer("pas une url", domains)).toBeNull();
  });
  it("la limite de débit coupe au-delà du maximum et repart après la fenêtre", () => {
    const rl = new RateLimiter(2, 1000);
    expect([rl.allow("ip", 0), rl.allow("ip", 1), rl.allow("ip", 2)]).toEqual([true, true, false]);
    expect(rl.allow("autre", 2)).toBe(true);
    expect(rl.allow("ip", 1001)).toBe(true);
  });
  it("conservation de 13 mois", () => {
    expect(retentionCutoff(new Date("2026-10-25T12:00:00Z")).toISOString().slice(0, 10)).toBe("2025-09-25");
  });
});
