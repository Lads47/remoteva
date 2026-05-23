// Page d'atterrissage EVA Newsletter (Phase 1).
// Renvoie vers les pages legacy (/admin/links, /admin/preparation) en attendant
// le regroupement de routes prévu en Phase 2.

import Link from "next/link";

export default function NewsletterLandingPage() {
  return (
    <div className="space-y-6">
      <div
        className="p-4 rounded-lg border"
        style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}
      >
        <p className="text-sm" style={{ color: "#1f2244" }}>
          <strong>EVA Newsletter — univers en cours de réorganisation.</strong>
        </p>
        <p className="text-sm mt-1" style={{ color: "#727485" }}>
          Les outils Newsletter restent accessibles via leurs interfaces actuelles.
          La Phase 2 regroupera liens newsletter et préparation sous cet univers.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/admin/links"
          className="p-4 rounded-lg border hover:shadow-md transition-all block"
          style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}
        >
          <h3 className="font-medium" style={{ color: "#1f2244" }}>
            Liens newsletter
          </h3>
          <p className="text-sm mt-1" style={{ color: "#727485" }}>
            Interface actuelle de gestion des liens d&apos;accès (filtre
            &laquo; newsletter &raquo; disponible).
          </p>
        </Link>

        <Link
          href="/admin/preparation"
          className="p-4 rounded-lg border hover:shadow-md transition-all block"
          style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}
        >
          <h3 className="font-medium" style={{ color: "#1f2244" }}>
            Préparation &amp; lexiques
          </h3>
          <p className="text-sm mt-1" style={{ color: "#727485" }}>
            Créer et gérer les lexiques d&apos;événements.
          </p>
        </Link>
      </div>
    </div>
  );
}
