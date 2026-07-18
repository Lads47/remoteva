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
// Phase 4 : /admin/pending ajouté (page d'attente pour comptes non validés).
const PROTECTED_ROUTES = [
  "/admin",
  "/admin/dashboard",
  "/admin/users",
  "/admin/account",
  "/admin/reclamations",
  "/admin/lien",
  "/admin/newsletter",
  "/admin/flow",
  "/admin/pending",
  "/admin/formations",
  "/admin/master",
];

// Routes API protégées
const PROTECTED_API_ROUTES = ["/api/admin", "/api/account"];

// Univers EVA : associe une route à son univers (Phase 4).
// Retourne null pour les routes transverses (hub, account, users, dashboard).
function universeForPath(pathname: string): string | null {
  if (pathname === "/admin" || pathname === "/admin/dashboard") return null;
  if (pathname.startsWith("/admin/account")) return null;
  if (pathname.startsWith("/admin/users")) return null;
  if (pathname.startsWith("/admin/pending")) return null;
  if (pathname.startsWith("/admin/lien")) return "lien";
  if (pathname.startsWith("/admin/newsletter")) return "newsletter";
  if (pathname.startsWith("/admin/flow")) return "flow";
  if (pathname.startsWith("/admin/formations")) return "formations";
  if (pathname.startsWith("/admin/reclamations")) return "formations";
  if (pathname.startsWith("/admin/master")) return "master";
  return null;
}

// Payload du JWT côté middleware (subset de TokenPayload).
interface ProxyPayload {
  userId?: string;
  status?: string;
  isSuperAdmin?: boolean;
  universes?: string[];
}

// Proxy de protection des routes (anciennement middleware).
// Phase 4 : ajoute la vérification du status (validated/pending) et de
// l'accès à l'univers demandé.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Vérifie si c'est une route protégée
  const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
    pathname === route || pathname.startsWith(route + "/")
  );
  const isProtectedApiRoute = PROTECTED_API_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  if (!isProtectedRoute && !isProtectedApiRoute) {
    return NextResponse.next();
  }

  // Fallback Bearer CRON_SECRET : crons et scripts d'admin.
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
    if (isProtectedApiRoute) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  // Vérifie le token
  let payload: ProxyPayload;
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET non défini");
    }
    const result = await jwtVerify(token, new TextEncoder().encode(secret));
    payload = result.payload as ProxyPayload;
  } catch {
    if (isProtectedApiRoute) {
      return NextResponse.json({ error: "Session expirée" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  // À partir d'ici, le token est valide. Phase 4 : checks de permission.

  // Cas spécial : comptes legacy (token créé avant Phase 4, sans status)
  // → on les considère validated + super-admin (cohérent avec la migration
  // de données qui passe tout existant en super-admin Q2a).
  const status = payload.status ?? "validated";
  const isSuperAdmin = payload.isSuperAdmin ?? true;
  const universes = Array.isArray(payload.universes) ? payload.universes : [];

  // Compte en attente : seules les routes neutres restent accessibles.
  if (status === "pending") {
    // Routes autorisées en pending : /admin/pending, /admin/account,
    // /api/account (pour changer son mot de passe), /api/auth/logout.
    const pendingAllowed =
      pathname === "/admin/pending" ||
      pathname.startsWith("/admin/account") ||
      pathname.startsWith("/api/account") ||
      pathname === "/api/auth/logout";

    if (!pendingAllowed) {
      if (isProtectedApiRoute) {
        return NextResponse.json(
          { error: "Compte en attente de validation" },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL("/admin/pending", request.url));
    }
    return NextResponse.next();
  }

  // Compte validé : vérification d'accès à l'univers (sauf super-admin).
  if (!isSuperAdmin) {
    const universe = universeForPath(pathname);
    if (universe && !universes.includes(universe)) {
      // L'utilisateur n'a pas accès à cet univers → retour au hub.
      if (isProtectedApiRoute) {
        return NextResponse.json(
          { error: "Accès refusé à cet univers" },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    // Routes super-admin (/admin/users) : interdites aux non-super-admin.
    if (pathname.startsWith("/admin/users")) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
  }

  return NextResponse.next();
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
    "/admin/formations/:path*",
    "/admin/master/:path*",
    "/admin/pending/:path*",
    // API admin
    "/api/admin/:path*",
    "/api/account/:path*",
  ],
};
