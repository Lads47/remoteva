// Client fetch unifié pour les appels /api/* côté navigateur.
//
// Remplace le triptyque répété partout :
//   const res = await fetch(url, {...});
//   const data = await res.json();
//   if (!res.ok) { setError(data.error || "Erreur"); return; }
//
// par :
//   const data = await apiFetch<Shape>(url, { method: "POST", body: {...} });
//
// Contrat :
//   - body objet → JSON.stringify + Content-Type automatique ; FormData → tel quel
//   - réponse non-ok → throw ApiError (message = data.error du serveur si présent)
//   - panne réseau / réponse non-JSON → throw ApiError avec message français générique
//   - abort (AbortController) → l'erreur d'abort est relancée telle quelle ;
//     utiliser isAbortError(err) dans le catch pour l'ignorer proprement

export class ApiError extends Error {
  /** Code HTTP, ou null si la requête n'a pas abouti (panne réseau). */
  readonly status: number | null;
  /** Corps JSON de la réponse d'erreur, si exploitable. */
  readonly data: unknown;

  constructor(message: string, status: number | null = null, data: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/** Message affichable pour un catch d'apiFetch (fallback si erreur inattendue). */
export function apiErrorMessage(err: unknown, fallback = "Erreur"): string {
  if (err instanceof ApiError) return err.message;
  return fallback;
}

export interface ApiFetchOptions {
  method?: string;
  /** Objet sérialisé en JSON, ou FormData passé tel quel. */
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export async function apiFetch<T = unknown>(url: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = "GET", body, signal, headers = {} } = options;

  const init: RequestInit = { method, signal, headers };
  if (body !== undefined) {
    if (body instanceof FormData) {
      init.body = body; // le navigateur pose le Content-Type multipart + boundary
    } else {
      init.body = JSON.stringify(body);
      init.headers = { "Content-Type": "application/json", ...headers };
    }
  }

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (isAbortError(err)) throw err;
    throw new ApiError("Erreur de connexion au serveur");
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Réponse vide (204) ou non-JSON (page d'erreur proxy) → data reste null
  }

  if (!res.ok) {
    const serverError =
      typeof data === "object" && data !== null && "error" in data
        ? (data as { error?: unknown }).error
        : null;
    const message =
      typeof serverError === "string" && serverError.length > 0
        ? serverError
        : `Erreur serveur (${res.status})`;
    throw new ApiError(message, res.status, data);
  }

  return data as T;
}
