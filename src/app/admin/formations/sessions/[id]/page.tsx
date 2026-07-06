"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import TraineeStatusDropdown from "@/components/TraineeStatusDropdown";
import { apiFetch, apiErrorMessage, isAbortError } from "@/lib/api-client";

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
  driveFolderId: string | null;
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
  sellsyOpportunityId: number | null;
  createdAt: string;
}

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
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [endOfTrainingBatching, setEndOfTrainingBatching] = useState(false);
  const [endOfTrainingFeedback, setEndOfTrainingFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  async function provisionDrive() {
    if (provisioning) return;
    setProvisioning(true);
    setFeedback(null);
    try {
      const d = await apiFetch<{ success?: boolean; error?: string; subfoldersCreated?: string[] }>(
        `/api/admin/sessions/${id}/provision-drive`,
        { method: "POST" }
      );
      if (!d.success) {
        setFeedback({ type: "error", msg: d.error || "Échec du provisioning Drive" });
        return;
      }
      const subs = d.subfoldersCreated || [];
      setFeedback({
        type: "success",
        msg:
          subs.length > 0
            ? `Dossier Drive OK · ${subs.length} sous-dossier(s) créé(s) : ${subs.join(", ")}`
            : `Dossier Drive OK · arborescence déjà complète`,
      });
      // Refresh session to update driveFolderId in UI
      const sessionsRes = await apiFetch<{ sessions?: SessionDetail[] }>(`/api/admin/sessions`);
      const found = (sessionsRes.sessions || []).find((s: SessionDetail) => s.id === id);
      if (found) setSession(found);
    } catch (err) {
      console.error(err);
      setFeedback({ type: "error", msg: apiErrorMessage(err, "Erreur réseau") });
    } finally {
      setProvisioning(false);
      setTimeout(() => setFeedback(null), 8000);
    }
  }

  async function batchEndOfTrainingDocs() {
    if (endOfTrainingBatching) return;
    if (!confirm(
      "Générer + envoyer le certificat de réalisation et l'attestation de fin de formation à tous les stagiaires en statut « Terminé » qui ne les ont pas encore reçus ?"
    )) return;
    setEndOfTrainingBatching(true);
    setEndOfTrainingFeedback(null);
    try {
      const d = await apiFetch<{
        results: { ok: boolean; stagiaire: string; error: string }[];
        sent: number;
        total: number;
      }>(`/api/admin/sessions/${id}/end-of-training-batch`, { method: "POST", body: {} });
      const errors = d.results.filter((x) => !x.ok);
      const errorMsg = errors.length > 0
        ? ` · ${errors.length} échec(s) : ${errors.slice(0, 3).map((x) => `${x.stagiaire} (${x.error})`).join(", ")}`
        : "";
      setEndOfTrainingFeedback({
        type: errors.length === 0 ? "success" : "error",
        msg: `✓ ${d.sent}/${d.total} mail(s) envoyé(s)${errorMsg}`,
      });
    } catch (err) {
      setEndOfTrainingFeedback({ type: "error", msg: apiErrorMessage(err, "Erreur réseau") });
    } finally {
      setEndOfTrainingBatching(false);
      setTimeout(() => setEndOfTrainingFeedback(null), 12000);
    }
  }

  async function refreshTrainees() {
    try {
      const d = await apiFetch<{ trainees?: Trainee[] }>(`/api/admin/trainees?sessionId=${id}`);
      setTrainees(d.trainees || []);
    } catch {}
  }

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
    const ac = new AbortController();
    Promise.all([
      apiFetch<{ sessions?: SessionDetail[] }>(`/api/admin/sessions`, { signal: ac.signal }),
      apiFetch<{ trainees?: Trainee[] }>(`/api/admin/trainees?sessionId=${id}`, { signal: ac.signal }),
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
      .catch((err) => {
        if (isAbortError(err)) return;
        setError(apiErrorMessage(err, "Erreur de chargement"));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
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

      {feedback && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm font-jetbrains ${
            feedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
          }`}
        >
          {feedback.msg}
        </div>
      )}

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

      {/* Bloc Drive */}
      <div className="mb-8 p-5 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wide mb-2" style={{ color: "#1f2244" }}>
          Dossier Google Drive
        </h2>
        <p className="text-xs font-jetbrains mb-3" style={{ color: "#727485" }}>
          Arborescence : 01_INSCRIPTIONS_CONVENTIONS · 02_SUIVI_ET_INCIDENTS · 03_EVALUATIONS · 04_ATTESTATIONS_BILAN · 05_PROGRAMME_SUPPORTS
        </p>
        <div className="flex gap-2 items-center flex-wrap">
          {session.driveFolderId ? (
            <>
              <span className="text-xs font-jetbrains px-2 py-1 rounded bg-green-50 text-green-800">
                ✓ Dossier provisionné
              </span>
              <a
                href={`https://drive.google.com/drive/folders/${session.driveFolderId}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs px-3 py-2 rounded-full border cursor-pointer"
                style={{ borderColor: "#1f2244", color: "#1f2244" }}
              >
                Ouvrir dans Drive ↗
              </a>
              <button
                onClick={provisionDrive}
                disabled={provisioning}
                className="text-xs px-3 py-2 rounded-full cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: "#7dcef5", color: "#1f2244" }}
              >
                {provisioning ? "..." : "Réparer arborescence"}
              </button>
            </>
          ) : (
            <>
              <span className="text-xs font-jetbrains px-2 py-1 rounded bg-amber-50 text-amber-800">
                ⚠ Pas encore créé
              </span>
              <button
                onClick={provisionDrive}
                disabled={provisioning}
                className="text-xs px-3 py-2 rounded-full cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: "#1f2244", color: "white" }}
              >
                {provisioning ? "Création..." : "Créer dossier + arborescence"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* === Tableau stagiaires (priorité visuelle haute) === */}
      <div className="mb-8">
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
                      <TraineeStatusDropdown
                        traineeId={t.id}
                        currentStatus={t.status}
                        hasSellsyOpportunity={!!t.sellsyOpportunityId}
                        compact
                        onChanged={() => refreshTrainees()}
                        onFeedback={(msg) => {
                          setFeedback({ type: msg.type, msg: msg.text });
                          setTimeout(() => setFeedback(null), msg.type === "error" ? 7000 : 5000);
                        }}
                      />
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

      {/* === Documents & évaluations Qualiopi (grille compacte 4 cartes) === */}
      <div className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "#727485" }}>
          Documents & évaluations
        </h2>
        {/* Ordre chronologique : chaud (fin de session) → docs fin (lendemain) →
            fiche formateur (J+1) → froid (3 mois) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* 1. Éval à chaud — déclenchée à la fin de la session */}
          <Link
            href={`/admin/formations/sessions/${session.id}/satisfaction`}
            className="p-4 rounded-xl border flex flex-col gap-2 hover:shadow-md transition-shadow cursor-pointer"
            style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}
            title="Synthèse des réponses + score NPS + PDF + archive Drive"
          >
            <div className="text-2xl">📝</div>
            <div className="text-sm font-semibold" style={{ color: "#1f2244" }}>Éval à chaud</div>
            <div className="text-xs font-jetbrains flex-1" style={{ color: "#727485" }}>
              Satisfaction stagiaires fin de session (anonyme).
            </div>
            <span className="text-xs font-medium self-start" style={{ color: "#1f2244" }}>
              Voir la synthèse →
            </span>
          </Link>

          {/* 2. Documents fin de formation — au passage à "Terminé" */}
          <div className="p-4 rounded-xl border flex flex-col gap-2" style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}>
            <div className="text-2xl">🎓</div>
            <div className="text-sm font-semibold" style={{ color: "#1f2244" }}>Documents fin de formation</div>
            <div className="text-xs font-jetbrains flex-1" style={{ color: "#727485" }}>
              Certificat + attestation aux stagiaires « Terminé ».
            </div>
            <button
              onClick={batchEndOfTrainingDocs}
              disabled={endOfTrainingBatching}
              className="text-xs px-3 py-1.5 rounded-full cursor-pointer disabled:opacity-50 self-start"
              style={{ backgroundColor: "#1f2244", color: "white" }}
              title="Génère + envoie pour tous les stagiaires en statut Terminé"
            >
              {endOfTrainingBatching ? "Envoi..." : "Envoyer en lot →"}
            </button>
            {endOfTrainingFeedback && (
              <div className={`text-[10px] font-jetbrains px-2 py-1 rounded ${endOfTrainingFeedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                {endOfTrainingFeedback.msg}
              </div>
            )}
          </div>

          {/* 3. Fiche formateur — J+1 après fin de session */}
          <Link
            href={`/admin/formations/sessions/${session.id}/trainer-eval`}
            className="p-4 rounded-xl border flex flex-col gap-2 hover:shadow-md transition-shadow cursor-pointer"
            style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}
            title="Envoi auto J+1 après dateFin, relances J+7 / J+14"
          >
            <div className="text-2xl">🎓</div>
            <div className="text-sm font-semibold" style={{ color: "#1f2244" }}>Fiche formateur</div>
            <div className="text-xs font-jetbrains flex-1" style={{ color: "#727485" }}>
              Bilan formateur J+1 après fin de session.
            </div>
            <span className="text-xs font-medium self-start" style={{ color: "#1f2244" }}>
              Voir la synthèse →
            </span>
          </Link>

          {/* 4. Éval à froid — 3 mois après fin de session */}
          <Link
            href={`/admin/formations/sessions/${session.id}/cold-eval`}
            className="p-4 rounded-xl border flex flex-col gap-2 hover:shadow-md transition-shadow cursor-pointer"
            style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}
            title="Envoi auto 3 mois après fin de session, relances J+7 / J+14"
          >
            <div className="text-2xl">🌬</div>
            <div className="text-sm font-semibold" style={{ color: "#1f2244" }}>Éval à froid</div>
            <div className="text-xs font-jetbrains flex-1" style={{ color: "#727485" }}>
              Impact en poste 3 mois après. Auto + relances.
            </div>
            <span className="text-xs font-medium self-start" style={{ color: "#1f2244" }}>
              Voir la synthèse →
            </span>
          </Link>

          {/* 5. Satisfaction entreprise — en même temps que l'éval à froid */}
          <Link
            href={`/admin/formations/sessions/${session.id}/sponsor-eval`}
            className="p-4 rounded-xl border flex flex-col gap-2 hover:shadow-md transition-shadow cursor-pointer"
            style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}
            title="Enquête commanditaire, envoi auto en même temps que l'éval à froid, relances J+7 / J+14"
          >
            <div className="text-2xl">🏢</div>
            <div className="text-sm font-semibold" style={{ color: "#1f2244" }}>Satisfaction entreprise</div>
            <div className="text-xs font-jetbrains flex-1" style={{ color: "#727485" }}>
              Avis du commanditaire. Auto (avec l&apos;éval à froid) + relances.
            </div>
            <span className="text-xs font-medium self-start" style={{ color: "#1f2244" }}>
              Voir la synthèse →
            </span>
          </Link>
        </div>
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
