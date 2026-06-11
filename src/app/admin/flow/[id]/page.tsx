"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, apiFetch, apiErrorMessage, isAbortError } from "@/lib/api-client";

interface Conference {
  id: string;
  order: number;
  title: string;
  speaker: string;
  status: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  startTime: string | null;
  endTime: string | null;
  localFolder: string | null;
  durationSeconds: number | null;
}

interface Project {
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
  recordingLocalPath: string | null;
  status: string;
  notes: string;
  conferences: Conference[];
}

interface Director {
  id: string;
  name: string;
  email: string;
  phone: string;
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
  not_captured: "Non capté",
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  planned: { bg: "#e8f4fd", text: "#1f2244" },
  recording: { bg: "#fef3cd", text: "#856404" },
  ingest: { bg: "#fff3cd", text: "#664d03" },
  ready_to_edit: { bg: "#d1ecf1", text: "#0c5460" },
  editing: { bg: "#e8daef", text: "#6c3483" },
  exported: { bg: "#d4edda", text: "#155724" },
  delivered: { bg: "#cce5ff", text: "#004085" },
  not_captured: { bg: "#f5f5f7", text: "#727485" },
};

export default function FlowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [availableDirectors, setAvailableDirectors] = useState<Director[]>([]);
  const [allDirectors, setAllDirectors] = useState<Director[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "warning" | "error"; msg: string } | null>(null);

  // Form édition événement
  const [editForm, setEditForm] = useState({
    title: "", date: "", location: "", room: "", notes: "",
    regie: "" as string, recordingLocalPath: "" as string,
  });

  // Form ajout conf
  const [showAddConf, setShowAddConf] = useState(false);
  const [newConf, setNewConf] = useState({ title: "", speaker: "", scheduledStart: "", scheduledEnd: "" });

  useEffect(() => {
    const ac = new AbortController();
    fetchAll(ac.signal);
    return () => ac.abort();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll(signal?: AbortSignal) {
    try {
      const [projData, allDirData] = await Promise.all([
        apiFetch<{ project?: Project; availableDirectors?: Director[] }>(`/api/admin/flow/${id}`, { signal }),
        apiFetch<{ directors?: Director[] }>("/api/admin/directors", { signal }),
      ]);
      if (projData.project) {
        setProject(projData.project);
        setEditForm({
          title: projData.project.title,
          date: projData.project.date.split("T")[0],
          location: projData.project.location,
          room: projData.project.room,
          notes: projData.project.notes,
          regie: projData.project.regie ?? "",
          recordingLocalPath: projData.project.recordingLocalPath ?? "",
        });
      }
      if (Array.isArray(projData.availableDirectors)) setAvailableDirectors(projData.availableDirectors);
      if (Array.isArray(allDirData.directors)) setAllDirectors(allDirData.directors);
    } catch (err) {
      if (isAbortError(err)) return;
      if (err instanceof ApiError && err.status === 404) {
        router.push("/admin/flow");
        return;
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function showFeedback(type: "success" | "warning" | "error", msg: string) {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 5000);
  }

  async function handleSaveProject(e: React.FormEvent) {
    e.preventDefault();
    setSavingEdit(true);
    try {
      const body: Record<string, unknown> = {
        id,
        title: editForm.title,
        date: editForm.date,
        location: editForm.location,
        room: editForm.room,
        notes: editForm.notes,
        regie: editForm.regie || null,
        recordingLocalPath: editForm.recordingLocalPath || null,
      };
      await apiFetch("/api/admin/flow", { method: "PUT", body });
      await fetchAll();
      setEditing(false);
      showFeedback("success", "Événement mis à jour");
    } catch (err) {
      showFeedback("error", apiErrorMessage(err, "Erreur"));
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleAssignDirector(directorId: string | null) {
    try {
      const data = await apiFetch<{ emailSent?: boolean; director?: { email?: string }; emailError?: string }>(
        `/api/admin/flow/${id}/assign-director`,
        { method: "POST", body: { directorId } }
      );
      await fetchAll();
      if (directorId === null) {
        showFeedback("success", "Réalisateur désassigné");
      } else if (data.emailSent) {
        showFeedback("success", `Feuille de route envoyée à ${data.director?.email}`);
      } else {
        showFeedback("warning", `Réal assigné mais email non envoyé (${data.emailError ?? "erreur"})`);
      }
    } catch (err) {
      console.error(err);
      showFeedback("error", apiErrorMessage(err, "Erreur"));
    }
  }

  async function handleConfStatusChange(confId: string, newStatus: string) {
    try {
      await apiFetch(`/api/admin/flow/${id}/conferences/${confId}`, {
        method: "PUT",
        body: { status: newStatus },
      });
      await fetchAll();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleConfDelete(conf: Conference) {
    if (!confirm(`Supprimer la conférence "${conf.title}" ?`)) return;
    try {
      await apiFetch(`/api/admin/flow/${id}/conferences/${conf.id}`, { method: "DELETE" });
      await fetchAll();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleAddConf(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;
    try {
      const start = newConf.scheduledStart && project.date
        ? new Date(`${project.date.split("T")[0]}T${newConf.scheduledStart}:00`).toISOString()
        : undefined;
      const end = newConf.scheduledEnd && project.date
        ? new Date(`${project.date.split("T")[0]}T${newConf.scheduledEnd}:00`).toISOString()
        : undefined;

      await apiFetch(`/api/admin/flow/${id}/conferences`, {
        method: "POST",
        body: {
          title: newConf.title,
          speaker: newConf.speaker,
          scheduledStart: start,
          scheduledEnd: end,
        },
      });
      setNewConf({ title: "", speaker: "", scheduledStart: "", scheduledEnd: "" });
      setShowAddConf(false);
      await fetchAll();
    } catch (err) {
      console.error(err);
    }
  }

  function formatDuration(secs: number | null): string {
    if (!secs) return "—";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s.toString().padStart(2, "0")}s`;
  }

  function formatTime(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-pulse" style={{ color: "#727485" }}>Chargement…</div>
      </div>
    );
  }

  if (!project) {
    return <div className="text-center py-12" style={{ color: "#727485" }}>Événement introuvable</div>;
  }

  const projectStatusColor = STATUS_COLORS[project.status] ?? { bg: "#f5f5f7", text: "#1f2244" };

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/flow" className="text-sm px-2 py-1 rounded hover:bg-gray-100" style={{ color: "#727485" }}>
          ← Liste des événements
        </Link>
      </div>

      {feedback && (
        <div
          className="p-3 rounded-lg text-sm border"
          style={
            feedback.type === "success"
              ? { backgroundColor: "#d4edda", color: "#155724", borderColor: "#c3e6cb" }
              : feedback.type === "warning"
              ? { backgroundColor: "#fef3cd", color: "#856404", borderColor: "#ffeaa7" }
              : { backgroundColor: "#fef2f2", color: "#991b1b", borderColor: "#fecaca" }
          }
        >
          {feedback.msg}
        </div>
      )}

      {/* Header événement */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm px-3 py-1 rounded font-mono font-bold" style={{ backgroundColor: "#7dcef5", color: "#1f2244" }}>
                {project.eventId}
              </span>
              <span
                className="text-xs px-2 py-1 rounded-full font-medium"
                style={{ backgroundColor: projectStatusColor.bg, color: projectStatusColor.text }}
              >
                {STATUS_LABELS[project.status] ?? project.status}
              </span>
              {project.regie && (
                <span className="text-xs px-2 py-1 rounded font-mono" style={{ backgroundColor: "#e8f4fd", color: "#1f2244" }}>
                  Régie : {project.regie}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold mt-3" style={{ color: "#1f2244" }}>{project.title}</h1>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm" style={{ color: "#727485" }}>
              <div>📅 <strong style={{ color: "#1f2244" }}>{new Date(project.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</strong></div>
              <div>📍 {project.location} — {project.room}</div>
              {project.director && <div>🎬 Réalisateur : <strong style={{ color: "#1f2244" }}>{project.director}</strong></div>}
              {project.recordingLocalPath && (
                <div className="font-mono text-xs">📂 {project.recordingLocalPath}</div>
              )}
            </div>
            {project.notes && (
              <p className="mt-3 p-3 rounded text-sm" style={{ backgroundColor: "#fff8e1", color: "#856404", borderLeft: "3px solid #f59e0b" }}>
                {project.notes}
              </p>
            )}
          </div>
          <div>
            <button
              onClick={() => setEditing(!editing)}
              className="text-sm px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              style={{ color: "#1f2244" }}
            >
              {editing ? "Annuler" : "Modifier"}
            </button>
          </div>
        </div>
      </div>

      {/* Édition événement */}
      {editing && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4" style={{ color: "#1f2244" }}>Édition de l&apos;événement</h2>
          <form onSubmit={handleSaveProject} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>Titre *</label>
                <input
                  type="text" value={editForm.title} required
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>Date *</label>
                <input
                  type="date" value={editForm.date} required
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>Régie</label>
                <select
                  value={editForm.regie}
                  onChange={(e) => setEditForm({ ...editForm, regie: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">— Non assignée —</option>
                  <option value="WVP_A1">WVP_A1</option>
                  <option value="WVP_A2">WVP_A2</option>
                  <option value="WVP_A3">WVP_A3</option>
                  <option value="WVP_A4">WVP_A4</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>Lieu *</label>
                <input
                  type="text" value={editForm.location} required
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>Salle *</label>
                <input
                  type="text" value={editForm.room} required
                  onChange={(e) => setEditForm({ ...editForm, room: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>Chemin local enregistrement</label>
                <input
                  type="text" value={editForm.recordingLocalPath}
                  onChange={(e) => setEditForm({ ...editForm, recordingLocalPath: e.target.value })}
                  placeholder="Ex : D:/REC/2026-04-18_journee/"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium mb-1" style={{ color: "#1f2244" }}>Notes</label>
                <textarea
                  rows={2} value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit" disabled={savingEdit}
                className="px-4 py-2 text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "#1f2244" }}
              >
                {savingEdit ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button
                type="button" onClick={() => setEditing(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                style={{ color: "#727485" }}
              >Annuler</button>
            </div>
          </form>
        </div>
      )}

      {/* Réalisateurs disponibles + assignation */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4" style={{ color: "#1f2244" }}>Réalisateur</h2>

        {project.directorId ? (
          <div className="p-4 rounded-lg flex items-center justify-between flex-wrap gap-3" style={{ backgroundColor: "#d4edda" }}>
            <div>
              <p className="font-medium" style={{ color: "#155724" }}>✓ {project.director}</p>
              <p className="text-sm" style={{ color: "#155724" }}>
                {allDirectors.find((d) => d.id === project.directorId)?.email}
              </p>
            </div>
            <button
              onClick={() => handleAssignDirector(null)}
              className="text-sm px-3 py-1 border border-red-200 rounded-lg hover:bg-red-50 text-red-600"
            >
              Désassigner
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: "#727485" }}>
              {availableDirectors.length === 0
                ? "Aucun réalisateur ne s'est déclaré disponible pour cette date."
                : `${availableDirectors.length} réalisateur${availableDirectors.length > 1 ? "s" : ""} disponible${availableDirectors.length > 1 ? "s" : ""} ce jour-là :`}
            </p>
            <div className="space-y-2">
              {availableDirectors.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div>
                    <p className="font-medium" style={{ color: "#1f2244" }}>{d.name}</p>
                    <p className="text-xs" style={{ color: "#727485" }}>📧 {d.email}{d.phone ? ` · 📞 ${d.phone}` : ""}</p>
                  </div>
                  <button
                    onClick={() => handleAssignDirector(d.id)}
                    className="text-sm px-3 py-1 text-white rounded-lg hover:opacity-90"
                    style={{ backgroundColor: "#1f2244" }}
                  >
                    Valider + envoyer feuille de route
                  </button>
                </div>
              ))}
            </div>
            {availableDirectors.length === 0 && allDirectors.filter((d) => d.active).length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer hover:underline" style={{ color: "#727485" }}>
                  Forcer l&apos;assignation d&apos;un réalisateur (même non disponible)
                </summary>
                <div className="mt-3 space-y-2">
                  {allDirectors.filter((d) => d.active).map((d) => (
                    <div key={d.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg" style={{ backgroundColor: "#fafbfc" }}>
                      <div>
                        <p className="font-medium" style={{ color: "#1f2244" }}>{d.name}</p>
                        <p className="text-xs" style={{ color: "#727485" }}>📧 {d.email}</p>
                      </div>
                      <button
                        onClick={() => handleAssignDirector(d.id)}
                        className="text-sm px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-100"
                        style={{ color: "#1f2244" }}
                      >Forcer l&apos;assignation</button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Conférences */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: "#1f2244" }}>
            Conférences ({project.conferences.length})
          </h2>
          <button
            onClick={() => setShowAddConf(!showAddConf)}
            className="text-sm px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50"
            style={{ color: "#1f2244" }}
          >
            {showAddConf ? "Annuler" : "+ Ajouter une conférence"}
          </button>
        </div>

        {showAddConf && (
          <form onSubmit={handleAddConf} className="mb-4 p-4 border border-gray-200 rounded-lg" style={{ backgroundColor: "#fafbfc" }}>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-5">
                <label className="text-xs" style={{ color: "#727485" }}>Titre *</label>
                <input
                  type="text" required
                  value={newConf.title}
                  onChange={(e) => setNewConf({ ...newConf, title: e.target.value })}
                  className="w-full mt-1 px-2 py-1.5 text-sm border border-gray-300 rounded"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="text-xs" style={{ color: "#727485" }}>Speaker</label>
                <input
                  type="text"
                  value={newConf.speaker}
                  onChange={(e) => setNewConf({ ...newConf, speaker: e.target.value })}
                  className="w-full mt-1 px-2 py-1.5 text-sm border border-gray-300 rounded"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs" style={{ color: "#727485" }}>Début</label>
                <input
                  type="time"
                  value={newConf.scheduledStart}
                  onChange={(e) => setNewConf({ ...newConf, scheduledStart: e.target.value })}
                  className="w-full mt-1 px-2 py-1.5 text-sm border border-gray-300 rounded"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs" style={{ color: "#727485" }}>Fin</label>
                <input
                  type="time"
                  value={newConf.scheduledEnd}
                  onChange={(e) => setNewConf({ ...newConf, scheduledEnd: e.target.value })}
                  className="w-full mt-1 px-2 py-1.5 text-sm border border-gray-300 rounded"
                />
              </div>
            </div>
            <button
              type="submit"
              className="mt-3 px-4 py-1.5 text-white rounded-lg text-sm hover:opacity-90"
              style={{ backgroundColor: "#1f2244" }}
            >
              Ajouter
            </button>
          </form>
        )}

        {project.conferences.length === 0 ? (
          <p className="text-center py-6 text-sm" style={{ color: "#727485" }}>Aucune conférence dans cet événement.</p>
        ) : (
          <div className="space-y-2">
            {project.conferences.map((c) => {
              const colors = STATUS_COLORS[c.status] ?? { bg: "#f5f5f7", text: "#1f2244" };
              const horaire = c.scheduledStart || c.scheduledEnd
                ? `${formatTime(c.scheduledStart)} – ${formatTime(c.scheduledEnd)}`
                : null;
              return (
                <div key={c.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-bold" style={{ color: "#1f2244" }}>#{c.order}</span>
                        <span className="font-medium" style={{ color: "#1f2244" }}>{c.title}</span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: colors.bg, color: colors.text }}
                        >
                          {STATUS_LABELS[c.status] ?? c.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: "#727485" }}>
                        {c.speaker && <span>🎤 {c.speaker}</span>}
                        {horaire && <span>⏰ {horaire}</span>}
                        {c.durationSeconds && <span>⏱ {formatDuration(c.durationSeconds)}</span>}
                        {c.localFolder && <span className="font-mono">📂 {c.localFolder}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={c.status}
                        onChange={(e) => handleConfStatusChange(c.id, e.target.value)}
                        className="text-xs px-2 py-1 border border-gray-300 rounded"
                        style={{ color: "#1f2244" }}
                      >
                        {Object.entries(STATUS_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleConfDelete(c)}
                        className="text-xs px-2 py-1 border border-red-200 rounded hover:bg-red-50 text-red-600"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
