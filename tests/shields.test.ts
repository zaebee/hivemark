import { describe, expect, it } from "vitest";
import { shieldsEndpoint } from "../src/publish/shields.js";
import type { TrackRecord } from "../src/types.js";

function track(over: Partial<TrackRecord["skeptic"]>): TrackRecord {
  return {
    identity_id: `0x${"11".repeat(32)}`,
    owner_address: "0x0000000000000000000000000000000000000001",
    genome: {
      schema_version: 1,
      known_fields: ["context_mode", "finder_model", "finder_provider", "review_fingerprint", "skeptic_model", "skeptic_provider"],
      finder_provider: "gemini",

      skeptic_provider: "gemini",
      finder_model: "gemini-2.5-flash",
      skeptic_model: "gemini-3.5-flash",
      context_mode: "graph",
      review_fingerprint: "d0d807ef",
    },
    reviews: 10,
    claims: 20,
    corpus: [["cal_dot_com", 10]],
    skeptic: { judge: "independent", confirmed: 15, refuted: 3, uncertain: 2, unresolved: 0, mean_impact: 4.1, ...over },
    human: { available: false },
  };
}

describe("shieldsEndpoint", () => {
  it("uses the shields endpoint contract", () => {
    expect(shieldsEndpoint(track({})).schemaVersion).toBe(1);
  });

  it("reports confirmed out of resolved, not out of all claims", () => {
    // 15 confirmed + 3 refuted + 2 uncertain = 20 resolved; 15/20 = 75%
    expect(shieldsEndpoint(track({})).message).toBe("75% confirmed (20 resolved)");
  });

  it("excludes unresolved from the denominator", () => {
    // 100 unresolved claims must not move the rate at all
    expect(shieldsEndpoint(track({ unresolved: 100 })).message).toBe(
      "75% confirmed (20 resolved)",
    );
  });

  it("says 'no data' rather than 0% when nothing is resolved", () => {
    const endpoint = shieldsEndpoint(
      track({ confirmed: 0, refuted: 0, uncertain: 0, unresolved: 5 }),
    );
    expect(endpoint.message).toBe("no data");
    expect(endpoint.color).toBe("lightgrey");
  });

  it("names the reviewer by finder_provider and context mode", () => {
    expect(shieldsEndpoint(track({})).label).toBe("gemini · graph");
  });
});

describe("a self-graded identity", () => {
  it("says self-graded rather than confirmed", () => {
    const badge = shieldsEndpoint(track({ judge: "self" }));
    expect(badge.message).toMatch(/self-graded/);
    expect(badge.message).not.toMatch(/confirmed/);
  });

  it("is denied the colour scale, however high the rate", () => {
    // 95% would be brightgreen for an independently judged identity. Colour is
    // what a reader takes in at a glance, so green over a number the finder
    // awarded itself asserts a quality this measurement cannot support.
    const high = { confirmed: 19, refuted: 1, uncertain: 0, unresolved: 0 };
    expect(shieldsEndpoint(track({ judge: "self", ...high })).message).toMatch(/95% self-graded/);
    expect(shieldsEndpoint(track({ judge: "self", ...high })).color).toBe("lightgrey");
    expect(shieldsEndpoint(track({ judge: "self" })).color).toBe("lightgrey");
  });

  it("still colours an independently judged identity by its rate", () => {
    // Without this the test above passes against an implementation returning
    // lightgrey for everything.
    const high = { confirmed: 19, refuted: 1, uncertain: 0, unresolved: 0 };
    const badge = shieldsEndpoint(track({ judge: "independent", ...high }));
    expect(badge.color).toBe("brightgreen");
    expect(badge.message).toMatch(/95% confirmed/);
  });

  it("does not call an unjudged corpus self-graded", () => {
    // `nobody` means no skeptic ran. Collapsing it into `self` would report an
    // unjudged corpus as a self-judged one.
    const none = shieldsEndpoint(
      track({ judge: "nobody", confirmed: 0, refuted: 0, uncertain: 0, unresolved: 20 }),
    );
    expect(none.message).toBe("no data");
    expect(none.message).not.toMatch(/self-graded/);
  });
});
