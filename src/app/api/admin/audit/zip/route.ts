// GET /api/admin/audit/zip?year=YYYY
//
// Prépare un ZIP du dossier d'audit Qualiopi pour l'année demandée.
//
// V1 contenu :
//   - bilan-qualiopi-YYYY.pdf       → généré à la volée via buildQualiopiPdf
//   - contrats-sous-traitance/      → 1 PDF par contrat ST de l'année
//   - manifest-formateurs.txt       → liens Drive vers les CV/qualifs
//   - README.txt                    → mode d'emploi pour l'auditeur
//
// Best-effort : si un fichier Drive n'est pas accessible (trashed, droits),
// on le mentionne dans le README et on continue. L'admin reçoit toujours
// un ZIP, jamais une 500.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import JSZip from "jszip";
import prisma from "@/lib/db";
import { buildQualiopiPdf } from "@/lib/qualiopi-pdf";
import { getQualiopiOverview } from "@/lib/analytics";
import { getFileAsPdf, isDriveConfigured } from "@/lib/google-drive";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    if (!Number.isFinite(year) || year < 2020 || year > 2100) {
      return NextResponse.json({ error: "Année invalide" }, { status: 400 });
    }

    const zip = new JSZip();
    const errors: string[] = [];
    const successes: string[] = [];

    // === 1. Bilan Qualiopi PDF ===
    try {
      const overview = await getQualiopiOverview(year);
      const { buffer, filename } = await buildQualiopiPdf(overview);
      zip.file(filename, buffer);
      successes.push(`✓ ${filename}`);
    } catch (e) {
      errors.push(`✗ Bilan Qualiopi : ${e instanceof Error ? e.message : String(e)}`);
    }

    // === 2. Contrats de sous-traitance (year filter on dateFin) ===
    const yearStart = new Date(`${year}-01-01T00:00:00Z`);
    const yearEnd = new Date(`${year}-12-31T23:59:59Z`);

    const sessionsAvecContrat = await prisma.session.findMany({
      where: {
        dateFin: { gte: yearStart, lte: yearEnd },
        status: { not: "cancelled" },
        trainerContractDriveFileId: { not: null },
      },
      select: {
        code: true,
        dateDebut: true,
        trainerContractDriveFileId: true,
        trainerFeeAmount: true,
        trainer: { select: { prenom: true, nom: true } },
        formation: { select: { code: true } },
      },
      orderBy: { dateDebut: "asc" },
    });

    if (isDriveConfigured() && sessionsAvecContrat.length > 0) {
      for (const s of sessionsAvecContrat) {
        if (!s.trainerContractDriveFileId) continue;
        try {
          const pdf = await getFileAsPdf(s.trainerContractDriveFileId);
          const safeName = `${s.formation.code}_${s.code}_${s.trainer?.nom ?? "formateur"}.pdf`
            .replace(/[/\\?%*:|"<>]/g, "_");
          zip.file(`contrats-sous-traitance/${safeName}`, pdf.buffer);
          successes.push(`✓ Contrat ST : ${s.code}`);
        } catch (e) {
          errors.push(
            `✗ Contrat ST ${s.code} : ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
    }

    // === 3. Manifest formateurs : liens Drive vers CV/qualifs ===
    const trainers = await prisma.trainer.findMany({
      where: { active: true },
      select: {
        prenom: true,
        nom: true,
        email: true,
        isExternal: true,
        qualifications: true,
        driveCvFolderId: true,
        developpementCompetences: true,
      },
      orderBy: { nom: "asc" },
    });

    const manifestLines: string[] = [
      `MANIFEST FORMATEURS — Année ${year}`,
      `Généré le ${new Date().toLocaleString("fr-FR")}`,
      "",
      "Ce manifeste liste les formateurs actifs et fournit les liens",
      "vers leurs dossiers Drive (CV, qualifications, justificatifs)",
      "ainsi qu'un résumé de leurs actions de développement.",
      "(Qualiopi indicateurs 21 — compétences et 22 — entretien et développement)",
      "",
      "═".repeat(72),
      "",
    ];

    for (const t of trainers) {
      manifestLines.push(`${t.prenom} ${t.nom} — ${t.email}`);
      manifestLines.push(t.isExternal ? "Statut : externe (sous-traitant)" : "Statut : interne");
      if (t.driveCvFolderId) {
        manifestLines.push(
          `Dossier Drive (CV + justificatifs) :`,
          `  https://drive.google.com/drive/folders/${t.driveCvFolderId}`
        );
      } else {
        manifestLines.push("⚠ Aucun dossier Drive renseigné");
      }
      if (t.qualifications) {
        manifestLines.push("", "Qualifications (ind. 21) :");
        manifestLines.push(indent(t.qualifications, "  "));
      }
      if (t.developpementCompetences) {
        manifestLines.push("", "Actions de développement (ind. 22) :");
        manifestLines.push(indent(t.developpementCompetences, "  "));
      }
      manifestLines.push("", "─".repeat(72), "");
    }

    zip.file("manifest-formateurs.txt", manifestLines.join("\n"));
    successes.push(`✓ manifest-formateurs.txt (${trainers.length} formateurs)`);

    // === 4. README pour l'auditeur ===
    const readme = [
      `DOSSIER D'AUDIT QUALIOPI — Année ${year}`,
      `Les Ateliers du Stream — NDA 75470196847`,
      `Généré le ${new Date().toLocaleString("fr-FR")}`,
      "",
      "═".repeat(72),
      "CONTENU DE CE ZIP",
      "═".repeat(72),
      "",
      "1. Bilan_Qualiopi_*.pdf",
      "   → Synthèse annuelle des 6 indicateurs Qualiopi :",
      "     activité, satisfaction chaud/froid, pédagogie, formateurs, réclamations.",
      "",
      "2. contrats-sous-traitance/",
      "   → 1 PDF par contrat de sous-traitance signé sur l'année",
      "     (Qualiopi indicateur 27).",
      "",
      "3. manifest-formateurs.txt",
      "   → Liste des formateurs actifs avec liens vers leurs dossiers Drive",
      "     (CV, qualifications, justificatifs) et résumé de leur",
      "     développement des compétences (Qualiopi ind. 21 et 22).",
      "",
      "═".repeat(72),
      "DOCUMENTS COMPLÉMENTAIRES (à fournir séparément à l'auditeur)",
      "═".repeat(72),
      "",
      "• Conventions de formation signées (par stagiaire, dans Drive)",
      "• Attestations / certificats de réalisation (par stagiaire, dans Drive)",
      "• Feuilles d'émargement signées (par session, dans Drive)",
      "• Bilan BPF (Google Sheet exporté chaque jour)",
      "• Veille technique et réglementaire (Drive partagé)",
      "",
      "═".repeat(72),
      "JOURNAL DE GÉNÉRATION",
      "═".repeat(72),
      "",
      ...successes,
      "",
    ];
    if (errors.length > 0) {
      readme.push("ERREURS RENCONTRÉES :", "");
      readme.push(...errors);
    }
    zip.file("README.txt", readme.join("\n"));

    // === Génération + envoi du ZIP ===
    const buffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    const filename = `Dossier_Audit_Qualiopi_${year}_LADS.zip`;
    // Buffer → Uint8Array (NextResponse n'accepte pas un Buffer directement)
    const body = new Uint8Array(buffer);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(body.byteLength),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[/api/admin/audit/zip] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function indent(text: string, prefix: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => prefix + l)
    .join("\n");
}
