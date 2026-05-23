"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface FlowProject {
  id: string;
  eventId: string;
  title: string;
  date: string;
  location: string;
  room: string;
  speaker: string;
  director: string;
  directorId: string | null;
  regie: string | null;
  status: string;
  notes: string;
  availableDirectorsCount?: number;
}

interface Director {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  planned: "Planifié",
  recording: "Enregistrement",
  ingest: "Transfert",
  ready_to_edit: "Prêt au montage",
  editing: "En montage",
  exported: "Exporté",
  delivered: "Livré",
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

interface ConferenceFormItem {
  title: string;
  speaker: string;
  scheduledStart: string;
  scheduledEnd: string;
}

const EMPTY_CONF: ConferenceFormItem = { title: "", speaker: "", scheduledStart: "", scheduledEnd: "" };

const EMPTY_FORM = {
  title: "",
  date: "",
  location: "",
  room: "",
  directorId: "" as string,
  notes: "",
  conferences: [{ ...EMPTY_CONF }],
};

export default function FlowPage() {
  const [projects, setProjects] = useState<FlowProject[]>([]);
  const [directors, setDirectors] = useState<Director[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    try {
      const [projRes, dirRes] = await Promise.all([
        fetch("/api/admin/flow"),
        fetch("/api/admin/directors"),
      ]);
      const projData = await projRes.json();
      const dirData = await dirRes.json();
      if (Array.isArray(projData.projects)) setProjects(projData.projects);
      if (Array.isArray(dirData.directors)) setDirectors(dirData.directors);
    } catch (err) {
      console.error("Erreur chargement:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const validConfs = form.conferences
        .filter((c) => c.title.trim() !== "")
        .map((c) => {
          const start = c.scheduledStart && form.date ? new Date(`${form.date}T${c.scheduledStart}:00`).toISOString() : undefined;
          const end = c.scheduledEnd && form.date ? new Date(`${form.date}T${c.scheduledEnd}:00`).toISOString() : undefined;
          return { title: c.title.trim(), speaker: c.speaker.trim(), scheduledStart: start, scheduledEnd: end };
        });

      const directorObj = directors.find((d) => d.id === form.directorId);
      const body = {
        title: form.title,
        date: form.date,
        location: form.location,
        room: form.room,
        director: directorObj?.name ?? "",
        directorId: form.directorId || null,
        notes: form.notes,
        conferences: validConfs.length > 0 ? validConfs : undefined,
      };

      const res = await fetch("/api/admin/flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur");
        return;
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      await fetchAll();
    } catch (err) {
      console.error(err);
      setError("Erreur connexion");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: FlowProject) {
    if (!confirm(`Supprimer l'événement "${p.title}" (${p.eventId}) ?\n\nLes conférences associées seront aussi supprimées.`)) return;
    try {
      const res = await fetch(`/api/admin/flow?id=${p.id}`, { method: "DELETE" });
      if (res.ok) await fetchAll();
    } catch (err) {
      console.error(err);
    }
  }

  function addConferenceField() {
    setForm({ ...form, conferences: [...form.conferences, { ...EMPTY_CONF }] });
  }

  function removeConferenceField(idx: number) {
    if (form.conferences.length === 1) return;
    setForm({ ...form, conferences: form.conferences.filter((_, i) => i !== idx) });
  }

  function updateConference(idx: number, field: keyof ConferenceFormItem, value: string) {
    const next = [...form.conferences];
    next[idx] = { ...next[idx], [field]: value };
    setForm({ ...form, conferences: next });
  }

  const filteredProjects = filterStatus === "all" ? projects : projects.filter((p) => p.status === filterStatus);

  const stats = {
    total: projects.length,
    planned: projects.filter((p) => p.status === "planned").length,
    inProgress: projects.filter((p) => ["recording", "ingest", "ready_to_edit", "editing"].includes(p.status)).length,
    done: projects.filter((p) => ["exported", "delivered"].includes(p.status)).length,
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-pulse" style={{ color: "#727485" }}>Chargement…</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* En-tête + breadcrumb fournis par /admin/flow/layout.tsx (Phase 5) */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold" style={{ color: "#1f2244" }}>
          Événements
        </h2>
        <button
          onClick={() => { setShowForm(true); setForm(EMPTY_FORM); setError(""); }}
          className="px-4 py-2 text-white rounded-lg transition-all hover:opacity-90"
          style={{ backgroundColor: "#1f2244" }}
        >
          + Nouvel événement
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard title="Total événements" value={stats.total} bg="#f5f5f7" text="#1f2244" />
        <StatCard title="Planifiés" value={stats.planned} bg="#e8f4fd" text="#1f2244" />
        <StatCard title="En cours" value={stats.inProgress} bg="#fef3cd" text="#856404" />
        <StatCard title="Terminés" value={stats.done} bg="#d4edda" text="#155724" />
      </div>

      {showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ color: "#1f2244" }}>Nouvel événement</h2>
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>Titre de l&apos;événement *</label>
                <input
                  type="text" value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Ex : Journée sur les nuages" required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>Date *</label>
                <input
                  type="date" value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>Réalisateur (optionnel)</label>
                <select
                  value={form.directorId}
                  onChange={(e) => setForm({ ...form, directorId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                >
                  <option value="">— Non assigné —</option>
                  {directors.filter((d) => d.active).map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>Lieu *</label>
                <input
                  type="text" value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Ex : Paris" required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>Salle *</label>
                <input
                  type="text" value={form.room}
                  onChange={(e) => setForm({ ...form, room: e.target.value })}
                  placeholder="Ex : Amphi A" required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2} placeholder="Optionnel"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 resize-none"
                />
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium" style={{ color: "#1f2244" }}>
                  Conférences ({form.conferences.filter((c) => c.title.trim()).length})
                </h3>
                <button
                  type="button" onClick={addConferenceField}
                  className="text-xs px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50"
                  style={{ color: "#1f2244" }}
                >+ Ajouter une conférence</button>
              </div>
              <div className="space-y-3">
                {form.conferences.map((c, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-start p-3 border border-gray-200 rounded-lg" style={{ backgroundColor: "#fafbfc" }}>
                    <div className="col-span-12 sm:col-span-4">
                      <label className="text-xs" style={{ color: "#727485" }}>Titre</label>
                      <input
                        type="text" value={c.title}
                        onChange={(e) => updateConference(idx, "title", e.target.value)}
                        placeholder={`Conf ${idx + 1}`}
                        className="w-full mt-1 px-2 py-1.5 text-sm border border-gray-300 rounded"
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-3">
                      <label className="text-xs" style={{ color: "#727485" }}>Speaker</label>
                      <input
                        type="text" value={c.speaker}
                        onChange={(e) => updateConference(idx, "speaker", e.target.value)}
                        placeholder="Optionnel"
                        className="w-full mt-1 px-2 py-1.5 text-sm border border-gray-300 rounded"
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <label className="text-xs" style={{ color: "#727485" }}>Début</label>
                      <input
                        type="time" value={c.scheduledStart}
                        onChange={(e) => updateConference(idx, "scheduledStart", e.target.value)}
                        className="w-full mt-1 px-2 py-1.5 text-sm border border-gray-300 rounded"
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <label className="text-xs" style={{ color: "#727485" }}>Fin</label>
                      <input
                        type="time" value={c.scheduledEnd}
                        onChange={(e) => updateConference(idx, "scheduledEnd", e.target.value)}
                        className="w-full mt-1 px-2 py-1.5 text-sm border border-gray-300 rounded"
                      />
                    </div>
                    <div className="col-span-12 sm:col-span-1 flex items-end justify-end">
                      <button
                        type="button"
                        onClick={() => removeConferenceField(idx)}
                        disabled={form.conferences.length === 1}
                        className="text-xs px-2 py-1.5 border border-red-200 rounded hover:bg-red-50 text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs mt-2" style={{ color: "#727485" }}>
                Tu peux laisser vide. Tu pourras ajouter des conférences plus tard depuis la fiche événement.
              </p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit" disabled={saving}
                className="px-4 py-2 text-white rounded-lg transition-all hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "#1f2244" }}
              >{saving ? "Création…" : "Créer l'événement"}</button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setError(""); }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                style={{ color: "#727485" }}
              >Annuler</button>
            </div>
          </form>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium" style={{ color: "#727485" }}>Filtrer :</span>
        <button
          onClick={() => setFilterStatus("all")}
          className={`text-xs px-3 py-1 rounded-full transition-colors ${filterStatus === "all" ? "text-white" : "border border-gray-300"}`}
          style={filterStatus === "all" ? { backgroundColor: "#1f2244" } : { color: "#727485" }}
        >Tous ({projects.length})</button>
        {Object.entries(STATUS_LABELS).map(([key, label]) => {
          const count = projects.filter((p) => p.status === key).length;
          if (count === 0) return null;
          const colors = STATUS_COLORS[key];
          return (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${filterStatus === key ? "ring-2 ring-offset-1 ring-gray-400" : ""}`}
              style={{ backgroundColor: colors.bg, color: colors.text }}
            >{label} ({count})</button>
          );
        })}
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4" style={{ color: "#1f2244" }}>
          Événements ({filteredProjects.length})
        </h2>

        {filteredProjects.length === 0 ? (
          <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
            <p style={{ color: "#727485" }}>
              {projects.length === 0 ? 'Aucun événement créé. Cliquez sur "+ Nouvel événement" pour commencer.' : "Aucun événement avec ce filtre."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProjects.map((p) => (
              <Link
                key={p.id}
                href={`/admin/flow/${p.id}`}
                className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs px-2 py-0.5 rounded font-mono font-bold" style={{ backgroundColor: "#7dcef5", color: "#1f2244" }}>
                        {p.eventId}
                      </span>
                      <h3 className="font-medium" style={{ color: "#1f2244" }}>{p.title}</h3>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{
                          backgroundColor: STATUS_COLORS[p.status]?.bg ?? "#f5f5f7",
                          color: STATUS_COLORS[p.status]?.text ?? "#1f2244",
                        }}
                      >{STATUS_LABELS[p.status] ?? p.status}</span>
                      {p.regie && (
                        <span className="text-xs px-2 py-0.5 rounded font-mono" style={{ backgroundColor: "#e8f4fd", color: "#1f2244" }}>
                          {p.regie}
                        </span>
                      )}
                      {p.directorId ? (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-bold"
                          style={{ backgroundColor: "#d4edda", color: "#155724" }}
                          title={`Réalisateur validé : ${p.director}`}
                        >
                          ✓ Validé
                        </span>
                      ) : p.availableDirectorsCount !== undefined && p.availableDirectorsCount > 0 ? (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-bold animate-pulse"
                          style={{ backgroundColor: "#fef3cd", color: "#856404", border: "1.5px solid #f59e0b" }}
                          title="Cliquer pour valider un réalisateur"
                        >
                          👥 {p.availableDirectorsCount} dispo{p.availableDirectorsCount > 1 ? "s" : ""}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm flex-wrap" style={{ color: "#727485" }}>
                      <span>📅 {new Date(p.date).toLocaleDateString("fr-FR")}</span>
                      <span>📍 {p.location}</span>
                      <span>🏛 {p.room}</span>
                      {p.director && <span>🎬 {p.director}</span>}
                    </div>
                    {p.notes && <p className="mt-2 text-sm" style={{ color: "#727485" }}>{p.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <span className="text-sm px-3 py-1 rounded-lg" style={{ backgroundColor: "#f5f5f7", color: "#1f2244" }}>
                      Voir →
                    </span>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(p); }}
                      className="text-xs px-3 py-1 border border-red-200 rounded-lg hover:bg-red-50 text-red-600"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, bg, text }: { title: string; value: number; bg: string; text: string }) {
  return (
    <div className="p-4 rounded-lg" style={{ backgroundColor: bg }}>
      <p className="text-sm" style={{ color: "#727485" }}>{title}</p>
      <p className="text-3xl font-bold mt-1" style={{ color: text }}>{value}</p>
    </div>
  );
}
