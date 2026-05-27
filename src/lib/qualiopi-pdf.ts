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
  // ⚠️ bottom: 0 — on gère le footer entièrement à la main (positions
  // absolues, voir drawFooter). Si on laisse une marge basse "raisonnable"
  // (genre 50 ou 75), chaque appel doc.text(...) du footer dont la
  // position dépasse `page.height - margins.bottom` déclenche un
  // `_addPage()` automatique chez pdfkit, ce qui crée une feuille blanche
  // et fragmente le footer sur plusieurs pages.
  // La protection du bas de page pour le contenu est assurée séparément par
  // ensureSpaceFor() qui utilise sa propre limite (page.height - 90).
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 0, left: 50, right: 50 },
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

  // === Section ACTIVITÉ ===
  drawSection(doc, "Activité", [
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
  drawSection(doc, "Satisfaction à chaud (fin de session)", [
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
  drawSection(doc, "Satisfaction à froid (impact 3 mois après)", [
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
  drawSection(doc, "Atteinte des objectifs pédagogiques", [
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
  drawSection(doc, "Satisfaction formateurs (bilan animation)", [
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
  drawSection(doc, "Réclamations (indicateur 32)", [
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
  const padding = 8;
  const lineHeight = 13;
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
  doc.y = startY + h + 8;
}

// Dessine une section complète (titre + séparateur + grille 2 colonnes) de
// manière ATOMIQUE : on calcule la hauteur totale et on appelle ensureSpaceFor
// une seule fois avant de dessiner quoi que ce soit. Ça évite le bug où le
// titre tient en bas de page mais la grille bascule sur la page suivante
// (= section coupée + impression d'une "page blanche en trop").
function drawSection(
  doc: PDFKit.PDFDocument,
  title: string,
  rows: { label: string; value: string; color?: string }[]
): void {
  const titleBlockHeight = 20; // titre + séparateur + petit gap
  const rowHeight = 14;
  const nbRowsPerCol = Math.ceil(rows.length / 2);
  const gridHeight = nbRowsPerCol * rowHeight;
  const bottomSpacing = 10;
  const sectionHeight = titleBlockHeight + gridHeight + bottomSpacing;

  ensureSpaceFor(doc, sectionHeight);

  const startY = doc.y;

  // Titre
  doc.fillColor(COLOR_TITLE).font("Helvetica-Bold").fontSize(10.5)
    .text(title, 50, startY, { width: 495, lineBreak: false });

  // Séparateur sous le titre
  const lineY = startY + 14;
  doc.moveTo(50, lineY).lineTo(545, lineY)
    .strokeColor(COLOR_BORDER).lineWidth(0.5).stroke();

  // Grille 2 colonnes — positions absolues, pas de wrap (lineBreak:false)
  const x1 = 60;
  const x2 = 310;
  const colWidth = 235;
  const valueWidth = 85;
  const labelWidth = colWidth - valueWidth - 5;
  const gridStartY = startY + titleBlockHeight;

  for (let i = 0; i < rows.length; i++) {
    const isLeft = i < nbRowsPerCol;
    const col = isLeft ? x1 : x2;
    const idx = isLeft ? i : i - nbRowsPerCol;
    const y = gridStartY + idx * rowHeight;
    const r = rows[i];
    doc.fillColor(COLOR_MUTED).font("Helvetica").fontSize(9)
      .text(r.label, col, y, { width: labelWidth, lineBreak: false, ellipsis: true });
    doc.fillColor(r.color || COLOR_TITLE).font("Helvetica-Bold").fontSize(9.5)
      .text(r.value, col + labelWidth + 5, y, { width: valueWidth, align: "right", lineBreak: false });
  }

  doc.y = startY + sectionHeight;
}

function ensureSpaceFor(doc: PDFKit.PDFDocument, requiredHeight: number): void {
  // Marge basse 90pt (footer ~60pt + 30pt de respiration)
  if (doc.y + requiredHeight > doc.page.height - 90) {
    doc.addPage();
    doc.y = 50;
  }
}

function drawFooter(doc: PDFKit.PDFDocument): void {
  // On fige la page range AVANT de dessiner. Si jamais une ligne du footer
  // déclenchait une nouvelle page (ne devrait plus arriver avec
  // margins.bottom = 0, mais ceinture + bretelles), on n'itèrerait pas
  // dessus (le bug "footer éparpillé sur plusieurs pages").
  const range = doc.bufferedPageRange();
  const pagesToDraw = range.count;

  for (let i = range.start; i < range.start + pagesToDraw; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - 60;

    doc.moveTo(50, y).lineTo(545, y).strokeColor(COLOR_BORDER).lineWidth(0.5).stroke();

    // `height` explicite borne le frame de texte et empêche pdfkit de
    // chercher à paginer même si lineBreak: false n'était pas suffisant.
    doc.fillColor(COLOR_MUTED).font("Helvetica").fontSize(7)
      .text(FOOTER_LINE_1, 50, y + 8, { width: 495, height: 10, align: "center", lineBreak: false });
    doc.text(FOOTER_LINE_2, 50, y + 20, { width: 495, height: 10, align: "center", lineBreak: false });
    if (pagesToDraw > 1) {
      doc.fillColor(COLOR_MUTED).fontSize(7).text(
        `Page ${i + 1} / ${pagesToDraw}`,
        50,
        y + 32,
        { width: 495, height: 10, align: "center", lineBreak: false }
      );
    }
  }
}
