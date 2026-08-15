import { describe, expect, it } from "vitest";
import { bodyPlan } from "../src/body.js";
import { BODY_LENGTH_MM, MORPHOLOGY } from "../src/morphology.js";
import type { Genome } from "../src/types.js";

const genome: Genome = {
  schema_version: 1,
  known_fields: [
    "context_mode",
    "finder_model",
    "review_fingerprint",
    "provider",
    "skeptic_model",
  ],
  finder_provider: "gemini",

  skeptic_provider: "gemini",
  finder_model: "gemini-2.5-flash",
  skeptic_model: "gemini-3.5-flash",
  context_mode: "graph",
  review_fingerprint: "d0d807ef01c556b882dc85b9fc0d2851d92aa1e5",
};

/**
 * Bodies across the whole trait space, not one fixture.
 *
 * The gap this closes has caught us before: a property is described in the
 * spec, listed in the plan, and then never exercised because the single fixture
 * made the case unreachable. The finder models are synthetic on purpose — the
 * head is driven by that slot, and five real names do not reach the ends of its
 * range.
 */
function* plans() {
  const finders = [
    "gemini-2.5-flash",
    "mistral-medium-latest",
    "qwen2.5-coder:7b",
    ...Array.from({ length: 40 }, (_, i) => `model-${i}`),
  ];
  const skeptics = [null, "gemini-3.5-flash", "mistral-medium-latest"];
  const modes = ["graph", "diff-only"] as const;
  const versions = [
    "d0d807ef01c556b882dc85b9fc0d2851d92aa1e5",
    "1ecd9629f46cab10b907dae285d0f58b0eef5e21",
    "0000000000000000000000000000000000000000",
  ];
  for (const finder_model of finders)
    for (const skeptic_model of skeptics)
      for (const context_mode of modes)
        for (const review_fingerprint of versions)
          yield bodyPlan({ ...genome, finder_model, skeptic_model, context_mode, review_fingerprint });
}

describe("bodyPlan scales", () => {
  it("doubles every dimension when the unit doubles", () => {
    // The property a table of coordinates cannot have: one number governs the
    // whole figure, so nothing can drift out of proportion with the rest.
    const small = bodyPlan(genome, 10);
    const large = bodyPlan(genome, 20);

    expect(large.width).toBeCloseTo(small.width * 2, 6);
    expect(large.height).toBeCloseTo(small.height * 2, 6);
    expect(large.head.cy).toBeCloseTo(small.head.cy * 2, 6);
    expect(large.head.rx).toBeCloseTo(small.head.rx * 2, 6);
    expect(large.abdomen.cy).toBeCloseTo(small.abdomen.cy * 2, 6);
    expect(large.wing.cy).toBeCloseTo(small.wing.cy * 2, 6);
    expect(large.eye.dx).toBeCloseTo(small.eye.dx * 2, 6);
    expect(large.stinger!.to).toBeCloseTo(small.stinger!.to * 2, 6);
  });

  it("is deterministic for one genome", () => {
    expect(bodyPlan(genome)).toEqual(bodyPlan({ ...genome }));
  });
});

describe("the segments form one body, across the whole trait space", () => {
  it("joins head to thorax with an overlap, not a gap", () => {
    for (const plan of plans()) {
      expect(plan.thorax.cy - plan.thorax.ry).toBeLessThan(plan.head.cy + plan.head.ry);
    }
  });

  it("joins thorax to abdomen with an overlap, not a gap", () => {
    for (const plan of plans()) {
      expect(plan.abdomen.cy - plan.abdomen.ry).toBeLessThan(plan.thorax.cy + plan.thorax.ry);
    }
  });

  it("runs the segments top to bottom in order", () => {
    for (const plan of plans()) {
      expect(plan.head.cy).toBeLessThan(plan.thorax.cy);
      expect(plan.thorax.cy).toBeLessThan(plan.abdomen.cy);
    }
  });

  it("starts the stinger inside the abdomen so it is not a spike resting on it", () => {
    for (const plan of plans()) {
      if (plan.stinger === null) continue;
      const abdomenBottom = plan.abdomen.cy + plan.abdomen.ry;
      expect(plan.stinger.from).toBeLessThan(abdomenBottom);
      expect(plan.stinger.to).toBeGreaterThan(abdomenBottom);
    }
  });

  it("attaches the wings to the thorax, not to empty space", () => {
    for (const plan of plans()) {
      expect(plan.wing.cy).toBeGreaterThan(plan.thorax.cy - plan.thorax.ry);
      expect(plan.wing.cy).toBeLessThan(plan.thorax.cy + plan.thorax.ry);
    }
  });

  it("keeps the eyes on the head", () => {
    for (const plan of plans()) {
      expect(plan.eye.dx + plan.eye.rx).toBeLessThanOrEqual(plan.head.rx);
      expect(Math.abs(plan.eye.cy - plan.head.cy) + plan.eye.ry).toBeLessThanOrEqual(plan.head.ry);
    }
  });
});

