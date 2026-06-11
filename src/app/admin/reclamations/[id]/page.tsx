"use client";

// Admin · Détail réclamation — affiche la section réclamant en lecture seule
// + permet de saisir la section admin (statut, action corrective, réponse)
// + bouton "envoyer la réponse par mail".

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, apiErrorMessage, isAbortError } from "@/lib/api-client";

type ComplaintStatus = "new" | "in_progress" | "resolved" | "closed";

const STATUS_LABELS: Record<ComplaintStatus, string> = {
  new: "Nouvelle",
  in_progress: "En cours",
  resolved: "Résolue",
  closed: "Clôturée",
};

const STATUS_COLORS: Record<ComplaintStatus, { bg: string; fg: string }> = {
  new: { bg: "#fee2e2", fg: "#991b1b" },
  in_progress: { bg: "#fef3c7", fg: "#92400e" },
  resolved: { bg: "#dcfce7", fg: "#166534" },
  closed: { bg: "#e5e7eb", fg: "#374151" },
};

interface Complaint {
  id: string;
  number: string;
  authorName: string;
  authorCompany: string;
  authorRole: string;
  authorEmail: string;
  concernedName: string;
  concernedCompany: string;
  concernedRole: string;
  subject: string;
  description: string;
  receptionMode: string;
  status: ComplaintStatus;
  responseType: string;
  responseContent: string;
  actionCorrective: string;
  responseSentAt: string | null;
  resolvedAt: string | null;
  resolvedBy: string;
  adminNotes: string;
  createdAt: string;
  updatedAt: string;
  sessionCode: string | null;
  formationNomLong: string | null;
  traineeNomComplet: string | null;
}

