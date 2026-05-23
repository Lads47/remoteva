// EVA Newsletter — vue principale : liens newsletter (Phase 2).
// Utilise le composant partagé AccessLinksManager avec serviceType="newsletter".
// L'onglet "Préparation" est dans le layout.

import AccessLinksManager from "@/components/admin/AccessLinksManager";

export default function NewsletterPage() {
  return (
    <AccessLinksManager
      serviceType="newsletter"
      title="Liens newsletter"
      subtitle="Liens d'accès aux résumés de conférences en direct."
    />
  );
}
