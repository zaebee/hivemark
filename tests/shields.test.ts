import { describe, expect, it } from "vitest";
import { shieldsEndpoint } from "../src/publish/shields.js";
import type { TrackRecord } from "../src/types.js";

function track(over: Partial<TrackRecord["skeptic"]>): TrackRecord {
  return {
    identity_id: `0x${"11".repeat(32)}`,
    owner_address: "0x0000000000000000000000000000000000000001",
    genome: {
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
      guardian_version: "d0d807ef",
    },
    reviews: 10,
    claims: 20,
    corpus: [["cal_dot_com", 10]],
    skeptic: { confirmed: 15, refuted: 3, uncertain: 2, unresolved: 0, mean_impact: 4.1, ...over },
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

  it("names the reviewer by provider and context mode", () => {
    expect(shieldsEndpoint(track({})).label).toBe("gemini · graph");
  });
});
