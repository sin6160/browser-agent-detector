import { NextResponse } from "next/server";
import { readRecords } from "@/app/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const records = await readRecords();
  return NextResponse.json({ records });
}
