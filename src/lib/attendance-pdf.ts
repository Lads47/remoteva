// PDF d'émargement collectif pour une session, format A4 portrait.
// 1 page par jour de formation, reproduisant le template officiel
// "État d'émargement collectif" affiché côté navigateur dans
// /formateur/sessions/[id]/emargement/print.
//
// Cas d'usage : bouton "📥 Télécharger PDF" sur la page émargement,
// pour récupérer le doc sans passer par le dialog d'impression.

import { readFileSync } from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import type { AttendanceGrid, AttendanceTraineeRow } from "./attendance";

const COLOR_TITLE = "#1f2244";
const COLOR_MUTED = "#727485";
const COLOR_BORDER = "#1f2244";
const COLOR_BG = "#f3f4f6";
const COLOR_ABSENT = "#991b1b";

const HOURS_PER_SLOT = 3.5;

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

function fmtDateLong(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtHours(h: number): string {
  if (h === 0) return "—";
  const heures = Math.floor(h);
  const minutes = Math.round((h - heures) * 60);
  return minutes === 0 ? `${heures}h` : `${heures}h${String(minutes).padStart(2, "0")}`;
}

export interface BuildAttendancePdfInput {
  session: { code: string; lieu: string };
  formation: { code: string; nomLong: string };
  trainer: { prenom: string; nom: string };
  grid: AttendanceGrid;
}

export async function buildAttendancePdf(
  input: BuildAttendancePdfInput
): Promise<{ buffer: Buffer; filename: string }> {
  const { session, formation, trainer, grid } = input;
  const trainerFullName = `${trainer.prenom} ${trainer.nom}`;

  // Liste des jours uniques dans la grille
  const days = Array.from(new Set(grid.slots.map((s) => s.date))).sort();

  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 36, bottom: 36, left: 36, right: 36 },
    info: {
      Title: `Émargement ${session.code}`,
      Author: "Les Ateliers du Stream",
      Subject: `Émargement collectif — ${formation.nomLong}`,
    },
    bufferPages: true,
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((r) => doc.on("end", () => r()));

  days.forEach((day, idx) => {
    if (idx > 0) doc.addPage();
    drawDayPage(doc, day, session, formation, trainerFullName, grid.rows);
  });

  // Si pas de jour (cas dégénéré), on met une page d'info
  if (days.length === 0) {
    doc.fontSize(14).fillColor(COLOR_TITLE).text("Aucun jour de formation à émarger.", { align: "center" });
  }

  doc.end();
  await done;

  const buffer = Buffer.concat(chunks);
  const filename = `Emargement_${session.code}.pdf`;
  return { buffer, filename };
}

// ============================================================================
// Mise en page d'une page (un jour)
// ============================================================================

