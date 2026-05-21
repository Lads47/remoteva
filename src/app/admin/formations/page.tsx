"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Formation {
  id: string;
  code: string;
  nomLong: string;
  description: string;
  prixHT: number;
  dureeJours: number;
  active: boolean;
  sellsyPipelineId: number | null;
  sellsyStepInitial: number | null;
  sellsyServiceId: number | null;
  sellsyEstimateModelId: number | null;
  codeOpportunite: string;
  driveDossierRacineId: string | null;
  driveDossierSessionsId: string | null;
  driveTemplateProgrammeId: string | null;
  driveTemplateConventionId: string | null;
  driveTemplateContratId: string | null;
  driveTemplateConvocationId: string | null;
  driveTemplateEmargementId: string | null;
  driveTemplateSuiviId: string | null;
  configForm: string;
  createdAt: string;
  updatedAt: string;
}

type FormState = {
  code: string;
  nomLong: string;
  description: string;
  prixHT: string;
  dureeJours: string;
  active: boolean;
  sellsyServiceId: string;
  sellsyEstimateModelId: string;
  codeOpportunite: string;
  driveDossierRacineId: string;
  driveDossierSessionsId: string;
  driveTemplateProgrammeId: string;
  driveTemplateConventionId: string;
  driveTemplateContratId: string;
  driveTemplateConvocationId: string;
  driveTemplateEmargementId: string;
  driveTemplateSuiviId: string;
};

const EMPTY_FORM: FormState = {
  code: "",
  nomLong: "",
  description: "",
  prixHT: "",
  dureeJours: "1",
  active: true,
  sellsyServiceId: "",
  sellsyEstimateModelId: "",
  codeOpportunite: "",
  driveDossierRacineId: "",
  driveDossierSessionsId: "",
  driveTemplateProgrammeId: "",
  driveTemplateConventionId: "",
  driveTemplateContratId: "",
  driveTemplateConvocationId: "",
  driveTemplateEmargementId: "",
  driveTemplateSuiviId: "",
};