function fmtDateTime(s: string) {
  return new Date(s).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ReclamationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [c, setC] = useState<Complaint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Champs éditables localement
  const [status, setStatus] = useState<ComplaintStatus>("new");
  const [responseType, setResponseType] = useState("");
  const [responseContent, setResponseContent] = useState("");
  const [actionCorrective, setActionCorrective] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [resolvedBy, setResolvedBy] = useState("");

  function load(signal?: AbortSignal) {
    setLoading(true);
    apiFetch<{ complaint: Complaint }>(`/api/admin/reclamations/${id}`, { signal })
      .then((d) => {
        const complaint = d.complaint;
        setC(complaint);
        setStatus(complaint.status);
        setResponseType(complaint.responseType);
        setResponseContent(complaint.responseContent);
        setActionCorrective(complaint.actionCorrective);
        setAdminNotes(complaint.adminNotes);
        setResolvedBy(complaint.resolvedBy);
      })
      .catch((e) => {
        if (isAbortError(e)) return;
        setError(apiErrorMessage(e, "Erreur"));
      })
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal);
    return () => ac.abort();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const d = await apiFetch<{ complaint: Complaint }>(`/api/admin/reclamations/${id}`, {
        method: "PUT",
        body: {
          status,
          responseType,
          responseContent,
          actionCorrective,
          adminNotes,
          resolvedBy,
        },
      });
      setC(d.complaint);
      setFeedback({ type: "success", msg: "Modifications enregistrées ✓" });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      setFeedback({ type: "error", msg: apiErrorMessage(err, "Erreur réseau") });
    } finally {
      setSaving(false);
    }
  }

  async function handleSendResponse() {
    if (sending) return;
    if (responseContent.trim().length < 10) {
      setFeedback({ type: "error", msg: "Le contenu de la réponse est requis (au moins 10 caractères)." });
      return;
    }
    if (!confirm(`Envoyer la réponse formelle à ${c?.authorEmail} ? La réclamation passera automatiquement en "Résolue".`)) return;
    setSending(true);
    setFeedback(null);
    try {
      // Sauvegarde d'abord les modifs locales (au cas où l'admin a édité sans cliquer Enregistrer)
      await apiFetch(`/api/admin/reclamations/${id}`, {
        method: "PUT",
        body: { responseType, responseContent, actionCorrective, adminNotes, resolvedBy },
      });
      const d = await apiFetch<{ success?: boolean; error?: string; complaint?: Complaint }>(
        `/api/admin/reclamations/${id}/send-response`,
        { method: "POST" }
      );
      if (!d.success || !d.complaint) {
        setFeedback({ type: "error", msg: d.error || "Échec d'envoi" });
        return;
      }
      setC(d.complaint);
      setStatus(d.complaint.status);
      setFeedback({ type: "success", msg: `Réponse envoyée à ${c?.authorEmail} ✓` });
      setTimeout(() => setFeedback(null), 5000);
    } catch (err) {
      setFeedback({ type: "error", msg: apiErrorMessage(err, "Erreur réseau") });
    } finally {
      setSending(false);
    }
  }

  if (loading) return <div className="text-center py-12 font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  if (error || !c) {
    return (
      <div className="text-center py-12">
        <p className="font-jetbrains text-sm" style={{ color: "#991b1b" }}>{error || "Réclamation introuvable"}</p>
        <Link href="/admin/reclamations" className="mt-4 inline-block underline text-sm" style={{ color: "#1f2244" }}>← Retour à la liste</Link>
      </div>
    );
  }

  const palette = STATUS_COLORS[c.status];
  const days = Math.floor((Date.now() - new Date(c.createdAt).getTime()) / (24 * 3600 * 1000));
  const isOverdue = !c.resolvedAt && days > 30;

  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-jetbrains" style={{ color: "#727485" }}>
        <Link href="/admin/formations" className="underline">Tableau de bord</Link>
        <span>›</span>
        <Link href="/admin/reclamations" className="underline">Réclamations</Link>
        <span>›</span>
        <span>{c?.number ?? "…"}</span>
      </div>
      <div className="mt-2 flex items-start justify-between gap-3 flex-wrap mb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <code className="px-2 py-0.5 rounded text-xs font-jetbrains" style={{ backgroundColor: "#1f2244", color: "white" }}>
              {c.number}
            </code>
            <span className="text-xs font-jetbrains px-2 py-0.5 rounded-full" style={{ backgroundColor: palette.bg, color: palette.fg }}>
              {STATUS_LABELS[c.status]}
            </span>
            {isOverdue && (
              <span className="text-xs font-jetbrains px-2 py-0.5 rounded-full" style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}>
                ⚠ En retard ({days} j)
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold mt-2" style={{ color: "#1f2244" }}>{c.subject}</h1>
          <p className="text-xs mt-1 font-jetbrains" style={{ color: "#727485" }}>
            Reçue le {fmtDateTime(c.createdAt)} via {c.receptionMode === "formulaire_web" ? "le formulaire public" : c.receptionMode}
          </p>
        </div>
      </div>

      {feedback && (
        <div className={`mb-4 p-3 rounded-lg text-sm font-jetbrains ${feedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {feedback.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* === Section réclamant (lecture seule) === */}
        <div className="p-5 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-4" style={{ color: "#1f2244" }}>
            Auteur de la réclamation
          </h2>
          <Info label="Nom" value={c.authorName} />
          <Info label="Email" value={c.authorEmail} mono />
          {c.authorCompany && <Info label="Entreprise" value={c.authorCompany} />}
          {c.authorRole && <Info label="Fonction" value={c.authorRole} />}

          {c.concernedName && (
            <>
              <h3 className="text-xs font-semibold uppercase tracking-wide mt-5 mb-2" style={{ color: "#727485" }}>
                Personne concernée (≠ auteur)
              </h3>
              <Info label="Nom" value={c.concernedName} />
              {c.concernedCompany && <Info label="Entreprise" value={c.concernedCompany} />}
              {c.concernedRole && <Info label="Fonction" value={c.concernedRole} />}
            </>
          )}

          {(c.formationNomLong || c.sessionCode) && (
            <>
              <h3 className="text-xs font-semibold uppercase tracking-wide mt-5 mb-2" style={{ color: "#727485" }}>
                Session liée
              </h3>
              {c.formationNomLong && <Info label="Formation" value={c.formationNomLong} />}
              {c.sessionCode && <Info label="Code session" value={c.sessionCode} mono />}
              {c.traineeNomComplet && <Info label="Stagiaire" value={c.traineeNomComplet} />}
            </>
          )}

          <h3 className="text-xs font-semibold uppercase tracking-wide mt-5 mb-2" style={{ color: "#727485" }}>
            Description
          </h3>
          <div className="text-sm whitespace-pre-wrap p-3 rounded-lg border" style={{ borderColor: "#e5e7eb", backgroundColor: "white", color: "#1f2244" }}>
            {c.description}
          </div>
        </div>

        {/* === Section admin (éditable) === */}
        <div className="p-5 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-4" style={{ color: "#1f2244" }}>
            Traitement (interne)
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>Statut</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ComplaintStatus)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                style={{ borderColor: "#d1d5db" }}
              >
                <option value="new">{STATUS_LABELS.new}</option>
                <option value="in_progress">{STATUS_LABELS.in_progress}</option>
                <option value="resolved">{STATUS_LABELS.resolved}</option>
                <option value="closed">{STATUS_LABELS.closed}</option>
              </select>
              {c.resolvedAt && (
                <p className="text-xs mt-1 font-jetbrains" style={{ color: "#9ca3af" }}>
                  Résolue le {fmtDateTime(c.resolvedAt)}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
                Action corrective mise en place <span className="text-xs" style={{ color: "#9ca3af" }}>(important pour Qualiopi)</span>
              </label>
              <textarea
                value={actionCorrective}
                onChange={(e) => setActionCorrective(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                style={{ borderColor: "#d1d5db" }}
                placeholder="Ex : remplacement du matériel défectueux, mise à jour de la procédure de check-in du matériel avant chaque session…"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
                Type de réponse adressée
              </label>
              <select
                value={responseType}
                onChange={(e) => setResponseType(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                style={{ borderColor: "#d1d5db" }}
              >
                <option value="">— Non défini —</option>
                <option value="email">Email</option>
                <option value="telephone">Téléphone</option>
                <option value="courrier">Courrier postal</option>
                <option value="rencontre">Rencontre / RDV</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
                Contenu de la réponse adressée au réclamant
                <span className="text-xs font-normal" style={{ color: "#9ca3af" }}> (ce texte sera envoyé par mail)</span>
              </label>
              <textarea
                value={responseContent}
                onChange={(e) => setResponseContent(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                style={{ borderColor: "#d1d5db" }}
                placeholder={"Bonjour " + c.authorName.split(" ")[0] + ",\n\nSuite à votre signalement, nous avons identifié que…\n\nNous avons mis en place…"}
              />
              {c.responseSentAt && (
                <p className="text-xs mt-1 font-jetbrains" style={{ color: "#166534" }}>
                  ✓ Réponse envoyée le {fmtDateTime(c.responseSentAt)}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>Traité par</label>
                <input
                  type="text"
                  value={resolvedBy}
                  onChange={(e) => setResolvedBy(e.target.value)}
                  placeholder="Noémie Marphay"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  style={{ borderColor: "#d1d5db" }}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
                Notes internes <span className="text-xs" style={{ color: "#9ca3af" }}>(non envoyées au réclamant)</span>
              </label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                style={{ borderColor: "#d1d5db" }}
              />
            </div>

            <div className="flex gap-2 flex-wrap pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-full text-sm font-medium border cursor-pointer disabled:opacity-50"
                style={{ borderColor: "#1f2244", color: "#1f2244" }}
              >
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
              <button
                onClick={handleSendResponse}
                disabled={sending || responseContent.trim().length < 10}
                className="px-4 py-2 rounded-full text-sm font-medium text-white cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: "#1f2244" }}
                title={responseContent.trim().length < 10 ? "Renseigne d'abord le contenu de la réponse (au moins 10 caractères)" : "Envoie le mail de réponse au réclamant et passe la réclamation à Résolue"}
              >
                {sending ? "Envoi..." : "📧 Envoyer la réponse au réclamant"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="mb-2">
      <div className="text-xs font-jetbrains" style={{ color: "#9ca3af" }}>{label}</div>
      <div className={`text-sm ${mono ? "font-jetbrains" : ""}`} style={{ color: "#1f2244" }}>{value}</div>
    </div>
  );
}
