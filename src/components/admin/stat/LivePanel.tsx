"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { LiveData, LiveVisit } from "@/lib/stat/live-types";
import { countryName, fmtDuration, fmtTime } from "@/lib/stat/format";
import { Empty, Panel, td, th } from "./ui";
import { MARKER_COLORS } from "./mapColors";

// Leaflet touche à window : chargé dans le navigateur seulement.
const VisitorsMap = dynamic(() => import("./VisitorsMap"), {
  ssr: false,
  loading: () => <div className="w-full rounded-md" style={{ height: 380, backgroundColor: "var(--surface-2)" }} />,
});

const REFRESH_MS = 5000;
const DEVICES: Record<string, string> = { desktop: "Ordinateur", mobile: "Mobile", tablette: "Tablette" };

export default function LivePanel({ site, bots }: { site: string; bots: boolean }) {
  const [data, setData] = useState<LiveData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let ctrl: AbortController | null = null;
    const url = `/api/admin/stat/live?site=${encodeURIComponent(site)}${bots ? "&bots=1" : ""}`;
    const load = async () => {
      if (document.hidden) return;
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        setData(await res.json());
        setFailed(false);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setFailed(true);
      }
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    const onVisible = () => !document.hidden && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      ctrl?.abort();
    };
  }, [site, bots]);

  const updated = data ? `mis à jour à ${new Date(data.generatedAt).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris" })}` : "chargement…";

  return (
    <>
      <Panel
        title="Carte des visiteurs récents"
        aside={
          <span className="text-xs flex flex-wrap items-center gap-3" style={{ color: "var(--muted)" }}>
            <Legend color={MARKER_COLORS.nouveau} label="nouveau" />
            <Legend color={MARKER_COLORS.recurrent} label="récurrent" />
            <Legend color={MARKER_COLORS["en-ligne"]} label="en ligne" />
          </span>
        }
      >
        <VisitorsMap visits={data?.map ?? []} />
      </Panel>

      <Panel
        title="Visiteurs en direct"
        aside={
          <span className="text-xs flex items-center gap-3" style={{ color: "var(--muted)" }}>
            {failed && <span style={{ color: "#dc2626" }}>connexion perdue, nouvel essai…</span>}
            <span>{updated}</span>
            <OnlineBadge count={data?.online ?? 0} />
          </span>
        }
      >
        {!data ? <Empty>Chargement…</Empty> : data.visits.length === 0 ? <Empty>Aucune visite pour l&apos;instant.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ color: "var(--muted)" }}>
                <tr>
                  <th className={th}>Heure</th><th className={th}>Visiteur</th><th className={th}>Référent</th>
                  <th className={th}>Page d&apos;entrée</th><th className={th}>Pages · durée</th><th className={th}>Lieu</th>
                  <th className={th}>Système · navigateur · appareil</th>
                </tr>
              </thead>
              <tbody style={{ color: "var(--ink)" }}>
                {data.visits.map((v) => <Row key={v.id} v={v} flag={v.country ? data.flags[v.country.toUpperCase()] : undefined} />)}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function Row({ v, flag }: { v: LiveVisit; flag?: string }) {
  const place = [v.city, v.region].filter(Boolean).join(", ") || countryName(v.country);
  return (
    <tr className="border-t align-top" style={{ borderColor: "var(--line)" }}>
      <td className={`${td} whitespace-nowrap`}>
        {v.online && <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: MARKER_COLORS["en-ligne"] }} title="En ligne" />}
        {fmtTime(new Date(v.startedAt))}
      </td>
      <td className="py-2 pr-3 whitespace-nowrap">
        {v.visitNumber > 1 ? `Récurrent · n° ${v.visitNumber}` : "Nouveau"}
        {v.isBot && <span className="ml-1 text-xs" style={{ color: "var(--muted)" }}>(robot)</span>}
      </td>
      <td className="py-2 pr-3 max-w-[10rem] truncate" title={v.referrerHost ?? undefined}>{v.referrerHost ?? <span style={{ color: "var(--muted)" }}>direct</span>}</td>
      <td className="py-2 pr-3 max-w-[14rem] truncate" title={v.entryPath}>{v.entryPath}</td>
      <td className={`${td} whitespace-nowrap`}>{v.pageCount} · {fmtDuration(v.durationSec)}</td>
      <td className="py-2 pr-3 whitespace-nowrap" title={v.isp ?? undefined}>
        {flag && (
          <span
            className="inline-block w-[18px] h-[12px] rounded-sm overflow-hidden align-middle mr-1.5 [&>svg]:w-full [&>svg]:h-full"
            dangerouslySetInnerHTML={{ __html: flag }}
          />
        )}
        {place}
      </td>
      <td className="py-2 pr-3 whitespace-nowrap" style={{ color: "var(--muted)" }}>
        {[v.os, v.browser, DEVICES[v.deviceType] ?? v.deviceType].filter(Boolean).join(" · ")}
      </td>
    </tr>
  );
}

function OnlineBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold" style={{ backgroundColor: "var(--surface-2)", color: "var(--ink)" }}>
      <span className="relative inline-flex w-2 h-2">
        {count > 0 && <span className="absolute inline-flex w-full h-full rounded-full animate-ping opacity-60" style={{ backgroundColor: MARKER_COLORS["en-ligne"] }} />}
        <span className="relative inline-flex w-2 h-2 rounded-full" style={{ backgroundColor: count > 0 ? MARKER_COLORS["en-ligne"] : "var(--line)" }} />
      </span>
      {count} en ligne
    </span>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
