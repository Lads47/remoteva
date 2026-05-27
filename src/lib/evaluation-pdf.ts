// Génération du PDF de synthèse d'une évaluation pratique.
//
// Deux modes :
//   - buildEvaluationPdf(evaluationId) : un PDF pour une évaluation (un
//     stagiaire × un exercice). Utilisé pour l'archivage Drive par exercice.
//   - buildGlobalEvaluationPdf(traineeId) : un PDF agrégé contenant TOUS les
//     exercices de la formation pour un stagiaire donné, avec une page de
//     synthèse en tête et une section par exercice. Utilisé pour générer un
//     livrable unique par stagiaire en fin de session.
//
// Implémentation via `pdfkit` (pure JS, pas de navigateur headless), pour
// rester compatible Docker slim sans dépendances système.

import { readFileSync } from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import prisma from "./db";
import { SCORE_LABELS, type ScoreValue } from "./evaluation-grids";

// Labels courts spécifiques au PDF : la pastille des scores fait ~110-130pt
// de large, "En cours d'acquisition" ne rentre pas. On surcharge le label
// long sans toucher à l'UI formateur (où la version complète reste plus
// claire pédagogiquement).
const SCORE_LABELS_PDF: Partial<Record<ScoreValue, string>> = {
  en_cours: "En cours",
};

function pdfLabelForScore(score: ScoreValue): string {
  return SCORE_LABELS_PDF[score] ?? SCORE_LABELS[score];
}

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

// =====================================================================
// PDF d'une évaluation unique (1 stagiaire × 1 exercice)
// =====================================================================
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

  const trainee = evaluation.trainee;
  const session = trainee.session;
  const formation = session.formation;
  const exercise = evaluation.exercise;

  const fullName = `${trainee.prenom} ${trainee.nom}`.trim();
  const safeName = sanitizeFilenamePart(fullName) || "Stagiaire";
  const safeExercise = sanitizeFilenamePart(exercise.titre).slice(0, 60) || `Ex${exercise.ordre}`;
  const filename = `Eval_Ex${exercise.ordre}_${safeName}_${safeExercise}.pdf`;

  const doc = createPdfDoc({
    title: `Évaluation pratique — ${exercise.titre} — ${fullName}`,
    subject: `Fiche d'évaluation pratique — ${formation.nomLong}`,
  });
  const { chunks, done } = bindPdfStream(doc);

  drawDocHeader(doc, "Fiche d'évaluation pratique");

  drawInfoBox(doc, doc.y, [
    { label: "Stagiaire", value: fullName },
    { label: "Formation", value: formation.nomLong },
    { label: "Session", value: formatSessionDates(session.dateDebut, session.dateFin) },
    { label: "Exercice", value: `Exercice ${exercise.ordre} — ${exercise.titre}` },
    {
      label: "Formateur évaluateur",
      value: evaluation.evaluator
        ? `${evaluation.evaluator.prenom} ${evaluation.evaluator.nom}`
        : "—",
    },
    { label: "Date de saisie", value: fmtDateTime(evaluation.evaluatedAt) },
  ]);

  drawExerciseSection(doc, {
    exercise: {
      ordre: exercise.ordre,
      titre: exercise.titre,
      description: exercise.description,
      criteria: exercise.criteria.map((c) => ({ id: c.id, ordre: c.ordre, libelle: c.libelle })),
    },
    evaluation: {
      globalNote: evaluation.globalNote,
      observations: evaluation.observations,
      scores: evaluation.scores.map((s) => ({
        criterionId: s.criterionId,
        score: s.score,
        comment: s.comment,
      })),
    },
    includeExerciseTitle: false, // déjà dans le bloc info
  });

  drawFooterOnAllPages(doc);
  doc.end();
  await done;
  return { buffer: Buffer.concat(chunks), filename, traineeFullName: fullName };
}

