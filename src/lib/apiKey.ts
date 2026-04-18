import prisma from "./db";
import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";

// Format clé : "evak_" + 40 chars hex (= 20 bytes random)
// Hash SHA-256 stocké en DB. Lookup direct par hash indexé.

const API_KEY_PREFIX = "evak_";
const SECRET_LENGTH_BYTES = 20;

export interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revoked: boolean;
  createdAt: Date;
}

/**
 * Génère une nouvelle API key.
 * Renvoie le plaintext UNE SEULE FOIS (à montrer à l'utilisateur).
 */
export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const secret = randomBytes(SECRET_LENGTH_BYTES).toString("hex");
  const plaintext = `${API_KEY_PREFIX}${secret}`;
  const hash = hashApiKey(plaintext);
  const prefix = plaintext.slice(0, 12); // "evak_" + 7 premiers chars

  return { plaintext, hash, prefix };
}

/**
 * Hash SHA-256 d'une API key plaintext.
 */
export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Crée une nouvelle API key en DB et renvoie le plaintext.
 */
export async function createApiKey(name: string, expiresAt?: Date): Promise<{ apiKey: ApiKeyInfo; plaintext: string }> {
  const { plaintext, hash, prefix } = generateApiKey();

  const created = await prisma.apiKey.create({
    data: {
      name,
      keyHash: hash,
      prefix,
      expiresAt: expiresAt ?? null,
    },
  });

  return {
    plaintext,
    apiKey: {
      id: created.id,
      name: created.name,
      prefix: created.prefix,
      lastUsedAt: created.lastUsedAt,
      expiresAt: created.expiresAt,
      revoked: created.revoked,
      createdAt: created.createdAt,
    },
  };
}

/**
 * Vérifie une plaintext API key contre la DB.
 * Renvoie l'ApiKey si valide (non révoquée, non expirée).
 * Met à jour lastUsedAt en best-effort (pas bloquant).
 */
export async function verifyApiKey(plaintext: string): Promise<ApiKeyInfo | null> {
  if (!plaintext || !plaintext.startsWith(API_KEY_PREFIX)) return null;

  const hash = hashApiKey(plaintext);
  const found = await prisma.apiKey.findUnique({ where: { keyHash: hash } });

  if (!found) return null;
  if (found.revoked) return null;
  if (found.expiresAt && found.expiresAt < new Date()) return null;

  // Best-effort lastUsedAt update (on ignore les erreurs)
  prisma.apiKey
    .update({ where: { id: found.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    id: found.id,
    name: found.name,
    prefix: found.prefix,
    lastUsedAt: found.lastUsedAt,
    expiresAt: found.expiresAt,
    revoked: found.revoked,
    createdAt: found.createdAt,
  };
}

/**
 * Révoque une API key (soft delete).
 */
export async function revokeApiKey(id: string): Promise<void> {
  await prisma.apiKey.update({ where: { id }, data: { revoked: true } });
}

/**
 * Liste toutes les API keys (sans le hash).
 */
export async function listApiKeys(): Promise<ApiKeyInfo[]> {
  const keys = await prisma.apiKey.findMany({ orderBy: { createdAt: "desc" } });
  return keys.map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    lastUsedAt: k.lastUsedAt,
    expiresAt: k.expiresAt,
    revoked: k.revoked,
    createdAt: k.createdAt,
  }));
}

/**
 * Middleware-like helper pour les routes /api/flow/*.
 * Renvoie un NextResponse 401 si la clé est invalide, sinon null.
 * À utiliser au début de chaque handler de route publique.
 */
export async function requireApiKey(request: NextRequest): Promise<NextResponse | null> {
  const apiKey = request.headers.get("x-api-key") ?? request.headers.get("X-Api-Key");

  if (!apiKey) {
    return NextResponse.json(
      { error: "Header X-Api-Key manquant" },
      { status: 401 }
    );
  }

  const valid = await verifyApiKey(apiKey);
  if (!valid) {
    return NextResponse.json(
      { error: "API key invalide, expirée ou révoquée" },
      { status: 401 }
    );
  }

  return null;
}
