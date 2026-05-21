// GET /api/admin/reclamations
// Liste toutes les réclamations, avec filtres optionnels (status, year).
// Auth gérée par src/proxy.ts (cookie admin ou Bearer CRON_SECRET).

import { NextRequest, NextResponse } from "next/server";
import { listComplaints, getComplaintStats, type ComplaintStatus } from "@/lib/complaint";

const VALID_STATUSES: ComplaintStatus[] = ["new", "in_progress", "resolved", "closed"];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const status = statusParam && VALID_STATUSES.includes(statusParam as ComplaintStatus)
      ? (statusParam as ComplaintStatus)
      : undefined;
    const yearParam = searchParams.get("year");
    const year = yearParam ? parseInt(yearParam, 10) : undefined;

    const [complaints, stats] = await Promise.all([
      listComplaints({ status, year }),
      getComplaintStats(year ?? new Date().getFullYear()),
    ]);
    return NextResponse.json({ complaints, stats });
  } catch (error) {
    console.error("[/api/admin/reclamations] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
