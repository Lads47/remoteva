import { NextRequest, NextResponse } from "next/server";
import { getLinkBySlug, isLinkValid, DownloadConfig } from "@/lib/services";
import { readFile, stat } from "fs/promises";
import path from "path";

// GET /api/services/download - Télécharge un fichier
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get("slug");
    const fileId = searchParams.get("fileId");

    if (!slug || !fileId) {
      return NextResponse.json(
        { error: "Slug et fileId requis" },
        { status: 400 }
      );
    }

    // Récupération du lien
    const link = await getLinkBySlug(slug);

    if (!link) {
      return NextResponse.json(
        { error: "Lien non trouvé" },
        { status: 404 }
      );
    }

    // Vérification de la validité
    if (!isLinkValid(link)) {
      return NextResponse.json(
        { error: "Lien expiré ou inactif" },
        { status: 403 }
      );
    }

    // Vérification du type de service
    if (link.serviceType !== "download") {
      return NextResponse.json(
        { error: "Type de service incorrect" },
        { status: 400 }
      );
    }

    const config = link.config as DownloadConfig;

    // Recherche du fichier dans la configuration
    const file = config.files.find((f) => f.id === fileId);

    if (!file) {
      return NextResponse.json(
        { error: "Fichier non trouvé" },
        { status: 404 }
      );
    }

    // Chemin sécurisé vers le fichier
    // Les fichiers sont stockés dans /data/files/{slug}/
    const filesDir = path.join(process.cwd(), "data", "files", slug);
    const filePath = path.join(filesDir, path.basename(file.path));

    // Vérification que le fichier est bien dans le répertoire autorisé
    const realPath = path.resolve(filePath);
    const realFilesDir = path.resolve(filesDir);

    if (!realPath.startsWith(realFilesDir)) {
      return NextResponse.json(
        { error: "Accès non autorisé" },
        { status: 403 }
      );
    }

    // Lecture du fichier
    try {
      const fileStats = await stat(filePath);
      const fileBuffer = await readFile(filePath);

      // Headers pour le téléchargement
      const headers = new Headers();
      headers.set("Content-Type", file.type || "application/octet-stream");
      headers.set("Content-Length", fileStats.size.toString());
      headers.set(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(file.name)}"`
      );

      return new NextResponse(fileBuffer, { headers });
    } catch {
      return NextResponse.json(
        { error: "Fichier introuvable sur le serveur" },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error("Erreur service download:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
