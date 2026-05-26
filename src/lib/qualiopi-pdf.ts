// PDF du bilan Qualiopi annuel pour audit.
//
// Format A4 portrait, 1 page si possible (compact, lisible pour un auditeur).
// Reprend l'identité visuelle du PDF de satisfaction (mêmes couleurs +
// header/footer LADS).

import { readFileSync } from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import type { QualiopiOverview } from "./analytics";

const COLOR_TITLE = "#1f2244";
const COLOR_MUTED = "#727485";
const COLOR_BORDER = "#e5e7eb";
const COLOR_BG_SOFT = "#fafbff";
const COLOR_GREEN = "#166534";
const COLOR_ORANGE = "#92400e";
const COLOR_RED = "#991b1b";

const FOOTER_LINE_1 =
  "Les Ateliers du Stream - Siège : 39 bis rue Robert Creuzet 47200 MARMANDE - Siret : 81950223800036 - APE : 59.11B - formation@lesateliersdustream.fr";
const FOOTER_LINE_2 =
  "Tel : 06.46.65.65.77 – Organisme de formation professionnelle continue - NDA N°75470196847";

let cachedLogo: string | null | undefined;
function loadLogo(): string | null {
  if (cachedLogo !== undefined) return cachedLogo;
  try {
    cachedLogo = readFileSync(path.join(process.cwd(), "public", "logo-lads-fonce.svg"), "utf8");
  } catch {
    cachedLogo = null;
  }
  return cachedLogo;
}