export default function FormationsPage() {
  const [formations, setFormations] = useState<Formation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  useEffect(() => {
    fetchFormations();
  }, []);

  async function fetchFormations() {
    try {
      const res = await fetch("/api/admin/formations");
      const data = await res.json();
      if (Array.isArray(data.formations)) setFormations(data.formations);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function toFormState(f: Formation): FormState {
    return {
      code: f.code,
      nomLong: f.nomLong,
      description: f.description,
      prixHT: f.prixHT.toString(),
      dureeJours: f.dureeJours.toString(),
      active: f.active,
      sellsyServiceId: f.sellsyServiceId?.toString() ?? "",
      sellsyEstimateModelId: f.sellsyEstimateModelId?.toString() ?? "",
      codeOpportunite: f.codeOpportunite,
      driveDossierRacineId: f.driveDossierRacineId ?? "",
      driveDossierSessionsId: f.driveDossierSessionsId ?? "",
      driveTemplateProgrammeId: f.driveTemplateProgrammeId ?? "",
      driveTemplateConventionId: f.driveTemplateConventionId ?? "",
      driveTemplateContratId: f.driveTemplateContratId ?? "",
      driveTemplateConvocationId: f.driveTemplateConvocationId ?? "",
      driveTemplateEmargementId: f.driveTemplateEmargementId ?? "",
      driveTemplateSuiviId: f.driveTemplateSuiviId ?? "",
    };
  }

  function fromFormState(f: FormState) {
    const toIntOrNull = (s: string) => (s.trim() === "" ? null : parseInt(s, 10));
    const toStrOrNull = (s: string) => (s.trim() === "" ? null : s.trim());
    return {
      code: f.code.trim(),
      nomLong: f.nomLong.trim(),
      description: f.description.trim(),
      prixHT: parseFloat(f.prixHT) || 0,
      dureeJours: parseInt(f.dureeJours, 10) || 1,
      active: f.active,
      sellsyServiceId: toIntOrNull(f.sellsyServiceId),
      sellsyEstimateModelId: toIntOrNull(f.sellsyEstimateModelId),
      codeOpportunite: f.codeOpportunite.trim(),
      driveDossierRacineId: toStrOrNull(f.driveDossierRacineId),
      driveDossierSessionsId: toStrOrNull(f.driveDossierSessionsId),
      driveTemplateProgrammeId: toStrOrNull(f.driveTemplateProgrammeId),
      driveTemplateConventionId: toStrOrNull(f.driveTemplateConventionId),
      driveTemplateContratId: toStrOrNull(f.driveTemplateContratId),
      driveTemplateConvocationId: toStrOrNull(f.driveTemplateConvocationId),
      driveTemplateEmargementId: toStrOrNull(f.driveTemplateEmargementId),
      driveTemplateSuiviId: toStrOrNull(f.driveTemplateSuiviId),
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload = fromFormState(form);
      const method = editingId ? "PUT" : "POST";
      const body = editingId ? { id: editingId, ...payload } : payload;
      const res = await fetch("/api/admin/formations", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur");
        return;
      }
      setFeedback({ type: "success", msg: editingId ? "Formation mise à jour" : "Formation créée" });
      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      await fetchFormations();
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      console.error(err);
      setError("Erreur connexion");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(f: Formation) {
    setEditingId(f.id);
    setForm(toFormState(f));
    setShowForm(true);
    setError("");
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cette formation ? (Impossible si des sessions existent)")) return;
    try {
      const res = await fetch(`/api/admin/formations?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", msg: data.error || "Erreur suppression" });
        setTimeout(() => setFeedback(null), 5000);
        return;
      }
      setFeedback({ type: "success", msg: "Formation supprimée" });
      await fetchFormations();
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      console.error(err);
    }
  }

  function handleCancel() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    setError("");
  }

  if (loading) {
    return <div className="text-center py-12 font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: "#1f2244" }}>
            Catalogue des formations
          </h1>
          <p className="text-sm mt-1 font-jetbrains" style={{ color: "#727485" }}>
            Configure le catalogue de formations (paramètres Sellsy + templates Drive)
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/admin/formations/trainers"
            className="px-4 py-2 rounded-full text-sm font-medium border transition-colors cursor-pointer"
            style={{ borderColor: "#1f2244", color: "#1f2244" }}
          >
            👤 Formateurs
          </Link>
          <Link
            href="/admin/formations/parametres-communs"
            className="px-4 py-2 rounded-full text-sm font-medium border transition-colors cursor-pointer"
            style={{ borderColor: "#1f2244", color: "#1f2244" }}
            title="Sellsy · Templates Drive · Questionnaire d'éval à chaud"
          >
            ⚙ Paramètres communs
          </Link>
          <Link
            href="/admin/formations/sessions"
            className="px-4 py-2 rounded-full text-sm font-medium border transition-colors cursor-pointer"
            style={{ borderColor: "#1f2244", color: "#1f2244" }}
          >
            Voir les sessions
          </Link>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 rounded-full text-sm font-medium text-white cursor-pointer"
              style={{ backgroundColor: "#1f2244" }}
            >
              + Nouvelle formation
            </button>
          )}
        </div>
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

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-8 p-6 rounded-lg border space-y-6"
          style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}
        >
          <h2 className="text-xl font-semibold" style={{ color: "#1f2244" }}>
            {editingId ? "Modifier la formation" : "Nouvelle formation"}
          </h2>

          <Section title="Informations générales">
            <Field label="Code (unique)" required>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="vMix-1J"
                className="input"
                required
              />
            </Field>
            <Field label="Nom complet" required>
              <input
                type="text"
                value={form.nomLong}
                onChange={(e) => setForm({ ...form, nomLong: e.target.value })}
                placeholder="Perfectionnement vMix 1 Jour"
                className="input"
                required
              />
            </Field>
            <Field label="Prix HT (€)" required>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.prixHT}
                onChange={(e) => setForm({ ...form, prixHT: e.target.value })}
                className="input"
                required
              />
            </Field>
            <Field label="Durée (jours)" required>
              <input
                type="number"
                min="1"
                value={form.dureeJours}
                onChange={(e) => setForm({ ...form, dureeJours: e.target.value })}
                className="input"
                required
              />
            </Field>
            <Field label="Description / Objectifs de la formation" full>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={6}
                className="input"
                placeholder={`Ex :\nÀ l'issue de la formation, le stagiaire sera capable de :\n— Configurer une régie multicaméra dans vMix\n— Gérer les transitions et l'incrustation en direct\n— Diffuser un live multi-plateformes`}
              />
              <p className="mt-1 text-xs font-jetbrains" style={{ color: "#727485" }}>
                Ce texte est repris dans la convocation à la place de <code>{"{{FORMATION_DESCRIPTION}}"}</code>, et dans le PDF d&apos;évaluation. Soigne-le : c&apos;est ce qui décrit les objectifs pédagogiques aux stagiaires en amont de la formation.
              </p>
            </Field>
            <Field label="Active" full>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                Visible dans le catalogue
              </label>
            </Field>
          </Section>

          <Section title="Configuration Sellsy" hint="Pipeline + step mapping sont gérés globalement dans « Config Sellsy ». Ici on configure ce qui change par formation : service, modèle de devis, code opportunité.">
            <Field label="Service ID (catalogue Sellsy)">
              <input
                type="text"
                value={form.sellsyServiceId}
                onChange={(e) => setForm({ ...form, sellsyServiceId: e.target.value })}
                placeholder="17914075"
                className="input"
              />
            </Field>
            <Field label="ID Modèle de devis">
              <input
                type="text"
                value={form.sellsyEstimateModelId}
                onChange={(e) => setForm({ ...form, sellsyEstimateModelId: e.target.value })}
                placeholder="52588111"
                className="input"
              />
            </Field>
            <Field label="Code opportunité" full>
              <input
                type="text"
                value={form.codeOpportunite}
                onChange={(e) => setForm({ ...form, codeOpportunite: e.target.value })}
                placeholder="VMX1"
                className="input"
              />
            </Field>
          </Section>

          <Section title="Dossiers Drive de la formation" hint="Les templates de documents (convention / contrat / convocation) sont gérés globalement dans « 📄 Templates Drive ». Ici on configure uniquement l'arborescence Drive propre à cette formation.">
            <Field label="Dossier racine FORMATION" full>
              <input
                type="text"
                value={form.driveDossierRacineId}
                onChange={(e) => setForm({ ...form, driveDossierRacineId: e.target.value })}
                placeholder="0ALeGbEg0d77jUk9PVA"
                className="input font-jetbrains text-xs"
              />
            </Field>
            <Field label="Dossier parent des sessions" full>
              <input
                type="text"
                value={form.driveDossierSessionsId}
                onChange={(e) => setForm({ ...form, driveDossierSessionsId: e.target.value })}
                className="input font-jetbrains text-xs"
              />
            </Field>
            <Field
              label="Programme détaillé de la formation (PDF Drive)"
              hint="ID Google Drive du PDF du programme pédagogique, joint automatiquement au mail de devis envoyé au stagiaire."
              full
            >
              <input
                type="text"
                value={form.driveTemplateProgrammeId}
                onChange={(e) => setForm({ ...form, driveTemplateProgrammeId: e.target.value })}
                placeholder="ex: 1abc...XYZ"
                className="input font-jetbrains text-xs"
              />
            </Field>
          </Section>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-full text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#1f2244" }}
            >
              {saving ? "Enregistrement..." : editingId ? "Mettre à jour" : "Créer"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 rounded-full text-sm font-medium border"
              style={{ borderColor: "#d1d5db", color: "#374151" }}
            >
              Annuler
            </button>
          </div>

          <style jsx>{`
            .input {
              width: 100%;
              padding: 0.5rem 0.75rem;
              border: 1px solid #d1d5db;
              border-radius: 0.5rem;
              font-size: 0.875rem;
              background-color: white;
            }
            .input:focus {
              outline: 2px solid #7dcef5;
              outline-offset: 1px;
            }
          `}</style>
        </form>
      )}

      {showForm ? null : formations.length === 0 ? (
        <div className="text-center py-12 border rounded-lg font-jetbrains text-sm" style={{ borderColor: "#e5e7eb", color: "#727485" }}>
          Aucune formation. Crée la première via &laquo; + Nouvelle formation &raquo;.
        </div>
      ) : (
        <div className="space-y-3">
          {formations.map((f) => (
            <FormationRow
              key={f.id}
              formation={f}
              onEdit={() => handleEdit(f)}
              onDelete={() => handleDelete(f.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// =========================================================================
// Ligne formation : 1 carte par formation avec un menu déroulant "Configurer"
// pour regrouper les 5 actions de config Qualiopi (pré-requis, grille éval,
// éval chaud/froid/formateur). Évite l'effet "mur de 8 boutons".
// =========================================================================

function FormationRow({
  formation: f,
  onEdit,
  onDelete,
}: {
  formation: Formation;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Click outside → ferme le menu
  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  // Items du dropdown de config — l'ordre suit la timeline d'une formation
  const configItems: { href: string; icon: string; label: string; hint: string }[] = [
    {
      href: `/admin/formations/${f.id}/prerequis`,
      icon: "📋",
      label: "Pré-requis",
      hint: "Questions du formulaire d'inscription",
    },
    {
      href: `/admin/formations/${f.id}/evaluation-grid`,
      icon: "✅",
      label: "Grille d'évaluation pratique",
      hint: "Exercices + critères notés en formation",
    },
    {
      href: `/admin/formations/${f.id}/satisfaction-config`,
      icon: "📝",
      label: "Éval à chaud (override)",
      hint: "Questionnaire de satisfaction fin de session",
    },
    {
      href: `/admin/formations/${f.id}/trainer-eval-config`,
      icon: "🎓",
      label: "Éval formateur (override)",
      hint: "Fiche satisfaction formateur J+1",
    },
    {
      href: `/admin/formations/${f.id}/cold-eval-config`,
      icon: "🌬",
      label: "Éval à froid (override)",
      hint: "Questionnaire impact 3 mois après",
    },
  ];

  return (
    <div
      className="p-4 rounded-lg border flex items-center justify-between"
      style={{ borderColor: "#e5e7eb" }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="px-2 py-0.5 rounded text-xs font-jetbrains"
            style={{ backgroundColor: "#1f2244", color: "white" }}
          >
            {f.code}
          </span>
          {!f.active && (
            <span className="px-2 py-0.5 rounded text-xs font-jetbrains bg-gray-200 text-gray-600">
              inactive
            </span>
          )}
          <h3 className="font-semibold" style={{ color: "#1f2244" }}>
            {f.nomLong}
          </h3>
        </div>
        <div className="text-sm mt-1 font-jetbrains" style={{ color: "#727485" }}>
          {f.prixHT.toLocaleString("fr-FR")} € HT · {f.dureeJours} jour
          {f.dureeJours > 1 ? "s" : ""}
        </div>
        <div className="text-xs mt-1 flex gap-3 font-jetbrains" style={{ color: "#9ca3af" }}>
          <span>Sellsy: {f.sellsyServiceId ? "ok" : "à configurer"}</span>
          <span>Drive: {f.driveDossierRacineId ? "ok" : "à configurer"}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 ml-4">
        {/* Action primaire : voir les sessions de cette formation */}
        <Link
          href={`/admin/formations/sessions?formationId=${f.id}`}
          className="text-xs px-3 py-1.5 rounded-full text-white cursor-pointer"
          style={{ backgroundColor: "#1f2244" }}
        >
          Sessions →
        </Link>

        {/* Action secondaire : éditer les infos de la formation */}
        <button
          onClick={onEdit}
          className="text-xs px-3 py-1.5 rounded-full cursor-pointer"
          style={{ backgroundColor: "#7dcef5", color: "#1f2244" }}
        >
          Modifier
        </button>

        {/* Menu déroulant Config : regroupe pré-requis / grille / 3 évals */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="text-xs px-3 py-1.5 rounded-full border cursor-pointer flex items-center gap-1"
            style={{ borderColor: "#1f2244", color: "#1f2244" }}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            ⚙ Configurer
            <span className="text-[10px]">{menuOpen ? "▴" : "▾"}</span>
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 z-20 w-72 rounded-xl border shadow-lg overflow-hidden"
              style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}
            >
              {configItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  className="flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors"
                  onClick={() => setMenuOpen(false)}
                >
                  <span className="text-lg leading-none mt-0.5">{item.icon}</span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium" style={{ color: "#1f2244" }}>
                      {item.label}
                    </span>
                    <span className="block text-xs font-jetbrains mt-0.5" style={{ color: "#9ca3af" }}>
                      {item.hint}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Action destructive : discrète, à part visuellement */}
        <button
          onClick={onDelete}
          className="text-xs px-3 py-1.5 rounded-full border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
          title="Supprimer (impossible si des sessions existent)"
        >
          Supprimer
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "#1f2244" }}>
          {title}
        </h3>
        {hint && <p className="text-xs mt-0.5 font-jetbrains" style={{ color: "#727485" }}>{hint}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  full,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  full?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {hint && <p className="text-xs mt-1 font-jetbrains" style={{ color: "#727485" }}>{hint}</p>}
    </div>
  );
}

