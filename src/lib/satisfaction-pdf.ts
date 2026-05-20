// PDF de synthèse de l'évaluation à chaud pour une session.
//
// Format A4, identité visuelle alignée avec le PDF d'évaluation pratique.
// Contient :
//   - En-tête : titre + logo LADS + bloc info session
//   - Totaux : invités / répondus / taux
//   - Bloc NPS si présent
//   - Stats par question (moyennes, distributions)
//   - Liste des verbatims (textareas / text)
//   - Footer (mentions légales OF)
//
// Utilise le même stack que evaluation-pdf.ts : pdfkit + svg-to-pdfkit.

import { readFileSync } from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import type { SatisfactionSynthesis } from "./satisfaction";

const COLOR_TITLE = "#1f2244";
const COLOR_MUTED = "#727485";
const COLOR_BORDER = "#e5e7eb";
const COLOR_BG_SOFT = "#fafbff";

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

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}
function fmtDateTime(d: Date): string {
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export async function buildSatisfactionPdf(synthesis: SatisfactionSynthesis): Promise<{ buffer: Buffer; filename: string }> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 75, left: 50, right: 50 },
    info: {
      Title: `Synthèse satisfaction — ${synthesis.session.code}`,
      Author: "Les Ateliers du Stream",
      Subject: `Évaluation à chaud — ${synthesis.formation.nomLong}`,
    },
    bufferPages: true,
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((r) => doc.on("end", () => r()));

  // En-tête
  drawHeader(doc, "Évaluation à chaud — Synthèse");

  // Bloc info session
  drawInfoBox(doc, doc.y, [
    { label: "Formation", value: synthesis.formation.nomLong },
    { label: "Session", value: `${synthesis.session.code} (${fmtDate(synthesis.session.dateDebut)} → ${fmtDate(synthesis.session.dateFin)})` },
    { label: "Lieu", value: synthesis.session.lieu || "—" },
    {
      label: "Taux de réponse",
      value: `${synthesis.totals.submitted}/${synthesis.totals.invited} (${Math.round(synthesis.totals.responseRate * 100)} %)`,
    },
    { label: "Date d'édition", value: fmtDateTime(new Date()) },
  ]);

  // Bloc NPS si présent
  const npsStat = synthesis.stats.find((s) => s.question.type === "scale_nps" && s.npsScore !== undefined);
  if (npsStat) {
    drawNpsBlock(doc, npsStat);
  }

  // Stats par question
  doc.font("Helvetica-Bold").fontSize(13).fillColor(COLOR_TITLE).text("Synthèse par question");
  doc.x = 50;
  doc.moveDown(0.5);

  for (const stat of synthesis.stats) {
    drawQuestionStat(doc, stat);
  }

  // Verbatims (textareas)
  const textStats = synthesis.stats.filter((s) => s.textResponses && s.textResponses.length > 0);
  if (textStats.length > 0) {
    doc.addPage();
    drawHeader(doc, "Réponses libres (verbatims)");
    for (const stat of textStats) {
      doc.font("Helvetica-Bold").fontSize(11).fillColor(COLOR_TITLE).text(stat.question.label);
      doc.x = 50;
      doc.moveDown(0.2);
      for (const txt of stat.textResponses!) {
        doc.font("Helvetica").fontSize(10).fillColor(COLOR_TITLE).text(`• ${txt}`, { align: "left" });
        doc.x = 50;
      }
      doc.moveDown(0.4);
    }
  }

  // Footer
  const pageRange = doc.bufferedPageRange();
  for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
    doc.switchToPage(i);
    drawFooter(doc);
  }

  doc.end();
  await done;
  return {
    buffer: Buffer.concat(chunks),
    filename: `Synthese_eval_a_chaud_${synthesis.session.code}.pdf`,
  };
}

function drawHeader(doc: PDFKit.PDFDocument, title: string): void {
  const headerTop = 40;
  const logoHeight = 48;
  const logoWidth = logoHeight * (469.53 / 324.62);
  const logoX = doc.page.width - 50 - logoWidth;
  const svg = loadLogo();
  if (svg) {
    try {
      SVGtoPDF(doc, svg, logoX, headerTop, { width: logoWidth, height: logoHeight, preserveAspectRatio: "xMinYMin meet" });
    } catch {}
  }
  doc
    .font("Helvetica-Bold").fontSize(18).fillColor(COLOR_TITLE)
    .text(title, 50, headerTop + 8, { width: logoX - 60, lineBreak: false });
  doc
    .font("Helvetica").fontSize(9).fillColor(COLOR_MUTED)
    .text("Les Ateliers du Stream", 50, headerTop + 32, { width: logoX - 60, lineBreak: false });
  doc.y = headerTop + logoHeight + 12;
  doc.x = 50;
  doc.moveDown(0.4);
}

