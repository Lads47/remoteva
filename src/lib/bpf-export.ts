// Export du Bilan Pédagogique et Financier (Cerfa 10443) annuel vers un
// Google Sheet dédié sur Drive. Parallèle à qualiopi-export.ts mais sur
// un fichier séparé "BPF - EVA Formation" — l'audience est différente
// (DREETS pour le BPF, auditeur Qualiopi pour les indicateurs).
//
// État stocké dans AppConfig sous les clés bpf.export_*.
// Cron quotidien : /api/cron/sync-bpf-sheet.

import prisma from "./db";
import {
  getAvailableYears,
  getBpfStats,
  type BpfStats,
  type BpfBreakdown,
} from "./analytics";
import {
  createSpreadsheetInFolder,
  addSheet,
  updateValues,
  clearValues,
  applyHeaderFormatting,
  getSpreadsheet,
} from "./google-sheets";
import { isDriveConfigured, findFile } from "./google-drive";

const SHEET_NAME = "BPF - EVA Formation";

const CFG_KEYS = {
  sheetId: "bpf.export_sheet_id",
  sheetUrl: "bpf.export_sheet_url",
  lastSync: "bpf.export_last_sync",
  targetFolder: "bpf.export_drive_folder_id",
} as const;

// ============================================================================
// AppConfig helpers (dupliqués de qualiopi-export — petit code, pas de DRY ici)
// ============================================================================

async function getCfg(key: string): Promise<string | null> {
  const row = await prisma.appConfig.findUnique({ where: { key } });
  return row?.value ?? null;
}

async function setCfg(key: string, value: string): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

// ============================================================================
// Find or create
// ============================================================================

async function resolveTargetFolderId(): Promise<string> {
  const explicit = await getCfg(CFG_KEYS.targetFolder);
  if (explicit) return explicit;

  // Fallback : même dossier que le Sheet Qualiopi si configuré
  const qualiopiFolder = await getCfg("qualiopi.export_drive_folder_id");
  if (qualiopiFolder) return qualiopiFolder;

  const firstFormation = await prisma.formation.findFirst({
    where: { driveDossierRacineId: { not: null }, active: true },
    select: { driveDossierRacineId: true },
  });
  if (firstFormation?.driveDossierRacineId) {
    return firstFormation.driveDossierRacineId;
  }

  throw new Error(
    "Aucun dossier Drive cible pour l'export BPF. Définir AppConfig key " +
      "bpf.export_drive_folder_id ou configurer driveDossierRacineId."
  );
}

interface SheetTarget {
  spreadsheetId: string;
  spreadsheetUrl: string;
  created: boolean;
}

async function getOrCreateBpfSheet(): Promise<SheetTarget> {
  const storedId = await getCfg(CFG_KEYS.sheetId);
  if (storedId) {
    try {
      const meta = await getSpreadsheet(storedId);
      return { spreadsheetId: meta.spreadsheetId, spreadsheetUrl: meta.spreadsheetUrl, created: false };
    } catch {
      console.warn(`[bpf-export] sheet stocké ${storedId} introuvable, recherche par nom…`);
    }
  }

  const folderId = await resolveTargetFolderId();

  const existing = await findFile(folderId, SHEET_NAME);
  if (existing) {
    await setCfg(CFG_KEYS.sheetId, existing.id);
    if (existing.webViewLink) await setCfg(CFG_KEYS.sheetUrl, existing.webViewLink);
    return {
      spreadsheetId: existing.id,
      spreadsheetUrl: existing.webViewLink || `https://docs.google.com/spreadsheets/d/${existing.id}/edit`,
      created: false,
    };
  }

  const created = await createSpreadsheetInFolder({ parentFolderId: folderId, name: SHEET_NAME });
  await setCfg(CFG_KEYS.sheetId, created.spreadsheetId);
  await setCfg(CFG_KEYS.sheetUrl, created.spreadsheetUrl);
  return { ...created, created: true };
}

// ============================================================================
// Format
// ============================================================================

type Cell = string | number | null;