describe("the canvas follows the body", () => {
  it("contains the whole figure, including antennae and wings", () => {
    for (const plan of plans()) {
      expect(plan.antenna.toY - plan.antenna.tip).toBeGreaterThanOrEqual(0);
      expect(plan.abdomen.cy + plan.abdomen.ry).toBeLessThanOrEqual(plan.height);
      if (plan.stinger !== null) expect(plan.stinger.to).toBeLessThanOrEqual(plan.height);
      expect(plan.axis + plan.abdomen.rx).toBeLessThanOrEqual(plan.width);
      // Both axes, for both pairs. Checking wings horizontally alone let a probe
      // drop the rear pair 900 units below a 300-unit canvas with every test
      // still green, while this test's name promised it contained them.
      for (const pair of [plan.wing, plan.rearWing]) {
        if (pair === null) continue;
        expect(plan.axis + pair.offset + pair.rx).toBeLessThanOrEqual(plan.width);
        expect(pair.cy - pair.ry).toBeGreaterThanOrEqual(0);
        expect(pair.cy + pair.ry).toBeLessThanOrEqual(plan.height);
      }
      expect(plan.axis + plan.antenna.spread + plan.antenna.tip).toBeLessThanOrEqual(plan.width);
    }
  });

  it("is shorter for a bee with no stinger", () => {
    // A fixed viewBox would have left the same empty space below either way.
    const withSting = bodyPlan(genome);
    const without = bodyPlan({ ...genome, skeptic_model: null });
    expect(without.height).toBeLessThan(withSting.height);
  });
});

describe("the body is the measured animal", () => {
  it("draws the head wider than tall, as measured", () => {
    // A circle was the drawing's habit; the measurement says otherwise.
    const plan = bodyPlan(genome);
    expect(plan.head.rx).toBeGreaterThan(plan.head.ry);
  });

  it("keeps the drawn segments summing to a published body length", () => {
    for (const plan of plans()) {
      const total = (2 * plan.head.ry + 2 * plan.thorax.ry + 2 * plan.abdomen.ry) / plan.unit;
      expect(total).toBeGreaterThanOrEqual(BODY_LENGTH_MM[0]);
      expect(total).toBeLessThanOrEqual(BODY_LENGTH_MM[1]);
    }
  });

  it("varies every region, each from the slot that builds it", () => {
    // The payoff, and it only became true when a second measurement of thorax
    // and abdomen was read: all four regions move, and each moves alone. An
    // earlier version of this test asserted the opposite for the abdomen — that
    // was the honest state of the literature at the time, not a target.
    const base = bodyPlan(genome);
    const cases = [
      ["head", { finder_model: "mistral-medium-latest" }, (p: typeof base) => p.head.ry],
      ["thorax", { review_fingerprint: "1ecd9629f46cab10b907dae285d0f58b0eef5e21" }, (p: typeof base) => p.thorax.ry],
      ["abdomen", { skeptic_model: "mistral-medium-latest" }, (p: typeof base) => p.abdomen.ry],
      ["wing", { context_mode: "diff-only" as const }, (p: typeof base) => p.wing.rx],
    ] as const;

    for (const [region, change, read] of cases) {
      const moved = bodyPlan({ ...genome, ...change });
      expect(read(moved), `${region} should follow its own slot`).not.toBe(read(base));
    }
    // And no character is left without a published range to move within.
    for (const name of Object.keys(MORPHOLOGY) as (keyof typeof MORPHOLOGY)[]) {
      expect(MORPHOLOGY[name].range, `${name} has no range`).not.toBeNull();
    }
  });
});

describe("traits reach the plan and nothing else does", () => {
  it("gives a graph reviewer a rear wing pair and diff-only none", () => {
    expect(bodyPlan(genome).rearWing).not.toBeNull();
    expect(bodyPlan({ ...genome, context_mode: "diff-only" }).rearWing).toBeNull();
  });

  it("drops the stinger when no skeptic judged the findings", () => {
    expect(bodyPlan({ ...genome, skeptic_model: null }).stinger).toBeNull();
  });

  it("keeps the generation marker visible for any revision string", () => {
    // A sha is hex by contract, but the field is typed as a string and the plate
    // and breeding both build genomes by hand. parseInt accepts a leading sign,
    // and JS keeps the sign through %, so "-2abc" produced zero bands — the
    // generation marker silently gone from the abdomen, past a NaN guard written
    // to catch exactly this kind of input.
    for (const version of ["-2abc", "-1abc", "+5abc", "", "zz", "0", "ffff"]) {
      const bands = bodyPlan({ ...genome, review_fingerprint: version }).bands;
      expect(bands, `"${version}" should still band the abdomen`).toBeGreaterThanOrEqual(1);
    }
  });

  it("counts bands from the Guardian revision", () => {
    const a = bodyPlan(genome).bands;
    const b = bodyPlan({
      ...genome,
      review_fingerprint: "1ecd9629f46cab10b907dae285d0f58b0eef5e21",
    }).bands;
    expect(a).not.toBe(b);
  });
});