function drawDayPage(
  doc: PDFKit.PDFDocument,
  day: string,
  session: { code: string; lieu: string },
  formation: { code: string; nomLong: string },
  trainerFullName: string,
  rows: AttendanceTraineeRow[]
): void {
  const pageWidth = doc.page.width;
  const contentW = pageWidth - 72; // marges G/D 36px
  const left = 36;

  // === Logo en haut ===
  const logo = loadLogo();
  if (logo) {
    try {
      SVGtoPDF(doc, logo, left, 36, { width: 60, height: 60 });
    } catch {
      /* fallback silencieux */
    }
  }

  // === Titre principal ===
  const titleY = 110;
  doc.rect(left, titleY, contentW, 30).strokeColor(COLOR_BORDER).lineWidth(1).stroke();
  doc
    .fillColor(COLOR_TITLE)
    .font("Helvetica-Bold")
    .fontSize(14)
    .text("ÉTAT D'ÉMARGEMENT COLLECTIF", left, titleY + 9, { width: contentW, align: "center" });

  // === Bloc info ===
  let y = titleY + 40;
  const infoRows: { label: string; value: string }[] = [
    { label: "Intitulé et n° du stage", value: `${formation.nomLong} (${session.code})` },
    { label: "Lieu du stage", value: session.lieu || "" },
    { label: "Date de l'émargement", value: fmtDateLong(day) },
    { label: "Nom du ou des formateurs", value: trainerFullName },
    { label: "Intitulé du module de formation", value: formation.nomLong },
  ];
  doc.rect(left, y, contentW, infoRows.length * 18).strokeColor(COLOR_BORDER).lineWidth(0.5).stroke();
  for (const row of infoRows) {
    doc.fillColor(COLOR_TITLE).font("Helvetica-Bold").fontSize(9).text(`${row.label} :`, left + 6, y + 5, { width: 200, continued: false });
    doc.fillColor(COLOR_TITLE).font("Helvetica").fontSize(9).text(row.value, left + 210, y + 5, { width: contentW - 220 });
    y += 18;
    // Ligne de séparation entre rows
    if (row !== infoRows[infoRows.length - 1]) {
      doc.moveTo(left, y).lineTo(left + contentW, y).strokeColor(COLOR_BORDER).lineWidth(0.3).stroke();
    }
  }

  // === Tableau émargement ===
  y += 18;
  const tableY = y;
  const colName = contentW * 0.30;
  const colSig = contentW * 0.225;
  const colHours = contentW * 0.25;
  const headerH = 36;

  // Header background
  doc.rect(left, tableY, contentW, headerH).fillColor(COLOR_BG).fill().strokeColor(COLOR_BORDER).lineWidth(0.5).stroke();
  // Colonnes header
  doc.fillColor(COLOR_TITLE).font("Helvetica-Bold").fontSize(8);
  doc.text("NOMS - PRÉNOMS\nDES STAGIAIRES", left, tableY + 8, { width: colName, align: "center" });
  doc.text("ÉMARGEMENT", left + colName, tableY + 4, { width: colSig * 2, align: "center" });
  // Sub-headers Matin / Après-midi
  doc.fontSize(7);
  doc.text("Matin", left + colName, tableY + 22, { width: colSig, align: "center" });
  doc.text("Après-midi", left + colName + colSig, tableY + 22, { width: colSig, align: "center" });
  doc.fontSize(8);
  doc.text("NOMBRE D'HEURES -\nSTAGIAIRES", left + colName + colSig * 2, tableY + 8, { width: colHours, align: "center" });

  // Lignes verticales du header
  doc.strokeColor(COLOR_BORDER).lineWidth(0.5);
  doc.moveTo(left + colName, tableY).lineTo(left + colName, tableY + headerH).stroke();
  doc.moveTo(left + colName + colSig, tableY + 18).lineTo(left + colName + colSig, tableY + headerH).stroke();
  doc.moveTo(left + colName + colSig * 2, tableY).lineTo(left + colName + colSig * 2, tableY + headerH).stroke();
  // Ligne horizontale au milieu du header (entre ÉMARGEMENT et Matin/Après-midi)
  doc.moveTo(left + colName, tableY + 18).lineTo(left + colName + colSig * 2, tableY + 18).stroke();

  // Lignes stagiaires
  let curY = tableY + headerH;
  const rowH = 32;
  let totalHeures = 0;

  if (rows.length === 0) {
    doc.rect(left, curY, contentW, rowH).strokeColor(COLOR_BORDER).lineWidth(0.3).stroke();
    doc.fillColor(COLOR_MUTED).font("Helvetica-Oblique").fontSize(10).text("Aucun stagiaire inscrit à cette session.", left, curY + 10, { width: contentW, align: "center" });
    curY += rowH;
  } else {
    for (const row of rows) {
      const morningStatus = row.cells.find((c) => c.date === day && c.slot === "morning")?.status ?? null;
      const afternoonStatus = row.cells.find((c) => c.date === day && c.slot === "afternoon")?.status ?? null;
      let hours = 0;
      if (morningStatus === "present") hours += HOURS_PER_SLOT;
      if (afternoonStatus === "present") hours += HOURS_PER_SLOT;
      totalHeures += hours;

      // Ligne
      doc.rect(left, curY, contentW, rowH).strokeColor(COLOR_BORDER).lineWidth(0.3).stroke();
      doc.moveTo(left + colName, curY).lineTo(left + colName, curY + rowH).stroke();
      doc.moveTo(left + colName + colSig, curY).lineTo(left + colName + colSig, curY + rowH).stroke();
      doc.moveTo(left + colName + colSig * 2, curY).lineTo(left + colName + colSig * 2, curY + rowH).stroke();

      // Nom
      doc.fillColor(COLOR_TITLE).font("Helvetica").fontSize(10).text(`${row.prenom} ${row.nom}`, left + 6, curY + rowH / 2 - 5, { width: colName - 12 });

      // Matin
      if (morningStatus === "absent") {
        doc.fillColor(COLOR_ABSENT).font("Helvetica-Bold").fontSize(9).text("ABSENT", left + colName, curY + rowH / 2 - 5, { width: colSig, align: "center" });
      }
      // Après-midi
      if (afternoonStatus === "absent") {
        doc.fillColor(COLOR_ABSENT).font("Helvetica-Bold").fontSize(9).text("ABSENT", left + colName + colSig, curY + rowH / 2 - 5, { width: colSig, align: "center" });
      }

      // Heures
      doc.fillColor(COLOR_TITLE).font("Helvetica-Bold").fontSize(10).text(fmtHours(hours), left + colName + colSig * 2, curY + rowH / 2 - 5, { width: colHours, align: "center" });

      curY += rowH;
    }

    // Ligne total
    const totalRowY = curY;
    doc.rect(left, totalRowY, contentW, 22).fillColor(COLOR_BG).fill().strokeColor(COLOR_BORDER).lineWidth(0.5).stroke();
    doc.moveTo(left + colName + colSig * 2, totalRowY).lineTo(left + colName + colSig * 2, totalRowY + 22).stroke();
    doc.fillColor(COLOR_TITLE).font("Helvetica-Bold").fontSize(9).text("TOTAL HEURES - STAGIAIRES", left, totalRowY + 7, { width: colName + colSig * 2, align: "right" });
    doc.fillColor(COLOR_TITLE).font("Helvetica-Bold").fontSize(11).text(fmtHours(totalHeures), left + colName + colSig * 2, totalRowY + 5, { width: colHours, align: "center" });
    curY = totalRowY + 22;
  }

  // === Note sous le tableau ===
  curY += 10;
  doc.fillColor(COLOR_MUTED).font("Helvetica-Oblique").fontSize(8).text(
    "Le stagiaire signe dans chaque case correspondant à sa demi-journée de présence. La mention « ABSENT » est portée par le formateur en cas d'absence.",
    left,
    curY,
    { width: contentW }
  );
  curY += 24;

  // === Bloc signature formateur ===
  doc.fillColor(COLOR_TITLE).font("Helvetica").fontSize(10).text("Certifié exact par l'organisme,", left, curY);
  curY += 14;
  doc.font("Helvetica").fontSize(10).text("par ", left, curY, { continued: true }).font("Helvetica-Bold").text(trainerFullName);
  curY += 14;
  doc.font("Helvetica").fontSize(10).text(`Date : ${fmtDateLong(day)}`, left, curY);
  curY += 14;
  doc.font("Helvetica").fontSize(10).text("Signature du ou des formateurs :", left, curY);
  curY += 18;
  doc.rect(left, curY, 200, 50).strokeColor(COLOR_BORDER).lineWidth(0.5).stroke();

  // === Footer ===
  const footerY = doc.page.height - 50;
  doc.moveTo(left, footerY - 4).lineTo(left + contentW, footerY - 4).strokeColor(COLOR_BORDER).lineWidth(0.3).stroke();
  doc.fillColor(COLOR_MUTED).font("Helvetica").fontSize(6.5).text(FOOTER_LINE_1, left, footerY, { width: contentW, align: "center" });
  doc.text(FOOTER_LINE_2, left, footerY + 12, { width: contentW, align: "center" });
}
