import fs from "fs/promises";
import path from "path";
import { ParsedFields, RecordEntry } from "./types";
import { randomUUID } from "crypto";

const dataDir = path.join(process.cwd(), "data");
const recordsFile = path.join(dataDir, "records.json");

async function ensureFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(recordsFile);
  } catch {
    await fs.writeFile(recordsFile, "[]", "utf8");
  }
}

export async function readRecords(): Promise<RecordEntry[]> {
  await ensureFile();
  try {
    const content = await fs.readFile(recordsFile, "utf8");
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // fall through to return empty
  }
  return [];
}

export async function appendRecord(fields: ParsedFields & { rawText: string; sourceIp?: string; userAgent?: string }) {
  const records = await readRecords();
  const entry: RecordEntry = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    sourceIp: fields.sourceIp,
    userAgent: fields.userAgent,
    name: fields.name ?? "",
    address: fields.address ?? "",
    phone: fields.phone ?? "",
    job: fields.job ?? "",
    age: fields.age ?? "",
    creditCard: fields.creditCard ?? "",
    rawText: fields.rawText ?? "",
  };

  // prepend newest
  const nextRecords = [entry, ...records].slice(0, 200); // keep latest 200 to avoid unbounded growth
  await fs.writeFile(recordsFile, JSON.stringify(nextRecords, null, 2), "utf8");
  return entry;
}
