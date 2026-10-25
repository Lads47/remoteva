import { NextRequest, NextResponse } from "next/server";
import { requireStatAccess } from "@/lib/stat/auth";
import { getLive } from "@/lib/stat/live";
import { siteBySlug } from "@/lib/stat/sites";

export const dynamic = "force-dynamic";

// Visiteurs en direct + carte, interrogé toutes les 5 s par le tableau de bord.
export async function GET(req: NextRequest) {
  const denied = await requireStatAccess();
  if (denied) return denied;

  const slug = req.nextUrl.searchParams.get("site") ?? "";
  const site = await siteBySlug(slug);
  if (!site) return NextResponse.json({ error: "Site inconnu" }, { status: 404 });

  const data = await getLive(site.id, req.nextUrl.searchParams.get("bots") === "1");
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
