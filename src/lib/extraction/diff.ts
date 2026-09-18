import type { ExtractedFields } from "./schema";

export interface FieldDiff {
  path: string;
  aiValue: unknown;
  makerValue: unknown;
}

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flatten(value as Record<string, unknown>, path));
    } else {
      result[path] = value;
    }
  }
  return result;
}

/** What the checker sees highlighted: every scalar field the maker changed from what Claude read. */
export function diffExtractedFields(ai: ExtractedFields, maker: ExtractedFields): FieldDiff[] {
  const aiFlat = flatten(ai as unknown as Record<string, unknown>);
  const makerFlat = flatten(maker as unknown as Record<string, unknown>);
  const paths = new Set([...Object.keys(aiFlat), ...Object.keys(makerFlat)]);

  const diffs: FieldDiff[] = [];
  for (const path of paths) {
    if (path.startsWith("service.line_items") || path === "low_confidence_fields") continue;
    const aiValue = aiFlat[path];
    const makerValue = makerFlat[path];
    if (JSON.stringify(aiValue) !== JSON.stringify(makerValue)) {
      diffs.push({ path, aiValue, makerValue });
    }
  }

  if (JSON.stringify(ai.service.line_items) !== JSON.stringify(maker.service.line_items)) {
    diffs.push({ path: "service.line_items", aiValue: ai.service.line_items, makerValue: maker.service.line_items });
  }

  return diffs;
}
