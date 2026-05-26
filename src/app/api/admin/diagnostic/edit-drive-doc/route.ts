// POST /api/admin/diagnostic/edit-drive-doc
//
// Applique des remplacements de texte verbatim dans un Google Doc partagé
// avec notre Service Account. Utilise replaceAllText (batchUpdate API).
//
// Body :
// {
//   "docId": "...",
//   "replacements": [
//     { "from": "ancien texte", "to": "nouveau texte" },
//     ...
//   ]
// }
//
// Limite : replaceAllText supprime le formatage RICHE (gras / liste) du
// texte inséré. Idéal pour des corrections de texte plat. Pour préserver
// le formatage, éditer manuellement le Doc.

import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/google-drive";

const DOCS_API = "https://docs.googleapis.com/v1";

interface Replacement {
  from: string;
  to: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const docId = String(body?.docId || "");
    const replacements = Array.isArray(body?.replacements) ? body.replacements as Replacement[] : [];
    if (!docId) return NextResponse.json({ error: "docId requis" }, { status: 400 });
    if (replacements.length === 0) return NextResponse.json({ error: "replacements requis" }, { status: 400 });

    const requests = replacements.map((r) => ({
      replaceAllText: {
        containsText: { text: r.from, matchCase: true },
        replaceText: r.to ?? "",
      },
    }));

    const token = await getAccessToken();
    const res = await fetch(
      `${DOCS_API}/documents/${encodeURIComponent(docId)}:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requests }),
      }
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Docs batchUpdate HTTP ${res.status}`, detail: t.slice(0, 500) },
        { status: 500 }
      );
    }
    const data = await res.json();
    // Chaque reply.replaceAllText.occurrencesChanged indique combien d'occurrences ont été remplacées
    const summary = (data.replies || []).map((r: { replaceAllText?: { occurrencesChanged?: number } }, i: number) => ({
      from: replacements[i].from,
      occurrencesChanged: r.replaceAllText?.occurrencesChanged ?? 0,
    }));
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[/api/admin/diagnostic/edit-drive-doc] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
