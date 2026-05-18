"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface Trainer {
  id: string;
  prenom: string;
  nom: string;
  email: string;
}

interface TrainerSession {
  id: string;
  code: string;
  formationCode: string;
  formationNomLong: string;
  dateDebut: string;
  dateFin: string;
  lieu: string;
  horaires: string;
  status: string;
  traineeCount: number;
  capacite: number;
  isPast: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  planned: "Planifiée",
  open: "Ouverte aux inscriptions",
  full: "Complète",
  closed: "Clôturée",
  cancelled: "Annulée",
};

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function FormateurHomeInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const [sessions, setSessions] = useState<TrainerSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Lien invalide : token manquant. Contactez Les Ateliers du Stream.");
      setLoading(false);
      return;
    }
    fetch(`/api/formateur/me?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Accès refusé");
        }
        return res.json();
      })
      .then((data) => {
        setTrainer(data.trainer);
        setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f8fafc" }}>
        <p className="font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</p>
      </div>
    );
  }

  if (error || !trainer) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "#f8fafc" }}>
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold" style={{ color: "#1f2244" }}>Accès refusé</h1>
          <p className="mt-2 text-sm font-jetbrains" style={{ color: "#727485" }}>
            {error || "Lien invalide."}
          </p>
        </div>
      </div>
    );
  }

  const upcoming = sessions.filter((s) => !s.isPast);
  const past = sessions.filter((s) => s.isPast);

  return (
    <div className="min-h-screen py-10 px-4" style={{ backgroundColor: "#f8fafc" }}>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs uppercase tracking-widest font-jetbrains" style={{ color: "#7dcef5" }}>
            Espace formateur
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold" style={{ color: "#1f2244" }}>
            Bonjour {trainer.prenom}
          </h1>
          <p className="mt-2 text-sm font-jetbrains" style={{ color: "#727485" }}>
            Voici les sessions de formation qui vous sont assignées. Cliquez sur une session pour
            voir la liste des stagiaires et leurs réponses aux pré-requis.
          </p>
        </div>

        {/* À venir */}
        <Section title={`À venir (${upcoming.length})`}>
          {upcoming.length === 0 ? (
            <p className="font-jetbrains text-sm" style={{ color: "#727485" }}>
              Aucune session à venir pour le moment.
            </p>
          ) : (
            <div className="space-y-3">
              {upcoming.map((s) => (
                <SessionCard key={s.id} session={s} token={token} />
              ))}
            </div>
          )}
        </Section>

        {/* Passées */}
        {past.length > 0 && (
          <Section title={`Sessions passées (${past.length})`}>
            <div className="space-y-3">
              {past.map((s) => (
                <SessionCard key={s.id} session={s} token={token} dimmed />
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: "#1f2244" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function SessionCard({
  session,
  token,
  dimmed,
}: {
  session: TrainerSession;
  token: string;
  dimmed?: boolean;
}) {
  return (
    <Link
      href={`/formateur/sessions/${session.id}?token=${encodeURIComponent(token)}`}
      className="block p-4 rounded-xl border transition-shadow hover:shadow-md"
      style={{
        borderColor: "#e5e7eb",
        backgroundColor: "white",
        opacity: dimmed ? 0.7 : 1,
      }}
    >
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className="px-2 py-0.5 rounded text-xs font-jetbrains"
          style={{ backgroundColor: "#1f2244", color: "white" }}
        >
          {session.code}
        </span>
        <span className="text-sm font-jetbrains" style={{ color: "#727485" }}>
          {STATUS_LABELS[session.status] ?? session.status}
        </span>
      </div>
      <h3 className="mt-2 font-semibold text-lg" style={{ color: "#1f2244" }}>
        {session.formationNomLong}
      </h3>
      <div className="mt-1 text-sm font-jetbrains" style={{ color: "#727485" }}>
        {fmtDate(session.dateDebut)} → {fmtDate(session.dateFin)}
        {session.lieu && ` · ${session.lieu}`}
        {session.horaires && ` · ${session.horaires}`}
      </div>
      <div className="mt-2 text-xs font-jetbrains" style={{ color: "#9ca3af" }}>
        {session.traineeCount} stagiaire{session.traineeCount > 1 ? "s" : ""} inscrit
        {session.traineeCount > 1 ? "s" : ""}
        {" · "}
        {session.capacite} places
      </div>
    </Link>
  );
}

export default function FormateurHomePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f8fafc" }}>
          <p className="font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</p>
        </div>
      }
    >
      <FormateurHomeInner />
    </Suspense>
  );
}
