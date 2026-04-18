import prisma from "./db";

// Format: DDMMYY-NNN (ex "180426-001")
// NNN = compteur incrémental des événements de la même journée

const EVENT_ID_PATTERN = /^(\d{2})(\d{2})(\d{2})-(\d{3})$/;

/**
 * Génère un eventId unique pour une date donnée.
 * Lit en base les eventIds existants pour cette date et incrémente le compteur.
 */
export async function generateEventId(date: Date): Promise<string> {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(date.getUTCFullYear() % 100).padStart(2, "0");
  const datePrefix = `${dd}${mm}${yy}`;

  // Trouve le plus haut compteur existant pour cette date
  const existing = await prisma.flowProject.findMany({
    where: { eventId: { startsWith: `${datePrefix}-` } },
    select: { eventId: true },
  });

  let maxCounter = 0;
  for (const p of existing) {
    const match = p.eventId.match(EVENT_ID_PATTERN);
    if (match) {
      const counter = parseInt(match[4], 10);
      if (counter > maxCounter) maxCounter = counter;
    }
  }

  const nextCounter = String(maxCounter + 1).padStart(3, "0");
  return `${datePrefix}-${nextCounter}`;
}

/**
 * Vérifie qu'un eventId est au bon format.
 */
export function isValidEventId(eventId: string): boolean {
  return EVENT_ID_PATTERN.test(eventId);
}

/**
 * Parse un eventId en composants.
 */
export function parseEventId(eventId: string): { day: number; month: number; year: number; counter: number } | null {
  const match = eventId.match(EVENT_ID_PATTERN);
  if (!match) return null;
  return {
    day: parseInt(match[1], 10),
    month: parseInt(match[2], 10),
    year: 2000 + parseInt(match[3], 10),
    counter: parseInt(match[4], 10),
  };
}
