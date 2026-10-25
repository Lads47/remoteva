// Point de collecte EVA Stat, appelé par /e.js depuis nos 3 sites.
// Nom neutre exprès : un chemin contenant « stat » ou « collect » finit dans
// les listes des bloqueurs de pub.

import { NextRequest, NextResponse, after } from "next/server";
import { ingest } from "@/lib/stat/ingest";
import { clientIp } from "@/lib/stat/ip";
import { MAX_BODY_BYTES, parsePayload } from "@/lib/stat/payload";
import { listSites, originAllowed, siteBySlug } from "@/lib/stat/sites";
import { RateLimiter } from "@/lib/stat/util";

export const dynamic = "force-dynamic";

const limiter = new RateLimiter(120);

function corsHeaders(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

const empty = (status: number, headers?: HeadersInit) => new NextResponse(null, { status, headers });

async function readLimited(req: NextRequest): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// Le slug n'est connu qu'en lisant le corps : le préflight accepte toute
// origine déclarée par l'un des sites.
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  const sites = await listSites();
  if (!origin || !sites.some((s) => originAllowed(s, origin))) return empty(403);
  return empty(204, corsHeaders(origin));
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const text = await readLimited(req);
  if (text === null) return empty(413);

  const msg = parsePayload(text);
  if (!msg) return empty(400);

  const site = await siteBySlug(msg.s);
  if (!site || !originAllowed(site, origin)) return empty(403);
  const headers = corsHeaders(origin!);

  const ip = clientIp(req.headers);
  if (!limiter.allow(ip ?? "inconnue")) return empty(429, headers);

  const userAgent = req.headers.get("user-agent");
  after(() =>
    ingest(site, msg, { ip, userAgent }).catch((err) => {
      console.error("[stat] écriture refusée :", err instanceof Error ? err.message : String(err));
    })
  );
  return empty(204, headers);
}
