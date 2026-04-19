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

const ORANGE = "#f59e0b";
const ORANGE_BG = "#ffe9b3";  // orange clair pour le fond
const BLUE = "#7dcef5";
const NAVY = "#1f2244";
const GRAY = "#cbd5e0";

function PrestaContent() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [director, setDirector] = useState<Director | null>(null);
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [eventDates, setEventDates] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<Array<{ id: string; eventId: string; title: string; date: string; directorId: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

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
      // Fetch parallèle : me + events
      const [meRes, evRes] = await Promise.all([
        fetch(`/api/presta/me?token=${encodeURIComponent(token)}`),
        fetch(`/api/presta/events?token=${encodeURIComponent(token)}`),
      ]);

      if (meRes.status === 401 || evRes.status === 401) {
        setError("Lien invalide ou expiré. Contacte les Ateliers du Stream pour recevoir un nouveau lien.");
        setLoading(false);
        return;
      }

      const meData = await meRes.json();
      if (meData.director) {
        setDirector(meData.director);
        setAvailableDates(new Set((meData.availableDates as string[]).map((d) => isoDateKey(new Date(d)))));
      }

      const evData = await evRes.json();
      if (Array.isArray(evData.events)) {
        setEvents(evData.events);
        setEventDates(new Set((evData.events as Array<{ date: string }>).map((e) => isoDateKey(new Date(e.date)))));
      }
    } catch (err) {
      console.error(err);
      setError("Erreur de connexion. Vérifie ta connexion internet.");
    } finally {
      setLoading(false);
    }
  }

  function isoDateKey(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function showFeedback(msg: string) {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3000);
  }

  async function toggleDate(year: number, month: number, day: number) {
    const dateUTC = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    const key = isoDateKey(dateUTC);

    // Bloquer dates passées
    const todayKey = isoDateKey(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())));
    if (key < todayKey) return;

    // Bloquer si pas d'événement ET pas déjà dispo (le serveur refusera de toute façon, on évite l'aller-retour)
    const hasEvent = eventDates.has(key);
    const isAvailable = availableDates.has(key);
    if (!hasEvent && !isAvailable) {
      showFeedback("Aucun événement planifié à cette date");
      return;
    }

    setSavingDate(key);
    try {
      const res = await fetch("/api/presta/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, date: dateUTC.toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) {
        showFeedback(data.error || "Erreur, réessaie");
        return;
      }
      setAvailableDates(new Set((data.availableDates as string[]).map((d) => isoDateKey(new Date(d)))));
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

  const calendarCells = useMemo(() => {
    const firstDay = new Date(Date.UTC(viewMonth.year, viewMonth.month, 1));
    const firstDayWeekday = (firstDay.getUTCDay() + 6) % 7;
    const lastDay = new Date(Date.UTC(viewMonth.year, viewMonth.month + 1, 0));
    const daysInMonth = lastDay.getUTCDate();

    type Cell = {
      day: number;
      key: string;
      isPast: boolean;
      isToday: boolean;
      isAvailable: boolean;
      hasEvent: boolean;
    };
    const cells: Array<Cell | null> = [];
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
        hasEvent: eventDates.has(key),
      });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [viewMonth, availableDates, eventDates, today]);

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
          <h1 className="text-lg font-bold mb-2" style={{ color: NAVY }}>Accès impossible</h1>
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
  const todayKey = isoDateKey(today);
  const upcomingEvents = events
    .filter((e) => isoDateKey(new Date(e.date)) >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10);

  return (
    <div className="min-h-screen pb-12" style={{ backgroundColor: "#f5f5f7" }}>
      <header className="px-4 py-6 text-white" style={{ backgroundColor: NAVY }}>
        <div className="max-w-md mx-auto">
          <p className="text-xs" style={{ color: BLUE, letterSpacing: "1px" }}>EVA FLOW</p>
          <h1 className="text-xl font-bold mt-1">{director.name}</h1>
          <p className="text-sm mt-1 opacity-80">Calendrier de disponibilités</p>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 mt-4 space-y-4">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <p className="text-sm" style={{ color: NAVY }}>
            Les dates en <strong style={{ color: ORANGE }}>orange</strong> ont un événement planifié.
            Touche-les pour indiquer que tu es disponible (la date passe en <strong style={{ color: BLUE }}>bleu</strong>).
            Touche à nouveau pour retirer ta disponibilité.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <button
              onClick={() => changeMonth(-1)}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100"
              style={{ color: NAVY }}
              aria-label="Mois précédent"
            >
              ←
            </button>
            <h2 className="font-semibold text-base capitalize" style={{ color: NAVY }}>{monthLabel}</h2>
            <button
              onClick={() => changeMonth(1)}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100"
              style={{ color: NAVY }}
              aria-label="Mois suivant"
            >
              →
            </button>
          </div>

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
                const todayBorder = cell.isToday ? "inset 0 0 0 2px " + NAVY : undefined;

                // Date passée
                if (cell.isPast) {
                  // Passée AVEC événement : gris foncé
                  if (cell.hasEvent) {
                    return (
                      <div
                        key={idx}
                        className={baseClass}
                        style={{ backgroundColor: "#e5e7eb", color: "#9ca3af" }}
                        aria-label={`${cell.day} (événement passé)`}
                        title="Événement passé"
                      >
                        {cell.day}
                      </div>
                    );
                  }
                  // Passée sans événement : juste gris clair
                  return (
                    <div key={idx} className={baseClass} style={{ color: GRAY }} aria-label={`${cell.day} (passé)`}>
                      {cell.day}
                    </div>
                  );
                }

                // Future : 4 cas selon hasEvent + isAvailable

                // (1) Événement + dispo : bleu plein + bordure orange
                if (cell.hasEvent && cell.isAvailable) {
                  return (
                    <button
                      key={idx}
                      onClick={() => toggleDate(viewMonth.year, viewMonth.month, cell.day)}
                      disabled={isSaving}
                      className={`${baseClass} active:scale-95`}
                      style={{
                        backgroundColor: BLUE,
                        color: NAVY,
                        boxShadow: cell.isToday ? `inset 0 0 0 2px ${NAVY}, 0 0 0 2px ${ORANGE}` : `0 0 0 2px ${ORANGE}`,
                      }}
                      aria-label={`${cell.day} (événement, disponible)`}
                    >
                      {isSaving ? "…" : cell.day}
                    </button>
                  );
                }

                // (2) Événement seul : carré orange (cliquable)
                if (cell.hasEvent) {
                  return (
                    <button
                      key={idx}
                      onClick={() => toggleDate(viewMonth.year, viewMonth.month, cell.day)}
                      disabled={isSaving}
                      className={`${baseClass} active:scale-95`}
                      style={{
                        backgroundColor: ORANGE_BG,
                        color: NAVY,
                        boxShadow: todayBorder ?? `inset 0 0 0 1.5px ${ORANGE}`,
                      }}
                      aria-label={`${cell.day} (événement planifié)`}
                    >
                      {isSaving ? "…" : cell.day}
                    </button>
                  );
                }

                // (3) Dispo legacy sans événement : bleu seul (autorise retrait)
                if (cell.isAvailable) {
                  return (
                    <button
                      key={idx}
                      onClick={() => toggleDate(viewMonth.year, viewMonth.month, cell.day)}
                      disabled={isSaving}
                      className={`${baseClass} active:scale-95`}
                      style={{
                        backgroundColor: BLUE,
                        color: NAVY,
                        boxShadow: todayBorder,
                      }}
                      aria-label={`${cell.day} (disponible)`}
                    >
                      {isSaving ? "…" : cell.day}
                    </button>
                  );
                }

                // (4) Aucun événement, pas dispo : non cliquable (juste affichage)
                return (
                  <div
                    key={idx}
                    className={baseClass}
                    style={{ color: NAVY, backgroundColor: cell.isToday ? "#fafbfc" : undefined, boxShadow: todayBorder }}
                    aria-label={`${cell.day}`}
                  >
                    {cell.day}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Légende */}
          <div className="flex items-center justify-center gap-3 px-4 pb-4 text-xs flex-wrap" style={{ color: "#727485" }}>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: ORANGE_BG, boxShadow: `inset 0 0 0 1.5px ${ORANGE}` }} />
              <span>Événement</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: BLUE, boxShadow: `0 0 0 2px ${ORANGE}` }} />
              <span>Disponible</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ boxShadow: `inset 0 0 0 2px ${NAVY}` }} />
              <span>Aujourd&apos;hui</span>
            </div>
          </div>
        </div>

        {/* Récap dispos à venir */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h3 className="font-semibold text-sm mb-3" style={{ color: NAVY }}>
            Mes prochaines disponibilités ({upcomingAvailable.length})
          </h3>
          {upcomingAvailable.length === 0 ? (
            <p className="text-sm" style={{ color: "#727485" }}>
              Aucune disponibilité enregistrée. Touche une date orange pour te déclarer dispo.
            </p>
          ) : (
            <ul className="space-y-1 text-sm" style={{ color: NAVY }}>
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

        {/* Récap événements à venir */}
        <div className="bg-white rounded-lg shadow-sm p-4">
          <h3 className="font-semibold text-sm mb-3" style={{ color: NAVY }}>
            Prochains événements ({upcomingEvents.length})
          </h3>
          {upcomingEvents.length === 0 ? (
            <p className="text-sm" style={{ color: "#727485" }}>
              Aucun événement planifié pour le moment.
            </p>
          ) : (
            <ul className="space-y-2 text-sm" style={{ color: NAVY }}>
              {upcomingEvents.map((ev) => {
                const d = new Date(ev.date);
                const dateKeyStr = isoDateKey(d);
                const isValidated = ev.directorId === director.id;
                const isPositioned = !isValidated && availableDates.has(dateKeyStr);
                return (
                  <li key={ev.id} className="capitalize flex items-center gap-2 flex-wrap">
                    <span style={{ color: ORANGE }}>●</span>
                    <span>{d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
                    {isValidated && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ backgroundColor: "#d4edda", color: "#155724" }}>
                        ✓ Tu es validé
                      </span>
                    )}
                    {isPositioned && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: BLUE, color: NAVY }}>
                        Tu t&apos;es positionné
                      </span>
                    )}
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

      {feedback && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-white shadow-lg text-sm" style={{ backgroundColor: NAVY }}>
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
