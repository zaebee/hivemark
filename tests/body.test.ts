import { describe, expect, it } from "vitest";
import { bodyPlan } from "../src/body.js";
import { BODY_LENGTH_MM, MORPHOLOGY } from "../src/morphology.js";
import type { Genome } from "../src/types.js";

const genome: Genome = {
  schema_version: 1,
  known_fields: [
    "context_mode",
    "finder_model",
    "guardian_version",
    "provider",
    "skeptic_model",
  ],
  provider: "gemini",
  finder_model: "gemini-2.5-flash",
  skeptic_model: "gemini-3.5-flash",
  context_mode: "graph",
  guardian_version: "d0d807ef01c556b882dc85b9fc0d2851d92aa1e5",
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
        for (const guardian_version of versions)
          yield bodyPlan({ ...genome, finder_model, skeptic_model, context_mode, guardian_version });
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
      expect(plan.axis + plan.wing.offset + plan.wing.rx).toBeLessThanOrEqual(plan.width);
      if (plan.rearWing !== null) {
        expect(plan.axis + plan.rearWing.offset + plan.rearWing.rx).toBeLessThanOrEqual(plan.width);
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

  it("varies the head between identities and leaves the abdomen fixed", () => {
    // Not an aspiration: this is what today's published corpus supports, and
    // the spec records it in advance so the result cannot be reframed later.
    const a = bodyPlan(genome);
    const b = bodyPlan({ ...genome, finder_model: "mistral-medium-latest" });
    expect(a.head.ry).not.toBe(b.head.ry);
    expect(MORPHOLOGY.abdomenLength.range).toBeNull();
    expect(a.abdomen.ry).toBe(b.abdomen.ry);
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

  it("counts bands from the Guardian revision", () => {
    const a = bodyPlan(genome).bands;
    const b = bodyPlan({
      ...genome,
      guardian_version: "1ecd9629f46cab10b907dae285d0f58b0eef5e21",
    }).bands;
    expect(a).not.toBe(b);
  });
});
