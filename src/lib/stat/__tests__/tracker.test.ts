import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { TRACKER_JS } from "@/lib/stat/tracker.generated";
import { buildTracker } from "../../../../scripts/stat-tracker-lib.mjs";

describe("fichier généré", () => {
  it("est à jour avec tracker.src.js", async () => {
    expect(TRACKER_JS).toBe(await buildTracker());
  });
  it("pèse moins de 3 Ko", () => {
    expect(Buffer.byteLength(TRACKER_JS)).toBeLessThan(3072);
  });
});

type Sent = Record<string, unknown>;

// Faux navigateur minimal : assez pour faire tourner le script et lire ce qu'il envoie.
function browser(opts: { dnt?: boolean; gpc?: boolean; storage?: Map<string, string>; beacon?: boolean } = {}) {
  const sent: Sent[] = [];
  const fetched: Sent[] = [];
  const listeners: Record<string, (() => void)[]> = {};
  const timers: (() => void)[] = [];
  const storage = (m: Map<string, string>) => ({
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  });
  const local = opts.storage ?? new Map<string, string>();
  const location = { pathname: "/", search: "?utm_source=newsletter&utm_campaign=rentree" };
  const document = {
    currentScript: { src: "https://evaremote.com/e.js", getAttribute: () => "lads" },
    visibilityState: "visible",
    title: "Accueil",
    referrer: "https://www.google.com/",
    addEventListener: (t: string, f: () => void) => (listeners[t] ||= []).push(f),
  };
  const history = {
    pushState(_s: unknown, _t: string, url: string) { location.pathname = url; },
    replaceState(_s: unknown, _t: string, url: string) { location.pathname = url; },
  };
  const navigator = {
    doNotTrack: opts.dnt ? "1" : null,
    globalPrivacyControl: !!opts.gpc,
    language: "fr-FR",
    sendBeacon: opts.beacon === false ? undefined : (_u: string, b: string) => (sent.push(JSON.parse(b)), true),
  };
  const window: Record<string, unknown> = {
    navigator, location, history, document,
    localStorage: storage(local),
    sessionStorage: storage(new Map()),
    addEventListener: (t: string, f: () => void) => (listeners[t] ||= []).push(f),
  };
  const ctx = vm.createContext({
    window, document, navigator, location, history,
    screen: { width: 1440 },
    URL, URLSearchParams, JSON, Math, Date,
    crypto: { randomUUID: () => "0f8e2b4a-1c3d-4e5f-8a9b-" + String(sent.length + fetched.length + Math.random()).replace(/\D/g, "").padEnd(12, "0").slice(0, 12) },
    fetch: (_u: string, init: { body: string }) => (fetched.push(JSON.parse(init.body)), Promise.resolve()),
    setTimeout: (f: () => void) => f(),
    setInterval: (f: () => void) => timers.push(f),
  });
  return {
    run: (prelude = "") => vm.runInContext(prelude + TRACKER_JS, ctx),
    window, document, location, history, sent, fetched, listeners, timers, local,
    fire: (t: string) => (listeners[t] || []).forEach((f) => f()),
  };
}

describe("comportement du script", () => {
  it("envoie une page vue au chargement avec référent et UTM", () => {
    const b = browser();
    b.run();
    expect(b.sent).toHaveLength(1);
    expect(b.sent[0]).toMatchObject({ t: "pageview", s: "lads", u: "/", ti: "Accueil", r: "https://www.google.com/", us: "newsletter", uc: "rentree", w: 1440, l: "fr-FR" });
  });

  it("garde le même visiteur d'un chargement à l'autre", () => {
    const storage = new Map<string, string>();
    const a = browser({ storage }); a.run();
    const b = browser({ storage }); b.run();
    expect(a.sent[0].v).toBe(b.sent[0].v);
  });

  it("ne mesure rien avec Do Not Track ou GPC", () => {
    const a = browser({ dnt: true }); a.run();
    const b = browser({ gpc: true }); b.run();
    expect(a.sent).toHaveLength(0);
    expect(b.sent).toHaveLength(0);
  });

  it("optOut coupe la mesure, optIn la rétablit", () => {
    const b = browser();
    b.run();
    (b.window.evaStat as { optOut: () => void }).optOut();
    b.fire("pagehide");
    expect(b.sent).toHaveLength(1);
    (b.window.evaStat as { optIn: () => void }).optIn();
    b.fire("pagehide");
    expect(b.sent.at(-1)).toMatchObject({ t: "leave" });
  });

  it("suit la navigation d'un site monopage, une seule fois par chemin", () => {
    const b = browser();
    b.run();
    b.history.pushState({}, "", "/tarifs");
    b.history.replaceState({}, "", "/tarifs");
    const types = b.sent.map((m) => `${m.t}:${m.u ?? ""}`);
    expect(types).toEqual(["pageview:/", "heartbeat:", "pageview:/tarifs"]);
    expect(b.sent[2].r).toBeUndefined();
  });

  it("heartbeat seulement onglet visible, leave à la fermeture", () => {
    const b = browser();
    b.run();
    b.timers[0]();
    expect(b.sent.at(-1)).toMatchObject({ t: "heartbeat" });
    b.document.visibilityState = "hidden";
    b.fire("visibilitychange");
    const n = b.sent.length;
    b.timers[0]();
    expect(b.sent).toHaveLength(n);
    b.fire("pagehide");
    expect(b.sent.at(-1)).toMatchObject({ t: "leave" });
  });

  it("dépile les événements appelés avant le chargement", () => {
    const b = browser();
    b.run("window.evaStat=function(){(window.evaStat.q=window.evaStat.q||[]).push(arguments)};window.evaStat('clic_telephone',{page:'contact'});");
    expect(b.sent.at(-1)).toMatchObject({ t: "event", n: "clic_telephone", pr: { page: "contact" } });
  });

  it("se replie sur fetch sans sendBeacon", () => {
    const b = browser({ beacon: false });
    b.run();
    expect(b.fetched[0]).toMatchObject({ t: "pageview" });
  });
});
