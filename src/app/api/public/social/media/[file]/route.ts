import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { contentTypeFor, isSafeMediaFile, MEDIA_DIR } from "@/lib/social/media";

// Images des publications, servies depuis notre serveur. Nom vérifié par motif strict :
// aucun chemin, aucune remontée de dossier possible.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!isSafeMediaFile(file)) return new Response(null, { status: 404 });
  try {
    const data = await fs.promises.readFile(path.join(MEDIA_DIR, file));
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": contentTypeFor(file),
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
