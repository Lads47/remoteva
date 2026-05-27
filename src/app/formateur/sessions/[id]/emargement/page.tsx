"use client";

import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Slot = "morning" | "afternoon";
type Status = "present" | "absent" | null;

interface AttendanceCell {
  date: string;
  slot: Slot;
  status: Status;
  signedAt?: string;
  signedByPrenomNom?: string;
}
interface TraineeRow {
  traineeId: string;
  prenom: string;
  nom: string;
  cells: AttendanceCell[];
  psh: boolean;
  besoinsAdaptation: string;
}
interface GridSlot {
  date: string;
  slot: Slot;
  label: string;
}
interface Grid {
  slots: GridSlot[];
  rows: TraineeRow[];
}

interface SignedFile {
  id: string;
  sessionId: string;
  date: string | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedByPrenomNom: string | null;
  driveFileId: string | null;
  driveWebUrl: string | null;
  driveSyncedAt: string | null;
  driveSyncError: string | null;
}

function EmargementInner({ id }: { id: string }) {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [grid, setGrid] = useState<Grid | null>(null);
  const [sessionMeta, setSessionMeta] = useState<{ code: string; dateDebut: string; dateFin: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Map des changements en attente : key "traineeId_date_slot" → status
  const [pending, setPending] = useState<Record<string, Status>>({});

  // Fichiers signés déposés
  const [files, setFiles] = useState<SignedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadDate, setUploadDate] = useState<string>("");

  async function refreshFiles() {
    try {
      const r = await fetch(`/api/formateur/sessions/${id}/attendance/files?token=${encodeURIComponent(token)}`);
      if (!r.ok) return;
      const d = await r.json();
      setFiles(Array.isArray(d.files) ? d.files : []);
    } catch {}
  }

  useEffect(() => {
    if (!token) {
      setError("Lien invalide");
      setLoading(false);
      return;
    }
    fetch(`/api/formateur/sessions/${id}/attendance?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.error || "Accès refusé");
        }
        return r.json();
      })
      .then((data) => {
        setGrid(data.grid);
        setSessionMeta(data.session);
        return refreshFiles();
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  function cellKey(traineeId: string, date: string, slot: Slot) {
    return `${traineeId}_${date}_${slot}`;
  }

  function currentStatus(row: TraineeRow, slot: GridSlot): Status {
    const key = cellKey(row.traineeId, slot.date, slot.slot);
    if (key in pending) return pending[key];
    const cell = row.cells.find((c) => c.date === slot.date && c.slot === slot.slot);
    return cell?.status ?? null;
  }

  function setStatus(traineeId: string, date: string, slot: Slot, status: Status) {
    const key = cellKey(traineeId, date, slot);
    setPending((prev) => ({ ...prev, [key]: status }));
    setDirty(true);
  }

  function markAllPresent(slot: GridSlot) {
    if (!grid) return;
    setPending((prev) => {
      const next = { ...prev };
      for (const row of grid.rows) {
        next[cellKey(row.traineeId, slot.date, slot.slot)] = "present";
      }
      return next;
    });
    setDirty(true);
  }

  async function handleUploadFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (uploadDate) formData.append("date", uploadDate);
      const res = await fetch(`/api/formateur/sessions/${id}/attendance/files?token=${encodeURIComponent(token)}`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", msg: data.error || "Échec de l'upload" });
        setTimeout(() => setFeedback(null), 6000);
        return;
      }
      setFeedback({ type: "success", msg: `Fichier "${file.name}" déposé` });
      setTimeout(() => setFeedback(null), 4000);
      setUploadDate("");
      await refreshFiles();
    } catch {
      setFeedback({ type: "error", msg: "Erreur de connexion" });
      setTimeout(() => setFeedback(null), 5000);
    } finally {
      setUploading(false);
      // reset input value pour permettre de réuploader le même fichier
      event.target.value = "";
    }
  }

  async function handleResyncDrive(fileId: string) {
    try {
      const res = await fetch(`/api/formateur/sessions/${id}/attendance/files/${fileId}/resync-drive?token=${encodeURIComponent(token)}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFeedback({ type: "error", msg: data.error || "Échec re-sync Drive" });
        setTimeout(() => setFeedback(null), 6000);
        await refreshFiles();
        return;
      }
      setFeedback({ type: "success", msg: "Fichier synchronisé sur Drive ✓" });
      setTimeout(() => setFeedback(null), 4000);
      await refreshFiles();
    } catch {
      setFeedback({ type: "error", msg: "Erreur de connexion" });
      setTimeout(() => setFeedback(null), 5000);
    }
  }

  async function handleDeleteFile(fileId: string, filename: string) {
    if (!confirm(`Supprimer définitivement le fichier "${filename}" ?`)) return;
    try {
      const res = await fetch(`/api/formateur/sessions/${id}/attendance/files/${fileId}?token=${encodeURIComponent(token)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setFeedback({ type: "error", msg: "Échec de la suppression" });
        setTimeout(() => setFeedback(null), 5000);
        return;
      }
      await refreshFiles();
    } catch {
      setFeedback({ type: "error", msg: "Erreur de connexion" });
      setTimeout(() => setFeedback(null), 5000);
    }
  }

  async function handleSave() {
    if (!grid) return;
    setSaving(true);
    try {
      const updates = Object.entries(pending).map(([key, status]) => {
        const [traineeId, date, slot] = key.split("_");
        return { traineeId, date, slot: slot as Slot, status };
      });
      const res = await fetch(`/api/formateur/sessions/${id}/attendance?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", msg: data.error || "Erreur" });
        setTimeout(() => setFeedback(null), 5000);
        return;
      }
      // Recharger la grille pour avoir les valeurs serveur
      const refresh = await fetch(`/api/formateur/sessions/${id}/attendance?token=${encodeURIComponent(token)}`);
      if (refresh.ok) {
        const refreshed = await refresh.json();
        setGrid(refreshed.grid);
      }
      setPending({});
      setDirty(false);
      // Si des stagiaires viennent de basculer en "en_formation" suite à
      // leur 1re présence, on l'indique au formateur dans le toast.
      const nbTransitions = Array.isArray(data.transitionedToEnFormation)
        ? data.transitionedToEnFormation.length
        : 0;
      const transitionNote = nbTransitions > 0
        ? ` · ${nbTransitions} stagiaire${nbTransitions > 1 ? "s" : ""} passé${nbTransitions > 1 ? "s" : ""} en « En formation »`
        : "";
      setFeedback({ type: "success", msg: `Enregistré (${data.updated} maj, ${data.deleted} suppr.)${transitionNote}` });
      setTimeout(() => setFeedback(null), 5000);
    } catch {
      setFeedback({ type: "error", msg: "Erreur de connexion" });
      setTimeout(() => setFeedback(null), 5000);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f8fafc" }}>
        <p className="font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</p>
      </div>
    );
  }
  if (error || !grid || !sessionMeta) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: "#f8fafc" }}>
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold" style={{ color: "#1f2244" }}>Accès refusé</h1>
          <p className="mt-2 text-sm font-jetbrains" style={{ color: "#727485" }}>
            {error || "Cette session ne vous est pas assignée."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-10 px-4" style={{ backgroundColor: "#f8fafc" }}>
      <div className="max-w-5xl mx-auto">
        <Link
          href={`/formateur/sessions/${id}?token=${encodeURIComponent(token)}`}
          className="text-xs font-jetbrains underline"
          style={{ color: "#727485" }}
        >
          ← Retour à la session
        </Link>
        <div className="mt-3 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold" style={{ color: "#1f2244" }}>
              Émargement
            </h1>
            <p className="mt-1 text-sm font-jetbrains" style={{ color: "#727485" }}>
              Session {sessionMeta.code} · {grid.slots.length / 2} jour{grid.slots.length / 2 > 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <a
              href={`/formateur/sessions/${id}/emargement/print?token=${encodeURIComponent(token)}`}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 rounded-full text-sm font-medium border cursor-pointer"
              style={{ borderColor: "#1f2244", color: "#1f2244" }}
              title="Aperçu A4 — boutons Imprimer et Télécharger PDF disponibles"
            >
              📄 Imprimer / Télécharger PDF
            </a>
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="px-4 py-2 rounded-full text-sm font-medium text-white cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: "#1f2244" }}
            >
              {saving ? "Enregistrement..." : dirty ? "Enregistrer les changements" : "Tout est enregistré"}
            </button>
          </div>
        </div>

        {feedback && (
          <div
            className={`mt-4 p-3 rounded-lg text-sm font-jetbrains ${
              feedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"
            }`}
          >
            {feedback.msg}
          </div>
        )}

        {/* Bannière adaptations PSH — Qualiopi indicateur 5 */}
        {grid.rows.filter((r) => r.psh).length > 0 && (
          <div className="mt-4 p-4 rounded-xl border" style={{ borderColor: "#fde68a", backgroundColor: "#fffbeb" }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">♿</span>
              <strong className="text-sm" style={{ color: "#92400e" }}>
                Adaptations à prévoir — situation de handicap signalée
              </strong>
            </div>
            <ul className="space-y-2">
              {grid.rows
                .filter((r) => r.psh)
                .map((r) => (
                  <li key={r.traineeId} className="text-sm" style={{ color: "#78350f" }}>
                    <strong>{r.prenom} {r.nom}</strong>
                    {r.besoinsAdaptation ? (
                      <span className="font-jetbrains text-xs"> — {r.besoinsAdaptation}</span>
                    ) : (
                      <span className="font-jetbrains text-xs italic" style={{ color: "#9ca3af" }}> — pas de précision sur les besoins</span>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        )}

        {grid.rows.length === 0 ? (
          <div className="mt-8 p-8 rounded-xl border text-center font-jetbrains text-sm" style={{ borderColor: "#e5e7eb", color: "#727485", backgroundColor: "white" }}>
            Aucun stagiaire inscrit à cette session.
          </div>
        ) : (
          <div className="mt-6 rounded-xl border overflow-x-auto" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  <th className="text-left px-3 py-2 sticky left-0 z-10" style={{ color: "#374151", backgroundColor: "#f9fafb" }}>
                    Stagiaire
                  </th>
                  {grid.slots.map((s) => (
                    <th key={`${s.date}_${s.slot}`} className="text-center px-2 py-2 min-w-[100px]" style={{ color: "#374151" }}>
                      <div className="text-xs font-medium">{s.label}</div>
                      <button
                        type="button"
                        onClick={() => markAllPresent(s)}
                        className="mt-1 text-[10px] font-jetbrains px-2 py-0.5 rounded-full border cursor-pointer"
                        style={{ borderColor: "#7dcef5", color: "#1f2244" }}
                        title="Tout marquer présent pour cette demi-journée"
                      >
                        ✓ tous
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((row) => (
                  <tr key={row.traineeId} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td className="px-3 py-2 sticky left-0 font-medium" style={{ color: "#1f2244", backgroundColor: "white" }}>
                      {row.prenom} {row.nom}
                      {row.psh && (
                        <span
                          className="ml-1 inline-block text-xs"
                          style={{ color: "#92400e" }}
                          title={row.besoinsAdaptation ? `Adaptation : ${row.besoinsAdaptation}` : "Situation de handicap signalée"}
                        >
                          ♿
                        </span>
                      )}
                    </td>
                    {grid.slots.map((s) => {
                      const status = currentStatus(row, s);
                      return (
                        <td key={`${s.date}_${s.slot}`} className="px-2 py-2">
                          <CellButton
                            value={status}
                            onChange={(v) => setStatus(row.traineeId, s.date, s.slot, v)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs font-jetbrains" style={{ color: "#9ca3af" }}>
          Conseil : cliquez sur une cellule pour cycler entre <strong>—</strong> (non saisi), <strong>P</strong> (présent),{" "}
          <strong>A</strong> (absent). N&apos;oubliez pas d&apos;enregistrer en fin de séance.
        </p>

        {/* === Feuilles signées (dépôt) === */}
        <div className="mt-10 p-5 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "#1f2244" }}>
            Feuilles signées
          </h2>
          <p className="text-xs mt-1 font-jetbrains" style={{ color: "#727485" }}>
            Déposez ici les scans / photos des feuilles d&apos;émargement signées par les stagiaires
            pour archivage. Formats acceptés : PDF, JPEG, PNG, HEIC, WebP (max 15 Mo).
          </p>

          {/* Upload */}
          <div className="mt-4 p-4 rounded-lg border" style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[160px]">
                <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
                  Date concernée (optionnel)
                </label>
                <select
                  value={uploadDate}
                  onChange={(e) => setUploadDate(e.target.value)}
                  disabled={uploading}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white disabled:opacity-50"
                  style={{ borderColor: "#d1d5db" }}
                >
                  <option value="">— Aucune date précisée —</option>
                  {Array.from(new Set(grid.slots.map((s) => s.date))).map((d) => (
                    <option key={d} value={d}>
                      {new Date(d + "T00:00:00Z").toLocaleDateString("fr-FR", {
                        weekday: "long",
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                        timeZone: "UTC",
                      })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-medium mb-1" style={{ color: "#374151" }}>
                  Fichier à déposer
                </label>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp"
                  onChange={handleUploadFile}
                  disabled={uploading}
                  className="block w-full text-xs file:mr-3 file:py-2 file:px-3 file:rounded-full file:border-0 file:text-sm file:font-medium file:cursor-pointer disabled:opacity-50"
                  style={{ color: "#1f2244" }}
                />
              </div>
            </div>
            {uploading && (
              <p className="mt-2 text-xs font-jetbrains" style={{ color: "#727485" }}>
                Upload en cours...
              </p>
            )}
          </div>

          {/* Liste */}
          <div className="mt-4">
            {files.length === 0 ? (
              <p className="text-sm font-jetbrains text-center py-4" style={{ color: "#9ca3af" }}>
                Aucune feuille signée déposée pour le moment.
              </p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "#f3f4f6" }}>
                {files.map((f) => (
                  <li key={f.id} className="py-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate flex items-center gap-2 flex-wrap" style={{ color: "#1f2244" }}>
                        <span>{f.filename}</span>
                        {f.driveFileId ? (
                          <span
                            className="text-[10px] font-jetbrains px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: "#dcfce7", color: "#166534" }}
                            title={f.driveSyncedAt ? `Synchronisé le ${new Date(f.driveSyncedAt).toLocaleString("fr-FR")}` : "Synchronisé sur Drive"}
                          >
                            ✓ Drive
                          </span>
                        ) : (
                          <span
                            className="text-[10px] font-jetbrains px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
                            title={f.driveSyncError ?? "Pas encore synchronisé"}
                          >
                            ⚠ Drive non sync
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-jetbrains mt-0.5" style={{ color: "#727485" }}>
                        {f.date
                          ? new Date(f.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })
                          : "Date non précisée"}
                        {" · "}
                        {(f.sizeBytes / 1024).toFixed(0)} Ko
                        {f.uploadedByPrenomNom && ` · déposé par ${f.uploadedByPrenomNom}`}
                        {" · "}
                        {new Date(f.uploadedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </div>
                      {f.driveSyncError && !f.driveFileId && (
                        <div className="text-xs font-jetbrains mt-1" style={{ color: "#991b1b" }} title={f.driveSyncError}>
                          Erreur Drive : {f.driveSyncError.slice(0, 100)}{f.driveSyncError.length > 100 ? "…" : ""}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {f.driveWebUrl && (
                        <a
                          href={f.driveWebUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-3 py-1.5 rounded-full border cursor-pointer"
                          style={{ borderColor: "#166534", color: "#166534" }}
                          title="Ouvrir dans Google Drive"
                        >
                          Drive ↗
                        </a>
                      )}
                      <a
                        href={`/api/formateur/sessions/${id}/attendance/files/${f.id}?token=${encodeURIComponent(token)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs px-3 py-1.5 rounded-full border cursor-pointer"
                        style={{ borderColor: "#1f2244", color: "#1f2244" }}
                      >
                        Ouvrir
                      </a>
                      {!f.driveFileId && (
                        <button
                          onClick={() => handleResyncDrive(f.id)}
                          className="text-xs px-3 py-1.5 rounded-full cursor-pointer"
                          style={{ backgroundColor: "#7dcef5", color: "#1f2244" }}
                          title="Retenter l'upload sur Google Drive"
                        >
                          Re-sync Drive
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteFile(f.id, f.filename)}
                        className="text-xs px-3 py-1.5 rounded-full border border-red-200 text-red-600 hover:bg-red-50 cursor-pointer"
                      >
                        Supprimer
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CellButton({ value, onChange }: { value: Status; onChange: (v: Status) => void }) {
  function cycle() {
    if (value === null) onChange("present");
    else if (value === "present") onChange("absent");
    else onChange(null);
  }
  const style: React.CSSProperties =
    value === "present"
      ? { backgroundColor: "#dcfce7", color: "#166534", borderColor: "#86efac" }
      : value === "absent"
      ? { backgroundColor: "#fee2e2", color: "#991b1b", borderColor: "#fca5a5" }
      : { backgroundColor: "white", color: "#9ca3af", borderColor: "#e5e7eb" };
  const label = value === "present" ? "P" : value === "absent" ? "A" : "—";
  return (
    <button
      type="button"
      onClick={cycle}
      className="w-9 h-9 rounded-full border-2 font-jetbrains font-bold text-sm cursor-pointer transition-colors"
      style={style}
      aria-label={value === "present" ? "Présent" : value === "absent" ? "Absent" : "Non saisi"}
    >
      {label}
    </button>
  );
}

export default function EmargementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f8fafc" }}>
          <p className="font-jetbrains text-sm" style={{ color: "#727485" }}>Chargement...</p>
        </div>
      }
    >
      <EmargementInner id={id} />
    </Suspense>
  );
}
