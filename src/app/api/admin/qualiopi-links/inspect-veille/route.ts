// GET /api/admin/qualiopi-links/inspect-veille
//
// Endpoint diagnostique : lit le Sheet de veille référencé dans AppConfig,
// renvoie ses onglets + les ~15 premières lignes de chaque pour permettre
// à l'admin (ou à moi pendant le dev) de visualiser la structure.

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSpreadsheet, getValues } from "@/lib/google-sheets";

function extractSheetId(url: string): string | null {
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

export async function GET() {
  try {
    const row = await prisma.appConfig.findUnique({
      where: { key: "qualiopi.veille_sheet_url" },
    });
    if (!row?.value) {
      return NextResponse.json({ error: "Aucune URL de veille enregistrée" }, { status: 404 });
    }
    const sheetId = extractSheetId(row.value);
    if (!sheetId) {
      return NextResponse.json({ error: "URL invalide (impossible d'extraire l'ID)" }, { status: 400 });
    }

    const meta = await getSpreadsheet(sheetId);
    const tabs = await Promise.all(
      meta.sheets.map(async (s) => {
        try {
          const values = await getValues(sheetId, `'${s.title}'!A1:Z20`);
          return { title: s.title, index: s.index, rows: values };
        } catch (err) {
          return {
            title: s.title,
            index: s.index,
            rows: [],
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })
    );

    return NextResponse.json({
      spreadsheetId: sheetId,
      spreadsheetUrl: meta.spreadsheetUrl,
      tabs,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[/api/admin/qualiopi-links/inspect-veille] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
