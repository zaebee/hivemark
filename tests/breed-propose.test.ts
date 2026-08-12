import { describe, expect, it } from "vitest";
import { proposalsFrom } from "../src/breed/propose.js";
import { identityId } from "../src/identity.js";
import type { Vocabulary } from "../src/breed/vocabulary.js";
import type { Genome } from "../src/types.js";

const KNOWN = [
  "context_mode",
  "finder_model",
  "guardian_version",
  "provider",
  "skeptic_model",
] as const;

const genome = (over: Partial<Genome>): Genome => ({
  schema_version: 1,
  known_fields: KNOWN,
  provider: "gemini",
  finder_model: "gemini-2.5-flash",
  skeptic_model: "gemini-3.5-flash",
  context_mode: "graph",
  guardian_version: "newest",
  ...over,
});

/** Two reviewers, one gemini pair and one mistral pair, both graph. */
const vocab: Vocabulary = {
  finderModels: ["gemini-2.5-flash", "mistral-medium-latest"],
  skepticModels: ["gemini-3.5-flash", "mistral-medium-latest"],
  contextModes: ["graph"],
  newestGuardian: "newest",
  existing: [
    genome({}),
    genome({
      provider: "mistral",
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
    for (const p of proposalsFrom(vocab)) expect(p.genome.guardian_version).toBe("newest");
  });

  it("derives provider from the finder rather than carrying it", () => {
    for (const p of proposalsFrom(vocab)) {
      const expected = p.genome.finder_model.startsWith("mistral") ? "mistral" : "gemini";
      expect(p.genome.provider).toBe(expected);
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

  it("is deterministic in content and order", () => {
    const once = proposalsFrom(vocab).map((p) => p.identity_id);
    const twice = proposalsFrom({ ...vocab, existing: [...vocab.existing].reverse() }).map(
      (p) => p.identity_id,
    );
    expect(twice).toEqual(once);
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
      newestGuardian: "revision-3",
      existing: [
        genome({ guardian_version: "revision-1" }),
        genome({
          guardian_version: "revision-2",
          provider: "mistral",
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
