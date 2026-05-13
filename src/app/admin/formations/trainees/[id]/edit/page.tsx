"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface TraineeDetail {
  id: string;
  inscriptionType: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  statutActuel: string;
  modeFinancement: string;
  raisonSociale: string;
  siret: string;
  adresseSiege: string;
  domaineActivite: string;
  contactAdmin: string;
  adressePostale: string;
  psh: boolean;
  besoinsAdaptation: string;
  attentes: string;
  formation: { code: string; nomLong: string };
  session: { code: string };
}

const STATUTS_ACTUELS = [
  "Salarié (CDI, CDD)",
  "Intermittent du spectacle",
  "Indépendant / Auto-entrepreneur / Libéral",
  "Demandeur d'emploi",
  "Particulier (Étudiant, autre)",
];

const MODES_FINANCEMENT = [
  "Fonds propres entreprise",
  "AFDAS (Intermittents)",
  "OPCO entreprise",
  "France Travail",
  "Financement personnel",
];

export default function TraineeEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [trainee, setTrainee] = useState<TraineeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    fetch(`/api/admin/trainees/${id}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Stagiaire introuvable");
        }
        return res.json();
      })
      .then((data) => setTrainee(data.trainee))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trainee) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        nom: trainee.nom,
        prenom: trainee.prenom,
        email: trainee.email,
        telephone: trainee.telephone,
        statutActuel: trainee.statutActuel,
        modeFinancement: trainee.modeFinancement,
        raisonSociale: trainee.raisonSociale,
        siret: trainee.siret,
        adresseSiege: trainee.adresseSiege,
        domaineActivite: trainee.domaineActivite,
        contactAdmin: trainee.contactAdmin,
        adressePostale: trainee.adressePostale,
        psh: trainee.psh,
        besoinsAdaptation: trainee.besoinsAdaptation,
        attentes: trainee.attentes,
      };
      const res = await fetch(`/api/admin/trainees/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur");
        return;
      }
      setFeedback({ type: "success", msg: "Fiche mise à jour" });
      setTimeout(() => router.push(`/admin/formations/trainees/${id}`), 800);
    } catch {
      setError("Erreur de connexion");
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof TraineeDetail>(field: K, value: TraineeDetail[K]) {
    setTrainee((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  if (loading) {
    return <div className="text-center py-12 font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  }
  if (error || !trainee) {
    return (
      <div className="text-center py-12">
        <p className="font-jetbrains text-sm" style={{ color: "#727485" }}>{error || "Stagiaire introuvable"}</p>
        <Link href="/admin/formations/sessions" className="mt-4 inline-block underline text-sm" style={{ color: "#1f2244" }}>
          ← Retour
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`/admin/formations/trainees/${id}`}
          className="text-xs font-jetbrains underline"
          style={{ color: "#727485" }}
        >
          ← Fiche stagiaire
        </Link>
        <h1 className="text-3xl font-bold mt-2" style={{ color: "#1f2244" }}>
          Modifier · {trainee.prenom} {trainee.nom}
        </h1>
        <p className="text-sm mt-1 font-jetbrains" style={{ color: "#727485" }}>
          {trainee.formation.nomLong} · session {trainee.session.code}
        </p>
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
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-800 text-sm font-jetbrains">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Section title="Identité et contact">
          <Grid>
            <Field label="Prénom" required>
              <input type="text" value={trainee.prenom} onChange={(e) => update("prenom", e.target.value)} className="input" required />
            </Field>
            <Field label="Nom" required>
              <input type="text" value={trainee.nom} onChange={(e) => update("nom", e.target.value)} className="input" required />
            </Field>
            <Field label="Email" required>
              <input type="email" value={trainee.email} onChange={(e) => update("email", e.target.value)} className="input" required />
            </Field>
            <Field label="Téléphone">
              <input type="tel" value={trainee.telephone} onChange={(e) => update("telephone", e.target.value)} className="input" />
            </Field>
            <Field label="Statut actuel" full>
              <select value={trainee.statutActuel} onChange={(e) => update("statutActuel", e.target.value)} className="input">
                <option value="">—</option>
                {STATUTS_ACTUELS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
          </Grid>
        </Section>

        {trainee.inscriptionType === "entreprise" ? (
          <Section title="Entreprise (facturation)">
            <Grid>
              <Field label="Raison sociale">
                <input type="text" value={trainee.raisonSociale} onChange={(e) => update("raisonSociale", e.target.value)} className="input" />
              </Field>
              <Field label="SIRET">
                <input
                  type="text"
                  value={trainee.siret}
                  onChange={(e) => update("siret", e.target.value)}
                  className="input font-jetbrains"
                />
              </Field>
              <Field label="Adresse du siège" full>
                <input type="text" value={trainee.adresseSiege} onChange={(e) => update("adresseSiege", e.target.value)} className="input" />
              </Field>
              <Field label="Domaine d'activité" full>
                <input type="text" value={trainee.domaineActivite} onChange={(e) => update("domaineActivite", e.target.value)} className="input" />
              </Field>
              <Field label="Contact administratif" hint="Nom, téléphone et email du référent si différent du stagiaire" full>
                <input type="text" value={trainee.contactAdmin} onChange={(e) => update("contactAdmin", e.target.value)} className="input" />
              </Field>
            </Grid>
          </Section>
        ) : (
          <Section title="Particulier (facturation)">
            <Grid>
              <Field label="Adresse postale" full>
                <input type="text" value={trainee.adressePostale} onChange={(e) => update("adressePostale", e.target.value)} className="input" />
              </Field>
            </Grid>
          </Section>
        )}

        <Section title="Financement">
          <Field label="Mode de financement">
            <select value={trainee.modeFinancement} onChange={(e) => update("modeFinancement", e.target.value)} className="input">
              <option value="">—</option>
              {MODES_FINANCEMENT.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title="Accessibilité">
          <div className="space-y-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={trainee.psh}
                onChange={(e) => update("psh", e.target.checked)}
              />
              <span style={{ color: "#1f2244" }}>Situation de handicap signalée</span>
            </label>
            <Field label="Besoins d'adaptation" full>
              <textarea
                value={trainee.besoinsAdaptation}
                onChange={(e) => update("besoinsAdaptation", e.target.value)}
                rows={2}
                className="input"
              />
            </Field>
          </div>
        </Section>

        <Section title="Attentes du stagiaire">
          <textarea
            value={trainee.attentes}
            onChange={(e) => update("attentes", e.target.value)}
            rows={3}
            className="input"
          />
        </Section>

        <div className="flex justify-between gap-2">
          <Link
            href={`/admin/formations/trainees/${id}`}
            className="px-4 py-2 rounded-full text-sm font-medium border cursor-pointer"
            style={{ borderColor: "#d1d5db", color: "#374151" }}
          >
            Annuler
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-full text-sm font-medium text-white cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: "#1f2244" }}
          >
            {saving ? "Enregistrement..." : "Enregistrer les modifications"}
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
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-5 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
      <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: "#1f2244" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>;
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
