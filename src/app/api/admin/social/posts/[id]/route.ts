import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireSuperAdmin } from "@/lib/social/auth";

const schema = z.object({ hidden: z.boolean() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const found = await prisma.socialPost.findUnique({ where: { id }, select: { id: true } });
  if (!found) return NextResponse.json({ error: "Publication introuvable." }, { status: 404 });
  await prisma.socialPost.update({ where: { id }, data: { hidden: parsed.data.hidden } });
  return NextResponse.json({ ok: true });
}