// =====================================================================
// PDF global d'un stagiaire (tous les exercices de la formation)
// =====================================================================
export async function buildGlobalEvaluationPdf(traineeId: string): Promise<PdfBundle> {
  const trainee = await prisma.trainee.findUnique({
    where: { id: traineeId },
    include: {
      session: {
        include: {
          formation: {
            include: {
              evaluationExercises: {
                where: { active: true },
                orderBy: { ordre: "asc" },
                include: { criteria: { orderBy: { ordre: "asc" } } },
              },
            },
          },
        },
      },
      exerciseEvaluations: {
        include: { scores: true, evaluator: true },
      },
    },
  });
  if (!trainee) throw new Error("Stagiaire introuvable");

  const session = trainee.session;
  const formation = session.formation;
  const exercises = formation.evaluationExercises;
  const fullName = `${trainee.prenom} ${trainee.nom}`.trim();

  // Index des évaluations par exerciseId
  const evalByExercise = new Map<string, (typeof trainee.exerciseEvaluations)[number]>();
  for (const e of trainee.exerciseEvaluations) {
    evalByExercise.set(e.exerciseId, e);
  }

  // Compte des statuts pour la page de synthèse
  let countAcquis = 0;
  let countEnCours = 0;
  let countNonAcquis = 0;
  let countNonNotes = 0;
  for (const ex of exercises) {
    const ev = evalByExercise.get(ex.id);
    if (!ev || !ev.globalNote) {
      countNonNotes++;
      continue;
    }
    if (ev.globalNote === "acquis") countAcquis++;
    else if (ev.globalNote === "en_cours") countEnCours++;
    else if (ev.globalNote === "non_acquis") countNonAcquis++;
    else countNonNotes++;
  }

  // Évaluateur principal : on prend le premier rencontré (en général un seul
  // formateur par session). Sinon vide.
  const firstEval = trainee.exerciseEvaluations.find((e) => e.evaluator);
  const evaluatorName = firstEval?.evaluator
    ? `${firstEval.evaluator.prenom} ${firstEval.evaluator.nom}`
    : "—";

  const safeName = sanitizeFilenamePart(fullName) || "Stagiaire";
  const filename = `Synthese_evaluations_${safeName}.pdf`;

  const doc = createPdfDoc({
    title: `Synthèse globale d'évaluations — ${fullName}`,
    subject: `Synthèse globale d'évaluations pratiques — ${formation.nomLong}`,
  });
  const { chunks, done } = bindPdfStream(doc);

  // === Page 1 : Couverture / synthèse ===
  drawDocHeader(doc, "Synthèse globale d'évaluations pratiques");

  drawInfoBox(doc, doc.y, [
    { label: "Stagiaire", value: fullName },
    { label: "Formation", value: formation.nomLong },
    { label: "Session", value: formatSessionDates(session.dateDebut, session.dateFin) },
    { label: "Formateur évaluateur", value: evaluatorName },
    {
      label: "Exercices évalués",
      value: `${exercises.length} exercice${exercises.length > 1 ? "s" : ""} défini${exercises.length > 1 ? "s" : ""} dans la formation`,
    },
    { label: "Date d'édition", value: fmtDateTime(new Date()) },
  ]);

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(COLOR_TITLE)
    .text("Bilan global");
  doc.moveDown(0.4);

  drawCountChips(doc, [
    { label: `${countAcquis} acquis`, color: SCORE_COLORS.acquis },
    { label: `${countEnCours} en cours`, color: SCORE_COLORS.en_cours },
    { label: `${countNonAcquis} non acquis`, color: SCORE_COLORS.non_acquis },
    ...(countNonNotes > 0
      ? [
          {
            label: `${countNonNotes} non noté${countNonNotes > 1 ? "s" : ""}`,
            color: { bg: "#f3f4f6", fg: "#727485" },
          },
        ]
      : []),
  ]);

  doc.moveDown(0.6);

  // Tableau récapitulatif par exercice
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLOR_TITLE)
    .text("Récapitulatif par exercice");
  doc.moveDown(0.3);

  if (exercises.length === 0) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(9)
      .fillColor(COLOR_MUTED)
      .text("Aucun exercice d'évaluation pratique n'est défini pour cette formation.");
  } else {
    drawRecapTable(
      doc,
      exercises.map((ex) => {
        const ev = evalByExercise.get(ex.id);
        return {
          ordre: ex.ordre,
          titre: ex.titre,
          globalNote: ev?.globalNote ?? "",
          scoredCount: ev?.scores.filter((s) => s.score && s.score !== "").length ?? 0,
          totalCriteria: ex.criteria.length,
        };
      })
    );
  }

  // === Pages suivantes : une section par exercice ===
  for (const ex of exercises) {
    doc.addPage();
    drawDocHeader(doc, "Évaluation pratique");

    drawInfoBox(doc, doc.y, [
      { label: "Stagiaire", value: fullName },
      { label: "Formation", value: formation.nomLong },
      { label: "Exercice", value: `Exercice ${ex.ordre} — ${ex.titre}` },
    ]);

    const ev = evalByExercise.get(ex.id);
    drawExerciseSection(doc, {
      exercise: {
        ordre: ex.ordre,
        titre: ex.titre,
        description: ex.description,
        criteria: ex.criteria.map((c) => ({ id: c.id, ordre: c.ordre, libelle: c.libelle })),
      },
      evaluation: ev
        ? {
            globalNote: ev.globalNote,
            observations: ev.observations,
            scores: ev.scores.map((s) => ({
              criterionId: s.criterionId,
              score: s.score,
              comment: s.comment,
            })),
          }
        : {
            globalNote: "",
            observations: "",
            scores: [],
          },
      includeExerciseTitle: false,
    });
  }

  drawFooterOnAllPages(doc);
  doc.end();
  await done;
  return { buffer: Buffer.concat(chunks), filename, traineeFullName: fullName };
}

