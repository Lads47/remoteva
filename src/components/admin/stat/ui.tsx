import Link from "next/link";
import type { ReactNode } from "react";
import type { Row } from "@/lib/stat/queries";
import { fmtInt, fmtPct } from "@/lib/stat/format";

export function Panel({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-lg border p-5" style={{ backgroundColor: "var(--surface)", borderColor: "var(--line)" }}>
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--ink)" }}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children = "Aucune donnée sur la période." }: { children?: ReactNode }) {
  return <p className="text-sm py-4" style={{ color: "var(--muted)" }}>{children}</p>;
}

export function Segmented({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <div className="inline-flex flex-wrap rounded-full border p-1 gap-1" style={{ borderColor: "var(--line)", backgroundColor: "var(--surface)" }}>
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          scroll={false}
          className="text-sm px-3 py-1.5 rounded-full transition-colors"
          style={it.active ? { backgroundColor: "var(--brand)", color: "#fff" } : { color: "var(--muted)" }}
          aria-current={it.active ? "page" : undefined}
        >
          {it.label}
        </Link>
      ))}
    </div>
  );
}

// Liste classée avec barre de part, pour référents, appareils, navigateurs, événements.
export function RankList({ rows, unit = "visites" }: { rows: Row[]; unit?: string }) {
  if (rows.length === 0) return <Empty />;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.key} className="text-sm">
          <div className="flex justify-between gap-3">
            <span className="truncate" style={{ color: "var(--ink)" }} title={r.label}>{r.label}</span>
            <span className="tabular-nums shrink-0" style={{ color: "var(--muted)" }} title={`${fmtInt(r.count)} ${unit}`}>
              {fmtInt(r.count)} · {fmtPct(r.share)}
            </span>
          </div>
          <div className="h-1 mt-1 rounded-full" style={{ backgroundColor: "var(--surface-2)" }}>
            <div className="h-1 rounded-full" style={{ width: `${Math.max(2, r.share * 100)}%`, backgroundColor: "var(--accent)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export const th = "text-left font-medium py-2 pr-3 text-xs uppercase tracking-wide";
export const td = "py-2 pr-3 tabular-nums";
