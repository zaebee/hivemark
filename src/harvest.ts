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

  warnings.push(...unrecognisedArms(records));
  warnings.push(...contextModeDisagreements(records));

  return { records, warnings };
}

/** The arm values this code knows how to interpret. */
const KNOWN_ARMS = new Set(["graph", "ablated"]);

/**
 * Report an `arm` value nothing here understands.
 *
 * `arm` is typed as a bare string rather than the contract's enum, so a value
 * added upstream cannot cost us the record it appears on. The price of that is
 * that it would otherwise pass unremarked and be treated as "not an ablation",
 * which is a guess. This says so instead.
 */
function unrecognisedArms(records: readonly ReviewRecord[]): string[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    if (record.arm === undefined || KNOWN_ARMS.has(record.arm)) continue;
    counts.set(record.arm, (counts.get(record.arm) ?? 0) + 1);
  }
  return [...counts].map(
    ([arm, n]) =>
      `${n} record${n === 1 ? "" : "s"} have arm=${arm}, which this version does not know; ` +
      `treated as not-ablated, which may be wrong`,
  );
}

/**
 * Report runs that are counted as `diff-only` for reasons a reader should know.
 *
 * `pr_slice` names the arm a run was planned for; `had_graph` reports whether a
 * graph was actually there. `genomeOf` derives `context_mode` — and therefore
 * `identity_id` — from `had_graph`, so either cause files the run under a
 * different reviewer than its plan implies. They are not the same event, and
 * conflating them is a mistake this project has already made once:
 *
 * - **Ablation** (`arm: "ablated"`) is a controlled removal. The same PR is
 *   reviewed with the graph deliberately withheld, to measure what the graph
 *   contributes. Nothing failed.
 * - **Ingest failure** is a graph-planned run where the graph turned out
 *   absent. Something failed.
 *
 * Upstream separates them with the `arm` field for exactly this reason, its own
 * comment saying "a failure and a controlled removal must not look alike in the
 * record". Reported separately here so they do not look alike downstream
 * either.
 *
 * Counted rather than reported per line: nineteen warnings is noise nobody
 * reads, and one with a number is a fact somebody acts on.
 */
function contextModeDisagreements(records: readonly ReviewRecord[]): string[] {
  let ablated = 0;
  let ingestFailed = 0;
  // Keyed by the actual `pr_slice`, not assumed to be "diff-only": the upstream
  // schema is a bare string and defines a third value, `"unknown"`, so naming
  // the label in the message means reading it rather than inferring it.
  const armsWithUnexpectedGraph = new Map<string, number>();

  for (const record of records) {
    const plannedGraph = record.pr_slice === "graph";
    if (plannedGraph === !!record.had_graph) continue;
    if (!plannedGraph) {
      const n = armsWithUnexpectedGraph.get(record.pr_slice) ?? 0;
      armsWithUnexpectedGraph.set(record.pr_slice, n + 1);
    } else if (record.arm === "ablated") {
      ablated += 1;
    } else {
      ingestFailed += 1;
    }
  }

  const s = (n: number) => (n === 1 ? "" : "s");
  const out: string[] = [];
  if (ablated > 0) {
    out.push(
      `${ablated} record${s(ablated)} are ablations — pr_slice=graph with the graph ` +
        `deliberately withheld (arm=ablated) — so they are counted as diff-only, ` +
        `alongside runs that were never planned for a graph`,
    );
  }
  if (ingestFailed > 0) {
    out.push(
      `${ingestFailed} record${s(ingestFailed)} have pr_slice=graph but had_graph=false ` +
        `and no arm=ablated, so a graph-planned run found no graph; counted as diff-only`,
    );
  }
  for (const [slice, n] of armsWithUnexpectedGraph) {
    out.push(
      `${n} record${s(n)} have pr_slice=${slice} but had_graph=true, so they are counted as graph`,
    );
  }
  return out;
}