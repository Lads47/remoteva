"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PrerequisField } from "@/lib/formation-prerequis";
import TraineeStatusDropdown from "@/components/TraineeStatusDropdown";

interface TraineeEvent {
  id: string;
  type: string;
  message: string;
  payload: string;
  createdAt: string;
}

interface TraineeDocument {
  id: string;
  type: string;
  fileName: string;
  driveFileId: string;
  driveFileUrl: string;
  generatedAt: string;
  sentAt: string | null;
  signedAt: string | null;
}

interface TraineeDetail {
  id: string;
  sessionId: string;
  status: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  inscriptionType: string;
  raisonSociale: string;
  siret: string;
  adresseSiege: string;
  domaineActivite: string;
  contactAdmin: string;
  adressePostale: string;
  statutActuel: string;
  modeFinancement: string;
  opcoDetecte: string;
  psh: boolean;
  besoinsAdaptation: string;
  evalEntree: string;
  attentes: string;
  sellsyCompanyId: number | null;
  sellsyIndividualId: number | null;
  sellsyOpportunityId: number | null;
  sellsyEstimateId: number | null;
  driveFolderId: string | null;
  createdAt: string;
  updatedAt: string;
  session: {
    id: string;
    code: string;
    dateDebut: string;
    dateFin: string;
    lieu: string;
    horaires: string;
    status: string;
  };
  formation: {
    id: string;
    code: string;
    nomLong: string;
    configForm: string;
    hasTemplateConvention: boolean;
    hasTemplateContrat: boolean;
    hasTemplateConvocation: boolean;
  };
  events: TraineeEvent[];
  documents: TraineeDocument[];
}

const STATUS_LABELS: Record<string, string> = {
  inscrit: "Inscrit",
  devis_envoye: "Devis envoyé",
  devis_signe: "Devis signé",
  convention_envoyee: "Convention envoyée",
  convention_signee: "Convention signée",
  valide: "Validé",
  convoque: "Convoqué",
  en_formation: "En formation",
  termine: "Terminé",
  abandonne: "Abandonné",
};

const EVENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  status_change: { label: "Changement de statut", color: "#3730a3" },
  rgpd_consent: { label: "Consentement RGPD", color: "#166534" },
  opco_detected: { label: "Détection OPCO", color: "#92400e" },
  email_sent: { label: "Email envoyé", color: "#166534" },
  email_failed: { label: "Échec email", color: "#991b1b" },
  note: { label: "Note", color: "#727485" },
};

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}
function fmtDateTime(s: string) {
  return new Date(s).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function TraineeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [trainee, setTrainee] = useState<TraineeDetail | null>(null);
  const [prerequisSchema, setPrerequisSchema] = useState<PrerequisField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [docFeedback, setDocFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  async function refresh() {
    const res = await fetch(`/api/admin/trainees/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setTrainee(data.trainee);
    setPrerequisSchema(Array.isArray(data.prerequisSchema) ? data.prerequisSchema : []);
  }

  useEffect(() => {
    fetch(`/api/admin/trainees/${id}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Stagiaire introuvable");
        }
        return res.json();
      })
      .then((data) => {
        setTrainee(data.trainee);
        setPrerequisSchema(Array.isArray(data.prerequisSchema) ? data.prerequisSchema : []);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleGenerateDoc(type: "convention" | "contrat" | "convocation") {
    if (!trainee || generating) return;
    setGenerating(type);
    setDocFeedback(null);
    try {
      const res = await fetch(`/api/admin/trainees/${id}/generate-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setDocFeedback({ type: "error", msg: data.error || "Échec de la génération" });
        return;
      }
      setDocFeedback({
        type: "success",
        msg: `${data.fileName} généré ✓`,
      });
      await refresh();
    } catch {
      setDocFeedback({ type: "error", msg: "Erreur réseau" });
    } finally {
      setGenerating(null);
      setTimeout(() => setDocFeedback(null), 8000);
    }
  }

  async function handleSendDevis() {
    if (!trainee) return;
    if (!confirm(`Créer la fiche Sellsy + l'opportunité + le devis pour ${trainee.prenom} ${trainee.nom}, et lui envoyer le devis par email ?`)) {
      return;
    }
    setActionLoading(true);
    setActionFeedback(null);
    try {
      const res = await fetch(`/api/admin/trainees/${id}/send-devis`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setActionFeedback({ type: "error", msg: data.error || "Erreur" });
        return;
      }
      setActionFeedback({
        type: "success",
        msg: data.emailSent
          ? "Devis créé dans Sellsy et envoyé par email au stagiaire ✓"
          : "Devis créé dans Sellsy, mais l'envoi du mail a échoué — vérifie les logs.",
      });
      await refresh();
    } catch {
      setActionFeedback({ type: "error", msg: "Erreur de connexion" });
    } finally {
      setActionLoading(false);
    }
  }

  const prerequisAnswers = useMemo<Record<string, unknown>>(() => {
    if (!trainee) return {};
    try {
      return JSON.parse(trainee.evalEntree || "{}");
    } catch {
      return {};
    }
  }, [trainee]);

  if (loading) {
    return <div className="text-center py-12 font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  }
  if (error || !trainee) {
    return (
      <div className="text-center py-12">
        <p className="font-jetbrains text-sm" style={{ color: "#727485" }}>{error || "Stagiaire introuvable"}</p>
        <Link href="/admin/formations/sessions" className="mt-4 inline-block underline text-sm" style={{ color: "#1f2244" }}>
          ← Retour aux sessions
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link
            href={`/admin/formations/sessions/${trainee.session.id}`}
            className="text-xs font-jetbrains underline"
            style={{ color: "#727485" }}
          >
            ← Session {trainee.session.code}
          </Link>
          <div className="flex items-center gap-3 flex-wrap mt-2">
            <span
              className="px-2 py-0.5 rounded text-xs font-jetbrains"
              style={{ backgroundColor: "#e0e7ff", color: "#3730a3" }}
            >
              {STATUS_LABELS[trainee.status] ?? trainee.status}
            </span>
            {trainee.psh && (
              <span
                className="px-2 py-0.5 rounded text-xs font-jetbrains"
                style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
              >
                PSH
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold mt-1" style={{ color: "#1f2244" }}>
            {trainee.prenom} {trainee.nom}
          </h1>
          <p className="text-sm mt-1 font-jetbrains" style={{ color: "#727485" }}>
            {trainee.formation.nomLong} · session du {fmtDate(trainee.session.dateDebut)} au{" "}
            {fmtDate(trainee.session.dateFin)}
          </p>
        </div>
        <div className="flex flex-col gap-2 items-end mt-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-jetbrains" style={{ color: "#727485" }}>
              Statut :
            </label>
            <TraineeStatusDropdown
              traineeId={trainee.id}
              currentStatus={trainee.status}
              hasSellsyOpportunity={!!trainee.sellsyOpportunityId}
              onChanged={() => refresh()}
              onFeedback={(msg) => {
                setActionFeedback({ type: msg.type, msg: msg.text });
                setTimeout(() => setActionFeedback(null), msg.type === "error" ? 7000 : 5000);
              }}
            />
          </div>
          <Link
            href={`/admin/formations/trainees/${trainee.id}/edit`}
            className="text-xs px-3 py-1.5 rounded-full border cursor-pointer"
            style={{ borderColor: "#1f2244", color: "#1f2244" }}
          >
            Modifier
          </Link>
        </div>
      </div>

      {/* Bandeau d'action — uniquement si statut = inscrit */}
      {trainee.status === "inscrit" && (
        <div className="p-5 rounded-xl border flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: "#fde68a", backgroundColor: "#fffbeb" }}>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold" style={{ color: "#92400e" }}>
              Prochaine étape : envoyer le devis
            </div>
            <div className="text-xs mt-0.5 font-jetbrains" style={{ color: "#b45309" }}>
              Crée la fiche {trainee.inscriptionType === "entreprise" ? "entreprise" : "particulier"} dans Sellsy,
              ajoute l&apos;opportunité, génère le devis et l&apos;envoie au stagiaire par mail (avec PDF en pièce jointe).
            </div>
          </div>
          <button
            onClick={handleSendDevis}
            disabled={actionLoading}
            className="px-4 py-2 rounded-full text-sm font-medium text-white cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: "#1f2244" }}
          >
            {actionLoading ? "Création en cours..." : "Envoyer le devis"}
          </button>
        </div>
      )}
      {trainee.status !== "inscrit" && trainee.sellsyEstimateId && (
        <div className="p-3 rounded-lg border text-sm font-jetbrains flex items-center gap-2" style={{ borderColor: "#dcfce7", backgroundColor: "#f0fdf4", color: "#166534" }}>
          ✓ Devis Sellsy <strong>#{trainee.sellsyEstimateId}</strong> envoyé. Opportunité Sellsy : #{trainee.sellsyOpportunityId}.
        </div>
      )}
      {actionFeedback && (
        <div
          className={`p-3 rounded-lg text-sm font-jetbrains ${
            actionFeedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {actionFeedback.msg}
        </div>
      )}

      {/* Documents administratifs */}
      <div className="p-5 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "#1f2244" }}>
            Documents administratifs
          </h2>
          <span className="text-xs font-jetbrains" style={{ color: "#727485" }}>
            {trainee.documents?.length ?? 0} document{(trainee.documents?.length ?? 0) > 1 ? "s" : ""} généré{(trainee.documents?.length ?? 0) > 1 ? "s" : ""}
          </span>
        </div>
        <p className="text-xs font-jetbrains mb-3" style={{ color: "#727485" }}>
          Génère le document depuis le template Google Doc défini globalement dans
          {" "}<Link href="/admin/formations/parametres-communs/drive" className="underline" style={{ color: "#1f2244" }}>« Templates Drive »</Link>.
          Les variables <code>{"{{NOM}}"}</code>, <code>{"{{FORMATION}}"}</code>, <code>{"{{SESSION_DATES}}"}</code>... sont remplacées automatiquement.
          Le fichier est archivé dans <code>01_INSCRIPTIONS_CONVENTIONS / {trainee.prenom} {trainee.nom}</code> sur Drive.
          {trainee.inscriptionType === "entreprise" ? (
            <> Stagiaire inscrit en <strong>entreprise</strong> : une <strong>convention de formation</strong> (signée OF + employeur) est requise.</>
          ) : (
            <> Stagiaire inscrit en <strong>particulier</strong> : un <strong>contrat de formation</strong> (signé OF + stagiaire individuel, L.6353-3 du Code du travail) est requis.</>
          )}
        </p>
        <div className="flex gap-2 flex-wrap mb-3">
          {trainee.inscriptionType === "entreprise" ? (
            <DocGenerateButton
              label="Convention"
              available={trainee.formation.hasTemplateConvention}
              disabled={generating !== null}
              loading={generating === "convention"}
              onClick={() => handleGenerateDoc("convention")}
            />
          ) : (
            <DocGenerateButton
              label="Contrat"
              available={trainee.formation.hasTemplateContrat}
              disabled={generating !== null}
              loading={generating === "contrat"}
              onClick={() => handleGenerateDoc("contrat")}
            />
          )}
          <DocGenerateButton
            label="Convocation"
            available={trainee.formation.hasTemplateConvocation}
            disabled={generating !== null}
            loading={generating === "convocation"}
            onClick={() => handleGenerateDoc("convocation")}
          />
        </div>
        {docFeedback && (
          <div
            className={`p-2.5 mb-3 rounded-lg text-xs font-jetbrains ${
              docFeedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
            }`}
          >
            {docFeedback.msg}
          </div>
        )}
        {trainee.documents && trainee.documents.length > 0 ? (
          <div className="space-y-1.5">
            {trainee.documents.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-lg border flex-wrap"
                style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-jetbrains text-xs" style={{ color: "#1f2244" }}>
                    <strong>{d.fileName}</strong>
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>
                    {d.type} · généré le {fmtDateTime(d.generatedAt)}
                    {d.sentAt && ` · envoyé le ${fmtDateTime(d.sentAt)}`}
                    {d.signedAt && ` · signé le ${fmtDateTime(d.signedAt)}`}
                  </div>
                </div>
                {d.driveFileUrl && (
                  <a
                    href={d.driveFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs px-3 py-1 rounded-full border cursor-pointer"
                    style={{ borderColor: "#1f2244", color: "#1f2244" }}
                  >
                    Ouvrir dans Drive ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs font-jetbrains italic" style={{ color: "#9ca3af" }}>
            Aucun document généré pour ce stagiaire.
          </p>
        )}

        <UploadSignedForm
          traineeId={trainee.id}
          onUploaded={refresh}
        />
      </div>

      {/* Identité */}
      <Section title="Identité et contact">
        <Grid>
          <Info label="Email" value={trainee.email} mono />
          <Info label="Téléphone" value={trainee.telephone || "—"} mono />
          <Info label="Statut actuel" value={trainee.statutActuel || "—"} />
          <Info label="Inscrit le" value={fmtDateTime(trainee.createdAt)} mono />
        </Grid>
      </Section>

      {/* Type inscription + Facturation */}
      {trainee.inscriptionType === "entreprise" ? (
        <Section title="Inscription — Entreprise">
          <Grid>
            <Info label="Raison sociale" value={trainee.raisonSociale || "—"} />
            <Info label="SIRET" value={trainee.siret || "—"} mono />
            <Info label="Adresse du siège" value={trainee.adresseSiege || "—"} full />
            <Info label="Domaine d'activité" value={trainee.domaineActivite || "—"} />
            <Info label="Contact administratif" value={trainee.contactAdmin || "—"} full />
          </Grid>
        </Section>
      ) : (
        <Section title="Inscription — Particulier">
          <Grid>
            <Info label="Adresse postale" value={trainee.adressePostale || "—"} full />
          </Grid>
        </Section>
      )}

      {/* Financement */}
      <Section title="Financement">
        <Grid>
          <Info label="Mode" value={trainee.modeFinancement || "—"} />
          <Info
            label="OPCO détecté"
            value={trainee.opcoDetecte && trainee.opcoDetecte !== "GENERIQUE" ? trainee.opcoDetecte : "—"}
            mono
          />
        </Grid>
      </Section>

      {/* Accessibilité */}
      <Section title="Accessibilité">
        <Grid>
          <Info label="Situation de handicap" value={trainee.psh ? "Oui" : "Non"} />
          <Info
            label="Besoins d'adaptation"
            value={trainee.besoinsAdaptation || "Aucun"}
            full
          />
        </Grid>
      </Section>

      {/* Pré-requis */}
      <Section title="Pré-requis et analyse du besoin">
        {prerequisSchema.length === 0 ? (
          <p className="text-sm font-jetbrains" style={{ color: "#727485" }}>
            Aucun schéma de pré-requis défini pour cette formation.
          </p>
        ) : (
          <div className="space-y-4">
            {prerequisSchema
              // "attentes" a sa propre section dédiée plus bas (champ Trainee.attentes en BDD)
              .filter((field) => field.name !== "attentes")
              .map((field) => {
                const raw = prerequisAnswers[field.name];
                return (
                  <div key={field.name}>
                    <div className="text-xs font-medium mb-1" style={{ color: "#374151" }}>
                      {field.label}
                    </div>
                    <div className="text-sm font-jetbrains" style={{ color: "#1f2244" }}>
                      {formatPrerequisAnswer(field, raw)}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </Section>

      {/* Attentes */}
      <Section title="Attentes du stagiaire">
        <p className="text-sm whitespace-pre-wrap" style={{ color: "#1f2244" }}>
          {trainee.attentes || "—"}
        </p>
      </Section>

      {/* Sellsy / Drive (debug, utile en Phase 3) */}
      {(trainee.sellsyCompanyId || trainee.sellsyIndividualId || trainee.sellsyOpportunityId || trainee.driveFolderId) && (
        <Section title="Liens externes">
          <Grid>
            {trainee.sellsyCompanyId && <Info label="Sellsy company" value={String(trainee.sellsyCompanyId)} mono />}
            {trainee.sellsyIndividualId && <Info label="Sellsy individual" value={String(trainee.sellsyIndividualId)} mono />}
            {trainee.sellsyOpportunityId && <Info label="Sellsy opportunity" value={String(trainee.sellsyOpportunityId)} mono />}
            {trainee.sellsyEstimateId && <Info label="Sellsy devis" value={String(trainee.sellsyEstimateId)} mono />}
            {trainee.driveFolderId && <Info label="Drive folder" value={trainee.driveFolderId} mono full />}
          </Grid>
        </Section>
      )}

      {/* Timeline événements */}
      <Section title="Historique (audit interne)">
        {trainee.events.length === 0 ? (
          <p className="text-sm font-jetbrains" style={{ color: "#727485" }}>
            Aucun événement enregistré.
          </p>
        ) : (
          <ul className="space-y-2">
            {trainee.events.map((e) => {
              const meta = EVENT_TYPE_LABELS[e.type] ?? { label: e.type, color: "#727485" };
              return (
                <li key={e.id} className="flex gap-3 items-start text-sm">
                  <span
                    className="text-xs font-jetbrains px-2 py-0.5 rounded mt-0.5 whitespace-nowrap"
                    style={{ backgroundColor: meta.color + "20", color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div style={{ color: "#1f2244" }}>{e.message}</div>
                    <div className="text-xs font-jetbrains mt-0.5" style={{ color: "#9ca3af" }}>
                      {fmtDateTime(e.createdAt)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
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
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">{children}</div>;
}

function Info({ label, value, full, mono }: { label: string; value: string; full?: boolean; mono?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <div className="text-xs font-medium mb-0.5" style={{ color: "#727485" }}>
        {label}
      </div>
      <div className={`text-sm ${mono ? "font-jetbrains" : ""}`} style={{ color: "#1f2244" }}>
        {value}
      </div>
    </div>
  );
}

function DocGenerateButton({
  label,
  available,
  disabled,
  loading,
  onClick,
}: {
  label: string;
  available: boolean;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  if (!available) {
    return (
      <span
        className="text-xs px-3 py-1.5 rounded-full border cursor-not-allowed"
        style={{ borderColor: "#e5e7eb", color: "#9ca3af", backgroundColor: "#f9fafb" }}
        title="Template Drive non configuré sur la formation"
      >
        {label} <span className="ml-1">⚠ template manquant</span>
      </span>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="text-xs px-3 py-1.5 rounded-full cursor-pointer disabled:opacity-50"
      style={{ backgroundColor: "#1f2244", color: "white" }}
    >
      {loading ? "Génération..." : `Générer ${label}`}
    </button>
  );
}

function UploadSignedForm({
  traineeId,
  onUploaded,
}: {
  traineeId: string;
  onUploaded: () => void | Promise<void>;
}) {
  const [type, setType] = useState("convention_signed");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || uploading) return;
    setUploading(true);
    setFeedback(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("type", type);
      const r = await fetch(`/api/admin/trainees/${traineeId}/upload-signed`, {
        method: "POST",
        body: form,
      });
      const d = await r.json();
      if (!r.ok || !d.success) {
        setFeedback({ type: "error", msg: d.error || "Échec de l'upload" });
        return;
      }
      setFeedback({ type: "success", msg: `Document archivé sur Drive ✓` });
      setFile(null);
      await onUploaded();
    } catch {
      setFeedback({ type: "error", msg: "Erreur réseau" });
    } finally {
      setUploading(false);
      setTimeout(() => setFeedback(null), 6000);
    }
  }

  return (
    <div className="mt-4 pt-4 border-t" style={{ borderColor: "#e5e7eb" }}>
      <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#1f2244" }}>
        Déposer un document signé / autre PJ
      </h3>
      <form onSubmit={handleSubmit} className="flex gap-2 flex-wrap items-center">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="text-xs font-jetbrains px-2 py-1.5 rounded border"
          style={{ borderColor: "#e5e7eb", color: "#1f2244" }}
        >
          <option value="convention_signed">Convention signée</option>
          <option value="contrat_signed">Contrat signé</option>
          <option value="devis_signed">Devis signé</option>
          <option value="convocation_signed">Convocation signée</option>
          <option value="attestation">Attestation</option>
          <option value="other">Autre</option>
        </select>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/heic,image/heif"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="text-xs"
        />
        <button
          type="submit"
          disabled={!file || uploading}
          className="text-xs px-3 py-1.5 rounded-full cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: "#7dcef5", color: "#1f2244" }}
        >
          {uploading ? "Upload..." : "Déposer"}
        </button>
      </form>
      <p className="text-[10px] font-jetbrains mt-1" style={{ color: "#9ca3af" }}>
        Le fichier est archivé dans <code>01_INSCRIPTIONS_CONVENTIONS / Prénom Nom</code> sur Drive et apparaît dans la liste ci-dessus. Max 25 MB · PDF, JPEG, PNG ou HEIC.
      </p>
      {feedback && (
        <div
          className={`mt-2 p-2 rounded-lg text-xs font-jetbrains ${
            feedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {feedback.msg}
        </div>
      )}
    </div>
  );
}

function formatPrerequisAnswer(field: PrerequisField, raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") return "— (non renseigné)";
  if (field.type === "yes_no") return raw === true ? "Oui" : raw === false ? "Non" : String(raw);
  if (field.type === "scale_1_5") {
    const n = Number(raw);
    if (!Number.isFinite(n)) return String(raw);
    return `${n}/5 (${field.leftLabel} → ${field.rightLabel})`;
  }
  return String(raw);
}
