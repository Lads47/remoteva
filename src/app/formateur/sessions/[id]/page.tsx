"use client";

import { Suspense, use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PrerequisField } from "@/lib/formation-prerequis";
import { EVA_STATUS_COLORS, EVA_STATUS_LABELS, EVA_STATUSES, type EvaStatus } from "@/lib/appConfig-types";
import { apiFetch, apiErrorMessage, isAbortError } from "@/lib/api-client";

interface Trainer {
  id: string;
  prenom: string;
  nom: string;
  email: string;
}

interface Session {
  id: string;
  code: string;
  dateDebut: string;
  dateFin: string;
  lieu: string;
  horaires: string;
  status: string;
  capacite: number;
  notes: string;
  driveFolderId: string | null;
}

interface Formation {
  code: string;
  nomLong: string;
  description: string;
  dureeJours: number;
}

interface Trainee {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  inscriptionType: string;
  raisonSociale: string;
  statutActuel: string;
  modeFinancement: string;
  psh: boolean;
  besoinsAdaptation: string;
  attentes: string;
  evalEntree: string;
  status: string;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function formatPrerequisAnswer(field: PrerequisField, raw: unknown): string {
  if (raw === undefined || raw === null || raw === "") return "—";
  if (field.type === "yes_no") return raw === true ? "Oui" : raw === false ? "Non" : String(raw);
  if (field.type === "scale_1_5") {
    const n = Number(raw);
    if (!Number.isFinite(n)) return String(raw);
    return `${n}/5 (${field.leftLabel} → ${field.rightLabel})`;
  }
  return String(raw);
}

function FormateurSessionInner({ id }: { id: string }) {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [formation, setFormation] = useState<Formation | null>(null);
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [prerequisSchema, setPrerequisSchema] = useState<PrerequisField[]>([]);
  const [expandedTrainee, setExpandedTrainee] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Lien invalide");
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    apiFetch<{
      trainer: Trainer;
      session: Session;
      formation: Formation;
      trainees?: Trainee[];
      prerequisSchema?: PrerequisField[];
    }>(`/api/formateur/sessions/${id}?token=${encodeURIComponent(token)}`, { signal: ac.signal })
      .then((data) => {
        setTrainer(data.trainer);
        setSession(data.session);
        setFormation(data.formation);
        setTrainees(Array.isArray(data.trainees) ? data.trainees : []);
        setPrerequisSchema(Array.isArray(data.prerequisSchema) ? data.prerequisSchema : []);
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        setError(apiErrorMessage(err, "Session introuvable"));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [id, token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f8fafc" }}>
        <p className="font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</p>
      </div>
    );
  }

  if (error || !session || !formation || !trainer) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "#f8fafc" }}>
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold" style={{ color: "#1f2244" }}>Session introuvable</h1>
          <p className="mt-2 text-sm font-jetbrains" style={{ color: "#727485" }}>
            {error || "Cette session ne vous est pas assignée."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-10 px-4" style={{ backgroundColor: "#f8fafc" }}>
      <div className="max-w-3xl mx-auto">
        {/* Retour */}
        <Link
          href={`/formateur?token=${encodeURIComponent(token)}`}
          className="text-xs font-jetbrains underline"
          style={{ color: "#727485" }}
        >
          ← Mes sessions
        </Link>

        {/* Header */}
        <div className="mt-3 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <span
              className="px-2 py-0.5 rounded text-xs font-jetbrains"
              style={{ backgroundColor: "#1f2244", color: "white" }}
            >
              {session.code}
            </span>
            <h1 className="mt-2 text-3xl font-bold" style={{ color: "#1f2244" }}>
              {formation.nomLong}
            </h1>
            <p className="mt-1 text-sm font-jetbrains" style={{ color: "#727485" }}>
              Du {fmtDate(session.dateDebut)} au {fmtDate(session.dateFin)}
              {session.lieu && ` · ${session.lieu}`}
              {session.horaires && ` · ${session.horaires}`}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap mt-2">
            <Link
              href={`/formateur/sessions/${id}/emargement?token=${encodeURIComponent(token)}`}
              className="px-4 py-2 rounded-full text-sm font-medium text-white cursor-pointer"
              style={{ backgroundColor: "#1f2244" }}
            >
              ✓ Émargement
            </Link>
            <Link
              href={`/formateur/sessions/${id}/evaluations?token=${encodeURIComponent(token)}`}
              className="px-4 py-2 rounded-full text-sm font-medium cursor-pointer"
              style={{ backgroundColor: "#7dcef5", color: "#1f2244" }}
            >
              ★ Évaluations pratiques
            </Link>
            <Link
              href={`/formateur/sessions/${id}/evaluation-grid?token=${encodeURIComponent(token)}`}
              className="px-4 py-2 rounded-full text-sm font-medium border cursor-pointer"
              style={{ borderColor: "#7dcef5", color: "#1f2244" }}
              title="Configurer les exercices et critères de la grille d'évaluation"
            >
              ⚙ Grille d&apos;évaluation
            </Link>
            <Link
              href={`/formateur/sessions/${id}/satisfaction?token=${encodeURIComponent(token)}`}
              className="px-4 py-2 rounded-full text-sm font-medium cursor-pointer"
              style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
            >
              📝 Éval à chaud
            </Link>
            {session.driveFolderId && (
              <a
                href={`https://drive.google.com/drive/folders/${session.driveFolderId}`}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded-full text-sm font-medium border cursor-pointer inline-flex items-center gap-1"
                style={{ borderColor: "#1f2244", color: "#1f2244" }}
                title="Ouvrir le dossier Drive de la session dans un nouvel onglet"
              >
                📁 Dossier Drive ↗
              </a>
            )}
          </div>
        </div>

        {/* Récap rapide : présence de PSH + répartition statuts Kanban */}
        {trainees.length > 0 && (
          <SessionSummary trainees={trainees} />
        )}

        {/* Stagiaires */}
        <div className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: "#1f2244" }}>
            Stagiaires inscrits ({trainees.length}/{session.capacite})
          </h2>

          {trainees.length === 0 ? (
            <div className="p-5 rounded-xl border text-center font-jetbrains text-sm" style={{ borderColor: "#e5e7eb", color: "#727485", backgroundColor: "white" }}>
              Aucun stagiaire inscrit pour le moment.
            </div>
          ) : (
            <div className="space-y-3">
              {trainees.map((t) => (
                <TraineeCard
                  key={t.id}
                  trainee={t}
                  prerequisSchema={prerequisSchema}
                  expanded={expandedTrainee === t.id}
                  onToggle={() => setExpandedTrainee(expandedTrainee === t.id ? null : t.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Description formation (pour rappel) */}
        {formation.description && (
          <div className="mt-8 p-5 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
            <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: "#1f2244" }}>
              À propos de la formation
            </h2>
            <p className="text-sm whitespace-pre-wrap" style={{ color: "#374151" }}>
              {formation.description}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SessionSummary({ trainees }: { trainees: Trainee[] }) {
  const pshCount = trainees.filter((t) => t.psh).length;
  // Comptage par statut Kanban pour résumer où en sont les stagiaires
  const counts = trainees.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  // Statuts pertinents à afficher (les autres sont peu fréquents en pratique
  // sur une page formateur, ils restent visibles via le badge par stagiaire)
  const summaryStatuses: EvaStatus[] = ["convoque", "en_formation", "termine", "abandonne"];
  const activeSummary = summaryStatuses.filter((s) => (counts[s] ?? 0) > 0);

  return (
    <div className="mt-6 p-4 rounded-xl border flex items-center gap-3 flex-wrap" style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}>
      <span className="text-xs font-jetbrains" style={{ color: "#727485" }}>
        Récap :
      </span>
      {activeSummary.length > 0 ? (
        activeSummary.map((s) => {
          const palette = EVA_STATUS_COLORS[s];
          return (
            <span
              key={s}
              className="text-xs font-jetbrains px-2 py-0.5 rounded-full"
              style={{ backgroundColor: palette.bg, color: palette.fg }}
            >
              {counts[s]} {EVA_STATUS_LABELS[s].toLowerCase()}
            </span>
          );
        })
      ) : (
        <span className="text-xs font-jetbrains" style={{ color: "#9ca3af" }}>
          en attente de convocation
        </span>
      )}
      {pshCount > 0 && (
        <span
          className="text-xs font-jetbrains px-2 py-0.5 rounded-full ml-auto"
          style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
          title="Stagiaires en situation de handicap signalée — adaptation matérielle/pédagogique requise"
        >
          ⚠ {pshCount} PSH
        </span>
      )}
    </div>
  );
}

function TraineeCard({
  trainee,
  prerequisSchema,
  expanded,
  onToggle,
}: {
  trainee: Trainee;
  prerequisSchema: PrerequisField[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const answers = useMemo<Record<string, unknown>>(() => {
    try {
      return JSON.parse(trainee.evalEntree || "{}");
    } catch {
      return {};
    }
  }, [trainee.evalEntree]);

  const statusEva = (EVA_STATUSES as readonly string[]).includes(trainee.status)
    ? (trainee.status as EvaStatus)
    : null;
  const statusPalette = statusEva ? EVA_STATUS_COLORS[statusEva] : { bg: "#e5e7eb", fg: "#374151" };
  const statusLabel = statusEva ? EVA_STATUS_LABELS[statusEva] : trainee.status;

  return (
    <div className="p-5 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-lg" style={{ color: "#1f2244" }}>
              {trainee.prenom} {trainee.nom}
            </h3>
            <span
              className="text-xs font-jetbrains px-2 py-0.5 rounded-full"
              style={{ backgroundColor: statusPalette.bg, color: statusPalette.fg }}
              title="Statut du stagiaire dans le pipeline (lecture seule formateur)"
            >
              {statusLabel}
            </span>
          </div>
          <div className="mt-1 text-xs font-jetbrains" style={{ color: "#727485" }}>
            {trainee.email}
            {trainee.telephone && ` · ${trainee.telephone}`}
          </div>
          <div className="mt-1 text-xs font-jetbrains" style={{ color: "#727485" }}>
            {trainee.inscriptionType === "entreprise" ? (
              <>Entreprise{trainee.raisonSociale && ` · ${trainee.raisonSociale}`}</>
            ) : (
              "Particulier"
            )}
            {trainee.statutActuel && ` · ${trainee.statutActuel}`}
          </div>
          {trainee.psh && (
            <div className="mt-2 inline-block text-xs font-jetbrains px-2 py-0.5 rounded" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
              ⚠ Situation de handicap signalée
              {trainee.besoinsAdaptation && ` — ${trainee.besoinsAdaptation}`}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="text-xs px-3 py-1.5 rounded-full border cursor-pointer whitespace-nowrap"
          style={{ borderColor: "#1f2244", color: "#1f2244" }}
        >
          {expanded ? "Masquer les pré-requis" : "Voir les pré-requis"}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: "#e5e7eb" }}>
          {trainee.attentes && (
            <div className="mb-4">
              <div className="text-xs font-medium mb-1" style={{ color: "#374151" }}>
                Attentes du stagiaire
              </div>
              <p className="text-sm whitespace-pre-wrap" style={{ color: "#1f2244" }}>
                {trainee.attentes}
              </p>
            </div>
          )}

          {prerequisSchema.filter((f) => f.name !== "attentes").length === 0 ? (
            <p className="text-sm font-jetbrains" style={{ color: "#727485" }}>
              Pas de pré-requis pour cette formation.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "#374151" }}>
                Pré-requis et analyse du besoin
              </div>
              {prerequisSchema
                .filter((f) => f.name !== "attentes")
                .map((field) => (
                  <div key={field.name}>
                    <div className="text-xs font-medium mb-0.5" style={{ color: "#374151" }}>
                      {field.label}
                    </div>
                    <div className="text-sm font-jetbrains" style={{ color: "#1f2244" }}>
                      {formatPrerequisAnswer(field, answers[field.name])}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FormateurSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f8fafc" }}>
          <p className="font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</p>
        </div>
      }
    >
      <FormateurSessionInner id={id} />
    </Suspense>
  );
}
