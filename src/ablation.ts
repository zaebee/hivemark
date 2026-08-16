import { byCodeUnit } from "./canonical.js";
import type { ReviewRecord } from "./schema.js";

/**
 * The one controlled comparison this corpus contains.
 *
 * Every other comparison on the page is confounded — reviewers saw different
 * codebases, so a difference between them may be a difference between projects.
 * The ablation arm is not: the same pull request, at the same commit, reviewed
 * by the same model, with the graph deliberately withheld. One variable, removed
 * on purpose.
 *
 * This is deliberately not a track record and must never be presented as one.
 * It is a claim about the graph, not about a reviewer, and the ablated runs are
 * already inside the `diff-only` identity's record — counting them again as a
 * fourth reviewer would repeat exactly the conflation that reading `arm` fixed.
 */

export interface AblationPair {
  readonly url: string;
  readonly project: string;
  readonly finder_model: string;
  readonly withoutGraph: number;
  readonly withGraph: number;
  /** `withGraph - withoutGraph`; positive means the graph run found more. */
  readonly difference: number;
}

export interface AblationStudy {
  readonly pairs: readonly AblationPair[];
  readonly projects: readonly string[];
  readonly graphFoundMore: number;
  readonly graphFoundFewer: number;
  readonly tied: number;
  readonly meanDifference: number;
  readonly lowest: number;
  readonly highest: number;
}

/** Same pull request, same commit, same reviewer — everything but the graph. */
function pairKey(record: ReviewRecord): string {
  return `${record.url} ${record.head_sha} ${record.finder_model}`;
}

/**
 * Pair each ablated run with the graph run of the same PR, commit and model.
 *
 * Returns null rather than an empty study when there is nothing to pair, so a
 * corpus without an ablation arm — the ordinary case — produces no section
 * rather than an empty one asserting nothing.
 */
export function ablationStudy(records: readonly ReviewRecord[]): AblationStudy | null {
  // Keyed on the observed `had_graph`, not on `arm: "graph"`. Rows predating
  // the arm field carry the condition without the label, and matching the label
  // finds 6 of the 19 real pairs where matching the condition finds all 19.
  const withGraph = new Map<string, ReviewRecord>();
  for (const record of records) {
    if (!record.had_graph) continue;
    const key = pairKey(record);
    const held = withGraph.get(key);
    // Latest wins, the rule `dedupe` applies to reruns. Six of nineteen real
    // pairs have more than one counterpart, so an arbitrary pick would make a
    // published number depend on the order the file happened to be read in.
    if (!held || Date.parse(record.reviewed_at) > Date.parse(held.reviewed_at)) {
      withGraph.set(key, record);
    }
  }

  // Deduplicated by the same rule as the graph side, and this symmetry is the
  // point: an ablated rerun would otherwise produce two pairs for one pull
  // request, counting the same comparison twice and moving both the split and
  // the mean. No such rerun exists in the corpus today, which is exactly why
  // this needed writing down rather than leaving to the data to enforce.
  const ablated = new Map<string, ReviewRecord>();
  for (const record of records) {
    if (record.arm !== "ablated" || record.had_graph) continue;
    const key = pairKey(record);
    const held = ablated.get(key);
    if (!held || Date.parse(record.reviewed_at) > Date.parse(held.reviewed_at)) {
      ablated.set(key, record);
    }
  }

  const pairs: AblationPair[] = [];
  for (const [key, record] of ablated) {
    const counterpart = withGraph.get(key);
    if (!counterpart) continue;
    pairs.push({
      url: record.url,
      project: record.project,
      finder_model: record.finder_model,
      withoutGraph: record.findings.length,
      withGraph: counterpart.findings.length,
      difference: counterpart.findings.length - record.findings.length,
    });
  }

  if (pairs.length === 0) return null;

  pairs.sort((a, b) => byCodeUnit(a.url, b.url));
  const differences = pairs.map((p) => p.difference);

  return {
    pairs,
    projects: [...new Set(pairs.map((p) => p.project))].sort(byCodeUnit),
    // Counted per pair rather than summarised, because two arms whose averages
    // match can differ on every single PR, and an average cannot tell those
    // apart. This split is the finding; the mean is context for it.
    graphFoundMore: differences.filter((d) => d > 0).length,
    graphFoundFewer: differences.filter((d) => d < 0).length,
    tied: differences.filter((d) => d === 0).length,
    meanDifference:
      Math.round((differences.reduce((a, b) => a + b, 0) / differences.length) * 100) / 100,
    lowest: Math.min(...differences),
    highest: Math.max(...differences),
  };
}
