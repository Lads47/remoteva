import { NextRequest, NextResponse } from "next/server";
import {
  getLinkBySlug,
  isLinkValid,
  updateLinkConfig,
  NewsletterConfig,
} from "@/lib/services";
import path from "path";
import fs from "fs";

// Taille max : 5 Mo
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Extensions autorisées
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

// Espace disque max pour les photos (10 Go total pour data/)
const MAX_STORAGE_BYTES = 10 * 1024 * 1024 * 1024; // 10 Go

// POST /api/services/newsletter/upload-photo
// Upload d'une photo pour une conférence
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const slug = formData.get("slug") as string | null;
    const conferenceId = formData.get("conference_id") as string | null;

    // Validations
    if (!slug || !conferenceId || !file) {
      return NextResponse.json(
        { error: "slug, conference_id et file sont requis" },
        { status: 400 }
      );
    }

    // Vérifier le lien
    const link = await getLinkBySlug(slug);
    if (!link) {
      return NextResponse.json(
        { error: "Lien non trouvé" },
        { status: 404 }
      );
    }

    if (!isLinkValid(link)) {
      return NextResponse.json(
        { error: "Lien expiré ou inactif" },
        { status: 403 }
      );
    }

    if (link.serviceType !== "newsletter") {
      return NextResponse.json(
        { error: "Type de service incorrect" },
        { status: 400 }
      );
    }

    // Vérifier la taille du fichier
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Fichier trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024} Mo)` },
        { status: 400 }
      );
    }

    // Vérifier l'extension
    const originalName = file.name || "photo.jpg";
    const ext = path.extname(originalName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: `Extension non autorisée. Formats acceptés : ${ALLOWED_EXTENSIONS.join(", ")}` },
        { status: 400 }
      );
    }

    // Vérifier le type MIME
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Le fichier doit être une image" },
        { status: 400 }
      );
    }

    // Vérifier la conférence
    const config = link.config as NewsletterConfig;
    const conferences = config.conferences || [];
    const confId = parseInt(conferenceId, 10);
    const confIndex = conferences.findIndex((c) => c.id === confId);

    if (confIndex === -1) {
      return NextResponse.json(
        { error: "Conférence non trouvée" },
        { status: 404 }
      );
    }

    // Créer le répertoire de stockage
    const dataDir = path.join(process.cwd(), "data");
    const eventsDir = path.join(dataDir, "events", slug, "photos");

    // Vérifier l'espace disque
    const currentSize = getDirSize(dataDir);
    if (currentSize + file.size > MAX_STORAGE_BYTES) {
      return NextResponse.json(
        { error: "Espace de stockage insuffisant" },
        { status: 507 }
      );
    }

    // Créer les répertoires si nécessaire
    fs.mkdirSync(eventsDir, { recursive: true });

    // Supprimer l'ancienne photo si elle existe
    const oldPhotoPath = conferences[confIndex].photo_path;
    if (oldPhotoPath) {
      const oldFullPath = path.join(process.cwd(), oldPhotoPath);
      if (fs.existsSync(oldFullPath)) {
        try {
          fs.unlinkSync(oldFullPath);
        } catch {
          console.warn(`Impossible de supprimer l'ancienne photo: ${oldPhotoPath}`);
        }
      }
    }

    // Nom de fichier unique : conf_{id}_{timestamp}{ext}
    const timestamp = Date.now();
    const fileName = `conf_${confId}_${timestamp}${ext}`;
    const filePath = path.join(eventsDir, fileName);

    // Écrire le fichier sur disque
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(filePath, buffer);

    // Chemin relatif stocké en base (relatif à process.cwd())
    const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");

    // Mettre à jour la config avec le chemin de la photo
    conferences[confIndex] = {
      ...conferences[confIndex],
      photo_path: relativePath,
    };

    const newConfig: NewsletterConfig = {
      ...config,
      conferences,
    };

    await updateLinkConfig(slug, newConfig);

    return NextResponse.json({
      success: true,
      photo_path: relativePath,
      file_name: fileName,
      file_size: file.size,
    });
  } catch (error) {
    console.error("Erreur upload photo:", error);
    return NextResponse.json(
      { error: "Erreur serveur lors de l'upload" },
      { status: 500 }
    );
  }
}

// Calculer la taille d'un répertoire récursivement
function getDirSize(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;

  let size = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        size += getDirSize(fullPath);
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(fullPath);
          size += stat.size;
        } catch {
          // Skip files we can't stat
        }
      }
    }
  } catch {
    // Skip directories we can't read
  }
  return size;
}
