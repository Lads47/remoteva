import { TRACKER_JS } from "@/lib/stat/tracker.generated";

// Script de suivi EVA Stat (nom neutre, voir api/public/e).
export function GET() {
  return new Response(TRACKER_JS, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
