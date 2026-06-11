import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiErrorMessage, apiFetch, isAbortError } from "../api-client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("retourne le JSON parsé sur une réponse ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ sessions: [1, 2] }));
    vi.stubGlobal("fetch", fetchMock);

    const data = await apiFetch<{ sessions: number[] }>("/api/admin/sessions");

    expect(data.sessions).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/sessions", expect.objectContaining({ method: "GET" }));
  });

  it("sérialise le body objet en JSON avec Content-Type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/api/admin/sessions", { method: "POST", body: { code: "S1" } });

    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBe('{"code":"S1"}');
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("passe un FormData tel quel sans Content-Type forcé", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const fd = new FormData();
    fd.append("name", "test");

    await apiFetch("/api/upload", { method: "POST", body: fd });

    const init = fetchMock.mock.calls[0][1];
    expect(init.body).toBe(fd);
    expect(init.headers["Content-Type"]).toBeUndefined();
  });

  it("throw ApiError avec le message data.error du serveur sur !ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "Session introuvable" }, 404)));

    const err = await apiFetch("/api/admin/sessions?id=x").catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("Session introuvable");
    expect(err.status).toBe(404);
    expect(err.data).toEqual({ error: "Session introuvable" });
  });

  it("throw ApiError générique si la réponse d'erreur n'a pas de champ error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 })));

    const err = await apiFetch("/api/admin/sessions").catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("Erreur serveur (502)");
    expect(err.status).toBe(502);
  });

  it("throw ApiError 'Erreur de connexion' sur panne réseau", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const err = await apiFetch("/api/admin/sessions").catch((e) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBeNull();
    expect(err.message).toBe("Erreur de connexion au serveur");
  });

  it("relance l'erreur d'abort telle quelle", async () => {
    const abortErr = new DOMException("The operation was aborted.", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortErr));

    const err = await apiFetch("/api/admin/sessions").catch((e) => e);

    expect(err).toBe(abortErr);
    expect(isAbortError(err)).toBe(true);
    expect(err).not.toBeInstanceOf(ApiError);
  });

  it("tolère une réponse ok sans corps JSON (204)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const data = await apiFetch("/api/admin/sessions?id=x");

    expect(data).toBeNull();
  });
});

describe("apiErrorMessage", () => {
  it("retourne le message de l'ApiError, sinon le fallback", () => {
    expect(apiErrorMessage(new ApiError("Quota dépassé", 429))).toBe("Quota dépassé");
    expect(apiErrorMessage(new Error("boom"))).toBe("Erreur");
    expect(apiErrorMessage(undefined, "Erreur d'envoi")).toBe("Erreur d'envoi");
  });
});
