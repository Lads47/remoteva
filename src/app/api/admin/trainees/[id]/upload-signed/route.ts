import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { archiveTraineeFile } from "@/lib/trainee-documents";
import { getTraineeById } from "@/lib/trainee";
import { transitionTraineeStatus } from "@/lib/trainee-status";
import { type EvaStatus } from "@/lib/appConfig";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

// Types de docs supportés. Reste cohérent avec ce qui apparait dans
// TraineeDocument.type ailleurs (devis | convention | contrat | convocation
// | + variantes "_signed").
const ALLOWED_TYPES = new Set([
  "convention_signed",
  "contrat_signed",
  "devis_signed",
  "convocation_signed",
  "attestation",
  "other",
]);

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
]);

// Dépôt d'un document signé → avancée du statut correspondante. C'est ce dépôt
// qui pilote la suite (étape Sellsy + génération convention), plutôt qu'une
// action côté Sellsy. On n'avance jamais en arrière (cf. STATUS_PIPELINE).
const DOC_TYPE_TO_STATUS: Record<string, EvaStatus> = {
  devis_signed: "devis_signe",
  convention_signed: "convention_signee",
  contrat_signed: "convention_signee",
};
const STATUS_PIPELINE: EvaStatus[] = [
  "inscrit", "devis_envoye", "devis_signe", "convention_envoyee",
  "convention_signee", "convoque", "en_formation", "termine",
];

// POST /api/admin/trainees/[id]/upload-signed
// Multipart : file + type (string)
// Archive le fichier dans Drive 01_INSCRIPTIONS_CONVENTIONS/<Stagiaire>/ et
// crée une ligne TraineeDocument.
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;

  try {
    const { id } = await ctx.params;
    const form = await request.formData();
    const file = form.get("file");
    const type = String(form.get("type") || "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier manquant (champ 'file')" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(type)) {
      return NextResponse.json(
        { error: `Type invalide. Valeurs autorisées : ${[...ALLOWED_TYPES].join(", ")}` },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `Fichier trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024} MB)` },
        { status: 400 }
      );
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: `Type MIME non autorisé : ${file.type}. Autorisés : PDF, JPEG, PNG, HEIC.` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file.name || `document-${Date.now()}`;

    const result = await archiveTraineeFile({
      traineeId: id,
      type,
      filename,
      buffer,
      mimeType: file.type,
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 });
    }

    // Le dépôt fait avancer le statut (et donc Sellsy + génération convention),
    // sans jamais faire régresser un stagiaire déjà plus avancé.
    let statusChange:
      | { to: EvaStatus; sellsySynced?: boolean; contractEmailSent?: boolean; error?: string }
      | { skipped: string }
      | null = null;
    const target = DOC_TYPE_TO_STATUS[type];
    if (target) {
      const current = await getTraineeById(id);
      const curIdx = current ? STATUS_PIPELINE.indexOf(current.status as EvaStatus) : -1;
      const tgtIdx = STATUS_PIPELINE.indexOf(target);
      if (current && curIdx >= 0 && tgtIdx > curIdx) {
        const r = await transitionTraineeStatus(id, target);
        if (r.kind === "changed") {
          statusChange = {
            to: target,
            sellsySynced: r.sellsySynced,
            contractEmailSent: r.contractTriggered?.emailSent,
            error: r.contractTriggered?.error ?? r.sellsyError ?? undefined,
          };
        }
      } else {
        statusChange = { skipped: "statut déjà à ce stade ou plus avancé" };
      }
    }

    return NextResponse.json({
      success: true,
      documentId: result.documentId,
      driveFileId: result.driveFileId,
      driveFileUrl: result.driveFileUrl,
      statusChange,
    });
  } catch (error) {
    console.error("[/api/admin/trainees/[id]/upload-signed] error:", error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
