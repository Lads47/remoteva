// Page d'atterrissage EVA Lien (Phase 1).
// Renvoie vers la page legacy /admin/links en attendant le regroupement
// de routes prévu en Phase 2 (déplacement de /admin/links → /admin/lien).

import Link from "next/link";

export default function LienLandingPage() {
  return (
    <div className="space-y-6">
      <div
        className="p-4 rounded-lg border"
        style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}
      >
        <p className="text-sm" style={{ color: "#1f2244" }}>
          <strong>EVA Lien — univers en cours de réorganisation.</strong>
        </p>
        <p className="text-sm mt-1" style={{ color: "#727485" }}>
          La gestion des liens de téléchargement reste accessible via l&apos;ancienne
          interface. Une refonte dédiée (Phase 3) regroupera ici les liens, les
          fichiers et leur configuration.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/admin/links"
          className="p-4 rounded-lg border hover:shadow-md transition-all block"
          style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}
        >
          <h3 className="font-medium" style={{ color: "#1f2244" }}>
            Gérer les liens de téléchargement
          </h3>
          <p className="text-sm mt-1" style={{ color: "#727485" }}>
            Interface actuelle (tous types de liens, filtre &laquo; download &raquo;
            disponible).
          </p>
        </Link>
      </div>
    </div>
  );
}
