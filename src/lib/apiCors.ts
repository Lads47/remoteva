import { NextResponse } from "next/server";

// CORS headers pour les routes /api/flow/* (machines EVA Capture / EVA Cut).
// Pas de contrainte d'origine : la sécurité repose sur l'API key.

export const FLOW_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Api-Key, x-api-key",
  "Access-Control-Max-Age": "86400",
};

/**
 * Wrap une NextResponse avec les CORS headers.
 */
export function withCors(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(FLOW_CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

/**
 * Helper pour répondre rapidement à un preflight OPTIONS.
 */
export function corsPreflightResponse(): NextResponse {
  return withCors(new NextResponse(null, { status: 204 }));
}

/**
 * Crée une JSON response avec CORS headers + status.
 */
export function jsonCors(data: unknown, init?: { status?: number }): NextResponse {
  return withCors(NextResponse.json(data, init));
}
