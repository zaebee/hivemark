import { describe, expect, it } from "vitest";
import { bodyPlan } from "../src/body.js";
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

describe("bodyPlan scales", () => {
  it("doubles every dimension when the unit doubles", () => {
    // The property a table of coordinates cannot have: one number governs the
    // whole figure, so nothing can drift out of proportion with the rest.
    const small = bodyPlan(genome, 10);
    const large = bodyPlan(genome, 20);

    expect(large.width).toBeCloseTo(small.width * 2, 6);
    expect(large.height).toBeCloseTo(small.height * 2, 6);
    expect(large.head.cy).toBeCloseTo(small.head.cy * 2, 6);
    expect(large.abdomen.cy).toBeCloseTo(small.abdomen.cy * 2, 6);
    expect(large.wing.cy).toBeCloseTo(small.wing.cy * 2, 6);
    expect(large.stinger!.to).toBeCloseTo(small.stinger!.to * 2, 6);
  });

  it("is deterministic for one genome", () => {
    expect(bodyPlan(genome)).toEqual(bodyPlan({ ...genome }));
  });
});

describe("the segments form one body", () => {
  it("joins head to thorax with an overlap, not a gap", () => {
    const plan = bodyPlan(genome);
    const headBottom = plan.head.cy + plan.head.r;
    const thoraxTop = plan.thorax.cy - plan.thorax.ry;
    expect(thoraxTop).toBeLessThan(headBottom);
  });

  it("joins thorax to abdomen with an overlap, not a gap", () => {
    const plan = bodyPlan(genome);
    const thoraxBottom = plan.thorax.cy + plan.thorax.ry;
    const abdomenTop = plan.abdomen.cy - plan.abdomen.ry;
    expect(abdomenTop).toBeLessThan(thoraxBottom);
  });

  it("runs the segments top to bottom in order", () => {
    const plan = bodyPlan(genome);
    expect(plan.head.cy).toBeLessThan(plan.thorax.cy);
    expect(plan.thorax.cy).toBeLessThan(plan.abdomen.cy);
  });

  it("starts the stinger inside the abdomen so it is not a spike resting on it", () => {
    const plan = bodyPlan(genome);
    const abdomenBottom = plan.abdomen.cy + plan.abdomen.ry;
    expect(plan.stinger!.from).toBeLessThan(abdomenBottom);
    expect(plan.stinger!.to).toBeGreaterThan(abdomenBottom);
  });

  it("attaches the wings to the thorax, not to empty space", () => {
    const plan = bodyPlan(genome);
    expect(plan.wing.cy).toBeGreaterThan(plan.thorax.cy - plan.thorax.ry);
    expect(plan.wing.cy).toBeLessThan(plan.thorax.cy + plan.thorax.ry);
  });
});

describe("the canvas follows the body", () => {
  it("contains the whole figure, including the antennae", () => {
    const plan = bodyPlan(genome);
    expect(plan.antenna.toY).toBeGreaterThanOrEqual(0);
    expect(plan.stinger!.to).toBeLessThanOrEqual(plan.height);
    expect(plan.axis + plan.abdomen.rx).toBeLessThanOrEqual(plan.width);
    expect(plan.axis + plan.wing.reach + plan.wing.rx).toBeLessThanOrEqual(plan.width);
  });

  it("is shorter for a bee with no stinger", () => {
    // A fixed viewBox would have left the same empty space below either way.
    const withSting = bodyPlan(genome);
    const without = bodyPlan({ ...genome, skeptic_model: null });
    expect(without.height).toBeLessThan(withSting.height);
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
    const b = bodyPlan({ ...genome, guardian_version: "1ecd9629f46cab10b907dae285d0f58b0eef5e21" }).bands;
    expect(a).not.toBe(b);
  });
});
