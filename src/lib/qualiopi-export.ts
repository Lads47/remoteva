// Export du bilan Qualiopi annuel vers un Google Sheet sur Drive.
//
// Stratégie :
//   - 1 spreadsheet unique stocké à la racine du Shared Drive FORMATION,
//     nommé "Bilan Qualiopi - EVA Formation"
//   - 1 onglet par année (2026, 2025, …) avec tous les indicateurs en lignes
//     [label, value]
//   - Stocke l'id et l'url du sheet dans AppConfig sous les clés :
//       qualiopi.export_sheet_id
//       qualiopi.export_sheet_url
//       qualiopi.export_last_sync   (ISO timestamp du dernier export OK)
//
// Le cron `/api/cron/sync-qualiopi-sheet` appelle `syncQualiopiSheet()`
// chaque jour. La page admin /admin/formations affiche le lien.

import prisma from "./db";
import { getAvailableYears, getQualiopiOverview, type QualiopiOverview } from "./analytics";
import {
  createSpreadsheetInFolder,
  addSheet,
  updateValues,
  clearValues,
  applyHeaderFormatting,
  getSpreadsheet,
} from "./google-sheets";
import { isDriveConfigured, findFile } from "./google-drive";

const SHEET_NAME = "Bilan Qualiopi - EVA Formation";

const CFG_KEYS = {
  sheetId: "qualiopi.export_sheet_id",
  sheetUrl: "qualiopi.export_sheet_url",
  lastSync: "qualiopi.export_last_sync",
  targetFolder: "qualiopi.export_drive_folder_id",
} as const;

// ============================================================================
// AppConfig helpers
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
// Trouver le dossier cible sur Drive
// ============================================================================

/**
 * Renvoie l'ID du dossier Drive où ranger le sheet de bilan.
 * Logique :
 *   1. Si AppConfig.qualiopi.export_drive_folder_id est défini → on l'utilise
 *   2. Sinon, on cherche la racine Drive de la première formation configurée
 *      (cas typique : toutes les formations sont dans le même Shared Drive)
 *   3. Sinon, throw avec message clair.
 */
async function resolveTargetFolderId(): Promise<string> {
  const explicit = await getCfg(CFG_KEYS.targetFolder);
  if (explicit) return explicit;

  const firstFormation = await prisma.formation.findFirst({
    where: { driveDossierRacineId: { not: null }, active: true },
    select: { driveDossierRacineId: true },
  });
  if (firstFormation?.driveDossierRacineId) {
    return firstFormation.driveDossierRacineId;
  }

  throw new Error(
    "Aucun dossier Drive cible configuré pour l'export Qualiopi. " +
      "Définir AppConfig key qualiopi.export_drive_folder_id, " +
      "ou configurer driveDossierRacineId sur au moins une formation."
  );
}

// ============================================================================
// Trouver ou créer le spreadsheet
// ============================================================================

interface SheetTarget {
  spreadsheetId: string;
  spreadsheetUrl: string;
  created: boolean;
}

/**
 * Trouve le spreadsheet de bilan Qualiopi, ou le crée s'il n'existe pas.
 *
 * Ordre de résolution :
 *   1. AppConfig.qualiopi.export_sheet_id → on vérifie qu'il existe encore
 *   2. Recherche par nom dans le dossier cible
 *   3. Création
 */
async function getOrCreateQualiopiSheet(): Promise<SheetTarget> {
  // 1. Vérifie l'ID stocké
  const storedId = await getCfg(CFG_KEYS.sheetId);
  if (storedId) {
    try {
      const meta = await getSpreadsheet(storedId);
      return { spreadsheetId: meta.spreadsheetId, spreadsheetUrl: meta.spreadsheetUrl, created: false };
    } catch {
      // Sheet supprimé / accès perdu : on tombe sur la recherche par nom
      console.warn(`[qualiopi-export] sheet stocké ${storedId} introuvable, recherche par nom…`);
    }
  }

  const folderId = await resolveTargetFolderId();

  // 2. Cherche par nom dans le dossier
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

  // 3. Création
  const created = await createSpreadsheetInFolder({ parentFolderId: folderId, name: SHEET_NAME });
  await setCfg(CFG_KEYS.sheetId, created.spreadsheetId);
  await setCfg(CFG_KEYS.sheetUrl, created.spreadsheetUrl);
  return { ...created, created: true };
}

// ============================================================================
// Format des données pour un onglet
// ============================================================================

type Cell = string | number | null;

function pct(r: number): string {
  return `${Math.round(r * 100)} %`;
}

function fmtAvg(v: number | null, max: number): string {
  return v !== null ? `${v} / ${max}` : "—";
}

/**
 * Transforme un QualiopiOverview en un tableau 2D [label, value] pour
 * remplir un onglet annuel. La première colonne contient les libellés,
 * la seconde la valeur (texte ou nombre).
 */
