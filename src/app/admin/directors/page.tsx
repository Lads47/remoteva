"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Director {
  id: string;
  name: string;
  email: string;
  phone: string;
  magicToken: string;
  active: boolean;
  createdAt: string;
}

const EMPTY_FORM = { name: "", email: "", phone: "" };

export default function DirectorsPage() {
  const [directors, setDirectors] = useState<Director[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "warning"; msg: string } | null>(null);

  useEffect(() => { fetchDirectors(); }, []);

  async function fetchDirectors() {
    try {
      const res = await fetch("/api/admin/directors");
      const data = await res.json();
      if (Array.isArray(data.directors)) setDirectors(data.directors);
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
      const res = await fetch("/api/admin/directors", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur");
        return;
      }
      // Pour la création : afficher le statut envoi du magic link
      if (!editingId) {
        if (data.emailSent) {
          setFeedback({ type: "success", msg: `Magic link envoyé à ${form.email}` });
        } else {
          setFeedback({ type: "warning", msg: `Réalisateur créé mais l'email n'a pas pu être envoyé : ${data.emailError ?? "erreur inconnue"}` });
        }
      } else {
        setFeedback({ type: "success", msg: "Réalisateur mis à jour" });
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      setShowForm(false);
      await fetchDirectors();
      setTimeout(() => setFeedback(null), 5000);
    } catch (err) {
      console.error(err);
      setError("Erreur connexion");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(d: Director) {
    setForm({ name: d.name, email: d.email, phone: d.phone });
    setEditingId(d.id);
    setShowForm(true);
    setError("");
  }

  async function handleToggleActive(d: Director) {
    try {
      const res = await fetch("/api/admin/directors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: d.id, active: !d.active }),
      });
      if (res.ok) await fetchDirectors();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete(d: Director) {
    if (!confirm(`Supprimer définitivement "${d.name}" ?\n\nCette action est irréversible. Préférez "Désactiver" pour conserver l'historique.`)) return;
    try {
      const res = await fetch(`/api/admin/directors?id=${d.id}`, { method: "DELETE" });
      if (res.ok) await fetchDirectors();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleRegenerateToken(d: Director) {
    if (!confirm(`Régénérer le lien magique pour "${d.name}" ?\n\nLe précédent lien deviendra invalide. Un nouveau mail sera envoyé à ${d.email}.`)) return;
    try {
      const res = await fetch(`/api/admin/directors/${d.id}/regenerate-token`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: "warning", msg: data.error ?? "Erreur" });
        return;
      }
      if (data.emailSent) {
        setFeedback({ type: "success", msg: `Nouveau magic link envoyé à ${d.email}` });
      } else {
        setFeedback({ type: "warning", msg: `Token régénéré mais email non envoyé (${data.emailError ?? "erreur"})` });
      }
      await fetchDirectors();
      setTimeout(() => setFeedback(null), 5000);
    } catch (err) {
      console.error(err);
    }
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    setError("");
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-pulse" style={{ color: "#727485" }}>Chargement…</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/dashboard" className="text-sm px-2 py-1 rounded hover:bg-gray-100" style={{ color: "#727485" }}>
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold mt-2" style={{ color: "#1f2244" }}>Réalisateurs</h1>
          <p className="mt-1" style={{ color: "#727485" }}>
            Gérer les intermittents disponibles pour les captations EVA Flow
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); setError(""); }}
          className="px-4 py-2 text-white rounded-lg transition-all hover:opacity-90"
          style={{ backgroundColor: "#1f2244" }}
        >
          + Nouveau réalisateur
        </button>
      </div>

      {feedback && (
        <div
          className="p-3 rounded-lg text-sm border"
          style={
            feedback.type === "success"
              ? { backgroundColor: "#d4edda", color: "#155724", borderColor: "#c3e6cb" }
              : { backgroundColor: "#fef3cd", color: "#856404", borderColor: "#ffeaa7" }
          }
        >
          {feedback.msg}
        </div>
      )}

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ color: "#1f2244" }}>
            {editingId ? "Modifier le réalisateur" : "Nouveau réalisateur"}
          </h2>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>Nom complet *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex : Paul Martin"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="paul@example.com"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              />
              {!editingId && (
                <p className="text-xs mt-1" style={{ color: "#727485" }}>
                  Un email avec le lien magique d&apos;accès au calendrier sera envoyé automatiquement.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>Téléphone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="06 12 34 56 78"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-white rounded-lg transition-all hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "#1f2244" }}
              >
                {saving ? "Enregistrement…" : editingId ? "Mettre à jour" : "Créer + envoyer magic link"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                style={{ color: "#727485" }}
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-4" style={{ color: "#1f2244" }}>
          Réalisateurs ({directors.filter((d) => d.active).length} actifs · {directors.filter((d) => !d.active).length} inactifs)
        </h2>

        {directors.length === 0 ? (
          <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
            <p style={{ color: "#727485" }}>Aucun réalisateur. Cliquez sur &quot;+ Nouveau réalisateur&quot; pour commencer.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {directors.map((d) => (
              <div
                key={d.id}
                className="bg-white border border-gray-200 rounded-lg p-4"
                style={!d.active ? { opacity: 0.6 } : {}}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium" style={{ color: "#1f2244" }}>{d.name}</h3>
                      {!d.active && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "#f5f5f7", color: "#727485" }}>
                          Inactif
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-sm space-y-1" style={{ color: "#727485" }}>
                      <div>📧 {d.email}</div>
                      {d.phone && <div>📞 {d.phone}</div>}
                      <div>Créé le : {new Date(d.createdAt).toLocaleString("fr-FR")}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 ml-4">
                    <button
                      onClick={() => handleToggleActive(d)}
                      className="text-xs px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50"
                      style={{ color: "#1f2244" }}
                    >
                      {d.active ? "Désactiver" : "Réactiver"}
                    </button>
                    <button
                      onClick={() => handleEdit(d)}
                      className="text-xs px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50"
                      style={{ color: "#1f2244" }}
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => handleRegenerateToken(d)}
                      className="text-xs px-3 py-1 border border-blue-200 rounded-lg hover:bg-blue-50"
                      style={{ color: "#1e40af" }}
                    >
                      Régénérer lien
                    </button>
                    <button
                      onClick={() => handleDelete(d)}
                      className="text-xs px-3 py-1 border border-red-200 rounded-lg hover:bg-red-50 text-red-600"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
