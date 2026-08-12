import { ReviewRecordSchema, type ReviewRecord } from "./schema.js";

export interface HarvestResult {
  records: ReviewRecord[];
  warnings: string[];
}

/**
 * Parse the append-only review log.
 *
 * The source file is written while benchmark runs are in flight, so the final
 * line may be a partial write. A truncated tail is skipped with a warning: it
 * must neither abort the run nor vanish silently, because a silent drop makes a
 * short result indistinguishable from a small corpus.
 */
export function harvest(text: string): HarvestResult {
  const records: ReviewRecord[] = [];
  const warnings: string[] = [];

  text.split("\n").forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed === "") return;

    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      warnings.push(
        `line ${index + 1}: unparseable JSON, skipped (${trimmed.length} bytes)`,
      );
      return;
    }

    const parsed = ReviewRecordSchema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const where = first?.path.join(".") || "(root)";
      warnings.push(
        `line ${index + 1}: schema mismatch at ${where}, skipped — ${first?.message ?? "unknown"}`,
      );
      return;
    }

    records.push(parsed.data);
  });

  return { records, warnings };
}
