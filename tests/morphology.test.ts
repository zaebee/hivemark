import { describe, expect, it } from "vitest";
import { BODY_LENGTH_MM, MORPHOLOGY, SOURCES, type CharacterName } from "../src/morphology.js";

const names = Object.keys(MORPHOLOGY) as CharacterName[];

describe("every number is attributable", () => {
  it("cites at least one published source per character", () => {
    for (const name of names) {
      expect(MORPHOLOGY[name].sources.length).toBeGreaterThan(0);
    }
  });

  it("resolves every source key to a full citation", () => {
    for (const name of names) {
      for (const key of MORPHOLOGY[name].sources) {
        expect(SOURCES[key]).toBeTypeOf("string");
        expect(SOURCES[key]!.length).toBeGreaterThan(40);
      }
    }
  });
});

describe("a character varies only when the literature disagrees", () => {
  it("gives a range exactly to the characters with two or more sources", () => {
    // The rule the whole design rests on: one measurement is a value, not a
    // range. A range invented from a single paper would be taste wearing a
    // citation.
    for (const name of names) {
      const { range, sources } = MORPHOLOGY[name];
      expect(range === null).toBe(sources.length < 2);
    }
  });

  it("orders every range and contains the primary mean inside it", () => {
    for (const name of names) {
      const { range, mm } = MORPHOLOGY[name];
      if (range === null) continue;
      const [low, high] = range;
      expect(low).toBeLessThan(high);
      expect(mm).toBeGreaterThanOrEqual(low);
      expect(mm).toBeLessThanOrEqual(high);
    }
  });
});

describe("the model is still an animal", () => {
  it("sums the segment lengths into the published body length", () => {
    // A cheap standing check: three characters measured separately must still
    // add up to a bee. If a future edit drifts, this fails.
    const total =
      MORPHOLOGY.headHeight.mm + MORPHOLOGY.thoraxLength.mm + MORPHOLOGY.abdomenLength.mm;
    expect(total).toBeGreaterThanOrEqual(BODY_LENGTH_MM[0]);
    expect(total).toBeLessThanOrEqual(BODY_LENGTH_MM[1]);
  });

  it("stays a bee at the longest each segment is published to be", () => {
    // The sum must survive its own extremes, not only its central values —
    // otherwise the bound holds for the one bee nobody varies.
    const longest = (name: CharacterName) => MORPHOLOGY[name].range?.[1] ?? MORPHOLOGY[name].mm;
    const total = longest("headHeight") + longest("thoraxLength") + longest("abdomenLength");
    expect(total).toBeLessThanOrEqual(BODY_LENGTH_MM[1]);
  });
});
