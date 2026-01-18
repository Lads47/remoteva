"use client";

import { AccessLinkInfo, DownloadConfig } from "@/lib/services";

interface Props {
  link: AccessLinkInfo;
}

// Composant pour le service Téléchargement - Design inspiré des Ateliers du Stream
// Affiche la liste des fichiers disponibles au téléchargement
export default function DownloadService({ link }: Props) {
  const config = link.config as DownloadConfig;
  const files = config.files || [];

  // Formate la taille du fichier
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Retourne l'icône selon le type de fichier
  const getFileIcon = (type: string): string => {
    if (type.startsWith("video/")) return "🎬";
    if (type.startsWith("audio/")) return "🎵";
    if (type.startsWith("image/")) return "🖼️";
    if (type.includes("pdf")) return "📄";
    if (type.includes("zip") || type.includes("rar")) return "📦";
    if (type.includes("word") || type.includes("document")) return "📝";
    if (type.includes("excel") || type.includes("spreadsheet")) return "📊";
    if (type.includes("powerpoint") || type.includes("presentation")) return "📽️";
    return "📁";
  };

  // Télécharge un fichier
  const handleDownload = (fileId: string, fileName: string) => {
    const url = `/api/services/download?slug=${link.slug}&fileId=${fileId}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
        <h2 className="text-lg font-semibold mb-2" style={{ color: "#1f2244" }}>
          Fichiers disponibles
        </h2>
        <p className="text-sm" style={{ color: "#727485" }}>
          {files.length === 0
            ? "Aucun fichier disponible pour le moment."
            : `${files.length} fichier${files.length > 1 ? "s" : ""} disponible${files.length > 1 ? "s" : ""} au téléchargement.`}
        </p>
      </div>

      {/* Liste des fichiers */}
      {files.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <ul className="divide-y divide-gray-200">
            {files.map((file) => (
              <li
                key={file.id}
                className="p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between gap-4">
                  {/* Infos fichier */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl flex-shrink-0">
                      {getFileIcon(file.type)}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium truncate" style={{ color: "#1f2244" }}>
                        {file.name}
                      </p>
                      <p className="text-sm" style={{ color: "#727485" }}>
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>

                  {/* Bouton téléchargement */}
                  <button
                    onClick={() => handleDownload(file.id, file.name)}
                    className="flex-shrink-0 px-4 py-2 text-white rounded-full text-sm font-medium transition-colors"
                    style={{ backgroundColor: "#1f2244" }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#7dcef5"}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = "#1f2244"}
                  >
                    <span className="hidden sm:inline">Télécharger</span>
                    <span className="sm:hidden">↓</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Note */}
      <div className="text-sm text-center" style={{ color: "#727485" }}>
        <p>
          Les fichiers sont disponibles jusqu&apos;au{" "}
          {new Date(link.expiresAt).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      </div>
    </div>
  );
}
