import { describe, expect, it } from "vitest";
import { harvest } from "../src/harvest.js";
import { ablationStudy } from "../src/ablation.js";
import { readCorpus } from "../src/corpus.js";
import type { ReviewRecord } from "../src/schema.js";

const base = {
  url: "https://github.com/o/r/pull/1",
  project: "r",
  base_sha: "a",
  head_sha: "b",
  guardian_sha: "1111111111111111",
  reviewed_at: "2026-08-12T10:00:00+00:00",
  finder_model: "gemini-2.5-flash",
  skeptic_model: "gemini-3.5-flash",
  had_graph: true,
  pr_slice: "graph",
  parse_failed: false,
  findings: [],
  review_fingerprint: "aaaa11111111",
  finder_provider: "gemini",
  skeptic_provider: "gemini",
} as const;

const finding = (verdict: string) => ({
  file: "f.ts",
  severity: "major" as const,
  category: "logic" as const,
  title: "t",
  evidence: "e",
  problem: "p",
  fix: "x",
  confidence: 80,
  verdict,
}) as ReviewRecord["findings"][number];

const rec = (over: Partial<ReviewRecord> & Record<string, unknown>): ReviewRecord =>
  ({ ...base, ...over }) as ReviewRecord;

const withN = (n: number, over: Record<string, unknown> = {}) =>
  rec({ findings: Array.from({ length: n }, () => finding("confirmed")), ...over });

describe("ablationStudy", () => {
  it("is null when nothing was ablated", () => {
    // The ordinary state for a corpus without an ablation arm, and the shape
    // the page must handle without inventing an empty study.
    expect(ablationStudy([withN(3)])).toBeNull();
  });

  it("is null when an ablated run has no counterpart", () => {
    // One arm of a paired experiment is not a paired experiment.
    expect(ablationStudy([withN(3, { arm: "ablated", had_graph: false })])).toBeNull();
  });

  it("pairs an ablated run with the graph run of the same PR and model", () => {
    const study = ablationStudy([
      withN(2, { arm: "ablated", had_graph: false }),
      withN(5, { arm: "graph", had_graph: true }),
    ]);
    expect(study?.pairs).toHaveLength(1);
    expect(study?.pairs[0]).toMatchObject({ withoutGraph: 2, withGraph: 5, difference: 3 });
  });

  it("does not pair across different finder models", () => {
    // A different model is a different reviewer, so the graph would not be the
    // only thing that changed — which is the entire point of the pairing.
    expect(
      ablationStudy([
        withN(2, { arm: "ablated", had_graph: false }),
        withN(5, { had_graph: true, finder_model: "mistral-medium-latest" }),
      ]),
    ).toBeNull();
  });

  it("does not pair across different commits", () => {
    expect(
      ablationStudy([
        withN(2, { arm: "ablated", had_graph: false }),
        withN(5, { had_graph: true, head_sha: "different" }),
      ]),
    ).toBeNull();
  });

  it("pairs against the observed graph, not the arm label", () => {
    // Rows predating the `arm` field carry had_graph without it. Matching on
    // the label finds 6 pairs in the real corpus; matching on the observed
    // condition finds all 19.
    const study = ablationStudy([
      withN(2, { arm: "ablated", had_graph: false }),
      withN(5, { had_graph: true }),
    ]);
    expect(study?.pairs).toHaveLength(1);
  });

  it("takes the latest graph run when a PR has several", () => {
    // Six of nineteen real pairs have more than one counterpart, so an
    // arbitrary pick would make the published result depend on the order the
    // file was read in. Latest wins, the same rule `dedupe` applies.
    const study = ablationStudy([
      withN(2, { arm: "ablated", had_graph: false }),
      withN(4, { had_graph: true, reviewed_at: "2026-08-12T09:00:00+00:00" }),
      withN(9, { had_graph: true, reviewed_at: "2026-08-12T18:00:00+00:00" }),
    ]);
    expect(study?.pairs[0]?.withGraph).toBe(9);
  });

  it("takes the latest ablated run too, not one pair per rerun", () => {
    // The graph side was deduplicated and the ablated side was not, so a rerun
    // ablation would have produced two pairs for one pull request and counted
    // the same comparison twice — skewing the split and the mean. Both sides of
    // a paired experiment have to collapse by the same rule.
    const study = ablationStudy([
      withN(2, { arm: "ablated", had_graph: false, reviewed_at: "2026-08-12T09:00:00+00:00" }),
      withN(7, { arm: "ablated", had_graph: false, reviewed_at: "2026-08-12T18:00:00+00:00" }),
      withN(5, { had_graph: true }),
    ]);
    expect(study?.pairs).toHaveLength(1);
    expect(study?.pairs[0]?.withoutGraph).toBe(7);
  });

  it("splits the pairs by which side found more", () => {
    const study = ablationStudy([
      withN(1, { arm: "ablated", had_graph: false }),
      withN(3, { had_graph: true }),
      withN(4, { arm: "ablated", had_graph: false, head_sha: "c" }),
      withN(2, { had_graph: true, head_sha: "c" }),
      withN(2, { arm: "ablated", had_graph: false, head_sha: "d" }),
      withN(2, { had_graph: true, head_sha: "d" }),
    ]);
    expect(study).toMatchObject({ graphFoundMore: 1, graphFoundFewer: 1, tied: 1 });
  });

  it("reports the spread, not only the average", () => {
    // Two arms averaging the same can differ on every PR. The average alone
    // cannot tell those apart, which is the failure this study exists to avoid.
    const study = ablationStudy([
      withN(1, { arm: "ablated", had_graph: false }),
      withN(4, { had_graph: true }),
      withN(4, { arm: "ablated", had_graph: false, head_sha: "c" }),
      withN(1, { had_graph: true, head_sha: "c" }),
    ]);
    expect(study).toMatchObject({ meanDifference: 0, lowest: -3, highest: 3 });
  });

  it("names every project the pairs cover", () => {
    const study = ablationStudy([
      withN(1, { arm: "ablated", had_graph: false }),
      withN(1, { had_graph: true }),
      withN(1, { arm: "ablated", had_graph: false, head_sha: "c", project: "other" }),
      withN(1, { had_graph: true, head_sha: "c", project: "other" }),
    ]);
    expect(study?.projects).toEqual(["other", "r"]);
  });
});

describe("ablationStudy on the real corpus", () => {
  const { records } = harvest(readCorpus("corpus.json").text);

  it("finds every ablated run a counterpart", () => {
    const ablated = records.filter((r) => r.arm === "ablated");
    expect(ablated).toHaveLength(19);
    expect(ablationStudy(records)?.pairs).toHaveLength(19);
  });

  it("reports a split indistinguishable from chance", () => {
    // Pinned because it is the headline: 8 to 9 with 2 ties is what no effect
    // looks like. If this moves, the claim on the page moves with it.
    expect(ablationStudy(records)).toMatchObject({
      graphFoundMore: 8,
      graphFoundFewer: 9,
      tied: 2,
    });
  });
});
