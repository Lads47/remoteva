// GET /api/admin/formations/qualiopi-stats/pdf?year=YYYY
//
// Génère un PDF A4 du bilan Qualiopi annuel — à présenter à un auditeur ou
// archiver pour la traçabilité Qualiopi.

import { NextResponse } from "next/server";
import { getQualiopiOverview } from "@/lib/analytics";
import { buildQualiopiPdf } from "@/lib/qualiopi-pdf";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const yearParam = url.searchParams.get("year");
    const year = yearParam ? Number.parseInt(yearParam, 10) : new Date().getFullYear();
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "Année invalide" }, { status: 400 });
    }

    const overview = await getQualiopiOverview(year);
    const { buffer, filename } = await buildQualiopiPdf(overview);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[/api/admin/formations/qualiopi-stats/pdf] error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
