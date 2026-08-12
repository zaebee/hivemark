import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { harvest } from "../src/harvest.js";
import { planBirths } from "../src/birth/plan.js";
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
    expect(plans.length).toBe(distinct.size);
    expect(plans.length).toBeGreaterThan(1);
  });

  it("skips identities that already have a birth record", () => {
    const first = identityId(genomeOf(records[0]!));
    const existing = [{ identity_id: first } as BirthRecord];
    const plans = planBirths(records, existing);
    expect(plans.some((p) => p.identity_id === first)).toBe(false);
    expect(plans.length).toBe(planBirths(records, []).length - 1);
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
