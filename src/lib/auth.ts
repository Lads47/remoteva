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

// Univers EVA accessibles (Phase 4 réorganisation EVA)
export const EVA_UNIVERSES = [
  "lien",
  "newsletter",
  "flow",
  "stream",
  "formations",
] as const;
export type EvaUniverse = (typeof EVA_UNIVERSES)[number];

// Statut d'un compte AdminUser
export type AccountStatus = "pending" | "validated";

// Payload du token JWT (Phase 4 : ajout status, isSuperAdmin, universes)
export interface TokenPayload {
  userId: string;
  email: string;
  status: AccountStatus;
  isSuperAdmin: boolean;
  universes: EvaUniverse[];
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

// Vérifie qu'une chaîne est un univers EVA valide.
export function isEvaUniverse(value: unknown): value is EvaUniverse {
  return (
    typeof value === "string" &&
    (EVA_UNIVERSES as readonly string[]).includes(value)
  );
}

// Détermine l'univers EVA associé à une route /admin/*.
// Retourne null pour les routes transverses (hub, account, users, dashboard,
// pending). /admin/reclamations est rattaché à formations (sous-feature
// Qualiopi).
export function universeForPath(pathname: string): EvaUniverse | null {
  if (pathname === "/admin" || pathname === "/admin/dashboard") return null;
  if (pathname.startsWith("/admin/account")) return null;
  if (pathname.startsWith("/admin/users")) return null;
  if (pathname.startsWith("/admin/pending")) return null;
  if (pathname.startsWith("/admin/lien")) return "lien";
  if (pathname.startsWith("/admin/newsletter")) return "newsletter";
  if (pathname.startsWith("/admin/flow")) return "flow";
  if (pathname.startsWith("/admin/formations")) return "formations";
  if (pathname.startsWith("/admin/reclamations")) return "formations";
  return null;
}
