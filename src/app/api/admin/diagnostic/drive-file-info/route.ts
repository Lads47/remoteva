// GET /api/admin/diagnostic/drive-file-info?id=<fileId>
//
// Renvoie les métadonnées d'un fichier Drive (nom, mimeType, modifiedTime,
// taille). Utile pour vérifier ce qu'on a réellement lié dans un champ
// driveTemplate*Id avant d'investiguer un problème de pipeline.

import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/google-drive";

const DRIVE_API = "https://www.googleapis.com/drive/v3";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

    const token = await getAccessToken();
    const fields = "id,name,mimeType,modifiedTime,size,webViewLink";
    const res = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Drive HTTP ${res.status}`, detail: txt.slice(0, 300) },
        { status: res.status === 404 ? 404 : 500 }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
