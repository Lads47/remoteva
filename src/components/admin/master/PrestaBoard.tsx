"use client";

// EVA Master — page d'une presta (cœur du dev, §5 du CDC).
// Ordre vertical VALIDÉ (ne pas réordonner) :
//   1. En-tête (nom, statuts, signal SRT, menu supprimer)
//   2. Marquage des conférences (EN HAUT — bloc principal, action répétée)
//   3. Les 3 sorties (correction / XML films / XML shorts)
//   4. Source Drive + Flux régie SRT (EN BAS, compact)
//
// Marquage LOCAL-FIRST : chaque clic écrit d'abord en IndexedDB (source de
// vérité régie, hors-ligne) ; le serveur ne reçoit une copie qu'au clic manuel
// « envoyer à EVA Core ». Voir lib/master-idb.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getLocalMarkings,
  putLocalMarking,
  clearDirtyFlags,
  deleteLocalMarking,
  type LocalMarking,
} from "@/lib/master-idb";

// Couleurs = design tokens (voir globals.css). En thème clair, ces variables
// valent exactement l'ancienne DA → rendu identique ; en "dark" elles basculent.
const EVA_DARK = "var(--ink)"; // texte principal
const EVA_ACCENT = "var(--accent)";
const EVA_MUTED = "var(--muted)";
const BORDER = "var(--line)";
const BRAND = "var(--brand)"; // fonds pleins (navy constant)
const GREEN = "#16a34a"; // feedback (succès) — thème-agnostique
const BLUE = "#2563eb"; // feedback (info) — thème-agnostique
const ACTIVE_BG = "var(--surface-2)";

type Presta = {
  id: string;
  slug: string;
  name: string;
  driveUrl: string;
  driveStatus: string;
};

type Conference = {
  id: string;
  position: number;
  title: string;
  speakers: string[];
  status: string;
  startedAt: string | null;
  endedAt: string | null;
};

type VmixLog = {
  id: string;
  filename: string;
  size: number;
  sent: boolean;
  uploadedAt: string;
};

type Props = {
  presta: Presta;
  initialConferences: Conference[];
  initialLogs: VmixLog[];
};

// --- Helpers heure ---
function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour12: false });
}
// Valeur pour <input type="time" step="1"> (HH:MM:SS heure locale).
function timeInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
// Combine une heure "HH:MM:SS" avec la date de base (jour du marquage) -> ISO.
function combineTime(baseIso: string | null, time: string): string | null {
  if (!time) return null;
  const [h, m, s] = time.split(":").map((x) => parseInt(x, 10));
  const base = baseIso ? new Date(baseIso) : new Date();
  base.setHours(h || 0, m || 0, s || 0, 0);
  return base.toISOString();
}

