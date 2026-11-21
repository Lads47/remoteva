import { describe, it, expect, beforeAll } from "vitest";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

// Gating de bout en bout : le vrai proxy, un vrai JWT, la route /admin/mark
// (page de téléchargement d'EVA Mark).
const SECRET = "secret-de-test";

async function request(path: string, payload?: Record<string, unknown>) {
  const headers = new Headers();
  if (payload) {
    const token = await new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode(SECRET));
    headers.set("cookie", `remoteva_session=${token}`);
  }
  return proxy(new NextRequest(new URL(path, "https://evaremote.com"), { headers }));
}

describe("gating de l'univers EVA Mark", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = SECRET;
  });

  const user = (universes: string[], isSuperAdmin = false) => ({ userId: "u", status: "validated", isSuperAdmin, universes });

  it("sans session → login", async () => {
    const r = await request("/admin/mark");
    expect(r.headers.get("location")).toBe("https://evaremote.com/admin/login");
  });
  it("sans le droit mark → retour au hub", async () => {
    const r = await request("/admin/mark", user(["stat"]));
    expect(r.headers.get("location")).toBe("https://evaremote.com/admin");
  });
  it("avec le droit mark, ou super-admin → passe", async () => {
    expect((await request("/admin/mark", user(["mark"]))).headers.get("location")).toBeNull();
    expect((await request("/admin/mark", user([], true))).headers.get("location")).toBeNull();
  });
});
