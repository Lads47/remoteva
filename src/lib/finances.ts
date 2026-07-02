// ============================================================================
// Statistiques financières par session.
//
// Calcule pour chaque session terminée d'une année :
//   - CA HT total (somme des montantHT des stagiaires)
//   - Coût sous-traitance HT (trainerFeeAmount si formateur externe)
//   - Marge brute = CA - coût ST
//   - Marge en % du CA
//
// Et l'agrégat YTD pour les KPI cards.
//
// Pivot : sessions où dateFin appartient à l'année ET status != cancelled
// ET dateFin <= now (cohérent avec analytics.ts).
// ============================================================================

import prisma from "./db";

export interface SessionFinanceRow {
  sessionId: string;
  code: string;
  dateDebut: Date;
  dateFin: Date;
  formationCode: string;
  formationNomLong: string;
  trainerNomComplet: string | null;
  trainerIsExternal: boolean;
  traineeCount: number;
  caHt: number;
  coutSousTraitanceHt: number;
  margeHt: number;
  margePct: number | null; // null si CA = 0 (division impossible)
}

export interface FinanceOverview {
  year: number;
  totalCaHt: number;
  totalCoutSousTraitanceHt: number;
  totalMargeHt: number;
  margeMoyennePct: number | null;
  sessionsCount: number;
  externalSessionsCount: number;
  sessions: SessionFinanceRow[];
}

/**
 * Calcule les stats financières par session pour une année.
 * @param year ex: 2026
 * @param formationId optionnel — filtre sur une formation précise
 */
export async function getFinancialStats(
  year: number,
  formationId?: string
): Promise<FinanceOverview> {
  const yearStart = new Date(`${year}-01-01T00:00:00Z`);
  const yearEnd = new Date(`${year}-12-31T23:59:59Z`);
  const now = new Date();

  const sessions = await prisma.session.findMany({
    where: {
      dateFin: { gte: yearStart, lte: yearEnd, lt: now },
      status: { not: "cancelled" },
      ...(formationId ? { formationId } : {}),
    },
    select: {
      id: true,
      code: true,
      dateDebut: true,
      dateFin: true,
      trainerFeeAmount: true,
      formation: { select: { code: true, nomLong: true } },
      trainer: { select: { prenom: true, nom: true, isExternal: true } },
      trainees: { where: { isTest: false }, select: { montantHT: true } },
    },
    orderBy: { dateFin: "desc" },
  });

  let totalCaHt = 0;
  let totalCoutSousTraitanceHt = 0;
  let externalSessionsCount = 0;

  const rows: SessionFinanceRow[] = sessions.map((s) => {
    const caHt = s.trainees.reduce((sum, t) => sum + (t.montantHT ?? 0), 0);
    // Le coût ST n'est compté que si le formateur est EXTERNE.
    // Pour un formateur interne, `trainerFeeAmount` doit rester null ; si
    // une valeur résiduelle existe (formateur passé d'externe à interne
    // après coup) on l'ignore pour rester cohérent.
    const isExternal = s.trainer?.isExternal === true;
    const coutSousTraitanceHt = isExternal ? s.trainerFeeAmount ?? 0 : 0;
    if (isExternal) externalSessionsCount++;

    const margeHt = caHt - coutSousTraitanceHt;
    const margePct = caHt > 0 ? Math.round((margeHt / caHt) * 1000) / 10 : null;

    totalCaHt += caHt;
    totalCoutSousTraitanceHt += coutSousTraitanceHt;

    return {
      sessionId: s.id,
      code: s.code,
      dateDebut: s.dateDebut,
      dateFin: s.dateFin,
      formationCode: s.formation.code,
      formationNomLong: s.formation.nomLong,
      trainerNomComplet: s.trainer ? `${s.trainer.prenom} ${s.trainer.nom}` : null,
      trainerIsExternal: isExternal,
      traineeCount: s.trainees.length,
      caHt,
      coutSousTraitanceHt,
      margeHt,
      margePct,
    };
  });

  const totalMargeHt = totalCaHt - totalCoutSousTraitanceHt;
  const margeMoyennePct =
    totalCaHt > 0 ? Math.round((totalMargeHt / totalCaHt) * 1000) / 10 : null;

  return {
    year,
    totalCaHt,
    totalCoutSousTraitanceHt,
    totalMargeHt,
    margeMoyennePct,
    sessionsCount: rows.length,
    externalSessionsCount,
    sessions: rows,
  };
}

/**
 * Liste des années où on a au moins 1 session terminée. Utile pour le
 * sélecteur d'année côté UI.
 */
export async function getYearsWithFinishedSessions(): Promise<number[]> {
  const now = new Date();
  const sessions = await prisma.session.findMany({
    where: {
      status: { not: "cancelled" },
      dateFin: { lt: now },
    },
    select: { dateFin: true },
  });
  const years = new Set<number>();
  for (const s of sessions) years.add(s.dateFin.getFullYear());
  return Array.from(years).sort((a, b) => b - a);
}
