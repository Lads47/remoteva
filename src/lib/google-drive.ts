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

// Scopes nécessaires :
//   drive        → opérations fichiers/dossiers (upload, copie, trash, listing)
//   documents    → batchUpdate sur Google Docs (substitution variables pour
//                  les templates convention/contrat/convocation).
//   spreadsheets → lecture/écriture de cellules dans Google Sheets
//                  (export du bilan Qualiopi annuel).
const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets",
].join(" ");
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

export async function getAccessToken(): Promise<string> {
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
 * Cherche un fichier (non-dossier) portant `name` dans `parentId`.
 * Renvoie `null` si rien trouvé.
 */
export async function findFile(parentId: string, name: string): Promise<DriveFile | null> {
  const token = await getAccessToken();
  const safeName = name.replace(/'/g, "\\'");
  const q = `'${parentId}' in parents and name = '${safeName}' and mimeType != '${FOLDER_MIME}' and trashed = false`;
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
    throw new Error(`Drive findFile failed (HTTP ${res.status}): ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as DriveListResponse;
  return data.files[0] ?? null;
}

/**
 * Liste les fichiers (non-dossiers) d'un dossier Drive, non corbeille.
 * Paginé en interne — renvoie tout (à n'utiliser que sur des dossiers de
 * taille raisonnable, ex. dossier de backups avec rotation).
 */
export async function listFilesInFolder(parentId: string): Promise<DriveFile[]> {
  const token = await getAccessToken();
  const q = `'${parentId}' in parents and mimeType != '${FOLDER_MIME}' and trashed = false`;
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${DRIVE_API}/files`);
    url.searchParams.set("q", q);
    url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType)");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    url.searchParams.set("corpora", "allDrives");
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Drive listFilesInFolder failed (HTTP ${res.status}): ${t.slice(0, 300)}`);
    }
    const data = (await res.json()) as DriveListResponse & { nextPageToken?: string };
    files.push(...data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
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
 * Copie un fichier Drive existant (typiquement un template Google Doc) vers
 * un dossier cible, avec un nouveau nom. Renvoie l'id et le webViewLink de
 * la copie.
 */
export async function copyDriveFile(input: {
  sourceFileId: string;
  parentFolderId: string;
  newName: string;
}): Promise<DriveFile> {
  const token = await getAccessToken();
  const res = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(input.sourceFileId)}/copy?supportsAllDrives=true&fields=id,name,webViewLink,mimeType`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: input.newName,
        parents: [input.parentFolderId],
      }),
    }
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Drive copyFile failed (HTTP ${res.status}): ${t.slice(0, 300)}`);
  }
  return (await res.json()) as DriveFile;
}

/**
 * Télécharge le contenu brut d'un fichier Drive (PDF natif, image, etc.).
 * Pour un Google Doc, utiliser exportDriveDocAsPdf à la place.
 */
export async function downloadDriveFile(fileId: string): Promise<{ buffer: Buffer; mimeType: string; name: string }> {
  const token = await getAccessToken();
  // 1. Récupère les métadonnées (nom + mimeType)
  const metaRes = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=name,mimeType&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!metaRes.ok) {
    throw new Error(`Drive get metadata failed (HTTP ${metaRes.status}): ${(await metaRes.text()).slice(0, 200)}`);
  }
  const meta = (await metaRes.json()) as { name: string; mimeType: string };

  // 2. Télécharge le contenu via alt=media
  const dlRes = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!dlRes.ok) {
    throw new Error(`Drive download failed (HTTP ${dlRes.status}): ${(await dlRes.text()).slice(0, 200)}`);
  }
  const arrayBuffer = await dlRes.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), mimeType: meta.mimeType, name: meta.name };
}

/**
 * Récupère un fichier Drive sous forme de PDF, peu importe son format natif :
 *   - application/pdf       → download direct (alt=media)
 *   - Google Doc/Sheet/Slide → export en PDF
 *   - autre                  → erreur explicite
 *
 * Utilisé pour les pièces jointes mails (CGV, RI...) où on veut un PDF
 * indépendamment de la façon dont le user a stocké le doc dans Drive.
 */
export async function getFileAsPdf(fileId: string): Promise<{ buffer: Buffer; name: string }> {
  const token = await getAccessToken();
  const metaRes = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=name,mimeType&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!metaRes.ok) {
    throw new Error(`Drive get metadata failed (HTTP ${metaRes.status}): ${(await metaRes.text()).slice(0, 200)}`);
  }
  const meta = (await metaRes.json()) as { name: string; mimeType: string };

  const baseName = meta.name.endsWith(".pdf") ? meta.name : `${meta.name}.pdf`;

  if (meta.mimeType === "application/pdf") {
    const dlRes = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!dlRes.ok) {
      throw new Error(`Drive download failed (HTTP ${dlRes.status}): ${(await dlRes.text()).slice(0, 200)}`);
    }
    const arrayBuffer = await dlRes.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), name: baseName };
  }

  const exportableTypes = new Set([
    "application/vnd.google-apps.document",
    "application/vnd.google-apps.spreadsheet",
    "application/vnd.google-apps.presentation",
    "application/vnd.google-apps.drawing",
  ]);
  if (exportableTypes.has(meta.mimeType)) {
    const exportRes = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?mimeType=application/pdf`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!exportRes.ok) {
      throw new Error(`Drive export PDF failed (HTTP ${exportRes.status}): ${(await exportRes.text()).slice(0, 200)}`);
    }
    const arrayBuffer = await exportRes.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), name: baseName };
  }

  // Cas Microsoft Word (.docx, .doc) ou OpenDocument (.odt) :
  // Drive ne sait pas les exporter directement en PDF. Solution :
  //   1. Télécharger le fichier
  //   2. Le re-uploader avec mimeType cible = Google Doc (Drive convertit)
  //   3. Exporter le Google Doc temporaire en PDF
  //   4. Supprimer le doc temporaire
  const convertibleToGoogleDoc = new Set([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/msword",                                                       // .doc
    "application/vnd.oasis.opendocument.text",                                  // .odt
    "text/plain",
    "text/html",
    "text/rtf",
    "application/rtf",
  ]);
  if (convertibleToGoogleDoc.has(meta.mimeType)) {
    // 1. Télécharge le contenu original
    const dlRes = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!dlRes.ok) {
      throw new Error(`Drive download .docx failed (HTTP ${dlRes.status})`);
    }
    const srcBuffer = Buffer.from(await dlRes.arrayBuffer());

    // 2. Récupère le parent pour y mettre le fichier temporaire (sinon Drive
    //    le place dans "Mon Drive" du SA, sans visibilité).
    const parentsRes = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=parents&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const parentsMeta = (await parentsRes.json()) as { parents?: string[] };
    const parent = parentsMeta.parents?.[0];

    // 3. Upload comme Google Doc (le mimeType cible déclenche la conversion)
    const boundary = `----eva-conv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const tmpMetadata: Record<string, unknown> = {
      name: `[tmp-conversion] ${meta.name}`,
      mimeType: "application/vnd.google-apps.document",
    };
    if (parent) tmpMetadata.parents = [parent];

    const preamble = Buffer.from(
      `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify(tmpMetadata) +
        `\r\n--${boundary}\r\n` +
        `Content-Type: ${meta.mimeType}\r\n\r\n`,
      "utf8"
    );
    const closing = Buffer.from(`\r\n--${boundary}--`, "utf8");
    const body = Buffer.concat([preamble, srcBuffer, closing]);

    const uploadUrl = new URL(`${DRIVE_UPLOAD}/files`);
    uploadUrl.searchParams.set("uploadType", "multipart");
    uploadUrl.searchParams.set("supportsAllDrives", "true");
    uploadUrl.searchParams.set("fields", "id");

    const upRes = await fetch(uploadUrl.toString(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body: body as unknown as BodyInit,
    });
    if (!upRes.ok) {
      throw new Error(`Drive upload conversion failed (HTTP ${upRes.status}): ${(await upRes.text()).slice(0, 200)}`);
    }
    const tmpFile = (await upRes.json()) as { id: string };

    try {
      // 4. Exporte le Google Doc temporaire en PDF
      const exportRes = await fetch(
        `${DRIVE_API}/files/${encodeURIComponent(tmpFile.id)}/export?mimeType=application/pdf`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!exportRes.ok) {
        throw new Error(`Drive export converted PDF failed (HTTP ${exportRes.status})`);
      }
      const pdfArray = await exportRes.arrayBuffer();
      return { buffer: Buffer.from(pdfArray), name: baseName };
    } finally {
      // 5. Nettoyage : trash le doc temporaire dans tous les cas
      await trashFile(tmpFile.id);
    }
  }

  throw new Error(`Type non supporté pour conversion PDF : ${meta.mimeType}`);
}

