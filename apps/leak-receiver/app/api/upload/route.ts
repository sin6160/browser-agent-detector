import { NextRequest, NextResponse } from "next/server";
import { appendRecord } from "@/app/lib/storage";
import { mergeFields, parseFieldsFromText } from "@/app/lib/parser";
import { ParsedFields } from "@/app/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  return undefined;
}

function getSourceIp(req: NextRequest) {
  const header = req.headers.get("x-forwarded-for");
  if (!header) return undefined;
  const first = header.split(",")[0]?.trim();
  return first || undefined;
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  let rawText = "";
  let overrides: ParsedFields = {};

  if (contentType.includes("application/json")) {
    const body = await req.json();
    if (typeof body.text === "string") rawText = body.text;
    if (typeof body.rawText === "string") rawText = body.rawText;
    overrides = {
      name: typeof body.name === "string" ? body.name : undefined,
      address: typeof body.address === "string" ? body.address : undefined,
      phone: typeof body.phone === "string" ? body.phone : undefined,
      job: typeof body.job === "string" ? body.job : undefined,
      age: typeof body.age === "string" ? body.age : undefined,
      creditCard: typeof body.credit_card === "string" ? body.credit_card : typeof body.creditCard === "string" ? body.creditCard : undefined,
    };
  } else {
    const formData = await req.formData();
    const textField = pickString(formData.get("text"));
    const file = formData.get("file");
    if (file instanceof File && file.size > 0) {
      rawText = await file.text();
      if (textField) {
        rawText = `${rawText}\n${textField}`;
      }
    } else if (textField) {
      rawText = textField;
    }

    overrides = {
      name: pickString(formData.get("name")),
      address: pickString(formData.get("address")),
      phone: pickString(formData.get("phone")),
      job: pickString(formData.get("job")),
      age: pickString(formData.get("age")),
      creditCard: pickString(formData.get("credit_card")) || pickString(formData.get("creditCard")),
    };
  }

  const parsed = rawText ? parseFieldsFromText(rawText) : {};
  const merged = mergeFields(parsed, overrides);
  const hasAnyField = Object.values(merged).some((v) => Boolean(v)) || Boolean(rawText.trim());

  if (!hasAnyField) {
    return NextResponse.json({ ok: false, message: "No data provided" }, { status: 400 });
  }

  const record = await appendRecord({
    ...merged,
    rawText: rawText.trim(),
    sourceIp: getSourceIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, record }, { status: 201 });
}
