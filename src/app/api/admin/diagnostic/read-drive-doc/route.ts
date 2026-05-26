// GET /api/admin/diagnostic/read-drive-doc?id=<fileId>
//
// Lit un Google Doc partagé avec notre Service Account et renvoie son contenu
// en text/plain. Utile pour audit Qualiopi d'un programme ou template sans
// devoir l'ouvrir dans le navigateur.
//
// Le SA doit avoir au minimum le rôle Lecteur sur le doc.

import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/google-drive";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

    const token = await getAccessToken();
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/export?mimeType=text/plain&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Drive export failed HTTP ${res.status}`, detail: txt.slice(0, 400) },
        { status: 500 }
      );
    }
    const text = await res.text();
    return new NextResponse(text, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[/api/admin/diagnostic/read-drive-doc] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
