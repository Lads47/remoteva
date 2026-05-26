// Endpoint de nettoyage : supprime TOUS les stagiaires + données associées.
//
// Usage prévu : remise à zéro après une période de test. À ne PAS exposer
// largement — auth admin standard + double confirmation par body.
//
// Cascade BDD (via onDelete dans schema.prisma) :
//   - TraineeDocument        : Cascade ✓
//   - TraineeEvent           : Cascade ✓
//   - Attendance             : Cascade ✓
//   - TraineeExerciseEvaluation : Cascade ✓ (donc TraineeCriterionScore aussi)
//   - ColdEvalResponse       : Cascade ✓
//   - SatisfactionResponse   : SetNull (anonyme, on garde la réponse) ✓
//   - Complaint              : SetNull (on garde la réclamation, juste détachée) ✓
//
// Pas géré ici :
//   - Sessions (gardées telles quelles, ce sont des shells réutilisables)
//   - AttendanceFile (lié à la session, pas au stagiaire — garde par session)
//   - Sellsy (les opportunités/devis créés en test doivent être supprimés à la main)
//
// Best-effort additionnel :
//   - Trash des dossiers Drive personnels de chaque stagiaire (driveFolderId)
//   - Re-sync des Sheets Qualiopi + BPF pour refléter le nouveau "tout vide"

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { trashFile, isDriveConfigured } from "@/lib/google-drive";
import { syncQualiopiSheet } from "@/lib/qualiopi-export";
import { syncBpfSheet } from "@/lib/bpf-export";

const CONFIRM_PHRASE = "DELETE_ALL_TRAINEES";

export async function GET() {
  try {
    const trainees = await prisma.trainee.findMany({
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
        status: true,
        driveFolderId: true,
        session: { select: { code: true } },
      },
    });

    const driveFoldersToTrash = trainees.filter((t) => t.driveFolderId).length;

    // Cascades — comptages indicatifs (purs SELECT, n'engagent rien)
    const [
      traineeDocs,
      traineeEvents,
      attendances,
      exerciseEvaluations,
      coldEvalResponses,
      satisfactionResponses,
      complaintsLinked,
    ] = await Promise.all([
      prisma.traineeDocument.count(),
      prisma.traineeEvent.count(),
      prisma.attendance.count(),
      prisma.traineeExerciseEvaluation.count(),
      prisma.coldEvalResponse.count(),
      prisma.satisfactionResponse.count({ where: { traineeId: { not: null } } }),
      prisma.complaint.count({ where: { traineeId: { not: null } } }),
    ]);

    return NextResponse.json({
      mode: "dry-run",
      confirm_phrase: CONFIRM_PHRASE,
      help: `POST ce même endpoint avec body { "confirm": "${CONFIRM_PHRASE}" } pour exécuter`,
      will_be_deleted: {
        trainees: trainees.length,
        trainee_documents: traineeDocs,
        trainee_events: traineeEvents,
        attendances,
        exercise_evaluations: exerciseEvaluations,
        cold_eval_responses: coldEvalResponses,
        drive_folders_to_trash: driveFoldersToTrash,
      },
      will_be_preserved: {
        satisfaction_responses: `${satisfactionResponses} (traineeId mis à null — réponses anonymes conservées)`,
        complaints: `${complaintsLinked} (traineeId mis à null — réclamations conservées)`,
        sessions: "toutes (shells réutilisables)",
        formations: "toutes",
      },
      sample_trainees: trainees.slice(0, 5).map((t) => ({
        id: t.id,
        nom: `${t.prenom} ${t.nom}`,
        email: t.email,
        status: t.status,
        session: t.session.code,
      })),
    });
  } catch (error) {
    console.error("[/api/admin/reset-trainees] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body?.confirm !== CONFIRM_PHRASE) {
      return NextResponse.json(
        { error: `Confirmation requise : POST { "confirm": "${CONFIRM_PHRASE}" }` },
        { status: 400 }
      );
    }

    // 1. Récupère les dossiers Drive à trash AVANT la suppression BDD
    const trainees = await prisma.trainee.findMany({
      select: { id: true, driveFolderId: true },
    });
    const driveFolderIds = trainees
      .map((t) => t.driveFolderId)
      .filter((id): id is string => Boolean(id));

    // 2. Trash Drive best-effort (en parallèle, on ne bloque pas sur les erreurs)
    let driveTrashedOK = 0;
    let driveTrashedErrors = 0;
    if (isDriveConfigured() && driveFolderIds.length > 0) {
      const results = await Promise.allSettled(driveFolderIds.map((id) => trashFile(id)));
      for (const r of results) {
        if (r.status === "fulfilled") driveTrashedOK++;
        else driveTrashedErrors++;
      }
    }

    // 3. Cascade delete BDD
    //    deleteMany sur Trainee — Prisma applique les cascades définies dans le schéma
    const deleted = await prisma.trainee.deleteMany({});

    // 4. Re-sync sheets best-effort (pas bloquant — l'opération principale est faite)
    const syncResults: Record<string, unknown> = {};
    try {
      syncResults.qualiopi = await syncQualiopiSheet();
    } catch (e) {
      syncResults.qualiopi_error = e instanceof Error ? e.message : String(e);
    }
    try {
      syncResults.bpf = await syncBpfSheet();
    } catch (e) {
      syncResults.bpf_error = e instanceof Error ? e.message : String(e);
    }

    console.log(
      `[reset-trainees] ${deleted.count} stagiaire(s) supprimé(s), ${driveTrashedOK}/${driveFolderIds.length} dossier(s) Drive trashés`
    );

    return NextResponse.json({
      mode: "executed",
      trainees_deleted: deleted.count,
      drive_folders_trashed: driveTrashedOK,
      drive_folders_errors: driveTrashedErrors,
      sheets_resynced: {
        qualiopi: syncResults.qualiopi ? "OK" : (syncResults.qualiopi_error ?? "skipped"),
        bpf: syncResults.bpf ? "OK" : (syncResults.bpf_error ?? "skipped"),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[/api/admin/reset-trainees] POST error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
