"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Templates {
  convention?: string;
  contrat?: string;
  convocation?: string;
}

export default function DriveConfigPage() {
  const [templates, setTemplates] = useState<Templates>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/drive-config")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setTemplates(d.templates ?? {});
      })
      .catch(() => setError("Erreur de chargement"))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/drive-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templates }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur");
        return;
      }
      setTemplates(data.templates ?? {});
      setFeedback({ type: "success", msg: "Templates Drive par défaut enregistrés" });
      setTimeout(() => setFeedback(null), 4000);
    } catch {
      setError("Erreur de connexion");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-center py-12 font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  }

  return (
    <div>
      <div className="mb-8">
        <Link href="/admin/formations" className="text-xs font-jetbrains underline" style={{ color: "#727485" }}>
          ← Catalogue
        </Link>
        <h1 className="text-3xl font-bold mt-2" style={{ color: "#1f2244" }}>
          Templates Drive par défaut
        </h1>
        <p className="text-sm mt-1 font-jetbrains" style={{ color: "#727485" }}>
          Ces templates sont utilisés <strong>par défaut</strong> quand une formation n&apos;a pas son
          propre template configuré. Pratique pour partager une convocation / convention commune entre
          toutes tes formations, tout en gardant la possibilité d&apos;en surcharger une formation
          spécifique au cas où.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg text-sm font-jetbrains bg-red-50 text-red-800">
          {error}
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

      <div className="space-y-5 p-5 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
        <TemplateField
          label="Convention (Doc)"
          value={templates.convention ?? ""}
          onChange={(v) => setTemplates({ ...templates, convention: v })}
          help="ID Google Doc utilisé par défaut pour générer les conventions de formation."
        />
        <TemplateField
          label="Contrat (Doc)"
          value={templates.contrat ?? ""}
          onChange={(v) => setTemplates({ ...templates, contrat: v })}
          help="ID Google Doc utilisé par défaut pour générer les contrats de formation."
        />
        <TemplateField
          label="Convocation (Doc)"
          value={templates.convocation ?? ""}
          onChange={(v) => setTemplates({ ...templates, convocation: v })}
          help="ID Google Doc utilisé par défaut pour générer les convocations."
        />
        <div className="pt-2 flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-full text-sm font-medium text-white cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: "#1f2244" }}
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
          <Link
            href="/admin/formations"
            className="px-4 py-2 rounded-full text-sm font-medium border"
            style={{ borderColor: "#d1d5db", color: "#374151" }}
          >
            Annuler
          </Link>
        </div>
      </div>

      <div className="mt-6 p-4 rounded-xl text-xs font-jetbrains" style={{ backgroundColor: "#fafbff", color: "#727485" }}>
        <p>
          <strong style={{ color: "#1f2244" }}>Comment trouver l&apos;ID d&apos;un Google Doc</strong> : ouvre le doc dans Drive, regarde l&apos;URL :{" "}
          <code>docs.google.com/document/d/<strong>ID_ICI</strong>/edit</code>
        </p>
        <p className="mt-2">
          <strong style={{ color: "#1f2244" }}>Quand utiliser quoi ?</strong> Pour un stagiaire en
          {" "}<strong>entreprise</strong> (employeur paye), on génère une <strong>convention</strong> (signée OF + employeur).
          Pour un stagiaire <strong>particulier</strong> (intermittent, indépendant, personne physique payant à titre individuel), on génère un <strong>contrat</strong> (article L.6353-3 du Code du travail).
          La convocation est toujours utile pour rappeler les modalités pratiques.
        </p>
      </div>

      {/* Variables disponibles */}
      <div className="mt-4 p-4 rounded-xl text-xs font-jetbrains" style={{ backgroundColor: "#fafbff", color: "#727485" }}>
        <strong style={{ color: "#1f2244" }}>Variables disponibles dans les templates</strong>.
        Utilise la syntaxe <code>{"{{NOM_VARIABLE}}"}</code> (double accolades) dans tes Google Doc.
        Lors de la génération pour un stagiaire, elles sont remplacées par les valeurs réelles.
        <details className="mt-2 cursor-pointer" open>
          <summary className="cursor-pointer" style={{ color: "#1f2244" }}>Voir la liste complète (34 variables)</summary>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1 max-h-96 overflow-y-auto pr-2">
            {[
              ["PRENOM", "Prénom du stagiaire"],
              ["NOM", "Nom du stagiaire"],
              ["NOM_COMPLET", "Prénom + Nom"],
              ["EMAIL", "Email du stagiaire"],
              ["TELEPHONE", "Téléphone du stagiaire"],
              ["ADRESSE", "Adresse postale (particulier) ou siège (entreprise)"],
              ["STATUT", "Statut actuel (intermittent, salarié, DE...)"],
              ["SOCIETE", "Raison sociale (vide si particulier)"],
              ["SIRET", "SIRET de la société"],
              ["ADRESSE_SIEGE", "Adresse du siège"],
              ["CONTACT_ADMIN", "Référent admin"],
              ["DOMAINE_ACTIVITE", "Domaine d'activité"],
              ["FORMATION", "Libellé long de la formation"],
              ["FORMATION_CODE", "Code interne"],
              ["FORMATION_DUREE_JOURS", "Durée (jours)"],
              ["FORMATION_DUREE_HEURES", "Durée (heures, = jours × 7)"],
              ["FORMATION_PRIX_HT", "Prix HT catalogue"],
              ["PRIX_HT", "Montant HT facturé (négocié si défini, sinon catalogue)"],
              ["PRIX_TTC", "Idem PRIX_HT × 1.2 (TVA 20%)"],
              ["FORMATION_DESCRIPTION", "Description / objectifs"],
              ["SESSION_CODE", "Code de la session"],
              ["SESSION_DATE_DEBUT", "Date début (jour mois année)"],
              ["SESSION_DATE_FIN", "Date fin"],
              ["SESSION_DATES", "Période formatée (intelligent)"],
              ["SESSION_LIEU", "Lieu"],
              ["SESSION_HORAIRES", "Horaires"],
              ["SESSION_CAPACITE", "Effectif max (config par session, défaut 8)"],
              ["FORMATEUR_NOM", "Formateur (prénom + nom)"],
              ["FORMATEUR_EMAIL", "Email formateur"],
              ["MODE_FINANCEMENT", "Mode de financement"],
              ["OPCO", "OPCO détecté"],
              ["ID_OPCO", "N° dossier OPCO"],
              ["MONTANT_HT", "Montant HT négocié"],
              ["PSH", "« Oui » si PSH, vide sinon"],
              ["BESOINS_ADAPTATION", "Besoins d'adaptation"],
              ["DATE_AUJOURDHUI", "Date du jour de génération"],
              ["ORGANISME", "Nom de l'organisme (LADS)"],
            ].map(([k, desc]) => (
              <div key={k} className="flex items-baseline gap-2">
                <code style={{ color: "#1f2244" }}>{`{{${k}}}`}</code>
                <span className="text-[10px]" style={{ color: "#9ca3af" }}>{desc}</span>
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}

function TemplateField({
  label,
  value,
  onChange,
  help,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  help: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Coller l'ID du Google Doc (ex : 1dR3806BnGR58SuO_p2zstNWCCRk4SA4V0lAdX1-R80s)"
        className="w-full px-3 py-2 rounded-lg border text-xs font-jetbrains"
        style={{ borderColor: "#e5e7eb", color: "#1f2244" }}
      />
      <p className="mt-1 text-xs font-jetbrains" style={{ color: "#727485" }}>
        {help}
      </p>
    </div>
  );
}
