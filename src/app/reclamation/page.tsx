"use client";

// Formulaire public de réclamation — Qualiopi indicateur 32.
// Accessible à tous, sans authentification. Le réclamant saisit ses
// coordonnées + l'objet + la description. Engagement de traitement sous 30 j.

import { useState } from "react";
import { ApiError, apiFetch, apiErrorMessage } from "@/lib/api-client";

interface FormState {
  authorName: string;
  authorCompany: string;
  authorRole: string;
  authorEmail: string;
  concernedSelf: boolean;     // "C'est moi qui suis concerné(e)"
  concernedName: string;
  concernedCompany: string;
  concernedRole: string;
  subject: string;
  description: string;
}

const EMPTY: FormState = {
  authorName: "",
  authorCompany: "",
  authorRole: "",
  authorEmail: "",
  concernedSelf: true,
  concernedName: "",
  concernedCompany: "",
  concernedRole: "",
  subject: "",
  description: "",
};

export default function PublicComplaintPage() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ number: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Validation minimale côté client (le serveur revalide)
    if (!form.authorName.trim()) {
      setError("Votre nom est requis");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (!form.authorEmail.trim() || !form.authorEmail.includes("@")) {
      setError("Une adresse email valide est requise");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (form.subject.trim().length < 3) {
      setError("L'objet de la réclamation doit faire au moins 3 caractères");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (form.description.trim().length < 20) {
      setError("Merci de décrire plus précisément la situation (au moins 20 caractères)");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setSubmitting(true);
    try {
      const data = await apiFetch<{ number: string }>("/api/public/reclamations", {
        method: "POST",
        body: {
          authorName: form.authorName,
          authorCompany: form.authorCompany,
          authorRole: form.authorRole,
          authorEmail: form.authorEmail,
          // Si "c'est moi qui suis concerné", on ne renvoie pas les champs concerned*
          concernedName: form.concernedSelf ? "" : form.concernedName,
          concernedCompany: form.concernedSelf ? "" : form.concernedCompany,
          concernedRole: form.concernedSelf ? "" : form.concernedRole,
          subject: form.subject,
          description: form.description,
        },
      });
      setSuccess({ number: data.number });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      // Erreurs de validation zod : le serveur renvoie un tableau issues
      const issues =
        err instanceof ApiError && typeof err.data === "object" && err.data !== null && "issues" in err.data
          ? (err.data as { issues?: Array<{ message: string }> }).issues
          : undefined;
      if (Array.isArray(issues) && issues.length > 0) {
        setError(issues[0].message);
      } else {
        setError(apiErrorMessage(err, "Erreur de connexion"));
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "#f8fafc" }}>
        <div className="max-w-xl bg-white rounded-2xl shadow-sm border p-8 text-center" style={{ borderColor: "#e5e7eb" }}>
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: "#dcfce7" }}>
            <svg className="w-8 h-8" fill="none" stroke="#166534" strokeWidth="3" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: "#1f2244" }}>Réclamation enregistrée ✓</h1>
          <p className="mt-3 text-sm font-jetbrains" style={{ color: "#727485" }}>
            Votre réclamation a été reçue et sera traitée par notre équipe.
            <br/><br/>Référence :{" "}
            <code
              className="inline-block px-2 py-1 rounded font-jetbrains"
              style={{ backgroundColor: "#1f2244", color: "white" }}
            >
              {success.number}
            </code>
          </p>
          <p className="mt-4 text-xs font-jetbrains px-4 py-3 rounded-lg" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
            <strong>Engagement Les Ateliers du Stream :</strong> nous traiterons votre
            réclamation sous <strong>30 jours maximum</strong>. Un accusé de réception
            vous a été envoyé par email.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-10 px-4" style={{ backgroundColor: "#f8fafc" }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-widest font-jetbrains" style={{ color: "#7dcef5" }}>
            Les Ateliers du Stream · Organisme de formation
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold" style={{ color: "#1f2244" }}>
            Formulaire de réclamation
          </h1>
          <p className="mt-3 text-sm font-jetbrains max-w-xl mx-auto" style={{ color: "#727485" }}>
            Vous souhaitez nous signaler un dysfonctionnement concernant l&apos;une de nos prestations
            de formation ? Nous sommes à votre écoute.
          </p>
        </div>

        {/* Bannière engagement */}
        <div className="mb-6 p-4 rounded-xl border flex items-start gap-3" style={{ borderColor: "#fde68a", backgroundColor: "#fffbeb" }}>
          <span className="text-xl mt-0.5">⏱</span>
          <p className="text-sm font-jetbrains" style={{ color: "#92400e" }}>
            <strong>Engagement :</strong> nous nous engageons à traiter chaque réclamation
            sous <strong>30 jours maximum</strong>. Vous recevrez un mail de retour avec
            notre analyse et les actions mises en place.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-800 text-sm font-jetbrains">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* === Section 1 : auteur === */}
          <Section number={1} total={3} title="Vos coordonnées">
            <p className="text-xs font-jetbrains mb-4" style={{ color: "#727485" }}>
              La personne qui exprime la réclamation. Nous vous adresserons un accusé
              de réception puis notre réponse par email.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nom et prénom" required>
                <input
                  type="text"
                  value={form.authorName}
                  onChange={(e) => setForm({ ...form, authorName: e.target.value })}
                  placeholder="Marie Dupont"
                  className="input"
                  required
                />
              </Field>
              <Field label="Adresse email" required>
                <input
                  type="email"
                  value={form.authorEmail}
                  onChange={(e) => setForm({ ...form, authorEmail: e.target.value })}
                  placeholder="marie.dupont@exemple.fr"
                  className="input"
                  required
                />
              </Field>
              <Field label="Entreprise (si applicable)">
                <input
                  type="text"
                  value={form.authorCompany}
                  onChange={(e) => setForm({ ...form, authorCompany: e.target.value })}
                  placeholder="ACME Production"
                  className="input"
                />
              </Field>
              <Field label="Fonction occupée">
                <input
                  type="text"
                  value={form.authorRole}
                  onChange={(e) => setForm({ ...form, authorRole: e.target.value })}
                  placeholder="Responsable formation"
                  className="input"
                />
              </Field>
            </div>
          </Section>

          {/* === Section 2 : personne concernée === */}
          <Section number={2} total={3} title="Personne concernée par la réclamation">
            <p className="text-xs font-jetbrains mb-4" style={{ color: "#727485" }}>
              Êtes-vous vous-même la personne directement concernée par la réclamation,
              ou réclamez-vous au nom de quelqu&apos;un d&apos;autre (par exemple un salarié
              que vous avez inscrit) ?
            </p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <YesNoOption
                active={form.concernedSelf}
                onClick={() => setForm({ ...form, concernedSelf: true })}
                label="C'est moi"
              />
              <YesNoOption
                active={!form.concernedSelf}
                onClick={() => setForm({ ...form, concernedSelf: false })}
                label="Quelqu'un d'autre"
              />
            </div>
            {!form.concernedSelf && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <Field label="Nom et prénom de la personne concernée" required>
                  <input
                    type="text"
                    value={form.concernedName}
                    onChange={(e) => setForm({ ...form, concernedName: e.target.value })}
                    placeholder="Paul Martin"
                    className="input"
                    required={!form.concernedSelf}
                  />
                </Field>
                <Field label="Entreprise">
                  <input
                    type="text"
                    value={form.concernedCompany}
                    onChange={(e) => setForm({ ...form, concernedCompany: e.target.value })}
                    className="input"
                  />
                </Field>
                <Field label="Fonction occupée" full>
                  <input
                    type="text"
                    value={form.concernedRole}
                    onChange={(e) => setForm({ ...form, concernedRole: e.target.value })}
                    placeholder="Technicien vidéo"
                    className="input"
                  />
                </Field>
              </div>
            )}
          </Section>

          {/* === Section 3 : réclamation === */}
          <Section number={3} total={3} title="Votre réclamation">
            <Field label="Objet précis de la réclamation" required full>
              <input
                type="text"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Ex : matériel défectueux pendant la formation vMix"
                className="input"
                required
                maxLength={150}
              />
            </Field>
            <Field
              label="Description détaillée"
              hint="Décrivez le dysfonctionnement : date, lieu, intervenants, conditions de survenue… Plus c'est précis, plus on peut vous aider."
              required
              full
            >
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={8}
                className="input"
                placeholder={`Exemple : Lors de la session du 12 mai, le poste de travail n°3 n'était pas correctement configuré (vMix non installé). Cela a entraîné une perte d'environ 30 minutes en début de matinée pour le diagnostic, et m'a empêché de suivre les exercices pratiques sur ce poste.`}
                required
                minLength={20}
              />
            </Field>
          </Section>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-full font-semibold text-white disabled:opacity-50 transition-opacity cursor-pointer"
            style={{ backgroundColor: "#1f2244" }}
          >
            {submitting ? "Envoi en cours..." : "Envoyer ma réclamation"}
          </button>

          <p className="text-xs text-center font-jetbrains" style={{ color: "#9ca3af" }}>
            Vos données sont utilisées uniquement pour le traitement de votre réclamation,
            conformément au RGPD.
          </p>
        </form>

        {/* Footer mentions légales */}
        <div className="mt-10 text-center text-xs font-jetbrains" style={{ color: "#9ca3af" }}>
          Les Ateliers du Stream — Organisme de formation professionnelle continue<br/>
          NDA N°75470196847 — formation@lesateliersdustream.fr
        </div>

        <style jsx>{`
          .input {
            width: 100%;
            padding: 0.625rem 0.875rem;
            border: 1px solid #d1d5db;
            border-radius: 0.625rem;
            font-size: 0.9rem;
            background-color: white;
            transition: border-color 0.15s, box-shadow 0.15s;
          }
          .input:focus {
            outline: none;
            border-color: #7dcef5;
            box-shadow: 0 0 0 3px rgba(125, 206, 245, 0.2);
          }
        `}</style>
      </div>
    </div>
  );
}

function Section({
  number,
  total,
  title,
  children,
}: {
  number: number;
  total: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border p-6 shadow-sm" style={{ borderColor: "#e5e7eb" }}>
      <div className="mb-4">
        <p className="text-xs uppercase tracking-widest font-jetbrains" style={{ color: "#9ca3af" }}>
          Étape {number} / {total}
        </p>
        <h2 className="text-lg font-semibold mt-0.5" style={{ color: "#1f2244" }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  required,
  full,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {hint && (
        <p className="text-xs mt-1 font-jetbrains" style={{ color: "#9ca3af" }}>{hint}</p>
      )}
    </div>
  );
}

function YesNoOption({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-center py-3 rounded-xl border transition-all cursor-pointer text-sm font-medium"
      style={{
        borderColor: active ? "#7dcef5" : "#e5e7eb",
        backgroundColor: active ? "#f0f9ff" : "white",
        color: "#1f2244",
      }}
    >
      {label}
    </button>
  );
}
