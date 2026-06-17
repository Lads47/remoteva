"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type { PrerequisField } from "@/lib/formation-prerequis";
import { apiFetch, apiErrorMessage, isAbortError, ApiError } from "@/lib/api-client";
import PrerequisFieldsEditor from "@/components/PrerequisFieldsEditor";

interface FormationLite {
  id: string;
  code: string;
  nomLong: string;
  configForm: string;
}

export default function PrerequisEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [formation, setFormation] = useState<FormationLite | null>(null);
  const [fields, setFields] = useState<PrerequisField[]>([]);
  const [usingDefault, setUsingDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    apiFetch<{ formations?: FormationLite[] }>(`/api/admin/formations`, { signal: ac.signal })
      .then((data) => {
        const found = (data.formations || []).find((f: FormationLite) => f.id === id);
        if (!found) {
          setError("Formation introuvable");
          return;
        }
        setFormation(found);
        // L'API publique résout le schéma (configForm si valide, sinon fallback
        // hardcoded). On l'utilise pour pré-remplir l'éditeur même quand le
        // configForm est vide : l'admin part du défaut puis le personnalise.
        return apiFetch<{ prerequisSchema?: PrerequisField[] }>(
          `/api/public/formations/${encodeURIComponent(found.code)}`,
          { signal: ac.signal }
        )
          .then((pub) => {
            const hasCustom =
              found.configForm && found.configForm.trim() !== "" && found.configForm.trim() !== "{}";
            setFields(Array.isArray(pub.prerequisSchema) ? pub.prerequisSchema : []);
            setUsingDefault(!hasCustom);
          })
          .catch((err) => {
            // Fidèle à l'ancien `if (!r.ok) return;` : une erreur HTTP ici est ignorée
            if (err instanceof ApiError && err.status !== null) return;
            throw err;
          });
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setError("Erreur de chargement");
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [id]);

  async function handleSave() {
    if (!formation) return;
    // Validation minimale : chaque champ doit avoir un label
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
    setSaving(true);
    try {
      const configForm = JSON.stringify({ prerequis: fields });
      await apiFetch("/api/admin/formations", {
        method: "PUT",
        body: { id: formation.id, configForm },
      });
      setFeedback({ type: "success", msg: "Pré-requis enregistrés" });
      setUsingDefault(false);
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setFeedback({ type: "error", msg: apiErrorMessage(err, "Erreur de connexion") });
    } finally {
      setSaving(false);
    }
  }

  async function handleResetDefault() {
    if (!formation) return;
    if (!confirm("Réinitialiser au schéma par défaut de cette formation ? Les questions personnalisées seront perdues.")) return;
    setSaving(true);
    try {
      await apiFetch("/api/admin/formations", {
        method: "PUT",
        body: { id: formation.id, configForm: "{}" },
      });
      // Recharger le schéma par défaut depuis l'API publique
      const pub = await apiFetch<{ prerequisSchema?: PrerequisField[] }>(
        `/api/public/formations/${encodeURIComponent(formation.code)}`
      );
      setFields(Array.isArray(pub.prerequisSchema) ? pub.prerequisSchema : []);
      setUsingDefault(true);
      setFeedback({ type: "success", msg: "Schéma par défaut restauré" });
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
  if (error || !formation) {
    return (
      <div className="text-center py-12">
        <p className="font-jetbrains text-sm" style={{ color: "#727485" }}>{error || "Formation introuvable"}</p>
        <Link href="/admin/formations/catalogue" className="mt-4 inline-block underline text-sm" style={{ color: "#1f2244" }}>
          ← Retour au catalogue
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <Link href="/admin/formations/catalogue" className="text-xs font-jetbrains underline" style={{ color: "#727485" }}>
          ← Catalogue
        </Link>
        <div className="flex items-center gap-3 flex-wrap mt-2">
          <span className="px-2 py-0.5 rounded text-xs font-jetbrains" style={{ backgroundColor: "#1f2244", color: "white" }}>
            {formation.code}
          </span>
        </div>
        <h1 className="text-3xl font-bold mt-1" style={{ color: "#1f2244" }}>
          Pré-requis · {formation.nomLong}
        </h1>
        <p className="text-sm mt-1 font-jetbrains" style={{ color: "#727485" }}>
          Édite les questions du formulaire d&apos;inscription pour cette formation (section &laquo; Pré-requis et analyse du besoin &raquo;).
        </p>
        {usingDefault && (
          <p className="mt-2 text-xs font-jetbrains px-3 py-2 rounded inline-block" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
            Schéma par défaut affiché. Modifie et enregistre pour le personnaliser.
          </p>
        )}
      </div>

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

      <div className="flex justify-end items-center gap-2 flex-wrap mt-6">
        <button
          type="button"
          onClick={handleResetDefault}
          className="px-4 py-2 rounded-full text-sm font-medium border cursor-pointer hover:bg-gray-50"
          style={{ borderColor: "#d1d5db", color: "#374151" }}
          disabled={saving}
        >
          Réinitialiser au défaut
        </button>
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
