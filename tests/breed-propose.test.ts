import { describe, expect, it } from "vitest";
import { proposalsFrom } from "../src/breed/propose.js";
import { identityId } from "../src/identity.js";
import type { Vocabulary } from "../src/breed/vocabulary.js";
import type { Genome } from "../src/types.js";

const KNOWN = [
  "context_mode",
  "finder_model",
  "review_fingerprint",
  "provider",
  "skeptic_model",
] as const;

const genome = (over: Partial<Genome>): Genome => ({
  schema_version: 1,
  known_fields: KNOWN,
  finder_provider: "gemini",

  skeptic_provider: "gemini",
  finder_model: "gemini-2.5-flash",
  skeptic_model: "gemini-3.5-flash",
  context_mode: "graph",
  review_fingerprint: "newest",
  ...over,
});

/** Two reviewers, one gemini pair and one mistral pair, both graph. */
const vocab: Vocabulary = {
  finderModels: ["gemini-2.5-flash", "mistral-medium-latest"],
  skepticModels: ["gemini-3.5-flash", "mistral-medium-latest"],
  contextModes: ["graph"],
  newestFingerprint: "newest",
  existing: [
    genome({}),
    genome({
      finder_provider: "mistral",

      skeptic_provider: "mistral",
      finder_model: "mistral-medium-latest",
      skeptic_model: "mistral-medium-latest",
    }),
  ],
};

describe("proposalsFrom", () => {
  it("enumerates the product and subtracts what exists", () => {
    // 2 finders x 2 skeptics x 1 context = 4; two already run.
    expect(proposalsFrom(vocab)).toHaveLength(2);
  });

  it("never proposes an identity that already exists", () => {
    const proposed = new Set(proposalsFrom(vocab).map((p) => p.identity_id));
    for (const g of vocab.existing) expect(proposed.has(identityId(g))).toBe(false);
  });

  it("returns nothing when every combination has been run", () => {
    const exhausted: Vocabulary = {
      ...vocab,
      finderModels: ["gemini-2.5-flash"],
      skepticModels: ["gemini-3.5-flash"],
      existing: [genome({})],
    };
    expect(proposalsFrom(exhausted)).toEqual([]);
  });

  it("stamps every proposal with the newest revision", () => {
    for (const p of proposalsFrom(vocab)) expect(p.genome.review_fingerprint).toBe("newest");
  });

  it("derives finder_provider from the finder rather than carrying it", () => {
    for (const p of proposalsFrom(vocab)) {
      const expected = p.genome.finder_model.startsWith("mistral") ? "mistral" : "gemini";
      expect(p.genome.finder_provider).toBe(expected);
    }
  });

  it("measures distance to the nearest existing identity and names the slots", () => {
    for (const p of proposalsFrom(vocab)) {
      // Each proposal here swaps exactly one of finder or skeptic.
      expect(p.distance).toBe(1);
      expect(p.differsIn).toHaveLength(1);
      expect(["finder_model", "skeptic_model"]).toContain(p.differsIn[0]);
    }
  });

  it("names parent pairs that genuinely cover the proposal", () => {
    for (const p of proposalsFrom(vocab)) {
      expect(p.parents.length).toBeGreaterThan(0);
      for (const [a, b] of p.parents) {
        const pa = vocab.existing.find((g) => identityId(g) === a)!;
        const pb = vocab.existing.find((g) => identityId(g) === b)!;
        for (const slot of ["finder_model", "skeptic_model", "context_mode"] as const) {
          expect([pa[slot], pb[slot]]).toContain(p.genome[slot]);
        }
      }
    }
  });

  it("is deterministic in content and order, whole objects included", () => {
    // Comparing only identity_id would have missed it: `nearest`, `differsIn`
    // and `parents` all depend on which existing identity is examined first,
    // and ties are guaranteed whenever one configuration ran under several
    // Guardian revisions. `differsIn` is a claim about what an experiment
    // controls for, so it must not change because arguments were reordered.
    const once = proposalsFrom(vocab);
    const twice = proposalsFrom({ ...vocab, existing: [...vocab.existing].reverse() });
    expect(twice).toEqual(once);
  });

  it("picks the same nearest when two existing identities tie", () => {
    // The same configuration under two revisions: both are equally near, so
    // something other than arrival order has to decide.
    const tied: Vocabulary = {
      ...vocab,
      existing: [
        genome({ review_fingerprint: "rev-a" }),
        genome({ review_fingerprint: "rev-b" }),
        genome({
          finder_provider: "mistral",

          skeptic_provider: "mistral",
          finder_model: "mistral-medium-latest",
          skeptic_model: "mistral-medium-latest",
        }),
      ],
    };
    const forward = proposalsFrom(tied);
    const backward = proposalsFrom({ ...tied, existing: [...tied.existing].reverse() });
    expect(backward.map((p) => p.nearest)).toEqual(forward.map((p) => p.nearest));
    expect(backward.map((p) => p.differsIn)).toEqual(forward.map((p) => p.differsIn));
  });

  it("does not merge two configurations whose slot values share a separator", () => {
    // A joined key would collide here: "a b" + sep + "c" equals "a" + sep +
    // "b c" for any single-character separator that can appear in a model name.
    const spaced: Vocabulary = {
      finderModels: ["gemini-a b", "gemini-a"],
      skepticModels: ["gemini-c", "gemini-b c"],
      contextModes: ["graph"],
      newestFingerprint: "newest",
      existing: [
        genome({ finder_model: "gemini-a b", skeptic_model: "gemini-c" }),
        genome({ finder_model: "gemini-a", skeptic_model: "gemini-b c" }),
      ],
    };
    // Four combinations, two already run — so two proposals, and neither of the
    // two existing ones may vanish into the other.
    expect(proposalsFrom(spaced)).toHaveLength(2);
  });

  it("orders by distance ascending", () => {
    const distances = proposalsFrom(vocab).map((p) => p.distance);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });

  it("does not propose a configuration already run on an older revision", () => {
    // The failure this catches: subtraction by identity would miss it, because
    // a candidate carries the newest revision while the identity that ran it
    // carries whichever was current then, so their hashes differ. It surfaced
    // only on the real corpus — the fixtures above give every genome the same
    // revision, so the case could not arise.
    const onOldRevisions: Vocabulary = {
      ...vocab,
      newestFingerprint: "revision-3",
      existing: [
        genome({ review_fingerprint: "revision-1" }),
        genome({
          review_fingerprint: "revision-2",
          finder_provider: "mistral",

          skeptic_provider: "mistral",
          finder_model: "mistral-medium-latest",
          skeptic_model: "mistral-medium-latest",
        }),
      ],
    };
    const proposals = proposalsFrom(onOldRevisions);

    // Still two — the same two as when everything shared a revision.
    expect(proposals).toHaveLength(2);
    // And nothing at distance 0, which is what an already-run configuration
    // dressed in a new revision would look like.
    for (const p of proposals) expect(p.distance).toBeGreaterThan(0);
  });

  it("omits a candidate no pair of parents can cover", () => {
    // One parent only: nothing can be recombined, so nothing is reachable even
    // though the vocabulary would enumerate four combinations.
    const lonely: Vocabulary = { ...vocab, existing: [genome({})] };
    expect(proposalsFrom(lonely)).toEqual([]);
  });
});
