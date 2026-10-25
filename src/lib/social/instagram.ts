// Instagram API avec connexion Instagram (comptes professionnels) — graph.instagram.com.
// Nos propres comptes : accès standard, jeton longue durée (60 jours) généré dans le
// tableau de bord Meta, prolongé de 60 jours par refresh_access_token.

const GRAPH = "https://graph.instagram.com";

export interface InstagramProfile {
  id: string;
  username: string;
  profilePictureUrl: string | null;
}

export interface InstagramMedia {
  id: string;
  caption: string | null;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | string;
  imageUrl: string | null; // image à afficher (vignette pour une vidéo)
  permalink: string;
  timestamp: Date;
}

export class InstagramError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(path, GRAPH);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) throw new InstagramError(body.error?.message ?? `Instagram a répondu ${res.status}`, res.status);
  return body;
}

export async function fetchProfile(token: string): Promise<InstagramProfile> {
  const p = await call<{ user_id?: string; id: string; username: string; profile_picture_url?: string }>("/me", {
    fields: "user_id,username,profile_picture_url",
    access_token: token,
  });
  return { id: p.user_id ?? p.id, username: p.username, profilePictureUrl: p.profile_picture_url ?? null };
}

type RawMedia = {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
};

export function toMedia(m: RawMedia): InstagramMedia {
  return {
    id: m.id,
    caption: m.caption?.trim() || null,
    mediaType: m.media_type,
    imageUrl: m.media_type === "VIDEO" ? m.thumbnail_url ?? null : m.media_url ?? null,
    permalink: m.permalink,
    timestamp: new Date(m.timestamp),
  };
}

export async function fetchMedia(token: string, limit = 20): Promise<InstagramMedia[]> {
  const r = await call<{ data: RawMedia[] }>("/me/media", {
    fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp",
    limit: String(limit),
    access_token: token,
  });
  return (r.data ?? []).map(toMedia);
}

// Prolonge un jeton longue durée de 60 jours (il doit avoir au moins 24 h et être encore valide).
export async function refreshToken(token: string): Promise<{ token: string; expiresAt: Date }> {
  const r = await call<{ access_token: string; expires_in: number }>("/refresh_access_token", {
    grant_type: "ig_refresh_token",
    access_token: token,
  });
  return { token: r.access_token, expiresAt: new Date(Date.now() + r.expires_in * 1000) };
}

// Renouveler quand il reste moins de 15 jours, ou quand on ne connaît pas l'échéance.
export function shouldRefresh(expiresAt: Date | null, now = new Date()): boolean {
  if (!expiresAt) return true;
  return expiresAt.getTime() - now.getTime() < 15 * 86_400_000;
}
