import { describe, it, expect, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

// Gating de bout en bout : le vrai proxy, un vrai JWT, la route /admin/stat.
const SECRET = "secret-de-test";

async function request(path: string, payload?: Record<string, unknown>) {
  const headers = new Headers();
  if (payload) {
    const token = await new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode(SECRET));
    headers.set("cookie", `remoteva_session=${token}`);
  }
  return proxy(new NextRequest(new URL(path, "https://evaremote.com"), { headers }));
}

describe("gating de l'univers EVA Stat", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
    delete process.env.CRON_SECRET;
  });

  const user = (universes: string[], isSuperAdmin = false) => ({ userId: "u", status: "validated", isSuperAdmin, universes });

  it("sans session → login", async () => {
    const r = await request("/admin/stat");
    expect(r.headers.get("location")).toBe("https://evaremote.com/admin/login");
  });
  it("sans le droit stat → retour au hub", async () => {
    const r = await request("/admin/stat?site=lads", user(["master"]));
    expect(r.headers.get("location")).toBe("https://evaremote.com/admin");
  });
  it("avec le droit stat, ou super-admin → passe", async () => {
    expect((await request("/admin/stat", user(["stat"]))).headers.get("location")).toBeNull();
    expect((await request("/admin/stat", user([], true))).headers.get("location")).toBeNull();
  });
  it("le point de collecte public n'est pas protégé", async () => {
    expect((await request("/api/public/e")).headers.get("location")).toBeNull();
  });
});
