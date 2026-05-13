"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

interface SessionDetail {
  id: string;
  formationId: string;
  formationCode: string;
  formationNomLong: string;
  code: string;
  dateDebut: string;
  dateFin: string;
  capacite: number;
  lieu: string;
  horaires: string;
  status: string;
  traineeCount: number;
}

interface Trainee {
  id: string;
  status: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  inscriptionType: string;
  raisonSociale: string;
  modeFinancement: string;
  opcoDetecte: string;
  psh: boolean;
  createdAt: string;
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

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function copyInscriptionUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/sessions`).then((r) => r.json()),
      fetch(`/api/admin/trainees?sessionId=${id}`).then((r) => r.json()),
    ])
      .then(([sessionsData, traineesData]) => {
        const found = (sessionsData.sessions || []).find((s: SessionDetail) => s.id === id);
        if (!found) {
          setError("Session introuvable");
          return;
        }
        setSession(found);
        setTrainees(traineesData.trainees || []);
      })
      .catch(() => setError("Erreur de chargement"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="text-center py-12 font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  }
  if (error || !session) {
    return (
      <div className="text-center py-12">
        <p className="font-jetbrains text-sm" style={{ color: "#727485" }}>{error || "Session introuvable"}</p>
        <Link href="/admin/formations/sessions" className="mt-4 inline-block underline text-sm" style={{ color: "#1f2244" }}>
          ← Retour aux sessions
        </Link>
      </div>
    );
  }

  const inscriptionUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/formations/${session.formationCode}/inscription`;

  return (
    <div>
      <div className="mb-8">
        <Link href="/admin/formations/sessions" className="text-xs font-jetbrains underline" style={{ color: "#727485" }}>
          ← Toutes les sessions
        </Link>
        <div className="flex items-center gap-3 flex-wrap mt-2">
          <span className="px-2 py-0.5 rounded text-xs font-jetbrains" style={{ backgroundColor: "#1f2244", color: "white" }}>
            {session.code}
          </span>
          <span className="text-sm font-jetbrains" style={{ color: "#727485" }}>{session.formationCode}</span>
        </div>
        <h1 className="text-3xl font-bold mt-1" style={{ color: "#1f2244" }}>
          {session.formationNomLong}
        </h1>
        <p className="text-sm mt-1 font-jetbrains" style={{ color: "#727485" }}>
          Du {fmtDate(session.dateDebut)} au {fmtDate(session.dateFin)}
          {session.lieu && ` · ${session.lieu}`}
          {session.horaires && ` · ${session.horaires}`}
        </p>
      </div>

      {/* Bloc lien d'inscription */}
      <div className="mb-8 p-5 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-2" style={{ color: "#1f2244" }}>
          Lien public d&apos;inscription
        </h2>
        <p className="text-xs font-jetbrains mb-3" style={{ color: "#727485" }}>
          Toutes les sessions ouvertes de cette formation sont accessibles via cette page :
        </p>
        <div className="flex gap-2 items-center flex-wrap">
          <code className="flex-1 min-w-0 px-3 py-2 rounded bg-white border text-xs font-jetbrains overflow-x-auto" style={{ borderColor: "#e5e7eb", color: "#1f2244" }}>
            {inscriptionUrl}
          </code>
          <button
            onClick={() => copyInscriptionUrl(inscriptionUrl)}
            className="text-xs px-3 py-2 rounded-full cursor-pointer transition-colors"
            style={{
              backgroundColor: copied ? "#dcfce7" : "#7dcef5",
              color: copied ? "#166534" : "#1f2244",
            }}
          >
            {copied ? "Copié ✓" : "Copier"}
          </button>
          <a
            href={inscriptionUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs px-3 py-2 rounded-full border cursor-pointer"
            style={{ borderColor: "#1f2244", color: "#1f2244" }}
          >
            Ouvrir
          </a>
        </div>
        {session.status !== "open" && (
          <p className="mt-3 text-xs font-jetbrains" style={{ color: "#92400e" }}>
            ⚠ Statut actuel : <strong>{session.status}</strong>. Passe la session en <strong>« Ouverte aux inscriptions »</strong> pour qu&apos;elle apparaisse au public.
          </p>
        )}
      </div>

      {/* Tableau stagiaires */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold" style={{ color: "#1f2244" }}>
            Stagiaires inscrits
          </h2>
          <span className="text-sm font-jetbrains" style={{ color: "#727485" }}>
            {trainees.length} / {session.capacite}
          </span>
        </div>

        {trainees.length === 0 ? (
          <div className="text-center py-12 border rounded-lg font-jetbrains text-sm" style={{ borderColor: "#e5e7eb", color: "#727485" }}>
            Aucun stagiaire inscrit pour cette session.
          </div>
        ) : (
          <div className="border rounded-xl overflow-hidden" style={{ borderColor: "#e5e7eb" }}>
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: "#f9fafb" }}>
                <tr>
                  <Th>Stagiaire</Th>
                  <Th>Type</Th>
                  <Th>Financement</Th>
                  <Th>Statut</Th>
                  <Th>Inscrit le</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {trainees.map((t) => (
                  <tr key={t.id} className="border-t" style={{ borderColor: "#e5e7eb" }}>
                    <td className="px-3 py-3">
                      <Link
                        href={`/admin/formations/trainees/${t.id}`}
                        className="font-medium hover:underline cursor-pointer"
                        style={{ color: "#1f2244" }}
                      >
                        {t.prenom} {t.nom}
                      </Link>
                      <div className="text-xs font-jetbrains" style={{ color: "#727485" }}>
                        {t.email}
                        {t.telephone && ` · ${t.telephone}`}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-jetbrains text-xs" style={{ color: "#727485" }}>
                      {t.inscriptionType === "entreprise" ? (
                        <>
                          Entreprise
                          {t.raisonSociale && <div className="mt-0.5">{t.raisonSociale}</div>}
                        </>
                      ) : (
                        "Particulier"
                      )}
                      {t.psh && <div className="mt-0.5 text-orange-700">PSH</div>}
                    </td>
                    <td className="px-3 py-3 font-jetbrains text-xs" style={{ color: "#727485" }}>
                      {t.modeFinancement || "—"}
                      {t.opcoDetecte && t.opcoDetecte !== "GENERIQUE" && (
                        <div className="mt-0.5">OPCO : {t.opcoDetecte}</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs font-jetbrains px-2 py-0.5 rounded" style={{ backgroundColor: "#e0e7ff", color: "#3730a3" }}>
                        {STATUS_LABELS[t.status] ?? t.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-jetbrains text-xs" style={{ color: "#9ca3af" }}>
                      {fmtDateTime(t.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`/admin/formations/trainees/${t.id}`}
                        className="text-xs px-3 py-1.5 rounded-full border cursor-pointer"
                        style={{ borderColor: "#1f2244", color: "#1f2244" }}
                      >
                        Voir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "#727485" }}>
      {children}
    </th>
  );
}