// =====================================================================
// Helpers PDFKit factorisés
// =====================================================================

interface DocOptions {
  title: string;
  subject: string;
}

function createPdfDoc(opts: DocOptions): PDFKit.PDFDocument {
  return new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 75, left: 50, right: 50 },
    info: {
      Title: opts.title,
      Author: "Les Ateliers du Stream",
      Subject: opts.subject,
    },
    bufferPages: true,
  });
}

function bindPdfStream(doc: PDFKit.PDFDocument): {
  chunks: Buffer[];
  done: Promise<void>;
} {
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));
  return { chunks, done };
}

// En-tête : titre à gauche, logo LADS à droite (réutilisé sur chaque page de couverture).
function drawDocHeader(doc: PDFKit.PDFDocument, title: string): void {
  const headerTop = 40;
  const logoHeight = 48;
  const logoAspectRatio = 469.53 / 324.62;
  const logoWidth = logoHeight * logoAspectRatio;
  const logoX = doc.page.width - 50 - logoWidth;
  drawLogo(doc, logoX, headerTop, logoHeight);

  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(COLOR_TITLE)
    .text(title, 50, headerTop + 8, { width: logoX - 60, lineBreak: false });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLOR_MUTED)
    .text("Les Ateliers du Stream", 50, headerTop + 32, {
      width: logoX - 60,
      lineBreak: false,
    });

  doc.y = headerTop + logoHeight + 12;
  doc.x = 50;
  doc.moveDown(0.4);
}

// Rendu d'une section "un exercice évalué" :
//  - (optionnel) titre exercice
//  - énoncé de l'exercice (si renseigné)
//  - tableau des critères
//  - note de synthèse (si renseignée)
//  - observations formateur (si renseignées)
interface ExerciseSectionInput {
  exercise: {
    ordre: number;
    titre: string;
    description: string;
    criteria: { id: string; ordre: number; libelle: string }[];
  };
  evaluation: {
    globalNote: string;
    observations: string;
    scores: { criterionId: string; score: string; comment: string }[];
  };
  includeExerciseTitle: boolean;
}