export function formatOverviewAsRows(overview: QualiopiOverview): Cell[][] {
  const a = overview.activity;
  const sc = overview.satisfactionChaud;
  const sf = overview.satisfactionFroid;
  const p = overview.pedagogy;
  const t = overview.trainerSat;
  const c = overview.complaints;

  return [
    [`Bilan Qualiopi — ${overview.year}`, ""],
    [`Mise à jour automatique`, new Date().toISOString().slice(0, 16).replace("T", " ")],
    ["", ""],

    ["▸ ACTIVITÉ", ""],
    ["Sessions terminées", a.sessionsCount],
    ["Formations distinctes", a.formationsDistinctesCount],
    ["Stagiaires accueillis", a.traineesAccueillis],
    ["Heures-stagiaires réalisées", a.heuresStagiairesRealisees],
    ["Heures-stagiaires nominales", a.heuresStagiairesNominales],
    ["Taux d'assiduité moyen", `${a.tauxAssiduiteMoyen} %`],
    ["Stagiaires en situation de handicap", a.stagiairesPSH],
    ["", ""],

    ["▸ SATISFACTION À CHAUD", ""],
    ["Invitations envoyées", sc.invitedTotal],
    ["Réponses soumises", sc.submittedTotal],
    ["Taux de réponse", pct(sc.responseRate)],
    ["Satisfaction moyenne (Likert /5)", fmtAvg(sc.globalAverage, 5)],
    ["Nombre de réponses Likert agrégées", sc.globalCount],
    ["NPS", sc.npsScore ?? "—"],
    ["  Promoteurs", sc.npsPromoters],
    ["  Passifs", sc.npsPassives],
    ["  Détracteurs", sc.npsDetractors],
    ["  Total répondants NPS", sc.npsTotal],
    ["", ""],

    ["▸ SATISFACTION À FROID (impact 3 mois)", ""],
    ["Invitations envoyées", sf.invitedTotal],
    ["Réponses soumises", sf.submittedTotal],
    ["Taux de réponse", pct(sf.responseRate)],
    ["Impact moyen (Likert /5)", fmtAvg(sf.globalAverage, 5)],
    ["Nombre de réponses Likert agrégées", sf.globalCount],
    ["NPS à froid", sf.npsScore ?? "—"],
    ["  Promoteurs", sf.npsPromoters],
    ["  Passifs", sf.npsPassives],
    ["  Détracteurs", sf.npsDetractors],
    ["  Total répondants NPS", sf.npsTotal],
    ["", ""],

    ["▸ ATTEINTE DES OBJECTIFS PÉDAGOGIQUES", ""],
    ["Stagiaires total", p.traineesTotal],
    ["Objectifs atteints", p.atteints],
    ["Partiellement atteints", p.partiellementAtteints],
    ["Non atteints", p.nonAtteints],
    ["Non évalués", p.nonEvalues],
    ["Taux d'atteinte (sur évalués)", `${p.tauxAtteinte} %`],
    ["", ""],

    ["▸ SATISFACTION FORMATEURS", ""],
    ["Invitations envoyées", t.invitedTotal],
    ["Réponses soumises", t.submittedTotal],
    ["Taux de réponse", pct(t.responseRate)],
    ["Note moyenne formateurs (Likert /4)", fmtAvg(t.globalAverage, 4)],
    ["Nombre de réponses agrégées", t.globalCount],
    ["", ""],

    ["▸ RÉCLAMATIONS (indicateur 32)", ""],
    ["Total réclamations", c.total],
    ["  Nouvelles", c.byStatus.new],
    ["  En cours", c.byStatus.in_progress],
    ["  Résolues", c.byStatus.resolved],
    ["  Clôturées", c.byStatus.closed],
    ["Résolues + Clôturées", c.resolved],
    ["Non résolues", c.unresolved],
    ["Taux de résolution", pct(c.resolutionRate)],
    ["Délai moyen de résolution (jours)", c.averageResolutionDays],
    ["En retard (> 30 jours)", c.overdue],
  ];
}

// ============================================================================
// Sync principal
// ============================================================================

export interface SyncReport {
  spreadsheetId: string;
  spreadsheetUrl: string;
  created: boolean;
  yearsSynced: number[];
  errors: { year: number; error: string }[];
  syncedAt: string;
}

/**
 * Met à jour le sheet de bilan Qualiopi avec les données les plus à jour
 * pour toutes les années qui ont des sessions. Idempotent : un appel
 * réécrit le contenu de chaque onglet annuel.
 */
export async function syncQualiopiSheet(): Promise<SyncReport> {
  if (!isDriveConfigured()) {
    throw new Error("Google Drive non configuré (GOOGLE_SERVICE_ACCOUNT_KEY_B64 manquant)");
  }

  const target = await getOrCreateQualiopiSheet();
  const years = await getAvailableYears();
  const yearsSynced: number[] = [];
  const errors: { year: number; error: string }[] = [];

  for (const year of years) {
    try {
      const tab = await addSheet(target.spreadsheetId, String(year));
      const overview = await getQualiopiOverview(year);
      const rows = formatOverviewAsRows(overview);

      const range = `'${year}'!A1:B${rows.length}`;
      await clearValues(target.spreadsheetId, `'${year}'!A:Z`);
      await updateValues(target.spreadsheetId, range, rows);
      await applyHeaderFormatting(target.spreadsheetId, tab.sheetId);
      yearsSynced.push(year);
    } catch (err) {
      errors.push({
        year,
        error: err instanceof Error ? err.message : String(err),
      });
      console.error(`[qualiopi-export] année ${year} échec:`, err);
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

/**
 * Lit l'état actuel du sheet (id, url, last sync) sans déclencher de sync.
 * Utilisé par le dashboard pour afficher le lien.
 */
export async function getQualiopiSheetInfo(): Promise<{
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
