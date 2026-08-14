import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { harvest } from "../src/harvest.js";
import { corpusSpan, planBirths } from "../src/birth/plan.js";
import { identityId } from "../src/identity.js";
import { genomeOf } from "../src/genome.js";
import type { BirthRecord } from "../src/birth/ledger.js";

const records = harvest(
  readFileSync("tests/fixtures/martian-reviews.sample.jsonl", "utf8"),
).records;

describe("planBirths", () => {
  it("names every identity in the corpus when none are announced", () => {
    const plans = planBirths(records, []);
    const distinct = new Set(records.map((r) => identityId(genomeOf(r))));
    expect(plans).toHaveLength(distinct.size);
    expect(plans.length).toBeGreaterThan(1);
  });

  it("skips identities that already have a birth record", () => {
    const first = identityId(genomeOf(records[0]!));
    const existing = [{ identity_id: first } as BirthRecord];
    const plans = planBirths(records, existing);
    expect(plans.some((p) => p.identity_id === first)).toBe(false);
    expect(plans).toHaveLength(planBirths(records, []).length - 1);
  });

  it("dates each identity by its earliest review, not by the run", () => {
    for (const plan of planBirths(records, [])) {
      const own = records
        .filter((r) => identityId(genomeOf(r)) === plan.identity_id)
        .map((r) => Math.floor(Date.parse(r.reviewed_at) / 1000));
      expect(plan.firstSeen).toBe(Math.min(...own));
    }
  });

  it("publishes a genome that recomputes to the identity it claims", () => {
    for (const plan of planBirths(records, [])) {
      expect(identityId(plan.genome)).toBe(plan.identity_id);
    }
  });

  it("is ordered deterministically, so two runs propose the same sequence", () => {
    expect(planBirths(records, []).map((p) => p.identity_id)).toEqual(
      planBirths([...records].reverse(), []).map((p) => p.identity_id),
    );
  });

  it("dates an identity the same whichever order its reviews arrive in", () => {
    // The earliest review must win regardless of which one is seen first.
    const forward = planBirths(records, []);
    const backward = planBirths([...records].reverse(), []);
    for (const plan of forward) {
      const other = backward.find((p) => p.identity_id === plan.identity_id)!;
      expect(other.firstSeen).toBe(plan.firstSeen);
    }
  });
});

describe("corpus edge, because a birth date cannot be revised", () => {
  const at = (iso: string): number => Math.floor(Date.parse(iso) / 1000);

  it("flags the identity whose first review is the corpus's first", () => {
    const plans = planBirths(records, []);
    const earliest = Math.min(...plans.map((p) => p.firstSeen));
    const flagged = plans.filter((p) => p.atCorpusEdge);

    // Exactly the ones sitting on the boundary, and nothing else. An identity
    // with reviews on both sides of it has evidence the file is not cutting it
    // off; one on the edge has none.
    expect(flagged.map((p) => p.firstSeen)).toEqual(flagged.map(() => earliest));
    expect(flagged.length).toBeGreaterThan(0);
  });

  it("does not flag an identity first seen inside the corpus", () => {
    const plans = planBirths(records, []);
    const inside = plans.filter((p) => !p.atCorpusEdge);
    const earliest = Math.min(...plans.map((p) => p.firstSeen));
    // Without this the test passes vacuously when everything is flagged: the
    // filter empties and the loop below never runs.
    expect(inside.length).toBeGreaterThan(0);
    for (const plan of inside) expect(plan.firstSeen).toBeGreaterThan(earliest);
  });

  it("reports the span the dates were drawn from", () => {
    const span = corpusSpan(records);
    expect(span).not.toBeNull();
    expect(span!.records).toBe(records.length);
    expect(span!.earliest).toBeLessThanOrEqual(span!.latest);
    expect(span!.earliest).toBe(
      Math.min(...records.map((r) => at(r.reviewed_at))),
    );
  });

  it("has no span for an empty corpus, rather than an invented one", () => {
    // Math.min() of nothing is Infinity, which would print as a date in 1970 or
    // worse — a boundary that looks measured and is not.
    expect(corpusSpan([])).toBeNull();
  });
});

describe("corpusSpan on a corpus larger than a spread call allows", () => {
  // 200,000 is above Node's argument limit for `Math.min(...array)`, measured at
  // between 125,000 and 130,000 on v22. This test fails with RangeError against
  // the spread implementation, which is the only reason it earns its runtime.
  const many = Array.from({ length: 200_000 }, (_, i) => ({
    reviewed_at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
  })) as never;

  it("computes a span without exceeding the call stack", () => {
    const span = corpusSpan(many);
    expect(span!.records).toBe(200_000);
    expect(span!.earliest).toBe(Date.UTC(2026, 0, 1) / 1000);
    expect(span!.latest).toBe(Date.UTC(2026, 0, 1) / 1000 + 199_999);
  });
});
