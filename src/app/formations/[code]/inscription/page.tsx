"use client";

import { use, useEffect, useState } from "react";
import type { PrerequisField } from "@/lib/formation-prerequis";

interface PublicSession {
  id: string;
  code: string;
  dateDebut: string;
  dateFin: string;
  lieu: string;
  horaires: string;
  capacite: number;
  placesRestantes: number;
}

interface PublicFormation {
  code: string;
  nomLong: string;
  description: string;
  prixHT: number;
  dureeJours: number;
}

const MODES_FINANCEMENT = [
  { value: "Fonds propres entreprise", label: "Fonds propres entreprise (paiement direct par mon employeur)" },
  { value: "AFDAS (Intermittents)", label: "AFDAS (Intermittents) — demande de prise en charge via mes droits de branche" },
  { value: "OPCO entreprise", label: "OPCO dont dépend mon entreprise (AFDAS salarié, Atlas, Akto, etc.)" },
  { value: "France Travail", label: "France Travail (demande d'AIF)" },
  { value: "Financement personnel", label: "Financement personnel (paiement à titre individuel)" },
] as const;

const STATUTS_ACTUELS = [
  "Salarié (CDI, CDD)",
  "Intermittent du spectacle",
  "Indépendant / Auto-entrepreneur / Libéral",
  "Demandeur d'emploi",
  "Particulier (Étudiant, autre)",
] as const;

type ModeFinancement = (typeof MODES_FINANCEMENT)[number]["value"];
type StatutActuel = (typeof STATUTS_ACTUELS)[number];
type PrerequisValue = string | number | boolean;

type FormState = {
  // 1 - Profil + session
  sessionId: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  inscriptionType: "particulier" | "entreprise";
  statutActuel: StatutActuel | "";
  modeFinancement: ModeFinancement | "";

  // 2 - Facturation particulier
  adressePostale: string;

  // 3 - Facturation entreprise
  raisonSociale: string;
  siret: string;
  adresseSiege: string;
  domaineActivite: string;
  contactAdmin: string;

  // 4 - Accessibilité
  psh: boolean;

  // 5 - Adaptations
  aBesoinsAdaptation: boolean;
  besoinsAdaptation: string;

  // 6 - Pré-requis (dynamique)
  prerequis: Record<string, PrerequisValue>;

  // 7 - Consentement RGPD
  consentementRgpd: boolean;
};

const EMPTY_FORM: FormState = {
  sessionId: "",
  nom: "",
  prenom: "",
  email: "",
  telephone: "",
  inscriptionType: "entreprise",
  statutActuel: "",
  modeFinancement: "",
  adressePostale: "",
  raisonSociale: "",
  siret: "",
  adresseSiege: "",
  domaineActivite: "",
  contactAdmin: "",
  psh: false,
  aBesoinsAdaptation: false,
  besoinsAdaptation: "",
  prerequis: {},
  consentementRgpd: false,
};

/**
 * Suggère le mode de financement le plus probable selon le statut + type d'inscription.
 * Retourne "" si aucune recommandation pertinente.
 */
function recommendedFinancement(
  type: "particulier" | "entreprise",
  statut: StatutActuel | ""
): ModeFinancement | "" {
  if (statut === "Intermittent du spectacle") return "AFDAS (Intermittents)";
  if (statut === "Demandeur d'emploi") return "France Travail";
  if (statut === "Particulier (Étudiant, autre)") return "Financement personnel";
  if (statut === "Salarié (CDI, CDD)" && type === "entreprise") return "OPCO entreprise";
  if (statut === "Indépendant / Auto-entrepreneur / Libéral" && type === "entreprise")
    return "Fonds propres entreprise";
  if (type === "particulier") return "Financement personnel";
  return "";
}

