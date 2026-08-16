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

  warnings.push(...contextModeDisagreements(records));

  return { records, warnings };
}

/**
 * Report records whose two candidate context sources contradict each other.
 *
 * `pr_slice` names the arm a run was assigned to; `had_graph` reports whether a
 * graph was actually there. `genomeOf` derives `context_mode` — and therefore
 * `identity_id` — from `had_graph`, so a disagreement silently files a run
 * under a different reviewer than its own label implies.
 *
 * This does not refuse, because `had_graph` is the defensible source and
 * refusing would stop a corpus that is honestly reporting a degraded run. It
 * warns, because 19 such records in the current corpus account for 42% of one
 * published identity's reviews, and that arrived without anything saying so.
 *
 * Counted rather than reported per line: nineteen warnings is noise nobody
 * reads, and one with a number is a fact somebody acts on.
 */
function contextModeDisagreements(records: readonly ReviewRecord[]): string[] {
  let graphArmWithoutGraph = 0;
  let diffArmWithGraph = 0;
  for (const record of records) {
    const labelledGraph = record.pr_slice === "graph";
    if (labelledGraph === !!record.had_graph) continue;
    if (labelledGraph) graphArmWithoutGraph += 1;
    else diffArmWithGraph += 1;
  }

  const say = (n: number, label: string, reported: string, counted: string): string =>
    `${n} record${n === 1 ? "" : "s"} have pr_slice=${label} but had_graph=${reported}; ` +
    `context_mode follows had_graph, so they are counted as ${counted}`;

  const out: string[] = [];
  if (graphArmWithoutGraph > 0) {
    out.push(say(graphArmWithoutGraph, "graph", "false", "diff-only"));
  }
  if (diffArmWithGraph > 0) out.push(say(diffArmWithGraph, "diff-only", "true", "graph"));
  return out;
}
