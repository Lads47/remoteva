// EVA Lien — vue principale : liens de téléchargement (Phase 2).
// Utilise le composant partagé AccessLinksManager avec serviceType="download".

import AccessLinksManager from "@/components/admin/AccessLinksManager";

export default function LienPage() {
  return (
    <AccessLinksManager
      serviceType="download"
      title="Liens de téléchargement"
      subtitle="Partage et téléchargement de fichiers volumineux via lien d'accès unique."
    />
  );
}
