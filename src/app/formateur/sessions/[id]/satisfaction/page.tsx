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
  invitations: InvitationResult[];
  totalInvitations: number;
  mailsSent: number;
}

function SatisfactionPage({ id }: { id: string }) {
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResponse | null>(null);
  const [error, setError] = useState("");

  const qrUrl = `/api/formateur/sessions/${id}/satisfaction/qr?token=${encodeURIComponent(token)}&size=400`;
  const selectionUrl = typeof window !== "undefined"
    ? `${window.location.origin}/eval-chaud/session/${id}`
    : `https://evaremote.com/eval-chaud/session/${id}`;

  async function handleSend() {
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
        setError(d.error || "Erreur lors de l'envoi");
        return;
      }
      setResult(d);
    } catch {
      setError("Erreur réseau");
    } finally {
      setSending(false);
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
        Envoie le questionnaire de satisfaction (≈ 3 min, ~10 questions Qualiopi) aux stagiaires de la session.
        Tu peux soit déclencher l&apos;<strong>envoi par mail</strong> à tous, soit <strong>afficher le QR code</strong>{" "}
        à scanner au téléphone — les deux mènent au même formulaire.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bloc envoi mail */}
        <div className="p-5 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-2" style={{ color: "#1f2244" }}>
            Envoi par mail
          </h2>
          <p className="text-xs font-jetbrains mb-3" style={{ color: "#727485" }}>
            Génère un lien personnel par stagiaire et lui envoie un mail d&apos;invitation. Idempotent : un stagiaire
            qui a déjà reçu un lien le réutilise.
          </p>
          <button
            onClick={handleSend}
            disabled={sending}
            className="px-4 py-2 rounded-full text-sm font-medium text-white cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: "#1f2244" }}
          >
            {sending ? "Envoi..." : "Envoyer le questionnaire à tous"}
          </button>
          {error && (
            <div className="mt-3 p-2.5 rounded text-xs font-jetbrains bg-red-50 text-red-800">{error}</div>
          )}
          {result && (
            <div className="mt-3">
              <div className="p-2.5 rounded text-xs font-jetbrains bg-green-50 text-green-800 mb-2">
                ✓ {result.mailsSent}/{result.totalInvitations} mail{result.totalInvitations > 1 ? "s" : ""} envoyé{result.mailsSent > 1 ? "s" : ""}
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
                    {i.alreadyExisted && <span style={{ color: "#9ca3af" }}>(relance)</span>}
                    {!i.ok && i.error && <span style={{ color: "#991b1b" }}>· {i.error}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

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
