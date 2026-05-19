// Génération du PDF de synthèse d'une évaluation pratique.
//
// Le PDF rappelle l'identité du stagiaire, le contexte formation/session,
// l'énoncé de l'exercice, la grille des critères avec les scores saisis, la
// note de synthèse et les observations du formateur. Il est destiné à
// l'archivage et aux audits.
//
// Implémentation via `pdfkit` (pure JS, pas de navigateur headless), pour
// rester compatible Docker slim sans dépendances système.

import { readFileSync } from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import prisma from "./db";
import { SCORE_LABELS, type ScoreValue } from "./evaluation-grids";

// Logo LADS — chargé une fois en mémoire au premier appel et cached.
let cachedLogoSvg: string | null | undefined;
function loadLogoSvg(): string | null {
  if (cachedLogoSvg !== undefined) return cachedLogoSvg;
  try {
    const filePath = path.join(process.cwd(), "public", "logo-lads-fonce.svg");
    cachedLogoSvg = readFileSync(filePath, "utf8");
  } catch (err) {
    console.warn("[evaluation-pdf] Logo introuvable, fallback texte :", err);
    cachedLogoSvg = null;
  }
  return cachedLogoSvg;
}

// Identité organisme de formation — doit rester aligné avec le footer de la
// feuille d'émargement (src/app/formateur/sessions/[id]/emargement/print/page.tsx).
const FOOTER_LINE_1 =
  "Les Ateliers du Stream - Siège : 39 bis rue Robert Creuzet 47200 MARMANDE - Siret : 81950223800036 - APE : 59.11B - formation@lesateliersdustream.fr";
const FOOTER_LINE_2 =
  "Tel : 06.46.65.65.77 – Organisme de formation professionnelle continue - NDA N°75470196847";

// Palette cohérente avec l'UI web (couleurs Tailwind matchées en hex)
const COLOR_TITLE = "#1f2244";
const COLOR_MUTED = "#727485";
const COLOR_BORDER = "#e5e7eb";
const COLOR_BG_SOFT = "#fafbff";

const SCORE_COLORS: Record<ScoreValue, { bg: string; fg: string }> = {
  acquis: { bg: "#dcfce7", fg: "#166534" },
  en_cours: { bg: "#fef3c7", fg: "#92400e" },
  non_acquis: { bg: "#fee2e2", fg: "#991b1b" },
};

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}
function fmtDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface PdfBundle {
  buffer: Buffer;
  filename: string;          // ex : "Eval_Ex1_Dupont_Marie.pdf" (PDF côté Drive)
  traineeFullName: string;   // ex : "Marie Dupont" (utilisé pour le sous-dossier Drive)
}

/**
 * Charge toutes les données nécessaires depuis la BDD et génère le PDF.
 * Throws si l'évaluation ou la session sont introuvables.
 */
