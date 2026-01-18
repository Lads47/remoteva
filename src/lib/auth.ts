import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

// Nom du cookie de session
const COOKIE_NAME = "remoteva_session";

// Durée de validité du token (24 heures)
const TOKEN_EXPIRATION = "24h";

// Récupère la clé secrète pour signer les tokens
function getSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET non défini dans les variables d'environnement");
  }
  return new TextEncoder().encode(secret);
}

// Payload du token JWT
export interface TokenPayload {
  userId: string;
  email: string;
  [key: string]: unknown;
}

// Hash un mot de passe
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

// Vérifie un mot de passe contre son hash
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Crée un token JWT
export async function createToken(payload: TokenPayload): Promise<string> {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRATION)
    .sign(getSecretKey());

  return token;
}

// Vérifie et décode un token JWT
export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

// Récupère la session courante depuis les cookies
export async function getSession(): Promise<TokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifyToken(token);
}

// Crée une session (définit le cookie)
export async function createSession(payload: TokenPayload): Promise<void> {
  const token = await createToken(payload);
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24, // 24 heures
    path: "/",
  });
}

// Supprime la session (efface le cookie)
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
