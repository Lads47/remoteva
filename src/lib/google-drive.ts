// Client Google Drive minimal — auth via Service Account (JWT signé) + REST API.
// Pas de dépendance npm google : on signe le JWT à la main avec node:crypto
// puis on swap pour un access_token via OAuth2.
//
// Variables d'env requises :
//   GOOGLE_SERVICE_ACCOUNT_KEY_B64  → contenu du JSON credentials en base64
//
// Le Service Account doit avoir été ajouté comme membre du Shared Drive cible
// (rôle "Gestionnaire de contenu" minimum).

import { createSign } from "crypto";

const SCOPES = "https://www.googleapis.com/auth/drive";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;
let cachedKey: ServiceAccountKey | null = null;

/**
 * Indique si Drive est configuré (clé présente). Permet aux appelants de
 * skip silencieusement si la conf n'est pas faite (best-effort).
 */
export function isDriveConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64);
}

function loadKey(): ServiceAccountKey {
  if (cachedKey) return cachedKey;
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_B64;
  if (!b64) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_B64 manquant dans .env");
  const decoded = Buffer.from(b64, "base64").toString("utf8");
  const parsed = JSON.parse(decoded) as ServiceAccountKey;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("Clé Service Account invalide : client_email ou private_key manquant");
  }
  cachedKey = parsed;
  return parsed;
}

function base64url(input: Buffer | string): string {
  const b = typeof input === "string" ? Buffer.from(input) : input;
  return b.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 30) {
    return cachedToken.value;
  }
  const key = loadKey();

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: key.client_email,
    scope: SCOPES,
    aud: key.token_uri || OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = base64url(signer.sign(key.private_key));
  const assertion = `${unsigned}.${signature}`;

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google OAuth échoué (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: now + data.expires_in };
  return data.access_token;
}

interface DriveFile {
  id: string;
  name: string;
  webViewLink?: string;
  mimeType?: string;
}

interface DriveListResponse {
  files: DriveFile[];
}

const FOLDER_MIME = "application/vnd.google-apps.folder";

/**
 * Cherche un dossier portant le nom `name` dans `parentId`.
 * Si plusieurs portent le même nom, renvoie le premier (par ordre Drive).
 * `null` si rien trouvé. Supporte les Shared Drives.
 */
export async function findFolder(parentId: string, name: string): Promise<DriveFile | null> {
  const token = await getAccessToken();
  // Échappe les apostrophes pour la requête Drive
  const safeName = name.replace(/'/g, "\\'");
  const q = `'${parentId}' in parents and name = '${safeName}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const url = new URL(`${DRIVE_API}/files`);
  url.searchParams.set("q", q);
  url.searchParams.set("fields", "files(id,name,webViewLink,mimeType)");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  url.searchParams.set("corpora", "allDrives");
  url.searchParams.set("pageSize", "10");

  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Drive findFolder failed (HTTP ${res.status}): ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as DriveListResponse;
  return data.files[0] ?? null;
}

/**
 * Crée un dossier `name` dans `parentId` et renvoie le DriveFile.
 */
export async function createFolder(parentId: string, name: string): Promise<DriveFile> {
  const token = await getAccessToken();
  const res = await fetch(`${DRIVE_API}/files?supportsAllDrives=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Drive createFolder failed (HTTP ${res.status}): ${t.slice(0, 300)}`);
  }
  return (await res.json()) as DriveFile;
}

/**
 * Trouve ou crée un sous-dossier portant `name` dans `parentId`.
 */
export async function findOrCreateFolder(parentId: string, name: string): Promise<DriveFile> {
  const existing = await findFolder(parentId, name);
  if (existing) return existing;
  return createFolder(parentId, name);
}

/**
 * Upload un fichier dans le dossier Drive `parentId` via l'API multipart.
 * Retourne le DriveFile avec son id et son webViewLink.
 */
export async function uploadFile(input: {
  parentId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<DriveFile> {
  const token = await getAccessToken();
  const boundary = `----eva-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const metadata = {
    name: input.filename,
    parents: [input.parentId],
    mimeType: input.mimeType,
  };

  const preamble = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n--${boundary}\r\n` +
      `Content-Type: ${input.mimeType}\r\n\r\n`,
    "utf8"
  );
  const closing = Buffer.from(`\r\n--${boundary}--`, "utf8");
  const body = Buffer.concat([preamble, input.buffer, closing]);

  const url = new URL(`${DRIVE_UPLOAD}/files`);
  url.searchParams.set("uploadType", "multipart");
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("fields", "id,name,webViewLink,mimeType");

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body: body as unknown as BodyInit,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Drive uploadFile failed (HTTP ${res.status}): ${t.slice(0, 300)}`);
  }
  return (await res.json()) as DriveFile;
}

/**
 * Supprime (déplace dans la corbeille) un fichier Drive.
 * Best-effort : ne throw pas si le fichier est déjà introuvable.
 */
export async function trashFile(fileId: string): Promise<void> {
  if (!isDriveConfigured()) return;
  try {
    const token = await getAccessToken();
    await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trashed: true }),
    });
  } catch (err) {
    console.warn(`[google-drive] trashFile ${fileId} a échoué:`, err);
  }
}
