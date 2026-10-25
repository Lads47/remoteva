import type { SeriesPoint } from "@/lib/stat/queries";
import { fmtDay, fmtDec, fmtInt } from "@/lib/stat/format";

const W = 800;
const H = 220;
const PAD = { top: 12, right: 8, bottom: 26, left: 36 };

function niceMax(v: number): number {
  if (v <= 5) return 5;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= v) return m * mag;
  return 10 * mag;
}

// Barres = visites par jour ; ligne = moyenne mobile sur 7 jours.
export default function VisitsChart({ series }: { series: SeriesPoint[] }) {
  const max = niceMax(Math.max(1, ...series.map((p) => Math.max(p.visits, p.avg7))));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const step = innerW / Math.max(1, series.length);
  const barW = Math.max(1, step * 0.7);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const x = (i: number) => PAD.left + i * step + step / 2;
  const line = series.map((p, i) => `${x(i).toFixed(1)},${y(p.avg7).toFixed(1)}`).join(" ");
  const labelEvery = Math.ceil(series.length / 8);
  const ticks = [0, max / 2, max];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Visites par jour">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
          <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">
            {fmtInt(t)}
          </text>
        </g>
      ))}
      {series.map((p, i) => (
        <g key={p.day} className="group">
          <rect x={PAD.left + i * step} y={PAD.top} width={step} height={innerH} fill="transparent" />
          <rect
            x={x(i) - barW / 2}
            y={y(p.visits)}
            width={barW}
            height={Math.max(0, PAD.top + innerH - y(p.visits))}
            rx={Math.min(3, barW / 3)}
            fill="var(--accent)"
            className="opacity-80 group-hover:opacity-100"
          />
          <title>{`${fmtDay(p.day, { weekday: "short", day: "numeric", month: "short" })} : ${fmtInt(p.visits)} visite${p.visits > 1 ? "s" : ""} · moyenne 7 j ${fmtDec(p.avg7)}`}</title>
          {i % labelEvery === 0 && (
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">
              {fmtDay(p.day)}
            </text>
          )}
        </g>
      ))}
      <polyline points={line} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />
    </svg>
  );
}