export async function buildEvaluationPdf(evaluationId: string): Promise<PdfBundle> {
  const evaluation = await prisma.traineeExerciseEvaluation.findUnique({
    where: { id: evaluationId },
    include: {
      trainee: {
        include: {
          session: { include: { formation: true } },
        },
      },
      exercise: { include: { criteria: { orderBy: { ordre: "asc" } } } },
      evaluator: true,
      scores: true,
    },
  });
  if (!evaluation) throw new Error("Évaluation introuvable");

  // Index des scores par criterionId pour assemblage rapide
  const scoreByCriterion = new Map<string, { score: string; comment: string }>();
  for (const s of evaluation.scores) {
    scoreByCriterion.set(s.criterionId, { score: s.score, comment: s.comment });
  }

  const trainee = evaluation.trainee;
  const session = trainee.session;
  const formation = session.formation;
  const exercise = evaluation.exercise;

  // Nom complet trimé pour le sous-dossier Drive et le filename
  const fullName = `${trainee.prenom} ${trainee.nom}`.trim();
  const safeName = sanitizeFilenamePart(fullName) || "Stagiaire";
  const safeExercise = sanitizeFilenamePart(exercise.titre).slice(0, 60) || `Ex${exercise.ordre}`;
  const filename = `Eval_Ex${exercise.ordre}_${safeName}_${safeExercise}.pdf`;

  // ===== Génération du PDF =====
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 85, left: 50, right: 50 }, // bottom élargi pour le footer multi-lignes
    info: {
      Title: `Évaluation pratique — ${exercise.titre} — ${fullName}`,
      Author: "Les Ateliers du Stream",
      Subject: `Fiche d'évaluation pratique — ${formation.nomLong}`,
    },
    bufferPages: true, // pour pouvoir dessiner le footer sur toutes les pages à la fin
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  // -- En-tête avec logo --
  drawLogo(doc, 50, 40, 48);
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(COLOR_TITLE)
    .text("Fiche d'évaluation pratique", 120, 48, { align: "left" });
  doc
    .moveDown(0.2)
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLOR_MUTED)
    .text("Les Ateliers du Stream", 120);

  // Repositionne le curseur sous le logo (logo plus haut que le titre)
  doc.y = Math.max(doc.y, 40 + 48 + 12);
  doc.x = 50;

  doc.moveDown(0.4);

  // -- Bloc info identification --
  const infoY = doc.y;
  drawInfoBox(doc, infoY, [
    { label: "Stagiaire", value: fullName },
    { label: "Formation", value: formation.nomLong },
    {
      label: "Session",
      value: formatSessionDates(session.dateDebut, session.dateFin),
    },
    {
      label: "Exercice",
      value: `Exercice ${exercise.ordre} — ${exercise.titre}`,
    },
    {
      label: "Formateur évaluateur",
      value: evaluation.evaluator
        ? `${evaluation.evaluator.prenom} ${evaluation.evaluator.nom}`
        : "—",
    },
    { label: "Date de saisie", value: fmtDateTime(evaluation.evaluatedAt) },
  ]);

  // -- Énoncé de l'exercice --
  if (exercise.description.trim()) {
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(COLOR_TITLE)
      .text("Énoncé / objectif de l'exercice");
    doc
      .moveDown(0.2)
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#1f2244")
      .text(exercise.description, { align: "justify" });
    doc.moveDown(0.6);
  }

  // -- Tableau critères --
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLOR_TITLE)
    .text(`Critères évalués (${exercise.criteria.length})`);
  doc.moveDown(0.3);

  if (exercise.criteria.length === 0) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(9)
      .fillColor(COLOR_MUTED)
      .text("Aucun critère défini pour cet exercice.");
    doc.moveDown(0.5);
  } else {
    drawCriteriaTable(
      doc,
      exercise.criteria.map((c) => {
        const s = scoreByCriterion.get(c.id);
        return {
          ordre: c.ordre,
          libelle: c.libelle,
          score: s?.score ?? "",
          comment: s?.comment ?? "",
        };
      })
    );
  }

  doc.moveDown(0.6);

  // -- Synthèse globale (uniquement si le formateur l'a renseignée) --
  const hasGlobalNote = !!(evaluation.globalNote && evaluation.globalNote in SCORE_COLORS);
  if (hasGlobalNote) {
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(COLOR_TITLE)
      .text("Note de synthèse du formateur");
    doc.moveDown(0.2);
    drawGlobalScoreLine(doc, evaluation.globalNote);
    doc.moveDown(0.5);
  }

  // -- Observations (uniquement si renseignées) --
  const obsTrim = evaluation.observations.trim();
  if (obsTrim) {
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(COLOR_TITLE)
      .text("Observations du formateur");
    doc.moveDown(0.2);
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#1f2244")
      .text(obsTrim, { align: "justify" });
  }

  // -- Pied de page sur toutes les pages --
  // Identique au footer de la feuille d'émargement (SIRET, APE, NDA, contact).
  const pageRange = doc.bufferedPageRange();
  for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
    doc.switchToPage(i);
    drawFooter(doc);
  }

  doc.end();
  await done;
  const buffer = Buffer.concat(chunks);

  return { buffer, filename, traineeFullName: fullName };
}

// --- Helpers de rendu PDF ---

// Échappe les caractères posant problème dans un nom de fichier OS-friendly.
function sanitizeFilenamePart(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")             // supprime accents
    .replace(/[^A-Za-z0-9 _-]+/g, "")             // garde alphanum + espace _ -
    .trim()
    .replace(/\s+/g, "_");
}