function drawExerciseSection(doc: PDFKit.PDFDocument, input: ExerciseSectionInput): void {
  const { exercise, evaluation, includeExerciseTitle } = input;

  if (includeExerciseTitle) {
    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor(COLOR_TITLE)
      .text(`Exercice ${exercise.ordre} — ${exercise.titre}`);
    doc.moveDown(0.4);
  }

  // Énoncé
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

  // Critères
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
    const scoreByCriterion = new Map<string, { score: string; comment: string }>();
    for (const s of evaluation.scores) {
      scoreByCriterion.set(s.criterionId, { score: s.score, comment: s.comment });
    }
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

  // Note globale du formateur (uniquement si renseignée).
  // Wording aligné sur l'UI (page d'évaluation, bloc 'Synthèse de l'exercice').
  const hasGlobalNote = !!(evaluation.globalNote && evaluation.globalNote in SCORE_COLORS);
  if (hasGlobalNote) {
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(COLOR_TITLE)
      .text("Note globale du formateur sur l'exercice");
    doc.moveDown(0.2);
    drawGlobalScoreLine(doc, evaluation.globalNote);
    doc.moveDown(0.5);
  }

  // Observations (uniquement si renseignées)
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
}

// Tableau récapitulatif (page de synthèse globale) : liste des exercices
// avec leur statut sous forme de chip.
function drawRecapTable(
  doc: PDFKit.PDFDocument,
  rows: { ordre: number; titre: string; globalNote: string; scoredCount: number; totalCriteria: number }[]
): void {
  const x = 50;
  const width = 495;
  const padding = 6;
  const colOrdre = 50;
  const colNote = 130;
  const colTitre = width - colOrdre - colNote - padding * 2;

  // Header
  const headerY = doc.y;
  doc.save();
  doc.lineWidth(0.5).strokeColor(COLOR_BORDER).fillColor("#f3f4f6");
  doc.rect(x, headerY, width, 22).fillAndStroke("#f3f4f6", COLOR_BORDER);
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(8).fillColor(COLOR_MUTED);
  doc.text("Exercice", x + padding, headerY + 7, { width: colOrdre });
  doc.text("Intitulé", x + padding + colOrdre, headerY + 7, { width: colTitre });
  doc.text("Note globale", x + padding + colOrdre + colTitre, headerY + 7, { width: colNote });
  doc.y = headerY + 22;

  for (const row of rows) {
    const rowStartY = doc.y;
    const titreHeight = doc.font("Helvetica").fontSize(9).heightOfString(row.titre, {
      width: colTitre - padding,
    });
    const rowHeight = Math.max(22, titreHeight + padding * 2);

    if (rowStartY + rowHeight > doc.page.height - 90) {
      doc.addPage();
    }
    const y = doc.y;

    doc.save();
    doc.lineWidth(0.5).strokeColor(COLOR_BORDER);
    doc.rect(x, y, width, rowHeight).stroke();
    doc.restore();

    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(COLOR_TITLE)
      .text(`Ex. ${row.ordre}`, x + padding, y + padding, { width: colOrdre - padding });

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLOR_TITLE)
      .text(row.titre, x + padding + colOrdre, y + padding, { width: colTitre - padding });

    drawScoreChip(doc, x + padding + colOrdre + colTitre, y + padding, row.globalNote, colNote - padding);
    doc.y = y + rowHeight;
  }
  doc.x = x;
}

// Petites pastilles colorées (utilisées sur la page de bilan global).
function drawCountChips(
  doc: PDFKit.PDFDocument,
  items: { label: string; color: { bg: string; fg: string } }[]
): void {
  const startX = 50;
  let cursorX = startX;
  const y = doc.y;
  const padX = 8;
  const padY = 4;

  doc.font("Helvetica-Bold").fontSize(10);
  for (const it of items) {
    const textW = doc.widthOfString(it.label);
    const w = textW + padX * 2;
    const h = doc.currentLineHeight() + padY * 2;
    doc.save();
    doc.lineWidth(0.5).strokeColor(it.color.fg).fillColor(it.color.bg);
    doc.roundedRect(cursorX, y, w, h, h / 2).fillAndStroke(it.color.bg, it.color.fg);
    doc.fillColor(it.color.fg).text(it.label, cursorX + padX, y + padY, {
      width: w - padX * 2,
      lineBreak: false,
    });
    doc.restore();
    cursorX += w + 6;
  }
  doc.y = y + doc.currentLineHeight() + padY * 2 + 4;
  doc.x = startX;
}

