// Client n8n pour l'envoi d'emails depuis EVA Flow.
// Tous les envois passent par le workflow "evaremote" sur n8n.

const N8N_BASE_URL = process.env.N8N_BASE_URL || "https://n8n.srv950180.hstgr.cloud/webhook";

interface N8nResponse {
  success?: boolean;
  message_id?: string;
  thread_id?: string;
  error?: string;
}

/**
 * POST helper vers un webhook n8n.
 */
async function postToN8n(endpoint: string, payload: Record<string, unknown>): Promise<N8nResponse> {
  try {
    const res = await fetch(`${N8N_BASE_URL}/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as N8nResponse;
    return data;
  } catch (err) {
    console.error(`n8n webhook error (${endpoint}):`, err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Envoie un email de bienvenue avec magic link à un nouveau réalisateur.
 */
export async function sendMagicLinkEmail(params: {
  to: string;
  directorName: string;
  magicLink: string;
}): Promise<N8nResponse> {
  return postToN8n("eva-flow-magic-link", params);
}

/**
 * Envoie une feuille de route au réalisateur validé sur un événement.
 */
export async function sendFeuilleDeRouteEmail(params: {
  to: string;
  directorName: string;
  eventId: string;
  eventTitle: string;
  eventDate: Date | string;
  location: string;
  room: string;
  regie?: string | null;
  recordingLocalPath?: string | null;
  notes?: string;
  conferences: Array<{
    order: number;
    title: string;
    speaker: string;
    scheduledStart?: Date | string | null;
    scheduledEnd?: Date | string | null;
  }>;
}): Promise<N8nResponse> {
  const payload = {
    ...params,
    eventDate: params.eventDate instanceof Date ? params.eventDate.toISOString() : params.eventDate,
    conferences: params.conferences.map((c) => ({
      ...c,
      scheduledStart: c.scheduledStart instanceof Date ? c.scheduledStart.toISOString() : c.scheduledStart,
      scheduledEnd: c.scheduledEnd instanceof Date ? c.scheduledEnd.toISOString() : c.scheduledEnd,
    })),
  };
  return postToN8n("eva-flow-feuille-de-route", payload);
}

/**
 * Construit l'URL /presta avec le token magique d'un réalisateur.
 */
export function buildMagicLink(token: string, baseUrl?: string): string {
  const base = baseUrl || process.env.PUBLIC_BASE_URL || "https://evaremote.com";
  return `${base}/presta?token=${encodeURIComponent(token)}`;
}
