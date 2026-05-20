// API admin : configuration des questions d'évaluation à FROID globales.
// Jumeau de /api/admin/satisfaction-config (chaud).

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  COLD_EVAL_DEFAULT_QUESTIONS,
  getGlobalColdEvalQuestions,
  setGlobalColdEvalQuestions,
} from "@/lib/cold-eval";
import type { SatisfactionQuestion } from "@/lib/satisfaction";

async function requireAuth() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return null;
}

const ALLOWED_TYPES = new Set([
  "section_header",
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

export async function GET() {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const questions = await getGlobalColdEvalQuestions();
    return NextResponse.json({ questions, defaults: COLD_EVAL_DEFAULT_QUESTIONS });
  } catch (error) {
    console.error("[/api/admin/cold-eval-config] GET error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const authError = await requireAuth();
  if (authError) return authError;
  try {
    const body = await request.json();
    const raw = body?.questions;
    if (!Array.isArray(raw)) {
      return NextResponse.json({ error: "Body invalide : 'questions' doit être un tableau" }, { status: 400 });
    }
    const validated: SatisfactionQuestion[] = [];
    const errors: string[] = [];
    raw.forEach((q, idx) => {
      const v = validateQuestion(q);
      if (!v) errors.push(`Question #${idx + 1} invalide (name/type/label requis)`);
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
    await setGlobalColdEvalQuestions(validated);
    return NextResponse.json({ success: true, questions: validated });
  } catch (error) {
    console.error("[/api/admin/cold-eval-config] PUT error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
