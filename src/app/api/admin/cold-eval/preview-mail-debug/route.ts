// Debug endpoint TEMPORAIRE — à supprimer une fois le 401 fixé.
// Pas d'auth : retourne ce que le handler voit pour comprendre le bug.

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = key.toLowerCase().includes("auth") ? `${value.slice(0, 20)}...` : value;
  });
  return NextResponse.json({
    debug: true,
    env: {
      hasSecret: !!secret,
      secretLength: secret?.length,
      secretFirst4: secret?.slice(0, 4),
      secretLast4: secret?.slice(-4),
    },
    request: {
      method: request.method,
      url: request.url,
      hasAuth: !!auth,
      authPrefix: auth?.slice(0, 30),
      authLength: auth?.length,
      expectedAuthLength: secret ? `Bearer ${secret}`.length : 0,
      match: secret ? auth === `Bearer ${secret}` : false,
    },
    headersList: Object.keys(headers),
    authHeader: auth,
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