export default function PrestaBoard({ presta, initialConferences, initialLogs }: Props) {
  const router = useRouter();
  const [conferences, setConferences] = useState<Conference[]>(initialConferences);
  const [logs, setLogs] = useState<VmixLog[]>(initialLogs);
  const [local, setLocal] = useState<Record<string, LocalMarking>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Charge les marquages locaux (IndexedDB) au montage.
  useEffect(() => {
    getLocalMarkings(presta.id)
      .then((rows) => {
        const map: Record<string, LocalMarking> = {};
        rows.forEach((r) => (map[r.conferenceId] = r));
        setLocal(map);
      })
      .catch(() => {});
  }, [presta.id]);

  function showFlash(kind: "ok" | "err", text: string) {
    setFlash({ kind, text });
    window.setTimeout(() => setFlash(null), 4000);
  }

  // Vue fusionnée d'une conf : le local (IndexedDB) prime sur la copie serveur.
  function view(conf: Conference) {
    const m = local[conf.id];
    return {
      startedAt: m ? m.startedAt : conf.startedAt,
      endedAt: m ? m.endedAt : conf.endedAt,
      status: m ? m.status : conf.status,
    };
  }

  // Nombre de marquages non envoyés (dirty).
  const pendingCount = useMemo(
    () => Object.values(local).filter((m) => m.dirty).length,
    [local]
  );
  const pendingLogs = useMemo(() => logs.filter((l) => !l.sent), [logs]);

  // Conf active mise en évidence : celle en cours d'enregistrement, sinon la
  // première "pending" pas encore démarrée.
  const activeId = useMemo(() => {
    const recording = conferences.find((c) => view(c).status === "recording");
    if (recording) return recording.id;
    const nextPending = conferences.find((c) => {
      const v = view(c);
      return v.status === "pending" && !v.startedAt;
    });
    return nextPending?.id ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conferences, local]);

  // --- Écriture locale d'un marquage (toujours dirty) ---
  async function writeLocal(conf: Conference, next: Partial<LocalMarking>) {
    const cur = local[conf.id];
    const v = view(conf);
    const m: LocalMarking = {
      conferenceId: conf.id,
      prestaId: presta.id,
      startedAt: cur?.startedAt ?? v.startedAt,
      endedAt: cur?.endedAt ?? v.endedAt,
      status: cur?.status ?? v.status,
      dirty: true,
      updatedAt: Date.now(),
      ...next,
    };
    await putLocalMarking(m);
    setLocal((prev) => ({ ...prev, [conf.id]: m }));
  }

  function markStart(conf: Conference) {
    writeLocal(conf, { startedAt: new Date().toISOString(), endedAt: null, status: "recording" });
  }
  function markEnd(conf: Conference) {
    writeLocal(conf, { endedAt: new Date().toISOString(), status: "done" });
  }
  // Annuler / réactiver = action structurelle SERVEUR immédiate (comme
  // ajouter/réordonner), pour que la correction et les autres vues la voient.
  // On efface le marquage local de la conf (elle n'a pas eu lieu / repart à zéro).
  async function setConfStatus(conf: Conference, status: "cancelled" | "pending") {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/master/${presta.slug}/conferences/${conf.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      if (!res.ok) throw new Error();
      await deleteLocalMarking(conf.id).catch(() => {});
      setLocal((prev) => {
        const copy = { ...prev };
        delete copy[conf.id];
        return copy;
      });
      await reloadConferences();
    } catch {
      showFlash("err", "Action impossible.");
    } finally {
      setBusy(false);
    }
  }
  function cancelConf(conf: Conference) {
    setConfStatus(conf, "cancelled");
  }
  function reactivateConf(conf: Conference) {
    setConfStatus(conf, "pending");
  }

  function openEdit(conf: Conference) {
    const v = view(conf);
    setEditingId(conf.id);
    setEditStart(timeInputValue(v.startedAt));
    setEditEnd(timeInputValue(v.endedAt));
  }
  async function saveEdit(conf: Conference) {
    const v = view(conf);
    const startedAt = combineTime(v.startedAt, editStart);
    const endedAt = combineTime(v.endedAt || v.startedAt, editEnd);
    const status = endedAt ? "done" : startedAt ? "recording" : "pending";
    await writeLocal(conf, { startedAt, endedAt, status });
    setEditingId(null);
  }

  // --- Conférences (serveur) ---
  async function reloadConferences() {
    const res = await fetch(`/api/admin/master/${presta.slug}/conferences`);
    const data = await res.json();
    setConferences(data.conferences || []);
  }

  async function loadFromCore() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/master/${presta.slug}/conferences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "load-core" }),
      });
      const data = await res.json();
      setConferences(data.conferences || []);
      showFlash("ok", "Conférences chargées depuis EVA CORE (stub).");
    } catch {
      showFlash("err", "Échec du chargement depuis EVA CORE.");
    } finally {
      setBusy(false);
    }
  }

  async function moveConf(conf: Conference, direction: "up" | "down") {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/master/${presta.slug}/conferences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reorder", id: conf.id, direction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      setConferences(data.conferences || []);
    } catch {
      showFlash("err", "Impossible de déplacer la conférence.");
    } finally {
      setBusy(false);
    }
  }

  async function addConf() {
    const title = window.prompt("Titre de la nouvelle conférence :", "");
    if (title === null) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/master/${presta.slug}/conferences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error();
      await reloadConferences();
    } catch {
      showFlash("err", "Impossible d'ajouter la conférence.");
    } finally {
      setBusy(false);
    }
  }

  // --- Logs vMix ---
  async function onLogsSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("files", f));
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/master/${presta.slug}/logs`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      setLogs((prev) => [...(data.logs || []), ...prev]);
      showFlash("ok", `${data.logs?.length ?? 0} log(s) déposé(s).`);
    } catch {
      showFlash("err", "Échec du dépôt des logs.");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // --- Envoi groupé (marquage dirty + logs non envoyés) ---
  async function sendToCore() {
    const dirty = Object.values(local).filter((m) => m.dirty);
    const markings = dirty.map((m) => ({
      conferenceId: m.conferenceId,
      externalId: null,
      startedAt: m.startedAt,
      endedAt: m.endedAt,
      status: m.status,
    }));
    const logIds = pendingLogs.map((l) => l.id);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/master/${presta.slug}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markings, logIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error();
      // Marquages envoyés -> plus dirty ; logs -> sent.
      await clearDirtyFlags(dirty.map((m) => m.conferenceId));
      setLocal((prev) => {
        const copy = { ...prev };
        dirty.forEach((m) => {
          if (copy[m.conferenceId]) copy[m.conferenceId] = { ...copy[m.conferenceId], dirty: false };
        });
        return copy;
      });
      setLogs((prev) => prev.map((l) => (logIds.includes(l.id) ? { ...l, sent: true } : l)));
      if (data.conferences) setConferences(data.conferences);
      showFlash("ok", data.message || "Envoyé à EVA Core.");
    } catch {
      // Sans conséquence : le local est conservé, réémission possible.
      showFlash("err", "Envoi échoué — données conservées en local, réessayez.");
    } finally {
      setBusy(false);
    }
  }

  // --- Suppression presta ---
  async function deletePresta() {
    const ok = window.confirm(
      `Supprimer la presta « ${presta.name} » ?\n\nToutes ses données (conférences, logs, marquage serveur) seront effacées. Irréversible.`
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/master?id=${presta.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      router.push("/admin/master");
    } catch {
      showFlash("err", "Échec de la suppression.");
    }
  }

  // --- Sorties XML (stub v1 : téléchargement d'un placeholder) ---
  function downloadStubXml(kind: "films" | "shorts") {
    const content =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<!-- EVA Master — génération XML ${kind} (STUB v1, non branché) -->\n` +
      `<!-- presta: ${presta.name} (${presta.slug}) -->\n` +
      `<xmeml version="4">\n  <sequence>\n    <name>${presta.name} — ${kind}</name>\n  </sequence>\n</xmeml>\n`;
    const blob = new Blob([content], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${presta.slug}-${kind}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const doneCount = conferences.filter((c) => view(c).status === "done").length;
  const driveRead = presta.driveStatus === "read";

  return (
    <div className="space-y-5">
      {/* Fil d'ariane */}
      <a href="/admin/master" className="text-sm inline-block" style={{ color: EVA_MUTED }}>
        ← Toutes les prestas
      </a>

      {/* 1. En-tête */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: EVA_MUTED }}>
            EVA Master · presta
          </p>
          <h1 className="text-2xl font-bold" style={{ color: EVA_DARK }}>
            {presta.name}
          </h1>
          <p className="mt-1 text-sm" style={{ color: EVA_MUTED }}>
            {conferences.length} conférence{conferences.length > 1 ? "s" : ""}
            {" · "}
            {driveRead ? "dossier Drive lu" : "dossier Drive lié"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 relative">
          {/* Indicateur signal SRT (stub v1 : absent) */}
          <span
            className="text-xs px-3 py-1.5 rounded-full font-medium inline-flex items-center gap-1.5"
            style={{ backgroundColor: "#f3f4f6", color: EVA_MUTED }}
            title="Aucun flux SRT détecté (stub v1)"
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#9ca3af" }} />
            signal SRT · absent
          </span>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-9 h-9 rounded-lg border flex items-center justify-center"
            style={{ borderColor: BORDER, color: EVA_MUTED }}
            title="Actions presta"
          >
            ⋯
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-11 z-10 rounded-lg border bg-surface shadow-md py-1"
              style={{ borderColor: BORDER }}
            >
              <button
                onClick={() => {
                  setMenuOpen(false);
                  deletePresta();
                }}
                className="block w-full text-left text-sm px-4 py-2 hover:bg-red-50 whitespace-nowrap"
                style={{ color: "#b91c1c" }}
              >
                Supprimer la presta
              </button>
            </div>
          )}
        </div>
      </div>

      {flash && (
        <div
          className="text-sm px-4 py-3 rounded-lg"
          style={
            flash.kind === "ok"
              ? { backgroundColor: "#f0fdf4", color: "#166534" }
              : { backgroundColor: "#fef2f2", color: "#b91c1c" }
          }
        >
          {flash.text}
        </div>
      )}

      {/* 2. Marquage des conférences (bloc principal) */}
      <section className="rounded-lg border bg-surface" style={{ borderColor: BORDER }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: BORDER }}>
          <h2 className="font-semibold flex items-center gap-2" style={{ color: EVA_DARK }}>
            <span aria-hidden>🚩</span> Marquage des conférences
          </h2>
          <span className="text-sm" style={{ color: EVA_MUTED }}>
            enregistré en local
            {pendingCount > 0 ? ` · ${pendingCount} à envoyer` : " · à jour"}
          </span>
        </div>

        {conferences.length === 0 ? (
          <div className="px-5 py-10 text-center" style={{ color: EVA_MUTED }}>
            <p className="text-sm">Aucune conférence pour l&apos;instant.</p>
            <button
              onClick={loadFromCore}
              disabled={busy}
              className="mt-3 text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
              style={{ backgroundColor: EVA_ACCENT, color: BRAND }}
            >
              Charger depuis EVA CORE
            </button>
          </div>
        ) : (
          <ul>
            {conferences.map((conf, index) => {
              const v = view(conf);
              const isActive = conf.id === activeId;
              const isEditing = editingId === conf.id;
              const isCancelled = v.status === "cancelled";
              return (
                <li
                  key={conf.id}
                  className="group flex items-center gap-3 px-5 py-3 border-b last:border-b-0"
                  style={{
                    borderColor: BORDER,
                    backgroundColor: isActive ? ACTIVE_BG : "transparent",
                  }}
                >
                  {/* Réordonnancement ↑/↓ (l'ordre réel prime sur le planifié) */}
                  <div className="flex flex-col leading-none opacity-30 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => moveConf(conf, "up")}
                      disabled={busy || index === 0}
                      className="text-[10px] leading-none px-1 disabled:opacity-20 disabled:cursor-default hover:text-black"
                      style={{ color: EVA_MUTED }}
                      title="Monter"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveConf(conf, "down")}
                      disabled={busy || index === conferences.length - 1}
                      className="text-[10px] leading-none px-1 disabled:opacity-20 disabled:cursor-default hover:text-black"
                      style={{ color: EVA_MUTED }}
                      title="Descendre"
                    >
                      ▼
                    </button>
                  </div>
                  <span
                    className="w-5 text-sm tabular-nums"
                    style={{ color: isCancelled ? "#c0c0c8" : EVA_MUTED }}
                  >
                    {conf.position}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-medium truncate"
                      style={{
                        color: isCancelled ? "#c0c0c8" : EVA_DARK,
                        textDecoration: isCancelled ? "line-through" : "none",
                      }}
                    >
                      {conf.title}
                    </p>
                  </div>

                  {/* Zone marquage */}
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        step={1}
                        value={editStart}
                        onChange={(e) => setEditStart(e.target.value)}
                        className="text-sm border rounded px-2 py-1"
                        style={{ borderColor: BORDER }}
                      />
                      <span style={{ color: EVA_MUTED }}>→</span>
                      <input
                        type="time"
                        step={1}
                        value={editEnd}
                        onChange={(e) => setEditEnd(e.target.value)}
                        className="text-sm border rounded px-2 py-1"
                        style={{ borderColor: BORDER }}
                      />
                      <button
                        onClick={() => saveEdit(conf)}
                        className="text-sm px-2 py-1 rounded"
                        style={{ backgroundColor: BRAND, color: "#fff" }}
                      >
                        OK
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-sm px-2 py-1 rounded border"
                        style={{ borderColor: BORDER, color: EVA_MUTED }}
                      >
                        Annuler
                      </button>
                    </div>
                  ) : isCancelled ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm italic" style={{ color: "#c0c0c8" }}>
                        annulée
                      </span>
                      <button
                        onClick={() => reactivateConf(conf)}
                        disabled={busy}
                        className="text-xs px-2 py-1 rounded-md border disabled:opacity-50"
                        style={{ borderColor: BORDER, color: EVA_MUTED }}
                        title="Réactiver cette conférence"
                      >
                        réactiver
                      </button>
                    </div>
                  ) : v.endedAt && v.startedAt ? (
                    // Terminée
                    <div className="flex items-center gap-2">
                      <span className="text-sm tabular-nums" style={{ color: EVA_MUTED }}>
                        {fmtTime(v.startedAt)} → {fmtTime(v.endedAt)}
                      </span>
                      <button
                        onClick={() => openEdit(conf)}
                        className="w-8 h-8 rounded-md border flex items-center justify-center"
                        style={{ borderColor: BORDER, color: EVA_MUTED }}
                        title="Corriger les horaires"
                      >
                        ✎
                      </button>
                      <span className="w-6 text-center" style={{ color: GREEN }} title="Marquage complet">
                        ✓
                      </span>
                    </div>
                  ) : v.startedAt ? (
                    // En cours
                    <div className="flex items-center gap-2">
                      <span className="text-sm tabular-nums font-medium" style={{ color: GREEN }}>
                        ▷ début {fmtTime(v.startedAt)}
                      </span>
                      <button
                        onClick={() => markEnd(conf)}
                        className="text-sm px-3 py-1.5 rounded-lg border font-medium"
                        style={{ borderColor: BORDER, color: EVA_DARK }}
                      >
                        ◻ fin
                      </button>
                      <button
                        onClick={() => openEdit(conf)}
                        className="w-8 h-8 rounded-md border flex items-center justify-center"
                        style={{ borderColor: BORDER, color: EVA_MUTED }}
                        title="Corriger l'horaire"
                      >
                        ✎
                      </button>
                    </div>
                  ) : isActive ? (
                    // Prête à démarrer (active)
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => markStart(conf)}
                        className="text-sm px-3 py-1.5 rounded-lg font-medium"
                        style={{ backgroundColor: EVA_ACCENT, color: BRAND }}
                      >
                        ▷ début
                      </button>
                    </div>
                  ) : (
                    <span className="text-sm" style={{ color: "#c0c0c8" }}>
                      en attente
                    </span>
                  )}

                  {/* Annuler la conf (discret, au survol) */}
                  {!isCancelled && !isEditing && (
                    <button
                      onClick={() => cancelConf(conf)}
                      className="text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: EVA_MUTED }}
                      title="Marquer comme annulée"
                    >
                      annuler
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Actions du bloc marquage */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-t" style={{ borderColor: BORDER }}>
          <button
            onClick={addConf}
            disabled={busy}
            className="text-sm px-4 py-2 rounded-lg border font-medium disabled:opacity-50"
            style={{ borderColor: BORDER, color: EVA_DARK }}
          >
            + conf
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="text-sm px-4 py-2 rounded-lg border font-medium disabled:opacity-50"
            style={{ borderColor: BORDER, color: EVA_DARK }}
          >
            ⬆ logs vMix
            {pendingLogs.length > 0 ? ` (${pendingLogs.length})` : ""}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".log,text/plain"
            multiple
            className="hidden"
            onChange={onLogsSelected}
          />
          <button
            onClick={sendToCore}
            disabled={busy || (pendingCount === 0 && pendingLogs.length === 0)}
            className="text-sm px-4 py-2 rounded-lg border font-medium ml-auto disabled:opacity-40"
            style={{ borderColor: BLUE, color: BLUE }}
          >
            ➤ envoyer à EVA Core
          </button>
        </div>
      </section>

      {/* 3. Les trois sorties */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <a
          href={`/admin/master/${presta.slug}/correction`}
          className="p-5 rounded-lg border bg-surface text-center hover:shadow-md transition-all"
          style={{ borderColor: BORDER }}
        >
          <div className="text-2xl">📄</div>
          <p className="mt-2 font-semibold" style={{ color: EVA_DARK }}>
            Espace correction
          </p>
          <p className="text-xs mt-0.5" style={{ color: EVA_MUTED }}>
            résumés · speakers
          </p>
        </a>
        <button
          onClick={() => downloadStubXml("films")}
          className="p-5 rounded-lg border bg-surface text-center hover:shadow-md transition-all"
          style={{ borderColor: BORDER }}
        >
          <div className="text-2xl">🎬</div>
          <p className="mt-2 font-semibold" style={{ color: EVA_DARK }}>
            XML films
          </p>
          <p className="text-xs mt-0.5" style={{ color: EVA_MUTED }}>
            télécharger
          </p>
        </button>
        <button
          onClick={() => downloadStubXml("shorts")}
          className="p-5 rounded-lg border bg-surface text-center hover:shadow-md transition-all"
          style={{ borderColor: BORDER }}
        >
          <div className="text-2xl">📱</div>
          <p className="mt-2 font-semibold" style={{ color: EVA_DARK }}>
            XML shorts
          </p>
          <p className="text-xs mt-0.5" style={{ color: EVA_MUTED }}>
            télécharger
          </p>
        </button>
      </div>

      {/* 4. Source Drive + Flux régie (compact, en bas) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-lg border bg-surface" style={{ borderColor: BORDER }}>
          <p className="text-sm font-medium flex items-center gap-2" style={{ color: EVA_DARK }}>
            <span aria-hidden>📁</span> Source Drive
          </p>
          <p className="text-xs mt-1" style={{ color: driveRead ? GREEN : EVA_MUTED }}>
            {driveRead ? "✓ lu · lexique + jingles prêts" : "en attente de lecture par EVA CORE"}
          </p>
          <a
            href={presta.driveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs mt-2 inline-block truncate max-w-full"
            style={{ color: BLUE }}
          >
            {presta.driveUrl}
          </a>
        </div>
        <div className="p-4 rounded-lg border bg-surface" style={{ borderColor: BORDER }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium flex items-center gap-2" style={{ color: EVA_DARK }}>
              <span aria-hidden>📶</span> Flux régie · SRT
            </p>
            <button className="text-xs" style={{ color: EVA_MUTED }} title="Paramètres SRT (à venir)">
              paramètres
            </button>
          </div>
          <div
            className="mt-2 h-24 rounded-md flex items-center justify-center text-xs"
            style={{ backgroundColor: "#0f1117", color: "#6b7280" }}
          >
            no signal
          </div>
        </div>
      </div>

      <p className="text-xs" style={{ color: "#c0c0c8" }}>
        {doneCount}/{conferences.length} conférence(s) marquée(s). La communication EVA CORE est stubbée en v1.
      </p>
    </div>
  );
}
