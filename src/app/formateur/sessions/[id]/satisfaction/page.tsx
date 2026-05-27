"use client";

import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface InvitationResult {
  traineeId: string;
  traineeName: string;
  email: string;
  ok: boolean;
  error?: string;
}

interface PromotionResult {
  traineeId: string;
  traineeName: string;
  promoted: boolean;
  alreadyTerminated?: boolean;
  endOfTrainingTriggered?: { emailSent?: boolean; error?: string; skipped?: boolean };
  error?: string;
}

interface SendResponse {
  success: boolean;
  total: number;
  mailsSent: number;
  results: InvitationResult[];
  surveyUrl: string;
}

interface CloseResponse {
  success: boolean;
  total: number;
  newlyTerminated: number;
  alreadyTerminated: number;
  failed: number;
  promotions: PromotionResult[];
}

interface PreviewQuestion {
  name: string;
  type: string;
  label: string;
  description?: string;
  required: boolean;
  options?: string[];
  leftLabel?: string;
  rightLabel?: string;
  placeholder?: string;
}

interface PreviewData {
  session: { code: string; dateDebut: string; dateFin: string };
  formation: { nomLong: string };
  questions: PreviewQuestion[];
}

function SatisfactionPage({ id }: { id: string }) {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResponse | null>(null);
  const [closing, setClosing] = useState(false);
  const [closeResult, setCloseResult] = useState<CloseResponse | null>(null);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const qrUrl = `/api/formateur/sessions/${id}/satisfaction/qr?token=${encodeURIComponent(token)}&size=400`;
  // URL à afficher / copier-coller : pointe vers la page de présentation
  // (gros QR + invitation, prête à projeter sur un écran de salle).
  // Le QR ci-dessus encode lui-même l'URL directe du formulaire.
  const surveyUrl = typeof window !== "undefined"
    ? `${window.location.origin}/eval-chaud/session/${id}/presentation`
    : `https://evaremote.com/eval-chaud/session/${id}/presentation`;

  async function sendMail() {
    if (sending) return;
    if (!confirm("Envoyer le questionnaire d'évaluation à chaud à TOUS les stagiaires de cette session par mail ?")) {
      return;
    }
    setSending(true);
    setError("");
    try {
      const r = await fetch(
        `/api/formateur/sessions/${id}/satisfaction/send?token=${encodeURIComponent(token)}`,
        { method: "POST" }
      );
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || "Erreur");
        return;
      }
      setResult(d);
    } catch {
      setError("Erreur réseau");
    } finally {
      setSending(false);
    }
  }

  async function closeSession() {
    if (closing) return;
    if (!confirm(
      "Clôturer cette session ?\n\n" +
      "Pour chaque stagiaire actif :\n" +
      "  • Passage du statut à « Terminé »\n" +
      "  • Génération + envoi du certificat de réalisation par mail\n" +
      "  • Génération + envoi de l'attestation de fin de formation par mail\n" +
      "  • Archivage de la synthèse globale d'évaluation sur Drive\n\n" +
      "À utiliser typiquement après avoir affiché le QR code aux stagiaires.\n" +
      "Les stagiaires déjà terminés ne seront pas affectés. Continuer ?"
    )) {
      return;
    }
    setClosing(true);
    setError("");
    try {
      const r = await fetch(
        `/api/formateur/sessions/${id}/close-session?token=${encodeURIComponent(token)}`,
        { method: "POST" }
      );
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || "Erreur");
        return;
      }
      setCloseResult(d);
    } catch {
      setError("Erreur réseau");
    } finally {
      setClosing(false);
    }
  }

  async function openPreview() {
    setShowPreview(true);
    if (preview) return;
    setPreviewLoading(true);
    try {
      const r = await fetch(`/api/formateur/sessions/${id}/satisfaction/preview?token=${encodeURIComponent(token)}`);
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        setError(d?.error || "Erreur de chargement");
        return;
      }
      setPreview(await r.json());
    } catch {
      setError("Erreur réseau");
    } finally {
      setPreviewLoading(false);
    }
  }

  function copyUrl() {
    navigator.clipboard.writeText(surveyUrl).catch(() => {});
  }

  return (
    <div>
      <Link
        href={`/formateur/sessions/${id}?token=${encodeURIComponent(token)}`}
        className="text-xs font-jetbrains underline"
        style={{ color: "#727485" }}
      >
        ← Retour à la session
      </Link>
      <h1 className="text-3xl font-bold mt-2 mb-6" style={{ color: "#1f2244" }}>
        📝 Évaluation à chaud
      </h1>

      <div className="mb-6 p-4 rounded-xl text-sm font-jetbrains" style={{ backgroundColor: "#fafbff", color: "#727485" }}>
        Questionnaire <strong>anonyme</strong> (≈ 3 min). Envoi par mail, ou QR à projeter en salle.
        Les 2 voies pointent vers la même URL — pas besoin de choisir.
      </div>

      <div className="mb-4 flex gap-2 flex-wrap">
        <button
          onClick={openPreview}
          className="px-3 py-1.5 rounded-full text-xs font-medium border cursor-pointer"
          style={{ borderColor: "#1f2244", color: "#1f2244" }}
        >
          👁 Aperçu du formulaire
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bloc envoi mail */}
        <div className="p-5 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-2" style={{ color: "#1f2244" }}>
            Envoyer par mail
          </h2>
          <p className="text-xs font-jetbrains mb-3" style={{ color: "#727485" }}>
            Envoie le lien du formulaire anonyme à chaque stagiaire de la session.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={sendMail}
              disabled={sending}
              className="px-4 py-2 rounded-full text-sm font-medium text-white cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: "#1f2244" }}
            >
              {sending ? "Envoi..." : "Envoyer par mail"}
            </button>
          </div>
          {error && (
            <div className="mt-3 p-2.5 rounded text-xs font-jetbrains bg-red-50 text-red-800">{error}</div>
          )}
          {result && (
            <div className="mt-3">
              <div className="p-2.5 rounded text-xs font-jetbrains bg-green-50 text-green-800 mb-2">
                ✓ {result.mailsSent}/{result.total} mail{result.total > 1 ? "s" : ""} envoyé{result.mailsSent > 1 ? "s" : ""}
              </div>
              <ul className="space-y-1 text-xs">
                {result.results.map((i) => (
                  <li
                    key={i.traineeId}
                    className="flex items-center gap-2 font-jetbrains"
                    style={{ color: i.ok ? "#166534" : "#991b1b" }}
                  >
                    <span>{i.ok ? "✓" : "✗"}</span>
                    <span>{i.traineeName}</span>
                    <span style={{ color: "#9ca3af" }}>{i.email}</span>
                    {!i.ok && i.error && <span style={{ color: "#991b1b" }}>· {i.error}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {showPreview && (
          <PreviewModal
            onClose={() => setShowPreview(false)}
            preview={preview}
            loading={previewLoading}
          />
        )}

        {/* Bloc QR code */}
        <div className="p-5 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-2" style={{ color: "#1f2244" }}>
            QR code à scanner
          </h2>
          <p className="text-xs font-jetbrains mb-3" style={{ color: "#727485" }}>
            À scanner par les stagiaires. L&apos;URL ouvre une <strong>page de présentation</strong> avec un QR géant
            (idéale pour vidéoprojeter en salle).
          </p>
          <div className="flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrUrl}
              alt="QR code éval à chaud"
              width={180}
              height={180}
              style={{ border: "1px solid #e5e7eb", borderRadius: 8 }}
            />
            <a
              href={qrUrl}
              download={`qr-eval-chaud-${id}.png`}
              className="text-xs px-3 py-1.5 rounded-full border cursor-pointer"
              style={{ borderColor: "#1f2244", color: "#1f2244" }}
            >
              Télécharger le QR code (PNG)
            </a>
            <div className="w-full">
              <p className="text-xs font-jetbrains mb-1" style={{ color: "#727485" }}>
                URL du formulaire :
              </p>
              <div className="flex gap-1">
                <code
                  className="flex-1 text-xs font-jetbrains px-2 py-1 rounded border break-all"
                  style={{ borderColor: "#e5e7eb", color: "#1f2244", backgroundColor: "#f9fafb" }}
                >
                  {surveyUrl}
                </code>
                <button
                  onClick={copyUrl}
                  className="text-xs px-2 py-1 rounded cursor-pointer"
                  style={{ backgroundColor: "#7dcef5", color: "#1f2244" }}
                >
                  Copier
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bloc clôture session — pleine largeur sous le grid */}
      <div className="mt-6 p-4 rounded-xl border" style={{ borderColor: "#fde68a", backgroundColor: "#fffbeb" }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold" style={{ color: "#92400e" }}>
              🎓 Clôturer la session
            </h2>
            <p className="text-xs font-jetbrains mt-0.5" style={{ color: "#b45309" }}>
              Statut <strong>Terminé</strong> + envoi <strong>certificat</strong> + <strong>attestation</strong> + archivage <strong>synthèse éval</strong> Drive. Idempotent.
            </p>
          </div>
          <button
            onClick={closeSession}
            disabled={closing}
            className="px-4 py-2 rounded-full text-sm font-medium text-white cursor-pointer disabled:opacity-50 whitespace-nowrap"
            style={{ backgroundColor: "#92400e" }}
          >
            {closing ? "Clôture en cours..." : "Clôturer la session"}
          </button>
        </div>
        {closeResult && (
          <div className="mt-3 pt-3 border-t" style={{ borderColor: "#fde68a" }}>
            <div className="text-xs font-semibold mb-2" style={{ color: "#92400e" }}>
              {closeResult.newlyTerminated > 0
                ? `✓ ${closeResult.newlyTerminated} stagiaire${closeResult.newlyTerminated > 1 ? "s" : ""} clôturé${closeResult.newlyTerminated > 1 ? "s" : ""}`
                : "Aucune action — tous déjà terminés"}
              {closeResult.alreadyTerminated > 0 && (
                <span style={{ color: "#9ca3af" }}> · {closeResult.alreadyTerminated} déjà terminé{closeResult.alreadyTerminated > 1 ? "s" : ""}</span>
              )}
              {closeResult.failed > 0 && (
                <span style={{ color: "#991b1b" }}> · {closeResult.failed} erreur{closeResult.failed > 1 ? "s" : ""}</span>
              )}
            </div>
            <ul className="space-y-1 text-xs font-jetbrains">
              {closeResult.promotions.map((p) => {
                const eot = p.endOfTrainingTriggered;
                const docsOk = eot?.emailSent === true;
                const docsSkipped = eot?.skipped === true;
                const docsErr = eot?.error;
                const promotionFailed = !p.promoted && !p.alreadyTerminated;
                return (
                  <li
                    key={p.traineeId}
                    className="flex flex-wrap items-center gap-1.5"
                    style={{
                      color: promotionFailed ? "#991b1b" : p.alreadyTerminated ? "#9ca3af" : "#1f2244",
                    }}
                  >
                    <span>{promotionFailed ? "⚠" : "•"}</span>
                    <span>{p.traineeName}</span>
                    {p.alreadyTerminated && <span>· déjà terminé</span>}
                    {p.promoted && docsOk && <span style={{ color: "#166534" }}>· certif + attestation envoyés</span>}
                    {p.promoted && docsSkipped && <span style={{ color: "#9ca3af" }}>· docs déjà envoyés</span>}
                    {p.promoted && docsErr && <span style={{ color: "#991b1b" }}>· erreur docs : {docsErr}</span>}
                    {promotionFailed && p.error && <span>· {p.error}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewModal({
  onClose,
  preview,
  loading,
}: {
  onClose: () => void;
  preview: PreviewData | null;
  loading: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(31, 34, 68, 0.5)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "#e5e7eb" }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: "#1f2244" }}>
              Aperçu du formulaire stagiaire
            </h2>
            <p className="text-xs font-jetbrains mt-0.5" style={{ color: "#727485" }}>
              Lecture seule — aucune action n&apos;est enregistrée.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-2xl cursor-pointer w-8 h-8 rounded-full flex items-center justify-center"
            style={{ color: "#727485", backgroundColor: "#f3f4f6" }}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto p-6">
          {loading && (
            <p className="text-sm font-jetbrains text-center py-12" style={{ color: "#727485" }}>
              Chargement...
            </p>
          )}
          {!loading && !preview && (
            <p className="text-sm font-jetbrains text-center py-12" style={{ color: "#991b1b" }}>
              Impossible de charger l&apos;aperçu.
            </p>
          )}
          {!loading && preview && <PreviewContent preview={preview} />}
        </div>

        <div className="px-6 py-3 border-t flex justify-end" style={{ borderColor: "#e5e7eb" }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full text-sm font-medium cursor-pointer"
            style={{ backgroundColor: "#1f2244", color: "white" }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewContent({ preview }: { preview: PreviewData }) {
  let questionIndex = 0;
  return (
    <div className="space-y-5">
      <div className="p-3 rounded-lg text-xs font-jetbrains" style={{ backgroundColor: "#fafbff", color: "#727485" }}>
        <strong style={{ color: "#1f2244" }}>{preview.formation.nomLong}</strong> · Session {preview.session.code}
      </div>
      {preview.questions.map((q) => {
        if (q.type === "section_header") {
          return (
            <div key={q.name} className="pt-3 pb-1 border-b" style={{ borderColor: "#e5e7eb" }}>
              <h3 className="text-base font-bold" style={{ color: "#1f2244" }}>{q.label}</h3>
              {q.description && (
                <p className="text-xs font-jetbrains mt-1" style={{ color: "#727485" }}>{q.description}</p>
              )}
            </div>
          );
        }
        questionIndex++;
        return (
          <div key={q.name}>
            <div className="text-sm font-medium" style={{ color: "#1f2244" }}>
              <span style={{ color: "#9ca3af" }}>{questionIndex}.</span> {q.label}
              {q.required && <span style={{ color: "#ef4444" }}> *</span>}
            </div>
            {q.description && (
              <p className="text-xs font-jetbrains mt-1" style={{ color: "#9ca3af" }}>{q.description}</p>
            )}
            <div className="mt-2 text-xs font-jetbrains" style={{ color: "#727485" }}>
              {q.type === "likert_5" && (
                <span>
                  Échelle 1 à 5 ({q.leftLabel || "min"} → {q.rightLabel || "max"})
                </span>
              )}
              {q.type === "scale_nps" && (
                <span>
                  Échelle NPS 0 à 10 ({q.leftLabel || "min"} → {q.rightLabel || "max"})
                </span>
              )}
              {q.type === "yes_no" && <span>Oui / Non</span>}
              {q.type === "single_choice" && q.options && (
                <span>Choix : {q.options.join(" · ")}</span>
              )}
              {q.type === "text" && <span>Réponse courte (1 ligne)</span>}
              {q.type === "textarea" && <span>Réponse libre (plusieurs lignes)</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="min-h-screen py-10 px-4" style={{ backgroundColor: "#f8fafc" }}>
      <div className="max-w-5xl mx-auto">
        <Suspense fallback={<div className="py-12 text-center font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>}>
          <SatisfactionPage id={id} />
        </Suspense>
      </div>
    </div>
  );
}
