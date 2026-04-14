"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Types
interface FlowProject {
  id: string;
  title: string;
  date: string;
  location: string;
  room: string;
  speaker: string;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// Labels et couleurs des statuts
const STATUS_LABELS: Record<string, string> = {
  planned: "Planifi\u00e9",
  recording: "Enregistrement",
  ingest: "Transfert",
  ready_to_edit: "Pr\u00eat au montage",
  editing: "En montage",
  exported: "Export\u00e9",
  delivered: "Livr\u00e9",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  planned: { bg: "#e8f4fd", text: "#1f2244" },
  recording: { bg: "#fef3cd", text: "#856404" },
  ingest: { bg: "#fff3cd", text: "#664d03" },
  ready_to_edit: { bg: "#d1ecf1", text: "#0c5460" },
  editing: { bg: "#e8daef", text: "#6c3483" },
  exported: { bg: "#d4edda", text: "#155724" },
  delivered: { bg: "#cce5ff", text: "#004085" },
};

// Formulaire vide par d\u00e9faut
const EMPTY_FORM = {
  title: "",
  date: "",
  location: "",
  room: "",
  speaker: "",
  notes: "",
};

export default function FlowPage() {
  const [projects, setProjects] = useState<FlowProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/admin/flow");
      const data = await res.json();
      if (data.projects) {
        setProjects(data.projects);
      }
    } catch (err) {
      console.error("Erreur chargement projets:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);

    try {
      const method = editingId ? "PUT" : "POST";
      const body = editingId ? { id: editingId, ...form } : form;

      const res = await fetch("/api/admin/flow", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erreur lors de la sauvegarde");
        return;
      }

      // Rafra\u00eechir la liste
      await fetchProjects();
      resetForm();
    } catch (err) {
      console.error("Erreur sauvegarde:", err);
      setError("Erreur de connexion");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (project: FlowProject) => {
    setForm({
      title: project.title,
      date: project.date.split("T")[0], // Format YYYY-MM-DD
      location: project.location,
      room: project.room,
      speaker: project.speaker,
      notes: project.notes,
    });
    setEditingId(project.id);
    setShowForm(true);
    setError("");
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Supprimer le projet "${title}" ?`)) return;

    try {
      const res = await fetch(`/api/admin/flow?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchProjects();
      }
    } catch (err) {
      console.error("Erreur suppression:", err);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await fetch("/api/admin/flow", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      });
      await fetchProjects();
    } catch (err) {
      console.error("Erreur changement statut:", err);
    }
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    setError("");
  };

  // Filtrage des projets
  const filteredProjects = filterStatus === "all"
    ? projects
    : projects.filter((p) => p.status === filterStatus);

