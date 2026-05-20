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
  alreadyExisted: boolean;
}

interface SendResponse {
  success: boolean;
  mode: "prepared" | "sent";
  invitations: InvitationResult[];
  totalInvitations: number;
  mailsSent: number;
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
  const [sending, setSending] = useState<"send" | "prepare" | null>(null);
  const [result, setResult] = useState<SendResponse | null>(null);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const qrUrl = `/api/formateur/sessions/${id}/satisfaction/qr?token=${encodeURIComponent(token)}&size=400`;
  const selectionUrl = typeof window !== "undefined"
    ? `${window.location.origin}/eval-chaud/session/${id}`
    : `https://evaremote.com/eval-chaud/session/${id}`;

  async function callSend(sendEmails: boolean) {
    if (sending) return;
    if (sendEmails && !confirm("Envoyer le questionnaire d'évaluation à chaud à TOUS les stagiaires de cette session par mail ?")) {
      return;
    }
    setSending(sendEmails ? "send" : "prepare");
    setError("");
    try {
      const r = await fetch(
        `/api/formateur/sessions/${id}/satisfaction/send?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sendEmails }),
        }
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
      setSending(null);
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
    navigator.clipboard.writeText(selectionUrl).catch(() => {});
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
        Questionnaire de satisfaction (≈ 3 min, 13 questions en 5 sections).
        Trois actions possibles : <strong>aperçu</strong> du formulaire pour vérifier les questions,{" "}
        <strong>préparation</strong> du QR code sans envoyer de mail (utile en présentiel), ou{" "}
        <strong>envoi par mail</strong> à tous les stagiaires.
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
            Préparer le questionnaire
          </h2>
          <p className="text-xs font-jetbrains mb-3" style={{ color: "#727485" }}>
            <strong>Préparer sans mail</strong> : active la page de sélection des stagiaires (et donc le QR code) sans envoyer de mail. Idéal en présentiel.<br/>
            <strong>Envoyer par mail</strong> : prévient chaque stagiaire par mail avec le lien public de la session. Le stagiaire arrive sur la page de sélection, choisit son nom, puis répond.<br/>
            <span style={{ color: "#9ca3af" }}>Note : les stagiaires n&apos;ont pas de lien magique personnel. Tout passe par la page de sélection (commune à la session).</span>
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => callSend(false)}
              disabled={sending !== null}
              className="px-3 py-2 rounded-full text-sm font-medium border cursor-pointer disabled:opacity-50"
              style={{ borderColor: "#1f2244", color: "#1f2244" }}
            >
              {sending === "prepare" ? "Préparation..." : "Préparer (sans mail)"}
            </button>
            <button
              onClick={() => callSend(true)}
              disabled={sending !== null}
              className="px-4 py-2 rounded-full text-sm font-medium text-white cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: "#1f2244" }}
            >
              {sending === "send" ? "Envoi..." : "Envoyer par mail"}
            </button>
          </div>
          {error && (
            <div className="mt-3 p-2.5 rounded text-xs font-jetbrains bg-red-50 text-red-800">{error}</div>
          )}
          {result && (
            <div className="mt-3">
              <div className="p-2.5 rounded text-xs font-jetbrains bg-green-50 text-green-800 mb-2">
                {result.mode === "prepared" ? (
                  <>✓ {result.totalInvitations} lien{result.totalInvitations > 1 ? "s" : ""} prêt{result.totalInvitations > 1 ? "s" : ""} — le QR code est maintenant fonctionnel</>
                ) : (
                  <>✓ {result.mailsSent}/{result.totalInvitations} mail{result.totalInvitations > 1 ? "s" : ""} envoyé{result.mailsSent > 1 ? "s" : ""}</>
                )}
              </div>
              <ul className="space-y-1 text-xs">
                {result.invitations.map((i) => (
                  <li
                    key={i.traineeId}
                    className="flex items-center gap-2 font-jetbrains"
                    style={{ color: i.ok ? "#166534" : "#991b1b" }}
                  >
                    <span>{i.ok ? "✓" : "✗"}</span>
                    <span>{i.traineeName}</span>
                    <span style={{ color: "#9ca3af" }}>{i.email}</span>
                    {i.alreadyExisted && <span style={{ color: "#9ca3af" }}>(existant)</span>}
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
            Affiche-le sur ton écran ou imprime-le : les stagiaires scannent au téléphone, choisissent leur nom
            dans la liste, et remplissent le questionnaire.
          </p>
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrUrl}
              alt="QR code éval à chaud"
              width={300}
              height={300}
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
                URL de la page de sélection :
              </p>
              <div className="flex gap-1">
                <code
                  className="flex-1 text-xs font-jetbrains px-2 py-1 rounded border break-all"
                  style={{ borderColor: "#e5e7eb", color: "#1f2244", backgroundColor: "#f9fafb" }}
                >
                  {selectionUrl}
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