function fmtDateTime(d: Date): string {
  return d.toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function pct(r: number): string {
  return `${Math.round(r * 100)} %`;
}

// === Seuils Qualiopi (cohérents avec le dashboard UI) ===

function colorAssiduite(t: number): string {
  if (t >= 90) return COLOR_GREEN;
  if (t >= 75) return COLOR_ORANGE;
  return COLOR_RED;
}
function colorAtteinte(t: number): string {
  if (t >= 80) return COLOR_GREEN;
  if (t >= 60) return COLOR_ORANGE;
  return COLOR_RED;
}
function colorReponse(r: number): string {
  if (r >= 0.6) return COLOR_GREEN;
  if (r >= 0.3) return COLOR_ORANGE;
  return COLOR_RED;
}
function colorSat(avg: number | null, max: number): string {
  if (avg === null) return COLOR_MUTED;
  const ratio = avg / max;
  if (ratio >= 0.8) return COLOR_GREEN;
  if (ratio >= 0.6) return COLOR_ORANGE;
  return COLOR_RED;
}
function colorNps(score: number | null): string {
  if (score === null) return COLOR_MUTED;
  if (score >= 30) return COLOR_GREEN;
  if (score >= 0) return COLOR_ORANGE;
  return COLOR_RED;
}

export async function buildQualiopiPdf(
  overview: QualiopiOverview
): Promise<{ buffer: Buffer; filename: string }> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 75, left: 50, right: 50 },
    info: {
      Title: `Bilan Qualiopi ${overview.year} — Les Ateliers du Stream`,
      Author: "Les Ateliers du Stream",
      Subject: `Indicateurs Qualiopi annuels ${overview.year}`,
    },
    bufferPages: true,
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((r) => doc.on("end", () => r()));

  drawHeader(doc, `Bilan Qualiopi — ${overview.year}`);

  // Bloc info
  drawInfoBox(doc, doc.y, [
    { label: "Organisme", value: "Les Ateliers du Stream" },
    { label: "NDA", value: "75470196847" },
    { label: "Année de référence", value: String(overview.year) },
    { label: "Date d'édition", value: fmtDateTime(new Date()) },
  ]);

  doc.moveDown(1);

  // === Section ACTIVITÉ ===
  drawSectionTitle(doc, "Activité");
  drawKeyValueGrid(doc, [
    { label: "Sessions réalisées", value: String(overview.activity.sessionsCount) },
    { label: "Formations distinctes", value: String(overview.activity.formationsDistinctesCount) },
    { label: "Stagiaires accueillis", value: String(overview.activity.traineesAccueillis) },
    { label: "Stagiaires PSH", value: String(overview.activity.stagiairesPSH) },
    {
      label: "Heures-stagiaires réalisées",
      value: `${overview.activity.heuresStagiairesRealisees} h / ${overview.activity.heuresStagiairesNominales} h`,
    },
    {
      label: "Taux d'assiduité moyen",
      value: `${overview.activity.tauxAssiduiteMoyen} %`,
      color: colorAssiduite(overview.activity.tauxAssiduiteMoyen),
    },
  ]);

  // === Section SATISFACTION À CHAUD ===
  drawSectionTitle(doc, "Satisfaction à chaud (fin de session)");
  drawKeyValueGrid(doc, [
    {
      label: "Taux de réponse",
      value: `${overview.satisfactionChaud.submittedTotal} / ${overview.satisfactionChaud.invitedTotal} (${pct(overview.satisfactionChaud.responseRate)})`,
      color: colorReponse(overview.satisfactionChaud.responseRate),
    },
    {
      label: "Satisfaction moyenne",
      value: overview.satisfactionChaud.globalAverage !== null
        ? `${overview.satisfactionChaud.globalAverage} / 5`
        : "—",
      color: colorSat(overview.satisfactionChaud.globalAverage, 5),
    },
    {
      label: "NPS",
      value: overview.satisfactionChaud.npsScore !== null ? String(overview.satisfactionChaud.npsScore) : "—",
      color: colorNps(overview.satisfactionChaud.npsScore),
    },
    {
      label: "Répartition P/Pa/D",
      value: `${overview.satisfactionChaud.npsPromoters} / ${overview.satisfactionChaud.npsPassives} / ${overview.satisfactionChaud.npsDetractors}`,
    },
  ]);

  // === Section SATISFACTION À FROID ===
  drawSectionTitle(doc, "Satisfaction à froid (impact 3 mois après)");
  drawKeyValueGrid(doc, [
    {
      label: "Taux de réponse",
      value: `${overview.satisfactionFroid.submittedTotal} / ${overview.satisfactionFroid.invitedTotal} (${pct(overview.satisfactionFroid.responseRate)})`,
      color: colorReponse(overview.satisfactionFroid.responseRate),
    },
    {
      label: "Impact moyen",
      value: overview.satisfactionFroid.globalAverage !== null
        ? `${overview.satisfactionFroid.globalAverage} / 5`
        : "—",
      color: colorSat(overview.satisfactionFroid.globalAverage, 5),
    },
    {
      label: "NPS à froid",
      value: overview.satisfactionFroid.npsScore !== null ? String(overview.satisfactionFroid.npsScore) : "—",
      color: colorNps(overview.satisfactionFroid.npsScore),
    },
    {
      label: "Répartition P/Pa/D",
      value: `${overview.satisfactionFroid.npsPromoters} / ${overview.satisfactionFroid.npsPassives} / ${overview.satisfactionFroid.npsDetractors}`,
    },
  ]);

  // === Section ATTEINTE DES OBJECTIFS ===
  drawSectionTitle(doc, "Atteinte des objectifs pédagogiques");
  drawKeyValueGrid(doc, [
    {
      label: "Taux d'atteinte (sur évalués)",
      value: `${overview.pedagogy.tauxAtteinte} %`,
      color: colorAtteinte(overview.pedagogy.tauxAtteinte),
    },
    { label: "Atteints", value: String(overview.pedagogy.atteints) },
    { label: "Partiellement atteints", value: String(overview.pedagogy.partiellementAtteints) },
    { label: "Non atteints", value: String(overview.pedagogy.nonAtteints) },
    { label: "Non évalués", value: String(overview.pedagogy.nonEvalues), color: overview.pedagogy.nonEvalues > 0 ? COLOR_ORANGE : undefined },
  ]);

  // === Section FORMATEURS ===
  drawSectionTitle(doc, "Satisfaction formateurs (bilan animation)");
  drawKeyValueGrid(doc, [
    {
      label: "Taux de réponse",
      value: `${overview.trainerSat.submittedTotal} / ${overview.trainerSat.invitedTotal} (${pct(overview.trainerSat.responseRate)})`,
      color: colorReponse(overview.trainerSat.responseRate),
    },
    {
      label: "Note moyenne formateurs",
      value: overview.trainerSat.globalAverage !== null
        ? `${overview.trainerSat.globalAverage} / 4`
        : "—",
      color: colorSat(overview.trainerSat.globalAverage, 4),
    },
  ]);

  // === Section RÉCLAMATIONS ===
  drawSectionTitle(doc, "Réclamations (indicateur 32)");
  drawKeyValueGrid(doc, [
    { label: "Total réclamations", value: String(overview.complaints.total) },
    { label: "Résolues", value: `${overview.complaints.resolved} (${pct(overview.complaints.resolutionRate)})` },
    { label: "En cours", value: String(overview.complaints.unresolved), color: overview.complaints.unresolved > 0 ? COLOR_ORANGE : undefined },
    { label: "En retard (>30 j)", value: String(overview.complaints.overdue), color: overview.complaints.overdue > 0 ? COLOR_RED : COLOR_GREEN },
    {
      label: "Délai moyen de résolution",
      value: overview.complaints.averageResolutionDays > 0
        ? `${overview.complaints.averageResolutionDays} j`
        : "—",
    },
  ]);

  drawFooter(doc);
  doc.end();
  await done;

  const buffer = Buffer.concat(chunks);
  const filename = `Bilan_Qualiopi_${overview.year}_LADS.pdf`;
  return { buffer, filename };
}

