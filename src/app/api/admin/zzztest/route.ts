import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({ debug: true, route: "/api/admin/zzztest" });
}
export async function POST() { return GET(); }
