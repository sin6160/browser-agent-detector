import { ParsedFields } from "./types";

type FieldKey = keyof ParsedFields;

const FIELD_PATTERNS: Record<FieldKey, string[]> = {
  name: ["氏名", "名前", "name"],
  address: ["住所", "address"],
  phone: ["電話", "電話番号", "phone", "tel"],
  job: ["職業", "job", "仕事", "profession"],
  age: ["年齢", "age"],
  creditCard: ["クレジットカード", "クレカ", "card", "credit", "creditcard"],
};

const SEP_REGEX = /[:：＝=]/;

export function parseFieldsFromText(text: string): ParsedFields {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const parsed: ParsedFields = {};

  for (const line of lines) {
    const [maybeKey, ...rest] = line.split(SEP_REGEX);
    if (!maybeKey || rest.length === 0) continue;
    const value = rest.join(":").trim();
    if (!value) continue;

    const lowerKey = maybeKey.toLowerCase();
    for (const [field, patterns] of Object.entries(FIELD_PATTERNS) as [FieldKey, string[]][]) {
      if (patterns.some((p) => lowerKey.includes(p.toLowerCase()))) {
        parsed[field] = value;
        break;
      }
    }
  }

  return parsed;
}

export function mergeFields(parsed: ParsedFields, overrides: ParsedFields): ParsedFields {
  return {
    name: overrides.name ?? parsed.name,
    address: overrides.address ?? parsed.address,
    phone: overrides.phone ?? parsed.phone,
    job: overrides.job ?? parsed.job,
    age: overrides.age ?? parsed.age,
    creditCard: overrides.creditCard ?? parsed.creditCard,
  };
}
