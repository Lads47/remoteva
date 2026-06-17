"use client";

// Consultation + édition des pré-requis d'une formation par le formateur.
// Périmètre formation (sessions assignées OU affectation directe). Toute
// sauvegarde notifie l'organisme (garde-fou Qualiopi).

import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PrerequisField } from "@/lib/formation-prerequis";
import { apiFetch, apiErrorMessage, isAbortError } from "@/lib/api-client";
import PrerequisFieldsEditor from "@/components/PrerequisFieldsEditor";

function PrerequisInner({ formationId }: { formationId: string }) {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const backHref = `/formateur?token=${encodeURIComponent(token)}`;

  const [formation, setFormation] = useState<{ code: string; nomLong: string } | null>(null);
  const [fields, setFields] = useState<PrerequisField[]>([]);
  const [usingDefault, setUsingDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Token manquant");
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    apiFetch<{ formation: { code: string; nomLong: string }; prerequis?: PrerequisField[]; usingDefault?: boolean }>(
      `/api/formateur/formations/${formationId}/prerequis?token=${encodeURIComponent(token)}`,
      { signal: ac.signal }
    )
      .then((d) => {
        setFormation(d.formation);
        setFields(Array.isArray(d.prerequis) ? d.prerequis : []);
        setUsingDefault(Boolean(d.usingDefault));
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setError(apiErrorMessage(err, "Accès refusé"));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [formationId, token]);

  async function handleSave() {
    // Validation minimale : chaque champ doit avoir un libellé
    for (const f of fields) {
      if (!f.label.trim()) {
        setFeedback({ type: "error", msg: "Toutes les questions doivent avoir un libellé" });
        setTimeout(() => setFeedback(null), 4000);
        return;
      }
      if (f.type === "single_choice" && f.options.length === 0) {
        setFeedback({ type: "error", msg: `La question "${f.label}" doit avoir au moins une option` });
        setTimeout(() => setFeedback(null), 4000);
        return;
      }
    }
    if (fields.length === 0) {
      setFeedback({ type: "error", msg: "Ajoute au moins une question avant d'enregistrer" });
      setTimeout(() => setFeedback(null), 4000);
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/formateur/formations/${formationId}/prerequis?token=${encodeURIComponent(token)}`, {
        method: "PUT",
        body: { prerequis: fields },
      });
      setUsingDefault(false);
      setFeedback({ type: "success", msg: "Pré-requis enregistrés ✓" });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setFeedback({ type: "error", msg: apiErrorMessage(err, "Erreur de connexion") });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12 font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  }
  if (error) {
    return (
      <div className="text-center py-12">
        <p className="font-jetbrains text-sm" style={{ color: "#991b1b" }}>{error}</p>
        <Link href={backHref} className="mt-4 inline-block underline text-sm" style={{ color: "#1f2244" }}>
          ← Retour à l&apos;accueil
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link href={backHref} className="text-xs font-jetbrains underline" style={{ color: "#727485" }}>
        ← Retour à l&apos;accueil
      </Link>

      <div className="mt-2 mb-4">
        {formation && (
          <span className="px-2 py-0.5 rounded text-xs font-jetbrains" style={{ backgroundColor: "#1f2244", color: "white" }}>
            {formation.code}
          </span>
        )}
        <h1 className="text-2xl font-bold mt-2" style={{ color: "#1f2244" }}>
          Pré-requis &amp; analyse du besoin
        </h1>
        {formation && (
          <p className="text-sm mt-1 font-jetbrains" style={{ color: "#727485" }}>{formation.nomLong}</p>
        )}
      </div>

      <div className="mb-4 p-3 rounded-lg text-xs font-jetbrains" style={{ backgroundColor: "#fafbff", color: "#727485" }}>
        Ces questions composent la section &laquo; Pré-requis et analyse du besoin &raquo; du formulaire
        d&apos;inscription des stagiaires. Elles s&apos;appliquent à toutes les sessions de la formation.
        L&apos;organisme de formation est notifié de chaque modification.
      </div>

      {usingDefault && (
        <div className="mb-4 p-3 rounded-lg text-xs font-jetbrains" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
          Schéma par défaut affiché. Modifie et enregistre pour le personnaliser.
        </div>
      )}

      {feedback && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm font-jetbrains ${
            feedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      <PrerequisFieldsEditor
        fields={fields}
        onChange={(f) => {
          setFields(f);
          setUsingDefault(false);
        }}
      />

      <div className="flex justify-end mt-6">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-full text-sm font-medium text-white cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: "#1f2244" }}
        >
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

export default function FormateurFormationPrerequisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<div className="text-center py-12 font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>}>
      <PrerequisInner formationId={id} />
    </Suspense>
  );
}