/**
 * Exporte un Google Doc en PDF via l'API d'export Drive.
 * Pour les types natifs Google (Doc, Sheet, Slides) seulement.
 * Garantit que le nom renvoyé se termine par ".pdf" — sinon le client mail
 * du destinataire ne reconnaît pas le format de la pièce jointe (la PJ
 * arrive sans extension et est considérée comme un binaire opaque).
 */
export async function exportDriveDocAsPdf(fileId: string): Promise<{ buffer: Buffer; name: string }> {
  const token = await getAccessToken();
  const metaRes = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=name&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!metaRes.ok) {
    throw new Error(`Drive get metadata failed (HTTP ${metaRes.status}): ${(await metaRes.text()).slice(0, 200)}`);
  }
  const meta = (await metaRes.json()) as { name: string };

  const exportRes = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?mimeType=application/pdf`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!exportRes.ok) {
    throw new Error(`Drive export PDF failed (HTTP ${exportRes.status}): ${(await exportRes.text()).slice(0, 200)}`);
  }
  const arrayBuffer = await exportRes.arrayBuffer();
  const safeName = meta.name.toLowerCase().endsWith(".pdf") ? meta.name : `${meta.name}.pdf`;
  return { buffer: Buffer.from(arrayBuffer), name: safeName };
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
