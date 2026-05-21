// TEMP debug — endpoint à un path totalement isolé pour valider le routing.
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  return NextResponse.json({
    debug: true,
    route: "/api/debug-headers",
    hasAuth: !!auth,
    authPrefix: auth?.slice(0, 30),
    hasSecret: !!secret,
    match: secret ? auth === `Bearer ${secret}` : false,
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
