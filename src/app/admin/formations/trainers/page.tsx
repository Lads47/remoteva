"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Trainer {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  magicToken: string;
  active: boolean;
  createdAt: string;
  sessionCount: number;
}

const EMPTY_FORM = { nom: "", prenom: "", email: "", telephone: "" };

export default function TrainersPage() {
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "warning" | "error"; msg: string } | null>(null);
  const [linkCopied, setLinkCopied] = useState<string | null>(null);

  const editingTrainer = editingId ? trainers.find((t) => t.id === editingId) : null;
  const magicLink = editingTrainer
    ? `${typeof window !== "undefined" ? window.location.origin : "https://evaremote.com"}/formateur?token=${editingTrainer.magicToken}`
    : "";

  async function copyMagicLink(t: Trainer) {
    const url = `${typeof window !== "undefined" ? window.location.origin : "https://evaremote.com"}/formateur?token=${t.magicToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(t.id);
      setTimeout(() => setLinkCopied(null), 2000);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    fetchTrainers();
  }, []);

  async function fetchTrainers() {
    try {
      const res = await fetch("/api/admin/trainers");
      const data = await res.json();
      if (Array.isArray(data.trainers)) setTrainers(data.trainers);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const method = editingId ? "PUT" : "POST";
      const body = editingId ? { id: editingId, ...form } : form;
      const res = await fetch("/api/admin/trainers", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur");
        return;
      }
      if (!editingId) {
        if (data.emailSent) {
          setFeedback({ type: "success", msg: `Magic link envoyé à ${form.email}` });
        } else {
          setFeedback({
            type: "warning",
            msg: `Formateur créé mais l'email n'a pas pu être envoyé : ${data.emailError ?? "erreur inconnue"}`,
          });
        }
      } else {
        setFeedback({ type: "success", msg: "Formateur mis à jour" });
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      await fetchTrainers();
      setTimeout(() => setFeedback(null), 5000);
    } catch (err) {
      console.error(err);
      setError("Erreur connexion");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(t: Trainer) {
    setEditingId(t.id);
    setForm({ nom: t.nom, prenom: t.prenom, email: t.email, telephone: t.telephone });
    setShowForm(true);
    setError("");
  }

  async function handleToggleActive(t: Trainer) {
    try {
      const res = await fetch("/api/admin/trainers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, active: !t.active }),
      });
      if (!res.ok) return;
      await fetchTrainers();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleRegenerate(t: Trainer) {
    if (!confirm(`Régénérer un nouveau lien d'accès pour ${t.prenom} ${t.nom} et le lui envoyer par email ?\nL'ancien lien deviendra invalide.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/trainers/${t.id}/regenerate-token`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", msg: data.error || "Erreur" });
        setTimeout(() => setFeedback(null), 5000);
        return;
      }
      setFeedback({
        type: data.emailSent ? "success" : "warning",
        msg: data.emailSent
          ? `Nouveau lien envoyé à ${t.email}`
          : `Nouveau lien généré mais email non envoyé : ${data.emailError ?? "?"}`,
      });
      await fetchTrainers();
      setTimeout(() => setFeedback(null), 5000);
    } catch {
      setFeedback({ type: "error", msg: "Erreur de connexion" });
    }
  }

  async function handleDelete(t: Trainer) {
    if (t.sessionCount > 0) {
      if (!confirm(`${t.prenom} ${t.nom} est lié·e à ${t.sessionCount} session(s). Si tu le supprimes, ces sessions n'auront plus de formateur (elles ne sont pas supprimées). Continuer ?`)) {
        return;
      }
    } else {
      if (!confirm(`Supprimer définitivement ${t.prenom} ${t.nom} ?`)) return;
    }
    try {
      const res = await fetch(`/api/admin/trainers?id=${t.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", msg: data.error || "Erreur" });
        setTimeout(() => setFeedback(null), 5000);
        return;
      }
      setFeedback({ type: "success", msg: "Formateur supprimé" });
      await fetchTrainers();
      setTimeout(() => setFeedback(null), 3000);
    } catch {
      setFeedback({ type: "error", msg: "Erreur de connexion" });
    }
  }

  function handleCancel() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    setError("");
  }

  if (loading) {
    return <div className="text-center py-12 font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: "#1f2244" }}>
            Formateurs
          </h1>
          <p className="text-sm mt-1 font-jetbrains" style={{ color: "#727485" }}>
            Gère les formateurs qui animent les sessions. Chaque formateur reçoit un lien magique
            personnel pour accéder à son espace.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/admin/formations"
            className="px-4 py-2 rounded-full text-sm font-medium border cursor-pointer"
            style={{ borderColor: "#1f2244", color: "#1f2244" }}
          >
            ← Tableau de bord
          </Link>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 rounded-full text-sm font-medium text-white cursor-pointer"
              style={{ backgroundColor: "#1f2244" }}
            >
              + Nouveau formateur
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm font-jetbrains ${
            feedback.type === "success"
              ? "bg-green-50 text-green-800"
              : feedback.type === "warning"
              ? "bg-yellow-50 text-yellow-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-8 p-6 rounded-lg border space-y-4"
          style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}
        >
          <h2 className="text-xl font-semibold" style={{ color: "#1f2244" }}>
            {editingId ? "Modifier le formateur" : "Nouveau formateur"}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Prénom" required>
              <input
                type="text"
                value={form.prenom}
                onChange={(e) => setForm({ ...form, prenom: e.target.value })}
                placeholder="Marie"
                className="input"
                required
              />
            </Field>
            <Field label="Nom" required>
              <input
                type="text"
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                placeholder="Dupont"
                className="input"
                required
              />
            </Field>
            <Field label="Email" required>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="marie.dupont@exemple.fr"
                className="input"
                required
              />
            </Field>
            <Field label="Téléphone">
              <input
                type="tel"
                value={form.telephone}
                onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                placeholder="06 12 34 56 78"
                className="input"
              />
            </Field>
          </div>

          {editingId && magicLink && (
            <div className="p-3 rounded-lg border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
              <p className="text-xs font-jetbrains mb-2" style={{ color: "#727485" }}>
                Lien d&apos;accès personnel :
              </p>
              <code className="text-xs font-jetbrains break-all" style={{ color: "#1f2244" }}>
                {magicLink}
              </code>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-full text-sm font-medium text-white disabled:opacity-50 cursor-pointer"
              style={{ backgroundColor: "#1f2244" }}
            >
              {saving ? "Enregistrement..." : editingId ? "Mettre à jour" : "Créer + envoyer le magic-link"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 rounded-full text-sm font-medium border cursor-pointer"
              style={{ borderColor: "#d1d5db", color: "#374151" }}
            >
              Annuler
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
      )}

      {trainers.length === 0 ? (
        <div className="text-center py-12 border rounded-lg font-jetbrains text-sm" style={{ borderColor: "#e5e7eb", color: "#727485" }}>
          Aucun formateur. Crée le premier via &laquo; + Nouveau formateur &raquo;.
        </div>
      ) : (
        <div className="space-y-3">
          {trainers.map((t) => (
            <div
              key={t.id}
              className="p-4 rounded-lg border flex items-center justify-between gap-4 flex-wrap"
              style={{ borderColor: "#e5e7eb" }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="font-semibold" style={{ color: "#1f2244" }}>
                    {t.prenom} {t.nom}
                  </h3>
                  {!t.active && (
                    <span className="px-2 py-0.5 rounded text-xs font-jetbrains bg-gray-200 text-gray-600">
                      désactivé
                    </span>
                  )}
                  {t.sessionCount > 0 && (
                    <span className="px-2 py-0.5 rounded text-xs font-jetbrains" style={{ backgroundColor: "#e0e7ff", color: "#3730a3" }}>
                      {t.sessionCount} session{t.sessionCount > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="text-xs mt-1 font-jetbrains" style={{ color: "#727485" }}>
                  {t.email}
                  {t.telephone && ` · ${t.telephone}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyMagicLink(t)}
                  className="text-xs px-3 py-1.5 rounded-full cursor-pointer transition-colors"
                  style={{
                    backgroundColor: linkCopied === t.id ? "#dcfce7" : "#7dcef5",
                    color: linkCopied === t.id ? "#166534" : "#1f2244",
                  }}
                >
                  {linkCopied === t.id ? "Copié ✓" : "Copier le lien"}
                </button>
                <button
                  onClick={() => handleRegenerate(t)}
                  className="text-xs px-3 py-1.5 rounded-full border cursor-pointer"
                  style={{ borderColor: "#1f2244", color: "#1f2244" }}
                >
                  Régénérer
                </button>
                <button
                  onClick={() => handleToggleActive(t)}
                  className="text-xs px-3 py-1.5 rounded-full border cursor-pointer"
                  style={{ borderColor: "#d1d5db", color: "#374151" }}
                >
                  {t.active ? "Désactiver" : "Réactiver"}
                </button>
                <button
                  onClick={() => handleEdit(t)}
                  className="text-xs px-3 py-1.5 rounded-full cursor-pointer"
                  style={{ backgroundColor: "#e0e7ff", color: "#3730a3" }}
                >
                  Modifier
                </button>
                <button
                  onClick={() => handleDelete(t)}
                  className="text-xs px-3 py-1.5 rounded-full border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