  // Stats rapides
  const stats = {
    total: projects.length,
    planned: projects.filter((p) => p.status === "planned").length,
    inProgress: projects.filter((p) =>
      ["recording", "ingest", "editing"].includes(p.status)
    ).length,
    done: projects.filter((p) =>
      ["exported", "delivered"].includes(p.status)
    ).length,
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-pulse" style={{ color: "#727485" }}>Chargement...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* En-t\u00eate */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/dashboard"
              className="text-sm px-2 py-1 rounded hover:bg-gray-100 transition-colors"
              style={{ color: "#727485" }}
            >
              \u2190 Dashboard
            </Link>
          </div>
          <h1 className="text-2xl font-bold mt-2" style={{ color: "#1f2244" }}>
            EVA Flow
          </h1>
          <p className="mt-1" style={{ color: "#727485" }}>
            Gestion des projets de captation vid\u00e9o
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setEditingId(null); setForm(EMPTY_FORM); }}
          className="px-4 py-2 text-white rounded-lg transition-all hover:opacity-90"
          style={{ backgroundColor: "#1f2244" }}
        >
          + Nouveau projet
        </button>
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg" style={{ backgroundColor: "#f5f5f7" }}>
          <p className="text-sm" style={{ color: "#727485" }}>Total projets</p>
          <p className="text-3xl font-bold mt-1" style={{ color: "#1f2244" }}>{stats.total}</p>
        </div>
        <div className="p-4 rounded-lg" style={{ backgroundColor: "#e8f4fd" }}>
          <p className="text-sm" style={{ color: "#727485" }}>Planifi\u00e9s</p>
          <p className="text-3xl font-bold mt-1" style={{ color: "#1f2244" }}>{stats.planned}</p>
        </div>
        <div className="p-4 rounded-lg" style={{ backgroundColor: "#fef3cd" }}>
          <p className="text-sm" style={{ color: "#727485" }}>En cours</p>
          <p className="text-3xl font-bold mt-1" style={{ color: "#856404" }}>{stats.inProgress}</p>
        </div>
        <div className="p-4 rounded-lg" style={{ backgroundColor: "#d4edda" }}>
          <p className="text-sm" style={{ color: "#727485" }}>Termin\u00e9s</p>
          <p className="text-3xl font-bold mt-1" style={{ color: "#155724" }}>{stats.done}</p>
        </div>
      </div>

      {/* Formulaire (affich\u00e9/masqu\u00e9) */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ color: "#1f2244" }}>
            {editingId ? "Modifier le projet" : "Nouveau projet"}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Titre */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>
                  Titre du projet *
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Ex: Conf\u00e9rence IA & Sant\u00e9 2026"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>
                  Date de captation *
                </label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
              </div>

              {/* Lieu */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>
                  Lieu *
                </label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Ex: Montpellier"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
              </div>

              {/* Salle */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>
                  Salle *
                </label>
                <input
                  type="text"
                  value={form.room}
                  onChange={(e) => setForm({ ...form, room: e.target.value })}
                  placeholder="Ex: Amphi A"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
              </div>

              {/* Intervenant */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>
                  Intervenant(s)
                </label>
                <input
                  type="text"
                  value={form.speaker}
                  onChange={(e) => setForm({ ...form, speaker: e.target.value })}
                  placeholder="Ex: Dr. Martin, Prof. Dupont"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
              </div>

              {/* Notes */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>
                  Notes
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Notes libres (optionnel)"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 resize-none"
                />
              </div>
            </div>

            {/* Boutons */}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-white rounded-lg transition-all hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "#1f2244" }}
              >
                {saving ? "Enregistrement..." : editingId ? "Mettre \u00e0 jour" : "Cr\u00e9er le projet"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                style={{ color: "#727485" }}
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filtre par statut */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium" style={{ color: "#727485" }}>Filtrer :</span>
        <button
          onClick={() => setFilterStatus("all")}
          className={`text-xs px-3 py-1 rounded-full transition-colors ${
            filterStatus === "all" ? "text-white" : "border border-gray-300"
          }`}
          style={filterStatus === "all" ? { backgroundColor: "#1f2244" } : { color: "#727485" }}
        >
          Tous ({projects.length})
        </button>
        {Object.entries(STATUS_LABELS).map(([key, label]) => {
          const count = projects.filter((p) => p.status === key).length;
          if (count === 0) return null;
          const colors = STATUS_COLORS[key];
          return (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                filterStatus === key ? "ring-2 ring-offset-1 ring-gray-400" : ""
              }`}
              style={{ backgroundColor: colors.bg, color: colors.text }}
            >
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* Liste des projets */}
      <div>
        <h2 className="text-lg font-semibold mb-4" style={{ color: "#1f2244" }}>
          Projets ({filteredProjects.length})
        </h2>

        {filteredProjects.length === 0 ? (
          <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
            <p style={{ color: "#727485" }}>
              {projects.length === 0
                ? "Aucun projet cr\u00e9\u00e9. Cliquez sur \"+ Nouveau projet\" pour commencer."
                : "Aucun projet avec ce filtre."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium" style={{ color: "#1f2244" }}>
                        {project.title}
                      </h3>
                      {/* Badge statut */}
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          backgroundColor: STATUS_COLORS[project.status]?.bg || "#f5f5f7",
                          color: STATUS_COLORS[project.status]?.text || "#1f2244",
                        }}
                      >
                        {STATUS_LABELS[project.status] || project.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm" style={{ color: "#727485" }}>
                      <span>\uD83D\uDCC5 {new Date(project.date).toLocaleDateString("fr-FR")}</span>
                      <span>\uD83D\uDCCD {project.location}</span>
                      <span>\uD83C\uDFE0 {project.room}</span>
                      {project.speaker && <span>\uD83C\uDF99\uFE0F {project.speaker}</span>}
                    </div>
                    {project.notes && (
                      <p className="mt-2 text-sm" style={{ color: "#727485" }}>
                        {project.notes}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 ml-4">
                    {/* S\u00e9lecteur de statut */}
                    <select
                      value={project.status}
                      onChange={(e) => handleStatusChange(project.id, e.target.value)}
                      className="text-xs px-2 py-1 border border-gray-300 rounded-lg focus:outline-none"
                      style={{ color: "#1f2244" }}
                    >
                      {Object.entries(STATUS_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleEdit(project)}
                      className="text-xs px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      style={{ color: "#1f2244" }}
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => handleDelete(project.id, project.title)}
                      className="text-xs px-3 py-1 border border-red-200 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
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
