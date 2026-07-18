import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/db";

async function requireAuth() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  return null;
}

async function prestaBySlug(slug: string) {
  return prisma.masterPresta.findUnique({ where: { slug } });
}

// GET - liste des logs déposés
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { slug } = await params;
  const presta = await prestaBySlug(slug);
  if (!presta) {
    return NextResponse.json({ error: "Presta introuvable" }, { status: 404 });
  }

  const logs = await prisma.masterVmixLog.findMany({
    where: { prestaId: presta.id },
    orderBy: { uploadedAt: "desc" },
  });
  return NextResponse.json({ logs });
}

// POST - dépôt de fichiers .log vMix (multipart/form-data, champ "files")
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { slug } = await params;
  const presta = await prestaBySlug(slug);
  if (!presta) {
    return NextResponse.json({ error: "Presta introuvable" }, { status: 404 });
  }

  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (files.length === 0) {
      return NextResponse.json({ error: "Aucun fichier" }, { status: 400 });
    }

    const dir = path.join(process.cwd(), "data", "master", presta.id, "logs");
    await mkdir(dir, { recursive: true });

    const created = [];
    for (const file of files) {
      const buf = Buffer.from(await file.arrayBuffer());
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = path.join(dir, `${Date.now()}-${safeName}`);
      await writeFile(storagePath, buf);
      const row = await prisma.masterVmixLog.create({
        data: {
          prestaId: presta.id,
          filename: file.name,
          size: buf.length,
          storagePath,
        },
      });
      created.push(row);
    }
    return NextResponse.json({ logs: created }, { status: 201 });
  } catch (error) {
    console.error("Erreur upload logs:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE ?id=... - retire un log (fichier + ligne)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { slug } = await params;
  const presta = await prestaBySlug(slug);
  if (!presta) {
    return NextResponse.json({ error: "Presta introuvable" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "ID requis" }, { status: 400 });
  }

  try {
    const log = await prisma.masterVmixLog.findFirst({
      where: { id, prestaId: presta.id },
    });
    if (log) {
      await unlink(log.storagePath).catch(() => {});
      await prisma.masterVmixLog.delete({ where: { id: log.id } });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression log:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
