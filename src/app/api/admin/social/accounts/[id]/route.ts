import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { requireSuperAdmin } from "@/lib/social/auth";
import { deleteAccount } from "@/lib/social/sync";

const patchSchema = z.object({
  active: z.boolean().optional(),
  brand: z.string().trim().min(1).max(80).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  const found = await prisma.socialAccount.findUnique({ where: { id }, select: { id: true } });
  if (!found) return NextResponse.json({ error: "Compte introuvable." }, { status: 404 });
  await prisma.socialAccount.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSuperAdmin();
  if (denied) return denied;
  const { id } = await params;
  await deleteAccount(id);
  return NextResponse.json({ ok: true });
}
