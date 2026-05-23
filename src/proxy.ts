import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Nom du cookie de session
const COOKIE_NAME = "remoteva_session";

// Routes protégées (admin uniquement)
// Note : "/admin" couvre le hub d'accueil (Phase 1 réorganisation EVA).
// Phase 2 : /admin/links, /admin/directors, /admin/api-keys et /admin/preparation
// sont désormais redirigés en edge via next.config.ts vers leurs nouveaux
// emplacements (sous /admin/lien, /admin/flow/*, /admin/newsletter/*).
// Les redirects edge passent AVANT le middleware, donc inutile de garder ces
// chemins ici.
const PROTECTED_ROUTES = ["/admin", "/admin/dashboard", "/admin/users", "/admin/account", "/admin/reclamations", "/admin/lien", "/admin/newsletter", "/admin/flow"];

// Routes API protégées
const PROTECTED_API_ROUTES = ["/api/admin", "/api/account"];

// Proxy de protection des routes (anciennement middleware)
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Vérifie si c'est une route protégée
  const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  );
  const isProtectedApiRoute = PROTECTED_API_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  if (!isProtectedRoute && !isProtectedApiRoute) {
    return NextResponse.next();
  }

  // Fallback Bearer CRON_SECRET : utilisé par les crons et les scripts
  // d'admin (preview de mails-types, debug, etc.). Donne le même niveau
  // d'accès que le cookie session puisque le secret est stocké dans l'env
  // du container et a une portée admin totale.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader === `Bearer ${cronSecret}`) {
      return NextResponse.next();
    }
  }

  // Récupère le token de session
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    // Route API: retourne 401
    if (isProtectedApiRoute) {
      return NextResponse.json(
        { error: "Non autorisé" },
        { status: 401 }
      );
    }
    // Route page: redirige vers login
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  // Vérifie le token
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET non défini");
    }

    await jwtVerify(token, new TextEncoder().encode(secret));
    return NextResponse.next();
  } catch {
    // Token invalide
    if (isProtectedApiRoute) {
      return NextResponse.json(
        { error: "Session expirée" },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
}

// Configuration du matcher
// Important : on évite "/admin/:path*" qui capturerait /admin/login.
// On liste donc explicitement le hub (/admin exact) puis chaque sous-route.
export const config = {
  matcher: [
    // Routes admin
    "/admin",
    "/admin/dashboard/:path*",
    "/admin/users/:path*",
    "/admin/account/:path*",
    "/admin/reclamations/:path*",
    "/admin/lien/:path*",
    "/admin/newsletter/:path*",
    "/admin/flow/:path*",
    // API admin
    "/api/admin/:path*",
    "/api/account/:path*",
  ],
};