function drawInfoBox(doc: PDFKit.PDFDocument, startY: number, rows: { label: string; value: string }[]): void {
  const padding = 10;
  const x = 50;
  const width = 495;
  const lineHeight = 14;
  const labelWidth = 130;
  let estimatedHeight = padding * 2;
  for (const r of rows) {
    const valueHeight = doc.heightOfString(r.value, { width: width - padding * 2 - labelWidth });
    estimatedHeight += Math.max(lineHeight, valueHeight) + 2;
  }
  doc.save();
  doc.lineWidth(0.5).strokeColor(COLOR_BORDER).fillColor(COLOR_BG_SOFT);
  doc.roundedRect(x, startY, width, estimatedHeight, 6).fillAndStroke(COLOR_BG_SOFT, COLOR_BORDER);
  doc.restore();
  let cursorY = startY + padding;
  for (const r of rows) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOR_MUTED).text(r.label, x + padding, cursorY, { width: labelWidth });
    const valueHeight = doc.heightOfString(r.value, { width: width - padding * 2 - labelWidth });
    doc.font("Helvetica").fontSize(10).fillColor(COLOR_TITLE).text(r.value, x + padding + labelWidth, cursorY, {
      width: width - padding * 2 - labelWidth,
    });
    cursorY += Math.max(lineHeight, valueHeight) + 2;
  }
  doc.y = startY + estimatedHeight + 12;
  doc.x = x;
}

interface StatLike {
  question: { name: string; type: string; label: string };
  average?: number;
  distribution?: Record<string, number>;
  textResponses?: string[];
  npsScore?: number;
  npsPromoters?: number;
  npsPassives?: number;
  npsDetractors?: number;
}

function drawNpsBlock(doc: PDFKit.PDFDocument, stat: StatLike): void {
  const x = 50;
  const width = 495;
  const startY = doc.y;
  const height = 60;
  doc.save();
  doc.lineWidth(0.5).strokeColor("#fef3c7").fillColor("#fffbeb");
  doc.roundedRect(x, startY, width, height, 6).fillAndStroke("#fffbeb", "#fde68a");
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#92400e").text("Score NPS (Net Promoter Score)", x + 12, startY + 10);
  doc.font("Helvetica-Bold").fontSize(28).fillColor("#92400e").text(String(stat.npsScore ?? "—"), x + 12, startY + 25);
  doc.font("Helvetica").fontSize(9).fillColor("#92400e").text(
    `${stat.npsPromoters} promoteurs · ${stat.npsPassives} passifs · ${stat.npsDetractors} détracteurs`,
    x + 100, startY + 30, { width: width - 110 }
  );
  doc.y = startY + height + 10;
  doc.x = x;
}

function drawQuestionStat(doc: PDFKit.PDFDocument, stat: StatLike): void {
  const x = 50;
  const width = 495;

  // Section header : titre groupe, pas de stats
  if (stat.question.type === "section_header") {
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(COLOR_TITLE).text(stat.question.label, x, doc.y, { width });
    doc.x = x;
    doc.moveDown(0.4);
    doc.save();
    doc.strokeColor(COLOR_BORDER).lineWidth(0.5).moveTo(x, doc.y).lineTo(x + width, doc.y).stroke();
    doc.restore();
    doc.moveDown(0.4);
    return;
  }

  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLOR_TITLE).text(stat.question.label, x, doc.y, { width });
  doc.x = x;
  doc.moveDown(0.2);

  if (stat.question.type === "likert_5") {
    const dist = stat.distribution || {};
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    const avg = stat.average !== undefined ? stat.average.toFixed(2) : "—";
    doc.font("Helvetica").fontSize(9).fillColor(COLOR_MUTED).text(`Moyenne : ${avg}/5  ·  ${total} réponse${total > 1 ? "s" : ""}`, x);
    doc.x = x;
    drawDistributionBars(doc, ["1", "2", "3", "4", "5"], dist, total);
  } else if (stat.question.type === "scale_nps") {
    const dist = stat.distribution || {};
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    const avg = stat.average !== undefined ? stat.average.toFixed(2) : "—";
    doc.font("Helvetica").fontSize(9).fillColor(COLOR_MUTED).text(`Moyenne : ${avg}/10  ·  ${total} réponse${total > 1 ? "s" : ""}`, x);
    doc.x = x;
    // Rendu compact en histogramme vertical (11 colonnes côte à côte). Tient
    // en une seule page contrairement à 11 barres horizontales empilées qui
    // débordaient et déclenchaient des sauts de page parasites.
    drawNpsHistogram(doc, dist, total);
  } else if (stat.question.type === "yes_no" || stat.question.type === "single_choice") {
    const dist = stat.distribution || {};
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    doc.font("Helvetica").fontSize(9).fillColor(COLOR_MUTED).text(`${total} réponse${total > 1 ? "s" : ""}`, x);
    doc.x = x;
    const labels = Object.keys(dist);
    drawDistributionBars(doc, labels, dist, total);
  } else {
    // text / textarea : on liste dans la section verbatims (page suivante).
    const count = stat.textResponses?.length ?? 0;
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(COLOR_MUTED).text(
      `${count} réponse${count > 1 ? "s" : ""} libre${count > 1 ? "s" : ""} — voir page suivante`,
      x
    );
    doc.x = x;
  }
  doc.moveDown(0.7);
}

