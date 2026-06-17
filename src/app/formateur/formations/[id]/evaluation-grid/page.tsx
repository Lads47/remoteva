"use client";

// Grille d'évaluation accessible directement depuis une FORMATION (sans passer
// par une session). Le périmètre et les appels API sont identiques à l'accès
// par session — on délègue à l'éditeur partagé.

import { Suspense, use } from "react";
import { useSearchParams } from "next/navigation";
import EvaluationGridEditor from "@/components/formateur/EvaluationGridEditor";

function FormationGridInner({ formationId }: { formationId: string }) {
  const params = useSearchParams();
  const token = params.get("token") || "";
  return (
    <EvaluationGridEditor
      formationId={formationId}
      token={token}
      backHref={`/formateur?token=${encodeURIComponent(token)}`}
      backLabel="Retour à l'accueil"
    />
  );
}

export default function FormateurFormationGridPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<div className="text-center py-12 font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>}>
      <FormationGridInner formationId={id} />
    </Suspense>
  );
}