function fmtMoney(n: number): string {
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

function breakdownRows(title: string, breakdown: BpfBreakdown[]): Cell[][] {
  if (breakdown.length === 0) {
    return [
      [title, ""],
      ["  (aucune donnée)", ""],
      ["", ""],
    ];
  }
  // 4 colonnes : Catégorie / Stagiaires / Heures-stagiaires / CA HT
  const header: Cell[] = [title, "Stagiaires", "Heures-stagiaires", "CA HT"];
  const rows: Cell[][] = [header];
  let totalCount = 0, totalH = 0, totalCa = 0;
  for (const b of breakdown) {
    rows.push([`  ${b.key}`, b.count, Math.round(b.heures * 10) / 10, fmtMoney(b.ca)]);
    totalCount += b.count;
    totalH += b.heures;
    totalCa += b.ca;
  }
  rows.push(["  TOTAL", totalCount, Math.round(totalH * 10) / 10, fmtMoney(totalCa)]);
  rows.push(["", "", "", ""]);
  return rows;
}

export function formatBpfAsRows(bpf: BpfStats): Cell[][] {
  const rows: Cell[][] = [];

  // En-tête
  rows.push([`BPF — Bilan Pédagogique et Financier ${bpf.year}`, "", "", ""]);
  rows.push([`Mise à jour automatique`, new Date().toISOString().slice(0, 16).replace("T", " "), "", ""]);
  rows.push([`Référence Cerfa`, "10443*16", "", ""]);
  rows.push(["", "", "", ""]);

  // Volume global (section F-1/F-3 du Cerfa)
  rows.push(["▸ VOLUME GLOBAL", "", "", ""]);
  rows.push(["  Stagiaires accueillis", bpf.totalTrainees, "", ""]);
  rows.push(["  Sessions réalisées", bpf.totalSessions, "", ""]);
  rows.push(["  Formations distinctes", bpf.totalFormations, "", ""]);
  rows.push(["  Heures-stagiaires réalisées", bpf.totalHeuresStagiaires, "", ""]);
  rows.push(["  Heures-stagiaires nominales", bpf.totalHeuresStagiairesNominales, "", ""]);
  rows.push(["  Stagiaires en situation de handicap (PSH)", bpf.traineesPSH, "", ""]);
  rows.push(["  Chiffre d'affaires HT total", fmtMoney(bpf.totalCaHt), "", ""]);
  rows.push(["", "", "", ""]);

  // Origine des stagiaires par statut professionnel (section F-2)
  rows.push(...breakdownRows("▸ ORIGINE DES STAGIAIRES (par statut professionnel)", bpf.byStatut));

  // Type d'inscription (section F-2)
  rows.push(...breakdownRows("▸ TYPE D'INSCRIPTION (particulier vs entreprise)", bpf.byInscriptionType));

  // Financement (section B-2 — origine des produits)
  rows.push(...breakdownRows("▸ FINANCEMENT (origine des produits)", bpf.byMode));

  // OPCO (détail section B-2)
  rows.push(...breakdownRows("▸ RÉPARTITION PAR OPCO", bpf.byOpco));

  // Détail par formation (section F-5 spécialités — à mapper sur codes NSF manuellement)
  rows.push(["▸ DÉTAIL PAR FORMATION (pour mapping NSF dans le Cerfa)", "", "", ""]);
  if (bpf.byFormation.length === 0) {
    rows.push(["  (aucune formation)", "", "", ""]);
  } else {
    rows.push(["  Code formation", "Sessions", "Stagiaires", "Heures-stagiaires"]);
    let totalSessions = 0, totalTrainees = 0, totalHeures = 0, totalCa = 0;
    for (const f of bpf.byFormation) {
      rows.push([`  ${f.code} — ${f.nomLong}`, f.sessions, f.trainees, f.heures]);
      totalSessions += f.sessions;
      totalTrainees += f.trainees;
      totalHeures += f.heures;
      totalCa += f.ca;
    }
    rows.push(["  TOTAL", totalSessions, totalTrainees, Math.round(totalHeures * 10) / 10]);
    rows.push(["", "", "", ""]);
    // Sous-tableau : CA par formation
    rows.push(["  CA HT par formation", "", "", ""]);
    rows.push(["  Code formation", "CA HT", "", ""]);
    for (const f of bpf.byFormation) {
      rows.push([`  ${f.code} — ${f.nomLong}`, fmtMoney(f.ca), "", ""]);
    }
    rows.push(["  TOTAL CA HT", fmtMoney(totalCa), "", ""]);
  }

  return rows;
}

// ============================================================================
// Sync
// ============================================================================

export interface BpfSyncReport {
  spreadsheetId: string;
  spreadsheetUrl: string;
  created: boolean;
  yearsSynced: number[];
  errors: { year: number; error: string }[];
  syncedAt: string;
}

export async function syncBpfSheet(): Promise<BpfSyncReport> {
  if (!isDriveConfigured()) {
    throw new Error("Google Drive non configuré (GOOGLE_SERVICE_ACCOUNT_KEY_B64 manquant)");
  }

  const target = await getOrCreateBpfSheet();
  const years = await getAvailableYears();
  const yearsSynced: number[] = [];
  const errors: { year: number; error: string }[] = [];

  for (const year of years) {
    try {
      const tab = await addSheet(target.spreadsheetId, String(year));
      const bpf = await getBpfStats(year);
      const rows = formatBpfAsRows(bpf);

      const maxCols = Math.max(...rows.map((r) => r.length));
      const range = `'${year}'!A1:${String.fromCharCode(64 + maxCols)}${rows.length}`;
      await clearValues(target.spreadsheetId, `'${year}'!A:Z`);
      await updateValues(target.spreadsheetId, range, rows);
      await applyHeaderFormatting(target.spreadsheetId, tab.sheetId);
      yearsSynced.push(year);
    } catch (err) {
      errors.push({
        year,
        error: err instanceof Error ? err.message : String(err),
      });
      console.error(`[bpf-export] année ${year} échec:`, err);
    }
  }

  const syncedAt = new Date().toISOString();
  await setCfg(CFG_KEYS.lastSync, syncedAt);

  return {
    spreadsheetId: target.spreadsheetId,
    spreadsheetUrl: target.spreadsheetUrl,
    created: target.created,
    yearsSynced,
    errors,
    syncedAt,
  };
}

export async function getBpfSheetInfo(): Promise<{
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  lastSync: string | null;
}> {
  const [spreadsheetId, spreadsheetUrl, lastSync] = await Promise.all([
    getCfg(CFG_KEYS.sheetId),
    getCfg(CFG_KEYS.sheetUrl),
    getCfg(CFG_KEYS.lastSync),
  ]);
  return { spreadsheetId, spreadsheetUrl, lastSync };
}
