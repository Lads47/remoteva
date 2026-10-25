import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Jetons des réseaux chiffrés en base (AES-256-GCM). Clé : SOCIAL_TOKEN_KEY, propre
// à cette fonction (changer JWT_SECRET ne doit pas casser les comptes reliés).
// Sans clé, on refuse : un jeton ne doit jamais finir en clair dans la base.

function key(secret = process.env.SOCIAL_TOKEN_KEY): Buffer {
  if (!secret || secret.length < 16) throw new Error("SOCIAL_TOKEN_KEY absente ou trop courte");
  return createHash("sha256").update(secret).digest();
}

export function encryptToken(plain: string, secret?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function decryptToken(enc: string, secret?: string): string {
  const [version, iv, tag, data] = enc.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("jeton chiffré illisible");
  const decipher = createDecipheriv("aes-256-gcm", key(secret), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