function drawInfoBox(
  doc: PDFKit.PDFDocument,
  startY: number,
  rows: { label: string; value: string }[]
): void {
  const padding = 10;
  const x = 50;
  const width = 495;
  const lineHeight = 14;
  const labelWidth = 130;

  // Calcul de la hauteur réelle pour le rect
  let estimatedHeight = padding * 2;
  for (const r of rows) {
    // hauteur "raisonnable" approximative en supposant 1 ligne par row
    const valueHeight = doc.heightOfString(r.value, { width: width - padding * 2 - labelWidth });
    estimatedHeight += Math.max(lineHeight, valueHeight) + 2;
  }

  doc.save();
  doc.lineWidth(0.5).strokeColor(COLOR_BORDER).fillColor(COLOR_BG_SOFT);
  doc.roundedRect(x, startY, width, estimatedHeight, 6).fillAndStroke(COLOR_BG_SOFT, COLOR_BORDER);
  doc.restore();

  let cursorY = startY + padding;
  for (const r of rows) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLOR_MUTED).text(
      r.label,
      x + padding,
      cursorY,
      { width: labelWidth, continued: false }
    );
    const valueHeight = doc.heightOfString(r.value, { width: width - padding * 2 - labelWidth });
    doc.font("Helvetica").fontSize(10).fillColor(COLOR_TITLE).text(
      r.value,
      x + padding + labelWidth,
      cursorY,
      { width: width - padding * 2 - labelWidth }
    );
    cursorY += Math.max(lineHeight, valueHeight) + 2;
  }
  doc.y = startY + estimatedHeight + 12;
}

function drawCriteriaTable(
  doc: PDFKit.PDFDocument,
  rows: { ordre: number; libelle: string; score: string; comment: string }[]
): void {
  const x = 50;
  const width = 495;
  const padding = 6;
  const colOrdre = 30;
  const colScore = 110;
  const colCriterion = width - colOrdre - colScore - padding * 2;

  // Header
  const headerY = doc.y;
  doc.save();
  doc.lineWidth(0.5).strokeColor(COLOR_BORDER).fillColor("#f3f4f6");
  doc.rect(x, headerY, width, 22).fillAndStroke("#f3f4f6", COLOR_BORDER);
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOR_MUTED);
  doc.text("#", x + padding, headerY + 7, { width: colOrdre });
  doc.text("Critère évalué", x + padding + colOrdre, headerY + 7, { width: colCriterion });
  doc.text("Évaluation", x + padding + colOrdre + colCriterion, headerY + 7, { width: colScore });
  doc.y = headerY + 22;

  // Body
  for (const row of rows) {
    const rowStartY = doc.y;
    // Hauteur de la cellule "critère" + éventuel commentaire
    const libelleHeight = doc.font("Helvetica").fontSize(9).heightOfString(row.libelle, {
      width: colCriterion - padding,
    });
    const hasComment = row.comment && row.comment.trim().length > 0;
    const commentHeight = hasComment
      ? doc.font("Helvetica-Oblique").fontSize(8).heightOfString(row.comment, {
          width: colCriterion - padding,
        }) + 4
      : 0;
    const rowHeight = Math.max(22, libelleHeight + commentHeight + padding * 2);

    // Saut de page si on déborde
    if (rowStartY + rowHeight > doc.page.height - 100) {
      doc.addPage();
    }
    const y = doc.y;

    doc.save();
    doc.lineWidth(0.5).strokeColor(COLOR_BORDER);
    doc.rect(x, y, width, rowHeight).stroke();
    doc.restore();

    // # ordre
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLOR_MUTED)
      .text(String(row.ordre), x + padding, y + padding, { width: colOrdre - padding });

    // libellé
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLOR_TITLE)
      .text(row.libelle, x + padding + colOrdre, y + padding, { width: colCriterion - padding });

    if (hasComment) {
      doc
        .font("Helvetica-Oblique")
        .fontSize(8)
        .fillColor(COLOR_MUTED)
        .text(row.comment, x + padding + colOrdre, y + padding + libelleHeight + 4, {
          width: colCriterion - padding,
        });
    }

    // chip score
    drawScoreChip(doc, x + padding + colOrdre + colCriterion, y + padding, row.score, colScore - padding);

    doc.y = y + rowHeight;
  }
}

