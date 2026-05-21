// GET /api/admin/formations/bpf-sheet-info
//
// Renvoie l'état du Sheet BPF (id, URL, last sync timestamp).
// Lit AppConfig — pas d'appel Google.

import { NextResponse } from "next/server";
import { getBpfSheetInfo } from "@/lib/bpf-export";

export async function GET() {
  try {
    const info = await getBpfSheetInfo();
    return NextResponse.json(info);
  } catch (error) {
    console.error("[/api/admin/formations/bpf-sheet-info] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
