// EVA Stat — tableau de bord d'audience. Rendu serveur : site, période et
// robots vivent dans l'URL (?site=lads&period=30j&bots=1).

import { notFound } from "next/navigation";
import Flag from "@/components/admin/stat/Flag";
import LivePanel from "@/components/admin/stat/LivePanel";
import VisitsChart from "@/components/admin/stat/VisitsChart";
import { Empty, Panel, RankList, Segmented, td, th } from "@/components/admin/stat/ui";
import { countryName, fmtDec, fmtDuration, fmtInt, fmtPct } from "@/lib/stat/format";
import { getOverview, parsePeriod, PERIOD_LABELS, PERIODS, type CardFigure, type Period } from "@/lib/stat/queries";
import { listSites } from "@/lib/stat/sites";

export const dynamic = "force-dynamic";

type Search = { site?: string; period?: string; bots?: string };

export default async function StatPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const sites = await listSites();
  if (sites.length === 0) notFound();
  const site = sites.find((s) => s.slug === sp.site) ?? sites[0];
  const period = parsePeriod(sp.period);
  const bots = sp.bots === "1";
  const data = await getOverview(site.id, period, bots);

  const href = (p: { site?: string; period?: Period; bots?: boolean }) => {
    const q = new URLSearchParams({ site: p.site ?? site.slug, period: p.period ?? period });
    if (p.bots ?? bots) q.set("bots", "1");
    return `/admin/stat?${q}`;
  };

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--ink)" }}>EVA Stat</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Audience de {site.name} · {site.domains.filter((d) => !d.startsWith("www.")).join(", ")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented items={sites.map((s) => ({ href: href({ site: s.slug }), label: s.name, active: s.id === site.id }))} />
          <Segmented items={(Object.keys(PERIODS) as Period[]).map((p) => ({ href: href({ period: p }), label: PERIOD_LABELS[p], active: p === period }))} />
          <Segmented items={[{ href: href({ bots: !bots }), label: bots ? "Robots affichés" : "Afficher les robots", active: bots }]} />
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="Aujourd'hui" f={data.cards.today} />
        <Card label="Hier" f={data.cards.yesterday} />
        <Card label="Ce mois-ci" f={data.cards.thisMonth} />
        <Card label="Mois dernier" f={data.cards.lastMonth} />
      </div>

      <Panel
        title={`Visites par jour · ${PERIOD_LABELS[period]}`}
        aside={
          <span className="text-xs flex items-center gap-3" style={{ color: "var(--muted)" }}>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "var(--accent)" }} />visites</span>
            <span className="flex items-center gap-1"><span className="inline-block w-3 h-0.5" style={{ backgroundColor: "var(--ink)" }} />moyenne 7 jours</span>
          </span>
        }
      >
        <VisitsChart series={data.series} />
        <dl className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
          <Total label="Visites" value={fmtInt(data.totals.visits)} />
          <Total label="Visiteurs" value={fmtInt(data.totals.visitors)} />
          <Total label="Pages vues" value={fmtInt(data.totals.pageviews)} />
          <Total label="Durée moyenne" value={fmtDuration(data.totals.avgDurationSec)} />
          <Total label="Rebond" value={fmtPct(data.totals.bounceRate)} />
        </dl>
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Pages les plus vues">
          {data.pages.length === 0 ? <Empty /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ color: "var(--muted)" }}>
                  <tr><th className={th}>Page</th><th className={`${th} text-right`}>Vues</th><th className={`${th} text-right`}>Temps moyen</th><th className={`${th} text-right`}>Sorties</th></tr>
                </thead>
                <tbody style={{ color: "var(--ink)" }}>
                  {data.pages.map((p) => (
                    <tr key={p.path} className="border-t" style={{ borderColor: "var(--line)" }}>
                      <td className="py-2 pr-3 max-w-[16rem] truncate" title={p.path}>{p.path}</td>
                      <td className={`${td} text-right`}>{fmtInt(p.pageviews)}</td>
                      <td className={`${td} text-right`}>{fmtDuration(p.avgDurationSec)}</td>
                      <td className={`${td} text-right`}>{fmtPct(p.exitRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Pays">
          {data.countries.length === 0 ? <Empty /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead style={{ color: "var(--muted)" }}>
                  <tr>
                    <th className={th}>Pays</th><th className={`${th} text-right`}>Visiteurs</th><th className={`${th} text-right`}>%</th>
                    <th className={`${th} text-right`}>Durée</th><th className={`${th} text-right`}>Pages/visite</th><th className={`${th} text-right`}>Rebond</th>
                  </tr>
                </thead>
                <tbody style={{ color: "var(--ink)" }}>
                  {data.countries.map((c) => (
                    <tr key={c.code ?? "?"} className="border-t" style={{ borderColor: "var(--line)" }}>
                      <td className="py-2 pr-3 whitespace-nowrap"><Flag code={c.code} /> <span className="ml-1">{countryName(c.code)}</span></td>
                      <td className={`${td} text-right`}>{fmtInt(c.visitors)}</td>
                      <td className={`${td} text-right`}>{fmtPct(c.share)}</td>
                      <td className={`${td} text-right`}>{fmtDuration(c.avgDurationSec)}</td>
                      <td className={`${td} text-right`}>{fmtDec(c.pagesPerVisit)}</td>
                      <td className={`${td} text-right`}>{fmtPct(c.bounceRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="Référents"><RankList rows={data.referrers} /></Panel>
        <Panel title="Appareils et navigateurs">
          <div className="space-y-5">
            <RankList rows={data.devices} />
            <RankList rows={data.browsers.slice(0, 5)} />
            <RankList rows={data.os.slice(0, 5)} />
          </div>
        </Panel>
        <Panel title="Événements"><RankList rows={data.events} unit="événements" /></Panel>
      </div>

      <LivePanel site={site.slug} bots={bots} />

      <footer className="text-xs pt-2" style={{ color: "var(--muted)" }}>
        Robots {bots ? "inclus" : "exclus"} · heures de Paris · conservation 13 mois ·{" "}
        <a href="https://db-ip.com" target="_blank" rel="noopener noreferrer" className="underline">IP Geolocation by DB-IP</a>
      </footer>
    </div>
  );
}

function Card({ label, f }: { label: string; f: CardFigure }) {
  return (
    <div className="rounded-lg border p-5" style={{ backgroundColor: "var(--surface)", borderColor: "var(--line)" }}>
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="mt-2 text-3xl font-bold tabular-nums" style={{ color: "var(--ink)" }}>{fmtInt(f.visits)}</div>
      <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>visite{f.visits > 1 ? "s" : ""} · {fmtInt(f.pageviews)} page{f.pageviews > 1 ? "s" : ""} vue{f.pageviews > 1 ? "s" : ""}</div>
    </div>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs" style={{ color: "var(--muted)" }}>{label}</dt>
      <dd className="font-semibold tabular-nums" style={{ color: "var(--ink)" }}>{value}</dd>
    </div>
  );
}
