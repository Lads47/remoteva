"use client";

// Grille d'évaluation accessible depuis une SESSION : on résout d'abord la
// formation de la session, puis on délègue à l'éditeur partagé (périmètre
// formation). Le lien retour pointe vers la session.

import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiFetch, isAbortError } from "@/lib/api-client";
import EvaluationGridEditor from "@/components/formateur/EvaluationGridEditor";

function SessionGridInner({ sessionId }: { sessionId: string }) {
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [formationId, setFormationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Token manquant");
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    apiFetch<{ formation?: { id?: string } }>(
      `/api/formateur/sessions/${sessionId}?token=${encodeURIComponent(token)}`,
      { signal: ac.signal }
    )
      .then((d) => {
        const fId = d?.formation?.id;
        if (!fId) {
          setError("Formation introuvable pour cette session");
          return;
        }
        setFormationId(fId);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setError("Accès refusé");
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [sessionId, token]);

  if (loading) {
    return <div className="text-center py-12 font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  }
  if (error || !formationId) {
    return (
      <div className="text-center py-12">
        <p className="font-jetbrains text-sm" style={{ color: "#991b1b" }}>{error || "Accès refusé"}</p>
        <Link href={`/formateur/sessions/${sessionId}?token=${encodeURIComponent(token)}`} className="mt-4 inline-block underline text-sm" style={{ color: "#1f2244" }}>
          ← Retour à la session
        </Link>
      </div>
    );
  }

  return (
    <EvaluationGridEditor
      formationId={formationId}
      token={token}
      backHref={`/formateur/sessions/${sessionId}?token=${encodeURIComponent(token)}`}
      backLabel="Retour à la session"
    />
  );
}

export default function FormateurSessionGridPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<div className="text-center py-12 font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>}>
      <SessionGridInner sessionId={id} />
    </Suspense>
  );
}
