import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireSuperAdmin } from "@/lib/social/auth";
import { syncAccount } from "@/lib/social/sync";

// « Actualiser maintenant » depuis l'admin, sans attendre le cron.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;
  const { id } = await params;
  const found = await prisma.socialAccount.findUnique({ where: { id }, select: { id: true } });
  if (!found) return NextResponse.json({ error: "Compte introuvable." }, { status: 404 });
  const report = await syncAccount(id);
  return NextResponse.json(report, { status: report.error ? 502 : 200 });
}
