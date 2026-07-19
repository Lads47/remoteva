"use client";

// EVA Master — Espace correction (EVA NL), dérivé de NewsletterService.
// Par conf : résumé éditable, mapping speakers (depuis les intervenants de la
// presta), « ouvrir toute la transcription », sauvegarde serveur.
// Global : export HTML (fichier récupéré par l'équipe, PAS d'envoi SMTP §9).

import { useMemo, useState } from "react";

const EVA_DARK = "#1f2244";
const EVA_ACCENT = "#7dcef5";
const EVA_MUTED = "#727485";
const BORDER = "#e5e7eb";
const BLUE = "#2563eb";
const GREEN = "#16a34a";

type TranscriptSegment = { speaker: string; text: string };

type Conference = {
  id: string;
  position: number;
  title: string;
  status: string;
  speakers: string[];
  summary: string;
  transcript: TranscriptSegment[];
  speakerMapping: Record<string, string>;
};

type Props = {
  presta: { id: string; slug: string; name: string };
  intervenants: string[];
  initialConferences: Conference[];
};

function countWords(t: string): number {
  return t.trim().split(/\s+/).filter(Boolean).length;
}

export default function CorrectionBoard({ presta, intervenants, initialConferences }: Props) {
  const [conferences, setConferences] = useState<Conference[]>(initialConferences);
  const [openTranscript, setOpenTranscript] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function showFlash(kind: "ok" | "err", text: string) {
    setFlash({ kind, text });
    window.setTimeout(() => setFlash(null), 3500);
  }

  // Labels de voix distincts d'une conf (issus de la transcription, sinon
  // reconstruits depuis le nombre d'intervenants).
  function speakerLabels(conf: Conference): string[] {
    const fromTranscript = Array.from(new Set(conf.transcript.map((s) => s.speaker)));
    if (fromTranscript.length > 0) return fromTranscript;
    return conf.speakers.map((_, i) => `Speaker ${i + 1}`);
  }

  // Nom affiché pour un label (mappé si connu).
  function displayName(conf: Conference, label: string): string {
    return conf.speakerMapping[label] || label;
  }

  function setSummary(id: string, summary: string) {
    setConferences((prev) => prev.map((c) => (c.id === id ? { ...c, summary } : c)));
  }
  function setMapping(id: string, label: string, name: string) {
    setConferences((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, speakerMapping: { ...c.speakerMapping, [label]: name } }
          : c
      )
    );
  }

  async function saveConf(conf: Conference) {
    setSavingId(conf.id);
    try {
      const res = await fetch(
        `/api/admin/master/${presta.slug}/conferences/${conf.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: conf.summary,
            speakerMapping: conf.speakerMapping,
          }),
        }
      );
      if (!res.ok) throw new Error();
      showFlash("ok", `« ${conf.title} » enregistrée.`);
    } catch {
      showFlash("err", "Échec de l'enregistrement.");
    } finally {
      setSavingId(null);
    }
  }

  // Export HTML client-side (pas de SMTP) : un document simple à fournir au client.
  function exportHtml() {
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const articles = conferences
      .filter((c) => c.status !== "cancelled")
      .map((c) => {
        const noms = speakerLabels(c)
          .map((l) => displayName(c, l))
          .filter((n) => !n.startsWith("Speaker "));
        const intervLine = noms.length
          ? `<p style="color:#727485;font-size:14px;margin:4px 0 12px">${esc(noms.join(", "))}</p>`
          : "";
        return `<article style="margin:0 0 32px;padding:0 0 24px;border-bottom:1px solid #e5e7eb">
  <h2 style="color:#1f2244;font-size:20px;margin:0 0 4px">${esc(c.title)}</h2>
  ${intervLine}
  <div style="color:#2b2d42;font-size:15px;line-height:1.6">${esc(c.summary).replace(/\n/g, "<br>")}</div>
</article>`;
      })
      .join("\n");
    const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${esc(presta.name)}</title></head>
<body style="font-family:system-ui,Arial,sans-serif;max-width:680px;margin:0 auto;padding:32px 20px;background:#fff">
<h1 style="color:#1f2244;font-size:26px;margin:0 0 24px">${esc(presta.name)}</h1>
${articles}
<p style="color:#9ca3af;font-size:12px;margin-top:32px">Généré par EVA Master — à relire avant diffusion.</p>
</body></html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${presta.slug}-newsletter.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalWords = useMemo(
    () => conferences.reduce((n, c) => n + countWords(c.summary), 0),
    [conferences]
  );

  return (
    <div className="space-y-5">
      <a href={`/admin/master/${presta.slug}`} className="text-sm inline-block" style={{ color: EVA_MUTED }}>
        ← Retour à la presta
      </a>

      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: EVA_MUTED }}>
            EVA Master · espace correction
          </p>
          <h1 className="text-2xl font-bold" style={{ color: EVA_DARK }}>
            {presta.name}
          </h1>
          <p className="mt-1 text-sm" style={{ color: EVA_MUTED }}>
            {conferences.length} conférence{conferences.length > 1 ? "s" : ""} · {totalWords} mots · export HTML (pas d&apos;envoi automatique)
          </p>
        </div>
        <button
          onClick={exportHtml}
          disabled={conferences.length === 0}
          className="shrink-0 text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-40"
          style={{ backgroundColor: EVA_DARK, color: "white" }}
        >
          ⬇ Exporter la newsletter (HTML)
        </button>
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

      {conferences.length === 0 ? (
        <div
          className="text-center py-16 rounded-lg border border-dashed"
          style={{ borderColor: BORDER, color: EVA_MUTED }}
        >
          <p className="text-sm">Aucune conférence à corriger.</p>
          <p className="text-sm mt-1">
            Charge d&apos;abord les conférences depuis la{" "}
            <a href={`/admin/master/${presta.slug}`} style={{ color: BLUE }}>
              page de la presta
            </a>
            .
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {conferences.map((conf) => {
            const labels = speakerLabels(conf);
            const isOpen = !!openTranscript[conf.id];
            const cancelled = conf.status === "cancelled";
            return (
              <section
                key={conf.id}
                className="rounded-lg border bg-white"
                style={{ borderColor: BORDER, opacity: cancelled ? 0.6 : 1 }}
              >
                <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: BORDER }}>
                  <h2 className="font-semibold" style={{ color: EVA_DARK }}>
                    <span style={{ color: EVA_MUTED }}>{conf.position}.</span> {conf.title}
                    {cancelled && <span className="ml-2 text-xs italic" style={{ color: EVA_MUTED }}>(annulée)</span>}
                  </h2>
                  <span className="text-xs" style={{ color: EVA_MUTED }}>
                    {countWords(conf.summary)} mots
                  </span>
                </div>

                <div className="p-5 space-y-4">
                  {/* Transcription intégrale */}
                  <div>
                    <button
                      onClick={() =>
                        setOpenTranscript((p) => ({ ...p, [conf.id]: !p[conf.id] }))
                      }
                      className="text-sm font-medium"
                      style={{ color: BLUE }}
                    >
                      {isOpen ? "▾ Masquer la transcription" : "▸ Ouvrir toute la transcription"}
                    </button>
                    {isOpen && (
                      <div
                        className="mt-2 max-h-72 overflow-y-auto rounded-lg border p-3 space-y-2 text-sm"
                        style={{ borderColor: BORDER, backgroundColor: "#f9fafb" }}
                      >
                        {conf.transcript.length === 0 ? (
                          <p style={{ color: EVA_MUTED }}>Transcription non disponible.</p>
                        ) : (
                          conf.transcript.map((seg, i) => (
                            <p key={i}>
                              <span className="font-semibold" style={{ color: EVA_DARK }}>
                                {displayName(conf, seg.speaker)} :
                              </span>{" "}
                              <span style={{ color: "#374151" }}>{seg.text}</span>
                            </p>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Mapping speakers */}
                  {labels.length > 0 && (
                    <div className="rounded-lg border p-4" style={{ borderColor: BORDER, backgroundColor: "#f0f4f8" }}>
                      <p className="text-sm font-semibold mb-1" style={{ color: BLUE }}>
                        Identification des intervenants
                      </p>
                      <p className="text-xs mb-3" style={{ color: EVA_MUTED }}>
                        Associez chaque voix détectée à un intervenant de la presta.
                      </p>
                      <div className="space-y-2">
                        {labels.map((label) => (
                          <div key={label} className="flex items-center gap-2">
                            <span
                              className="font-mono text-xs px-2 py-1 rounded shrink-0 min-w-[90px] font-semibold"
                              style={{ backgroundColor: "#e5e7eb", color: EVA_MUTED }}
                            >
                              {label}
                            </span>
                            <span style={{ color: EVA_MUTED }}>→</span>
                            <select
                              value={conf.speakerMapping[label] || ""}
                              onChange={(e) => setMapping(conf.id, label, e.target.value)}
                              className="flex-1 min-w-0 px-3 py-2 border rounded-lg text-sm"
                              style={{ borderColor: BORDER, color: EVA_DARK }}
                            >
                              <option value="">— Sélectionner un intervenant —</option>
                              <option value="Public">Public (groupe)</option>
                              {intervenants.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Résumé éditable */}
                  <div>
                    <label className="block text-sm font-semibold mb-2" style={{ color: EVA_MUTED }}>
                      Résumé (corrigé)
                    </label>
                    <textarea
                      value={conf.summary}
                      onChange={(e) => setSummary(conf.id, e.target.value)}
                      rows={6}
                      className="w-full px-3 py-2 rounded-lg border text-sm resize-y"
                      style={{ borderColor: BORDER, color: "#1f2937" }}
                      placeholder="Résumé de la conférence…"
                    />
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={() => saveConf(conf)}
                      disabled={savingId === conf.id}
                      className="text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50"
                      style={{ backgroundColor: GREEN, color: "white" }}
                    >
                      {savingId === conf.id ? "Enregistrement…" : "Enregistrer"}
                    </button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