function drawDistributionBars(
  doc: PDFKit.PDFDocument,
  labels: string[],
  dist: Record<string, number>,
  total: number
): void {
  const x = 50;
  const widthTotal = 495;
  const labelW = 18;
  const barLabelW = 50;
  const barW = widthTotal - labelW - barLabelW;
  const ROW_H = 12;

  // Saut de page proactif si l'ensemble du bloc ne tient pas sur la page courante.
  // Sinon pdfkit fait des sauts intempestifs au milieu de la boucle (1 page par ligne).
  const blockHeight = labels.length * ROW_H + 4;
  const usableBottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + blockHeight > usableBottom) {
    doc.addPage();
  }

  doc.save();
  for (const lbl of labels) {
    const count = dist[lbl] || 0;
    const pct = total > 0 ? count / total : 0;
    const y = doc.y;
    // libellé
    doc.font("Helvetica").fontSize(9).fillColor(COLOR_TITLE).text(lbl, x, y + 1, { width: labelW });
    // barre fond
    doc.lineWidth(0.5).strokeColor(COLOR_BORDER).fillColor("#f3f4f6");
    doc.rect(x + labelW, y, barW, 10).fillAndStroke("#f3f4f6", COLOR_BORDER);
    // barre remplie
    if (pct > 0) {
      doc.fillColor("#7dcef5");
      doc.rect(x + labelW, y, barW * pct, 10).fill();
    }
    // count + %
    doc.font("Helvetica").fontSize(8).fillColor(COLOR_MUTED).text(
      `${count} (${Math.round(pct * 100)}%)`,
      x + labelW + barW + 4, y + 1, { width: barLabelW }
    );
    doc.y = y + ROW_H;
  }
  doc.restore();
  doc.x = x;
}

/**
 * Histogramme vertical compact pour les questions NPS (échelle 0-10).
 *
 * 11 colonnes côte à côte avec colorisation rouge (0-6) / jaune (7-8) /
 * vert (9-10) cohérente avec le rendu écran du formulaire. Hauteur totale
 * ~85px, tient sur une page même en bas de section.
 */
function drawNpsHistogram(
  doc: PDFKit.PDFDocument,
  dist: Record<string, number>,
  total: number
): void {
  const x = 50;
  const widthTotal = 495;
  const N = 11;
  const gap = 3;
  const colW = (widthTotal - gap * (N - 1)) / N;
  const pctH = 10;     // ligne pourcentage au-dessus
  const barH = 50;     // hauteur max de la barre
  const labelH = 12;   // ligne label en dessous
  const blockHeight = pctH + barH + labelH + 6;

  // Saut de page si nécessaire
  const usableBottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + blockHeight > usableBottom) {
    doc.addPage();
  }

  // Pic max pour normaliser les hauteurs de barres
  let maxCount = 0;
  for (let n = 0; n <= 10; n++) {
    maxCount = Math.max(maxCount, dist[String(n)] || 0);
  }

  const baseY = doc.y;
  doc.save();
  for (let n = 0; n <= 10; n++) {
    const count = dist[String(n)] || 0;
    const pct = total > 0 ? count / total : 0;
    const h = maxCount > 0 ? (count / maxCount) * barH : 0;
    const colX = x + n * (colW + gap);
    const bgFill = n <= 6 ? "#fee2e2" : n <= 8 ? "#fef3c7" : "#dcfce7";
    const fgFill = n <= 6 ? "#991b1b" : n <= 8 ? "#92400e" : "#166534";

    // Pourcentage au-dessus
    doc.font("Helvetica").fontSize(7).fillColor(COLOR_MUTED).text(
      `${Math.round(pct * 100)}%`,
      colX, baseY, { width: colW, align: "center", lineBreak: false }
    );

    // Couloir vide (zone barre)
    doc.lineWidth(0).fillColor(bgFill);
    doc.rect(colX, baseY + pctH, colW, barH).fill();

    // Barre remplie partant du bas
    if (h > 0) {
      doc.fillColor(fgFill);
      doc.rect(colX, baseY + pctH + (barH - h), colW, h).fill();
    }

    // Label sous la barre
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOR_TITLE).text(
      String(n),
      colX, baseY + pctH + barH + 2, { width: colW, align: "center", lineBreak: false }
    );
  }
  doc.restore();
  doc.x = x;
  doc.y = baseY + blockHeight;
}

function drawFooter(doc: PDFKit.PDFDocument): void {
  const leftX = 50;
  const rightX = doc.page.width - 50;
  const width = rightX - leftX;
  const baseY = doc.page.height - 50;
  const savedMargins = doc.page.margins;
  doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };
  doc.save();
  doc.strokeColor(COLOR_BORDER).lineWidth(0.5).moveTo(leftX, baseY).lineTo(rightX, baseY).stroke();
  doc.font("Helvetica").fontSize(7).fillColor(COLOR_TITLE).text(FOOTER_LINE_1, leftX, baseY + 6, { width, align: "center", lineBreak: false });
  doc.font("Helvetica").fontSize(7).fillColor(COLOR_TITLE).text(FOOTER_LINE_2, leftX, baseY + 18, { width, align: "center", lineBreak: false });
  doc.restore();
  doc.page.margins = savedMargins;
}
