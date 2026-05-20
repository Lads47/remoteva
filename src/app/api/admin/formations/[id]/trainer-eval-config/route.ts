// Override par formation du questionnaire d'éval formateur.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/db";
import {
  TRAINER_EVAL_DEFAULT_QUESTIONS,
  getGlobalTrainerEvalQuestions,
} from "@/lib/trainer-eval";
import type { SatisfactionQuestion } from "@/lib/satisfaction";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

const ALLOWED_TYPES = new Set([
  "section_header",
  "likert_4",
  "likert_5",
  "scale_nps",
  "text",
  "textarea",
  "yes_no",
  "single_choice",
]);

function validateQuestion(q: unknown): SatisfactionQuestion | null {
  if (!q || typeof q !== "object") return null;
  const obj = q as Record<string, unknown>;
  if (typeof obj.name !== "string" || obj.name.trim() === "") return null;
  if (typeof obj.type !== "string" || !ALLOWED_TYPES.has(obj.type)) return null;
  if (typeof obj.label !== "string" || obj.label.trim() === "") return null;
  return {
    name: obj.name.trim(),
    type: obj.type as SatisfactionQuestion["type"],
    label: obj.label.trim(),
    description: typeof obj.description === "string" ? obj.description : undefined,
    required: typeof obj.required === "boolean" ? obj.required : false,
    options: Array.isArray(obj.options) ? obj.options.filter((o) => typeof o === "string") : undefined,
    leftLabel: typeof obj.leftLabel === "string" ? obj.leftLabel : undefined,
    rightLabel: typeof obj.rightLabel === "string" ? obj.rightLabel : undefined,
    placeholder: typeof obj.placeholder === "string" ? obj.placeholder : undefined,
  };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const f = await prisma.formation.findUnique({
      where: { id },
      select: { id: true, code: true, nomLong: true, trainerEvalConfigForm: true },
    });
    if (!f) return NextResponse.json({ error: "Formation introuvable" }, { status: 404 });

    let override: SatisfactionQuestion[] | null = null;
    if (f.trainerEvalConfigForm && f.trainerEvalConfigForm.trim() !== "" && f.trainerEvalConfigForm.trim() !== "{}") {
      try {
        const parsed = JSON.parse(f.trainerEvalConfigForm);
        if (Array.isArray(parsed)) override = parsed;
      } catch {}
    }

    const global = await getGlobalTrainerEvalQuestions();
    return NextResponse.json({
      formation: { id: f.id, code: f.code, nomLong: f.nomLong },
      override,
      global,
      defaults: TRAINER_EVAL_DEFAULT_QUESTIONS,
    });
  } catch (error) {
    console.error("[/api/admin/formations/[id]/trainer-eval-config] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const { id } = await ctx.params;
    const body = await request.json();

    if (body?.questions === null) {
      await prisma.formation.update({
        where: { id },
        data: { trainerEvalConfigForm: "" },
      });
      return NextResponse.json({ success: true, override: null });
    }

    if (!Array.isArray(body?.questions)) {
      return NextResponse.json({ error: "Body invalide : 'questions' doit être un tableau ou null" }, { status: 400 });
    }
    const validated: SatisfactionQuestion[] = [];
    const errors: string[] = [];
    body.questions.forEach((q: unknown, idx: number) => {
      const v = validateQuestion(q);
      if (!v) errors.push(`Question #${idx + 1} invalide`);
      else validated.push(v);
    });
    if (errors.length > 0) {
      return NextResponse.json({ error: "Validation échouée", issues: errors }, { status: 400 });
    }
    const names = new Set<string>();
    for (const q of validated) {
      if (q.type === "section_header") continue;
      if (names.has(q.name)) {
        return NextResponse.json({ error: `Le 'name' "${q.name}" est utilisé plusieurs fois.` }, { status: 400 });
      }
      names.add(q.name);
    }

    await prisma.formation.update({
      where: { id },
      data: { trainerEvalConfigForm: JSON.stringify(validated) },
    });
    return NextResponse.json({ success: true, override: validated });
  } catch (error) {
    console.error("[/api/admin/formations/[id]/trainer-eval-config] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