function drawScoreChip(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  score: string,
  maxWidth: number
): void {
  if (!score || !(score in SCORE_COLORS)) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLOR_MUTED)
      .text("Non noté", x, y, { width: maxWidth });
    return;
  }
  const colors = SCORE_COLORS[score as ScoreValue];
  const label = SCORE_LABELS[score as ScoreValue];
  // Pill background
  doc.save();
  const padX = 6;
  const padY = 3;
  doc.font("Helvetica-Bold").fontSize(9);
  const textWidth = doc.widthOfString(label);
  const w = Math.min(maxWidth, textWidth + padX * 2);
  const h = doc.currentLineHeight() + padY * 2;
  doc.lineWidth(0.5).strokeColor(colors.fg).fillColor(colors.bg);
  doc.roundedRect(x, y, w, h, h / 2).fillAndStroke(colors.bg, colors.fg);
  doc.fillColor(colors.fg).text(label, x + padX, y + padY, { width: w - padX * 2 });
  doc.restore();
}

function drawGlobalScoreLine(doc: PDFKit.PDFDocument, score: string): void {
  if (!score || !(score in SCORE_COLORS)) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(10)
      .fillColor(COLOR_MUTED)
      .text("Non renseignée");
    return;
  }
  const startX = 50;
  const y = doc.y;
  drawScoreChip(doc, startX, y, score, 200);
  // Avance la position Y au-dessous du chip
  doc.y = y + 22;
}

// Trace le logo LADS depuis le SVG dans le coin supérieur gauche.
// Si le SVG ne peut pas être chargé, ne fait rien (l'en-tête textuel reste).
function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number, height: number): void {
  const svg = loadLogoSvg();
  if (!svg) return;
  try {
    // viewBox du logo : 469.53 x 324.62 → ratio largeur/hauteur ≈ 1.45
    const aspectRatio = 469.53 / 324.62;
    const width = height * aspectRatio;
    SVGtoPDF(doc, svg, x, y, { width, height, preserveAspectRatio: "xMinYMin meet" });
  } catch (err) {
    console.warn("[evaluation-pdf] Échec rendu logo SVG :", err);
  }
}

// Formatte la période de la session :
//   - même jour       → "12 mars 2026"
//   - plusieurs jours → "12 – 14 mars 2026" (idem mois/année) ou "30 mars – 2 avril 2026"
// Le séparateur est l'en-dash U+2013 (présent dans WinAnsi), pas la flèche
// U+2192 qui ne s'affiche pas dans Helvetica/Times standard.
function formatSessionDates(start: Date | null | undefined, end: Date | null | undefined): string {
  if (!start) return "—";
  const s = new Date(start);
  if (!end) return fmtDate(s);
  const e = new Date(end);
  const sameDay =
    s.getUTCFullYear() === e.getUTCFullYear() &&
    s.getUTCMonth() === e.getUTCMonth() &&
    s.getUTCDate() === e.getUTCDate();
  if (sameDay) return fmtDate(s);

  const sameMonthYear =
    s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth();
  if (sameMonthYear) {
    const dayStart = s.toLocaleDateString("fr-FR", { day: "numeric", timeZone: "UTC" });
    return `${dayStart} – ${fmtDate(e)}`;
  }
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  if (sameYear) {
    const startShort = s.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });
    return `${startShort} – ${fmtDate(e)}`;
  }
  return `${fmtDate(s)} – ${fmtDate(e)}`;
}

// Pied de page identique à la feuille d'émargement signée. Trois lignes :
// adresse + SIRET + APE / contact + NDA / horodatage de génération.
function drawFooter(doc: PDFKit.PDFDocument): void {
  const leftX = 50;
  const rightX = doc.page.width - 50;
  const width = rightX - leftX;
  const baseY = doc.page.height - 60;

  doc.save();
  doc.strokeColor(COLOR_BORDER).lineWidth(0.5).moveTo(leftX, baseY).lineTo(rightX, baseY).stroke();
  doc.font("Helvetica").fontSize(7).fillColor(COLOR_TITLE);
  doc.text(FOOTER_LINE_1, leftX, baseY + 6, { width, align: "center" });
  doc.text(FOOTER_LINE_2, leftX, baseY + 16, { width, align: "center" });
  doc
    .fontSize(6)
    .fillColor(COLOR_MUTED)
    .text(`Document généré le ${fmtDateTime(new Date())}`, leftX, baseY + 30, {
      width,
      align: "center",
    });
  doc.restore();
}
