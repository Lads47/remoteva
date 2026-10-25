import fs from "node:fs";
import path from "node:path";

// Images des publications gardées sur notre serveur (data/social/media) :
// l'accueil ne fait aucun appel au CDN d'Instagram (liens qui expirent, et aucun
// visiteur envoyé chez un tiers).
export const MEDIA_DIR = path.join(process.cwd(), "data", "social", "media");
const MAX_BYTES = 15 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Nom de fichier sûr : uniquement [a-z0-9_-], jamais de chemin.
export function safeName(base: string): string {
  return base.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 80);
}

export function isSafeMediaFile(name: string): boolean {
  return /^[a-z0-9_-]{1,80}\.(jpg|png|webp)$/.test(name);
}

export function contentTypeFor(name: string): string {
  const ext = name.split(".").pop();
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}

// Télécharge une image si elle n'est pas déjà là. Renvoie le nom du fichier, ou null.
export async function cacheImage(url: string | null, base: string): Promise<string | null> {
  if (!url) return null;
  const stem = safeName(base);
  await fs.promises.mkdir(MEDIA_DIR, { recursive: true });
  const existing = (await fs.promises.readdir(MEDIA_DIR)).find((f) => f.startsWith(`${stem}.`));
  if (existing) return existing;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const type = (res.headers.get("content-type") ?? "").split(";")[0];
  if (!res.ok || !TYPES[type]) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_BYTES) return null;
  const name = `${stem}.${TYPES[type]}`;
  const tmp = path.join(MEDIA_DIR, `.${name}.tmp`);
  await fs.promises.writeFile(tmp, buf);
  await fs.promises.rename(tmp, path.join(MEDIA_DIR, name));
  return name;
}

export async function removeImage(name: string | null) {
  if (name && isSafeMediaFile(name)) await fs.promises.rm(path.join(MEDIA_DIR, name), { force: true });
}
