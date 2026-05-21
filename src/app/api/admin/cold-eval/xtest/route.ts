// TEMP debug — endpoint sous /admin/cold-eval/ mais nom isolé (pas un préfixe ni suffixe de preview-mail)
import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({ debug: true, route: "/api/admin/cold-eval/xtest" });
}
export async function GET() {
  return POST();
}
