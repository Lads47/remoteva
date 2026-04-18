"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

interface Director {
  id: string;
  name: string;
  email: string;
}

const MONTHS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const WEEKDAYS_FR = ["L", "M", "M", "J", "V", "S", "D"];

function PrestaContent() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [director, setDirector] = useState<Director | null>(null);
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Mois affiché (par défaut : mois courant)
  const today = useMemo(() => new Date(), []);
  const [viewMonth, setViewMonth] = useState({ year: today.getUTCFullYear(), month: today.getUTCMonth() });

  useEffect(() => {
    if (!token) {
      setError("Aucun token fourni dans l'URL. Vérifie le lien dans ton email.");
      setLoading(false);
      return;
    }
    fetchData();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchData() {
    try {
      const res = await fetch(`/api/presta/me?token=${encodeURIComponent(token)}`);
      if (res.status === 401) {
        setError("Lien invalide ou expiré. Contacte les Ateliers du Stream pour recevoir un nouveau lien.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.director) {
        setDirector(data.director);
        const set = new Set<string>(
          (data.availableDates as string[]).map((d) => isoDateKey(new Date(d)))
        );
        setAvailableDates(set);
      }
    } catch (err) {
      console.error(err);
      setError("Erreur de connexion. Vérifie ta connexion internet.");
    } finally {
      setLoading(false);
    }
  }

  function isoDateKey(d: Date): string {
    // Clé "YYYY-MM-DD" en UTC (compatible avec stockage)
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function showFeedback(msg: string) {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2500);
  }

  async function toggleDate(year: number, month: number, day: number) {
    const dateUTC = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    const key = isoDateKey(dateUTC);

    // Bloquer les dates passées
    const todayKey = isoDateKey(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())));
    if (key < todayKey) return;

    setSavingDate(key);
    try {
      const res = await fetch("/api/presta/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, date: dateUTC.toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) {
        showFeedback("Erreur, réessaie");
        return;
      }
      // Re-build set from server response
      const set = new Set<string>(
        (data.availableDates as string[]).map((d) => isoDateKey(new Date(d)))
      );
      setAvailableDates(set);
      showFeedback(data.created ? "✓ Disponibilité ajoutée" : "Disponibilité retirée");
    } catch (err) {
      console.error(err);
      showFeedback("Erreur de connexion");
    } finally {
      setSavingDate(null);
    }
  }

  function changeMonth(delta: number) {
    setViewMonth((prev) => {
      const d = new Date(Date.UTC(prev.year, prev.month + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });
  }

  // Génère le tableau de jours du mois affiché (avec padding pour aligner sur lundi)
  const calendarCells = useMemo(() => {
    const firstDay = new Date(Date.UTC(viewMonth.year, viewMonth.month, 1));
    // getUTCDay: 0=dim, 1=lun, ..., 6=sam → on veut lundi=0
    const firstDayWeekday = (firstDay.getUTCDay() + 6) % 7;

    const lastDay = new Date(Date.UTC(viewMonth.year, viewMonth.month + 1, 0));
    const daysInMonth = lastDay.getUTCDate();

    const cells: Array<{ day: number; key: string; isPast: boolean; isToday: boolean; isAvailable: boolean } | null> = [];
    for (let i = 0; i < firstDayWeekday; i++) cells.push(null);

    const todayKey = isoDateKey(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())));

    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(Date.UTC(viewMonth.year, viewMonth.month, d));
      const key = isoDateKey(dt);
      cells.push({
        day: d,
        key,
        isPast: key < todayKey,
        isToday: key === todayKey,
        isAvailable: availableDates.has(key),
      });
    }
    // Pad fin pour atteindre multiple de 7
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewMonth, availableDates, today]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f5f5f7" }}>
        <div className="animate-pulse" style={{ color: "#727485" }}>Chargement…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: "#f5f5f7" }}>
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm p-6 text-center">
          <div className="text-4xl mb-3">🚫</div>
          <h1 className="text-lg font-bold mb-2" style={{ color: "#1f2244" }}>Accès impossible</h1>
          <p className="text-sm" style={{ color: "#727485" }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!director) return null;

  const monthLabel = `${MONTHS_FR[viewMonth.month]} ${viewMonth.year}`;
  const upcomingAvailable = Array.from(availableDates)
    .filter((k) => k >= isoDateKey(today))
    .sort()
    .slice(0, 5);

  return (
    <div className="min-h-screen pb-12" style={{ backgroundColor: "#f5f5f7" }}>
      {/* Header */}
      <header className="px-4 py-6 text-white" style={{ backgroundColor: "#1f2244" }}>
        <div className="max-w-md mx-auto">
          <p className="text-xs" style={{ color: "#7dcef5", letterSpacing: "1px" }}>EVA FLOW</p>
          <h1 className="text-xl font-bold mt-1">{director.name}</h1>
          <p className="text-sm mt-1 opacity-80">Calendrier de disponibilités</p>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 mt-4 space-y-4">
        {/* Instructions */}
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm" style={{ color: "#1f2244" }}>
            <strong>Touche une date</strong> pour indiquer que tu es disponible ce jour-là.
            Touche-la à nouveau pour retirer ta disponibilité.
          </p>
        </div>

        {/* Calendrier */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          {/* Nav mois */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <button
              onClick={() => changeMonth(-1)}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100"
              style={{ color: "#1f2244" }}
              aria-label="Mois précédent"
            >
              ←
            </button>
            <h2 className="font-semibold text-base capitalize" style={{ color: "#1f2244" }}>{monthLabel}</h2>
            <button
              onClick={() => changeMonth(1)}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100"
              style={{ color: "#1f2244" }}
              aria-label="Mois suivant"
            >
              →
            </button>
          </div>

          {/* Grille jours */}
          <div className="p-2">
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS_FR.map((d, i) => (
                <div key={i} className="h-8 flex items-center justify-center text-xs font-medium" style={{ color: "#727485" }}>
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((cell, idx) => {
                if (!cell) return <div key={idx} className="h-12" />;

                const isSaving = savingDate === cell.key;
                const baseClass = "h-12 rounded-lg flex items-center justify-center text-sm font-medium transition-all";

                if (cell.isPast) {
                  return (
                    <div key={idx} className={baseClass} style={{ color: "#cbd5e0" }} aria-label={`${cell.day} (passé)`}>
                      {cell.day}
                    </div>
                  );
                }

                if (cell.isAvailable) {
                  return (
                    <button
                      key={idx}
                      onClick={() => toggleDate(viewMonth.year, viewMonth.month, cell.day)}
                      disabled={isSaving}
                      className={`${baseClass} active:scale-95`}
                      style={{
                        backgroundColor: "#7dcef5",
                        color: "#1f2244",
                        boxShadow: cell.isToday ? "inset 0 0 0 2px #1f2244" : undefined,
                      }}
                      aria-label={`${cell.day} (disponible)`}
                    >
                      {isSaving ? "…" : cell.day}
                    </button>
                  );
                }

                return (
                  <button
                    key={idx}
                    onClick={() => toggleDate(viewMonth.year, viewMonth.month, cell.day)}
                    disabled={isSaving}
                    className={`${baseClass} hover:bg-gray-100 active:scale-95`}
                    style={{
                      color: "#1f2244",
                      backgroundColor: cell.isToday ? "#fafbfc" : undefined,
                      boxShadow: cell.isToday ? "inset 0 0 0 2px #7dcef5" : undefined,
                    }}
                    aria-label={`${cell.day}`}
                  >
                    {isSaving ? "…" : cell.day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Légende */}
          <div className="flex items-center justify-center gap-4 px-4 pb-4 text-xs" style={{ color: "#727485" }}>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: "#7dcef5" }} />
              <span>Disponible</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ boxShadow: "inset 0 0 0 2px #7dcef5" }} />
              <span>Aujourd&apos;hui</span>
            </div>
          </div>
        </div>

        {/* Récap dispos à venir */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h3 className="font-semibold text-sm mb-3" style={{ color: "#1f2244" }}>
            Mes prochaines disponibilités ({upcomingAvailable.length})
          </h3>
          {upcomingAvailable.length === 0 ? (
            <p className="text-sm" style={{ color: "#727485" }}>
              Aucune disponibilité enregistrée. Touche une date pour commencer.
            </p>
          ) : (
            <ul className="space-y-1 text-sm" style={{ color: "#1f2244" }}>
              {upcomingAvailable.map((k) => {
                const d = new Date(`${k}T00:00:00.000Z`);
                return (
                  <li key={k} className="capitalize">
                    📅 {d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="text-xs text-center pt-2" style={{ color: "#727485" }}>
          Les Ateliers du Stream — EVA Flow
        </p>
      </main>

      {/* Toast feedback */}
      {feedback && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-white shadow-lg text-sm" style={{ backgroundColor: "#1f2244" }}>
          {feedback}
        </div>
      )}
    </div>
  );
}

export default function PrestaPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f5f5f7" }}><div className="animate-pulse" style={{ color: "#727485" }}>Chargement…</div></div>}>
      <PrestaContent />
    </Suspense>
  );
}