// ============================================================================
// Helpers de rendu PDF
// ============================================================================

function drawHeader(doc: PDFKit.PDFDocument, title: string): void {
  const logo = loadLogo();
  if (logo) {
    try {
      SVGtoPDF(doc, logo, 50, 40, { width: 40, height: 40 });
    } catch {
      /* fallback silencieux */
    }
  }
  doc
    .fillColor(COLOR_TITLE)
    .font("Helvetica-Bold")
    .fontSize(18)
    .text(title, 100, 50, { width: 400 });

  doc
    .moveTo(50, 100)
    .lineTo(545, 100)
    .strokeColor(COLOR_BORDER)
    .lineWidth(0.5)
    .stroke();

  doc.y = 115;
}

function drawInfoBox(
  doc: PDFKit.PDFDocument,
  startY: number,
  rows: { label: string; value: string }[]
): void {
  const x = 50;
  const w = 495;
  const padding = 10;
  const lineHeight = 14;
  const h = padding * 2 + rows.length * lineHeight;

  doc.rect(x, startY, w, h)
    .fillColor(COLOR_BG_SOFT).fill()
    .strokeColor(COLOR_BORDER).lineWidth(0.5).stroke();

  let y = startY + padding;
  for (const r of rows) {
    doc.fillColor(COLOR_MUTED).font("Helvetica").fontSize(9).text(r.label, x + padding, y, { width: 140 });
    doc.fillColor(COLOR_TITLE).font("Helvetica-Bold").fontSize(10).text(r.value, x + padding + 150, y, { width: w - padding - 150 });
    y += lineHeight;
  }
  doc.y = startY + h + 6;
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  ensureSpaceFor(doc, 30);
  doc.fillColor(COLOR_TITLE).font("Helvetica-Bold").fontSize(11).text(title, 50, doc.y);
  doc.moveDown(0.3);
  const y = doc.y;
  doc.moveTo(50, y).lineTo(545, y).strokeColor(COLOR_BORDER).lineWidth(0.5).stroke();
  doc.moveDown(0.4);
}

function drawKeyValueGrid(
  doc: PDFKit.PDFDocument,
  rows: { label: string; value: string; color?: string }[]
): void {
  // Affichage 2 colonnes pour rester compact
  const x1 = 60;
  const x2 = 310;
  const colWidth = 230;
  const rowHeight = 16;
  const nbRowsPerCol = Math.ceil(rows.length / 2);
  const totalHeight = nbRowsPerCol * rowHeight + 6;
  ensureSpaceFor(doc, totalHeight);

  const startY = doc.y;
  for (let i = 0; i < rows.length; i++) {
    const isLeft = i < nbRowsPerCol;
    const col = isLeft ? x1 : x2;
    const idx = isLeft ? i : i - nbRowsPerCol;
    const y = startY + idx * rowHeight;
    const r = rows[i];
    doc.fillColor(COLOR_MUTED).font("Helvetica").fontSize(9).text(r.label, col, y, { width: colWidth - 80, continued: false });
    doc.fillColor(r.color || COLOR_TITLE).font("Helvetica-Bold").fontSize(9.5).text(r.value, col + colWidth - 80, y, { width: 80, align: "right" });
  }
  doc.y = startY + totalHeight;
}

function ensureSpaceFor(doc: PDFKit.PDFDocument, requiredHeight: number): void {
  if (doc.y + requiredHeight > doc.page.height - 90) {
    doc.addPage();
    doc.y = 50;
  }
}

function drawFooter(doc: PDFKit.PDFDocument): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - 60;
    doc.moveTo(50, y).lineTo(545, y).strokeColor(COLOR_BORDER).lineWidth(0.5).stroke();
    doc.fillColor(COLOR_MUTED).font("Helvetica").fontSize(7).text(FOOTER_LINE_1, 50, y + 8, { width: 495, align: "center" });
    doc.text(FOOTER_LINE_2, 50, y + 20, { width: 495, align: "center" });
    doc.fillColor(COLOR_MUTED).fontSize(7).text(
      `Page ${i + 1} / ${range.count}`,
      50,
      y + 40,
      { width: 495, align: "center" }
    );
  }
}
