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
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
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
      setFeedback({ type: "success", msg: `Enregistré (${data.updated} maj, ${data.deleted} suppr.)` });
      setTimeout(() => setFeedback(null), 4000);
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
            >
              📄 Version imprimable
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