// =====================================================================
// Helpers PDF primitives — restent inchangés
// =====================================================================

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
  // Replace le curseur X à la marge gauche : sans ça, les text() suivants
  // (titres de section, label "Note globale...") héritent du X de la dernière
  // valeur du bloc info (~190) et se retrouvent décalés à droite.
  doc.x = x;
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

  for (const row of rows) {
    const rowStartY = doc.y;
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

    if (rowStartY + rowHeight > doc.page.height - 90) {
      doc.addPage();
    }
    const y = doc.y;

    doc.save();
    doc.lineWidth(0.5).strokeColor(COLOR_BORDER);
    doc.rect(x, y, width, rowHeight).stroke();
    doc.restore();

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(COLOR_MUTED)
      .text(String(row.ordre), x + padding, y + padding, { width: colOrdre - padding });

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

    drawScoreChip(doc, x + padding + colOrdre + colCriterion, y + padding, row.score, colScore - padding);
    doc.y = y + rowHeight;
  }
  // Idem : reset X à la marge gauche pour la suite du document.
  doc.x = x;
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
      .text("Non noté", x, y, { width: maxWidth, lineBreak: false });
    return;
  }
  const colors = SCORE_COLORS[score as ScoreValue];
  const label = pdfLabelForScore(score as ScoreValue);
  doc.save();
  const padX = 6;
  const padY = 3;
  doc.font("Helvetica-Bold").fontSize(9);
  const textWidth = doc.widthOfString(label);
  const w = Math.min(maxWidth, textWidth + padX * 2);
  const h = doc.currentLineHeight() + padY * 2;
  doc.lineWidth(0.5).strokeColor(colors.fg).fillColor(colors.bg);
  doc.roundedRect(x, y, w, h, h / 2).fillAndStroke(colors.bg, colors.fg);
  doc.fillColor(colors.fg).text(label, x + padX, y + padY, { width: w - padX * 2, lineBreak: false });
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
  doc.y = y + 22;
}

function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number, height: number): void {
  const svg = loadLogoSvg();
  if (!svg) return;
  try {
    const aspectRatio = 469.53 / 324.62;
    const width = height * aspectRatio;
    SVGtoPDF(doc, svg, x, y, { width, height, preserveAspectRatio: "xMinYMin meet" });
  } catch (err) {
    console.warn("[evaluation-pdf] Échec rendu logo SVG :", err);
  }
}

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

// Dessine le pied de page sur toutes les pages bufferisées.
function drawFooterOnAllPages(doc: PDFKit.PDFDocument): void {
  const pageRange = doc.bufferedPageRange();
  for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
    doc.switchToPage(i);
    drawFooter(doc);
  }
}

function drawFooter(doc: PDFKit.PDFDocument): void {
  const leftX = 50;
  const rightX = doc.page.width - 50;
  const width = rightX - leftX;
  const baseY = doc.page.height - 50;

  const savedMargins = doc.page.margins;
  doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };

  doc.save();
  doc
    .strokeColor(COLOR_BORDER)
    .lineWidth(0.5)
    .moveTo(leftX, baseY)
    .lineTo(rightX, baseY)
    .stroke();

  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor(COLOR_TITLE)
    .text(FOOTER_LINE_1, leftX, baseY + 6, { width, align: "center", lineBreak: false });

  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor(COLOR_TITLE)
    .text(FOOTER_LINE_2, leftX, baseY + 18, { width, align: "center", lineBreak: false });

  doc.restore();
  doc.page.margins = savedMargins;
}
