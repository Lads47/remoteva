import { TZ } from "./tz";

const int = new Intl.NumberFormat("fr-FR");
const pct = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const countries = new Intl.DisplayNames(["fr"], { type: "region" });

export const fmtInt = (n: number) => int.format(Math.round(n));
export const fmtPct = (n: number) => pct.format(n);
export const fmtDec = (n: number) => dec1.format(n);

export function fmtDuration(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

export function countryName(code: string | null): string {
  if (!code) return "Inconnu";
  try {
    return countries.of(code) ?? code;
  } catch {
    return code;
  }
}

export function fmtDay(day: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("fr-FR", { ...opts, timeZone: TZ });
}

export function fmtTime(d: Date): string {
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

export function fmtAgo(d: Date, now = new Date()): string {
  const s = Math.max(0, (now.getTime() - d.getTime()) / 1000);
  if (s < 60) return "à l'instant";
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} jours`;
}