function fmtDateFr(s: string) {
  return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

export default function PublicInscriptionPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);

  const [formation, setFormation] = useState<PublicFormation | null>(null);
  const [sessions, setSessions] = useState<PublicSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Lit ?session=<id> côté client (window) — disponible après hydratation.
  // Si la session est valide et ouverte, on la pré-sélectionne au lieu de la première.
  const preselectSessionId =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("session") : null;

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [financementTouched, setFinancementTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<{ opcoDetecte: string | null } | null>(null);
  const [prerequisSchema, setPrerequisSchema] = useState<PrerequisField[]>([]);

  useEffect(() => {
    fetch(`/api/public/formations/${encodeURIComponent(code)}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Formation introuvable");
        }
        return res.json();
      })
      .then((data) => {
        setFormation(data.formation);
        setSessions(data.sessions);
        setPrerequisSchema(Array.isArray(data.prerequisSchema) ? data.prerequisSchema : []);
        if (data.sessions.length > 0) {
          // Si l'URL a un ?session=<id> et que cette session est dans la liste,
          // on la pré-sélectionne. Sinon on prend la première par défaut.
          const fromUrl = preselectSessionId
            ? data.sessions.find((s: PublicSession) => s.id === preselectSessionId)
            : null;
          const chosen = fromUrl ?? data.sessions[0];
          setForm((prev) => ({ ...prev, sessionId: chosen.id }));
        }
      })
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, [code]);

  function setPrerequis(name: string, value: PrerequisValue) {
    setForm((prev) => ({ ...prev, prerequis: { ...prev.prerequis, [name]: value } }));
  }

  // Auto-pré-sélection du financement à chaque changement de statut/type,
  // tant que l'utilisateur n'a pas cliqué manuellement sur une option.
  useEffect(() => {
    if (financementTouched) return;
    const reco = recommendedFinancement(form.inscriptionType, form.statutActuel);
    if (reco && reco !== form.modeFinancement) {
      setForm((prev) => ({ ...prev, modeFinancement: reco }));
    }
  }, [form.inscriptionType, form.statutActuel, form.modeFinancement, financementTouched]);

  const reco = recommendedFinancement(form.inscriptionType, form.statutActuel);

  function validateClientSide(): string | null {
    if (!form.sessionId) return "Choisissez une session";
    if (!form.statutActuel) return "Votre statut actuel est requis";
    if (!form.modeFinancement) return "Mode de financement requis";
    if (!form.consentementRgpd) return "Vous devez accepter le traitement de vos données (RGPD)";

    // Pré-requis required
    for (const field of prerequisSchema) {
      if (!field.required) continue;
      const v = form.prerequis[field.name];
      if (v === undefined || v === "" || v === null) {
        return `Réponse manquante : ${field.label}`;
      }
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clientErr = validateClientSide();
    if (clientErr) {
      setError(clientErr);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setError("");
    setFieldErrors({});
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/inscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        if (Array.isArray(data.issues)) {
          const errs: Record<string, string> = {};
          for (const issue of data.issues) {
            const path = (issue.path || []).join(".");
            if (path) errs[path] = issue.message;
          }
          setFieldErrors(errs);
          setError("Merci de corriger les champs en rouge");
        } else {
          setError(data.error || "Erreur serveur");
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setSuccess({ opcoDetecte: data.opcoDetecte });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Erreur de connexion");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f8fafc" }}>
        <p className="font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</p>
      </div>
    );
  }

  if (loadError || !formation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "#f8fafc" }}>
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold" style={{ color: "#1f2244" }}>Formation indisponible</h1>
          <p className="mt-2 text-sm font-jetbrains" style={{ color: "#727485" }}>
            {loadError || "Cette formation n'existe pas ou n'est plus active."}
          </p>
        </div>
      </div>
    );
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
          <h1 className="text-2xl font-bold" style={{ color: "#1f2244" }}>Inscription envoyée ✓</h1>
          <p className="mt-3 text-sm font-jetbrains" style={{ color: "#727485" }}>
            Merci, votre demande pour la formation « {formation.nomLong} » a bien été reçue.
            Vous recevrez un email de notre équipe sous quelques jours avec le devis et les démarches à suivre.
          </p>
          {success.opcoDetecte && success.opcoDetecte !== "GENERIQUE" && (
            <p className="mt-3 text-xs font-jetbrains" style={{ color: "#9ca3af" }}>
              OPCO identifié automatiquement : <strong>{success.opcoDetecte}</strong>
            </p>
          )}
        </div>
      </div>
    );
  }

  const totalSections = 6;

  return (
    <div className="min-h-screen py-10 px-4" style={{ backgroundColor: "#f8fafc" }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-widest font-jetbrains" style={{ color: "#7dcef5" }}>
            Inscription · {formation.dureeJours} jour{formation.dureeJours > 1 ? "s" : ""} · {formation.prixHT.toLocaleString("fr-FR")} € HT
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold" style={{ color: "#1f2244" }}>
            {formation.nomLong}
          </h1>
          {formation.description && (
            <p className="mt-3 text-sm font-jetbrains max-w-xl mx-auto" style={{ color: "#727485" }}>
              {formation.description}
            </p>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-800 text-sm font-jetbrains">{error}</div>
        )}

        {sessions.length === 0 ? (
          <div className="bg-white rounded-2xl border p-8 text-center" style={{ borderColor: "#e5e7eb" }}>
            <p className="font-jetbrains text-sm" style={{ color: "#727485" }}>
              Aucune session ouverte aux inscriptions pour le moment.
            </p>
            <p className="mt-2 font-jetbrains text-sm" style={{ color: "#727485" }}>
              Contactez-nous pour être informé des prochaines dates.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* === Section 1 : Profil + session + financement === */}
            <Section number={1} total={totalSections} title="Votre profil">
              <div className="space-y-5">
                {/* Session */}
                <div>
                  <Label required>À quelle session souhaitez-vous participer ?</Label>
                  <div className="space-y-2">
                    {sessions.map((s) => (
                      <label
                        key={s.id}
                        className="block p-4 rounded-xl border cursor-pointer transition-all hover:bg-gray-50"
                        style={{
                          borderColor: form.sessionId === s.id ? "#7dcef5" : "#e5e7eb",
                          backgroundColor: form.sessionId === s.id ? "#f0f9ff" : "white",
                        }}
                      >
                        <input
                          type="radio"
                          name="sessionId"
                          value={s.id}
                          checked={form.sessionId === s.id}
                          onChange={() => setForm({ ...form, sessionId: s.id })}
                          className="sr-only"
                        />
                        <div className="flex justify-between items-start gap-2">
                          <div>
                            <div className="font-semibold text-sm" style={{ color: "#1f2244" }}>
                              Du {fmtDateFr(s.dateDebut)} au {fmtDateFr(s.dateFin)}
                            </div>
                            <div className="mt-1 text-xs font-jetbrains" style={{ color: "#727485" }}>
                              {s.lieu || "Lieu à préciser"}
                              {s.horaires && ` · ${s.horaires}`}
                            </div>
                          </div>
                          <span
                            className="text-xs font-jetbrains px-2 py-0.5 rounded-full whitespace-nowrap"
                            style={{
                              backgroundColor: s.placesRestantes > 0 ? "#dcfce7" : "#fee2e2",
                              color: s.placesRestantes > 0 ? "#166534" : "#991b1b",
                            }}
                          >
                            {s.placesRestantes > 0
                              ? `${s.placesRestantes} place${s.placesRestantes > 1 ? "s" : ""}`
                              : "Complète"}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Identité */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Prénom" error={fieldErrors.prenom} required>
                    <input
                      type="text"
                      autoComplete="given-name"
                      value={form.prenom}
                      onChange={(e) => setForm({ ...form, prenom: e.target.value })}
                      placeholder="Marie"
                      className="input"
                      required
                    />
                  </Field>
                  <Field label="Nom de famille" error={fieldErrors.nom} required>
                    <input
                      type="text"
                      autoComplete="family-name"
                      value={form.nom}
                      onChange={(e) => setForm({ ...form, nom: e.target.value })}
                      placeholder="Dupont"
                      className="input"
                      required
                    />
                  </Field>
                  <Field label="Adresse e-mail" error={fieldErrors.email} required>
                    <input
                      type="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="marie.dupont@exemple.fr"
                      className="input"
                      required
                    />
                  </Field>
                  <Field label="Téléphone" error={fieldErrors.telephone} required>
                    <input
                      type="tel"
                      autoComplete="tel"
                      value={form.telephone}
                      onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                      placeholder="06 12 34 56 78"
                      className="input"
                      required
                    />
                  </Field>
                </div>

                {/* Type inscription */}
                <div>
                  <Label required>Vous suivez cette formation à titre</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <TypeOption
                      active={form.inscriptionType === "entreprise"}
                      onClick={() => setForm({ ...form, inscriptionType: "entreprise" })}
                      label="Professionnel"
                      hint="Salarié, indépendant, gérant"
                    />
                    <TypeOption
                      active={form.inscriptionType === "particulier"}
                      onClick={() => setForm({ ...form, inscriptionType: "particulier" })}
                      label="Personnel"
                      hint="Particulier"
                    />
                  </div>
                </div>

                {/* Statut actuel */}
                <div>
                  <Label required>Quel est votre statut actuel ?</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {STATUTS_ACTUELS.map((s) => (
                      <RadioCard
                        key={s}
                        active={form.statutActuel === s}
                        onClick={() => setForm({ ...form, statutActuel: s })}
                        label={s}
                      />
                    ))}
                  </div>
                  {fieldErrors.statutActuel && (
                    <p className="text-xs mt-1 font-jetbrains text-red-600">{fieldErrors.statutActuel}</p>
                  )}
                </div>

                {/* Financement */}
                <div>
                  <Label required>Comment envisagez-vous de financer cette formation ?</Label>
                  <div className="space-y-2">
                    {MODES_FINANCEMENT.map((m) => (
                      <RadioCard
                        key={m.value}
                        active={form.modeFinancement === m.value}
                        onClick={() => {
                          setFinancementTouched(true);
                          setForm({ ...form, modeFinancement: m.value });
                        }}
                        label={m.label}
                        recommended={reco === m.value && !financementTouched}
                      />
                    ))}
                  </div>
                  {fieldErrors.modeFinancement && (
                    <p className="text-xs mt-1 font-jetbrains text-red-600">{fieldErrors.modeFinancement}</p>
                  )}
                  {!financementTouched && reco && (
                    <p className="text-xs mt-2 font-jetbrains" style={{ color: "#727485" }}>
                      Nous avons pré-sélectionné le mode le plus probable pour votre profil. Vous pouvez le modifier.
                    </p>
                  )}
                </div>
              </div>
            </Section>

            {/* === Section 2 : Facturation (contenu varie selon le type) === */}
            <Section
              number={2}
              total={totalSections}
              title={form.inscriptionType === "entreprise" ? "Informations de facturation entreprise" : "Informations de facturation"}
            >
              {form.inscriptionType === "particulier" ? (
                <Field label="Adresse postale complète" error={fieldErrors.adressePostale} required full>
                  <input
                    type="text"
                    value={form.adressePostale}
                    onChange={(e) => setForm({ ...form, adressePostale: e.target.value })}
                    placeholder="Numéro, rue, code postal, ville"
                    className="input"
                  />
                </Field>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Raison sociale" error={fieldErrors.raisonSociale} required>
                    <input type="text" value={form.raisonSociale} onChange={(e) => setForm({ ...form, raisonSociale: e.target.value })} className="input" />
                  </Field>
                  <Field label="Numéro SIRET (14 chiffres)" error={fieldErrors.siret} required>
                    <input
                      type="text"
                      value={form.siret}
                      onChange={(e) => setForm({ ...form, siret: e.target.value })}
                      placeholder="123 456 789 00012"
                      className="input font-jetbrains"
                    />
                  </Field>
                  <Field label="Adresse postale complète du siège" error={fieldErrors.adresseSiege} required full>
                    <input type="text" value={form.adresseSiege} onChange={(e) => setForm({ ...form, adresseSiege: e.target.value })} className="input" />
                  </Field>
                  <Field label="Domaine d'activité" error={fieldErrors.domaineActivite} required full>
                    <input type="text" value={form.domaineActivite} onChange={(e) => setForm({ ...form, domaineActivite: e.target.value })} className="input" />
                  </Field>
                  <Field label="Contact administratif (si différent du stagiaire)" hint="Nom, téléphone et email du référent qui gère le dossier" full>
                    <input
                      type="text"
                      value={form.contactAdmin}
                      onChange={(e) => setForm({ ...form, contactAdmin: e.target.value })}
                      placeholder="Marie Dupont — 06 12 34 56 78 — marie@entreprise.fr"
                      className="input"
                    />
                  </Field>
                </div>
              )}
            </Section>

            {/* === Section 3 : Accessibilité === */}
            <Section number={3} total={totalSections} title="Accessibilité">
              <Label required>Êtes-vous en situation de handicap ?</Label>
              <div className="grid grid-cols-2 gap-2">
                <YesNoOption active={form.psh} onClick={() => setForm({ ...form, psh: true })} label="Oui" />
                <YesNoOption active={!form.psh} onClick={() => setForm({ ...form, psh: false })} label="Non" />
              </div>
            </Section>

            {/* === Section 4 : Aménagements pédagogiques === */}
            <Section number={4} total={totalSections} title="Aménagements pédagogiques">
              <Label required>Souhaitez-vous nous faire part de besoins d&apos;adaptations particulières ? (matériel, durée, accès PMR...)</Label>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <YesNoOption
                  active={form.aBesoinsAdaptation}
                  onClick={() => setForm({ ...form, aBesoinsAdaptation: true })}
                  label="Oui (précisez ci-dessous)"
                />
                <YesNoOption
                  active={!form.aBesoinsAdaptation}
                  onClick={() => setForm({ ...form, aBesoinsAdaptation: false, besoinsAdaptation: "" })}
                  label="Non"
                />
              </div>
              {form.aBesoinsAdaptation && (
                <Field label="Précisions sur vos besoins" error={fieldErrors.besoinsAdaptation} required full>
                  <textarea
                    value={form.besoinsAdaptation}
                    onChange={(e) => setForm({ ...form, besoinsAdaptation: e.target.value })}
                    rows={3}
                    className="input"
                  />
                </Field>
              )}
            </Section>

            {/* === Section 5 : Pré-requis === */}
            <Section number={5} total={totalSections} title="Pré-requis et analyse du besoin">
              <div className="space-y-5">
                {prerequisSchema.map((field) => (
                  <PrerequisRenderer
                    key={field.name}
                    field={field}
                    value={form.prerequis[field.name]}
                    onChange={(v) => setPrerequis(field.name, v)}
                  />
                ))}
              </div>
            </Section>

            {/* === Section 6 : RGPD === */}
            <Section number={6} total={totalSections} title="Protection des données personnelles">
              <p className="text-sm font-jetbrains mb-4" style={{ color: "#727485" }}>
                Les informations recueillies via ce formulaire sont utilisées uniquement dans le cadre du
                traitement de votre demande de formation. Elles ne seront ni cédées ni revendues à des tiers.
                Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès, de rectification et de suppression
                de vos données.
              </p>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.consentementRgpd}
                  onChange={(e) => setForm({ ...form, consentementRgpd: e.target.checked })}
                  className="mt-1"
                  required
                />
                <span className="text-sm" style={{ color: "#1f2244" }}>
                  J&apos;accepte que mes données soient utilisées dans le cadre de ma demande de formation
                  conformément au RGPD. <span className="text-red-500">*</span>
                </span>
              </label>
            </Section>

            <button
              type="submit"
              disabled={submitting || !form.sessionId}
              className="w-full py-3 rounded-full font-semibold text-white disabled:opacity-50 transition-opacity cursor-pointer"
              style={{ backgroundColor: "#1f2244" }}
            >
              {submitting ? "Envoi en cours..." : "Envoyer ma demande d'inscription"}
            </button>

            <p className="text-xs text-center font-jetbrains" style={{ color: "#9ca3af" }}>
              Formation référencée Qualiopi. Vos données sont utilisées uniquement pour le traitement de votre inscription.
            </p>
          </form>
        )}

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

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div className="block text-sm font-medium mb-2" style={{ color: "#1f2244" }}>
      {children}
      {required && <span className="text-red-500"> *</span>}
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  required,
  full,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
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
      {hint && !error && (
        <p className="text-xs mt-1 font-jetbrains" style={{ color: "#9ca3af" }}>{hint}</p>
      )}
      {error && (
        <p className="text-xs mt-1 font-jetbrains text-red-600">{error}</p>
      )}
    </div>
  );
}

function TypeOption({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left p-4 rounded-xl border transition-all cursor-pointer"
      style={{
        borderColor: active ? "#7dcef5" : "#e5e7eb",
        backgroundColor: active ? "#f0f9ff" : "white",
      }}
    >
      <div className="font-semibold text-sm" style={{ color: "#1f2244" }}>{label}</div>
      <div className="mt-1 text-xs font-jetbrains" style={{ color: "#727485" }}>{hint}</div>
    </button>
  );
}

function RadioCard({
  active,
  onClick,
  label,
  recommended,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  recommended?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2"
      style={{
        borderColor: active ? "#7dcef5" : "#e5e7eb",
        backgroundColor: active ? "#f0f9ff" : "white",
      }}
    >
      <span
        className="mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center"
        style={{ borderColor: active ? "#1f2244" : "#cbd5e1" }}
      >
        {active && <span className="block w-2 h-2 rounded-full" style={{ backgroundColor: "#1f2244" }} />}
      </span>
      <span className="flex-1 text-sm flex items-center justify-between gap-2" style={{ color: "#1f2244" }}>
        <span>{label}</span>
        {recommended && (
          <span
            className="text-[10px] uppercase tracking-wide font-jetbrains px-1.5 py-0.5 rounded whitespace-nowrap"
            style={{ backgroundColor: "#dcfce7", color: "#166534" }}
          >
            Recommandé
          </span>
        )}
      </span>
    </button>
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

function PrerequisRenderer({
  field,
  value,
  onChange,
}: {
  field: PrerequisField;
  value: PrerequisValue | undefined;
  onChange: (v: PrerequisValue) => void;
}) {
  if (field.type === "single_choice") {
    return (
      <div>
        <Label required={field.required}>{field.label}</Label>
        <div className="space-y-2">
          {field.options.map((opt) => (
            <label
              key={opt}
              className="block p-3 rounded-xl border cursor-pointer transition-all hover:bg-gray-50"
              style={{
                borderColor: value === opt ? "#7dcef5" : "#e5e7eb",
                backgroundColor: value === opt ? "#f0f9ff" : "white",
              }}
            >
              <input
                type="radio"
                name={field.name}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                className="sr-only"
              />
              <span className="text-sm" style={{ color: "#1f2244" }}>{opt}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }
  if (field.type === "yes_no") {
    return (
      <div>
        <Label required={field.required}>{field.label}</Label>
        <div className="grid grid-cols-2 gap-2">
          <YesNoOption active={value === true} onClick={() => onChange(true)} label="Oui" />
          <YesNoOption active={value === false} onClick={() => onChange(false)} label="Non" />
        </div>
      </div>
    );
  }
  if (field.type === "scale_1_5") {
    return (
      <div>
        <Label required={field.required}>{field.label}</Label>
        <div className="flex items-center gap-3">
          <span className="text-xs font-jetbrains w-32 text-right" style={{ color: "#727485" }}>{field.leftLabel}</span>
          <div className="flex-1 grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                className="aspect-square rounded-full border transition-all cursor-pointer text-sm font-jetbrains font-semibold"
                style={{
                  borderColor: value === n ? "#7dcef5" : "#e5e7eb",
                  backgroundColor: value === n ? "#7dcef5" : "white",
                  color: value === n ? "#1f2244" : "#727485",
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <span className="text-xs font-jetbrains w-32" style={{ color: "#727485" }}>{field.rightLabel}</span>
        </div>
      </div>
    );
  }
  if (field.type === "textarea") {
    return (
      <div>
        <Label required={field.required}>{field.label}</Label>
        <textarea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={field.placeholder}
          className="w-full px-3 py-2 border rounded-xl text-sm"
          style={{ borderColor: "#d1d5db", backgroundColor: "white" }}
        />
      </div>
    );
  }
  // type === "text"
  return (
    <div>
      <Label required={field.required}>{field.label}</Label>
      <input
        type="text"
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="w-full px-3 py-2 border rounded-xl text-sm"
        style={{ borderColor: "#d1d5db", backgroundColor: "white" }}
      />
    </div>
  );
}
