import { describe, expect, it } from "vitest";
import { isAddress } from "viem";
import { identityId, ownerAddress } from "../src/identity.js";
import type { Genome } from "../src/types.js";

const base: Genome = {
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
  review_fingerprint: "d0d807ef01c5",
};

describe("identityId", () => {
  it("is stable for the same genome", () => {
    expect(identityId(base)).toBe(identityId({ ...base }));
  });

  it("changes when any field changes", () => {
    const id = identityId(base);
    expect(identityId({ ...base, context_mode: "diff-only" })).not.toBe(id);
    expect(identityId({ ...base, skeptic_model: null })).not.toBe(id);
    expect(identityId({ ...base, review_fingerprint: "1ecd9629f46c" })).not.toBe(id);
    expect(identityId({ ...base, schema_version: 2 })).not.toBe(id);
  });

  it("distinguishes a null field from a string that looks like one", () => {
    const withNull = identityId({ ...base, skeptic_model: null });
    const withValue = identityId({ ...base, skeptic_model: "none" });
    expect(withNull).not.toBe(withValue);
  });

  it("is a 32-byte hex string", () => {
    expect(identityId(base)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("ownerAddress", () => {
  it("derives a valid checksummed address", () => {
    expect(isAddress(ownerAddress(identityId(base)))).toBe(true);
  });

  it("is deterministic", () => {
    expect(ownerAddress(identityId(base))).toBe(ownerAddress(identityId(base)));
  });

  it("differs for different identities", () => {
    const a = ownerAddress(identityId(base));
    const b = ownerAddress(identityId({ ...base, context_mode: "diff-only" }));
    expect(a).not.toBe(b);
  });
});
