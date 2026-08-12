import { describe, expect, it } from "vitest";
import { loadSigner } from "../src/attest/signer.js";

// A well-known test key; never used for anything real.
const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

describe("loadSigner", () => {
  it("returns null when no key is configured", () => {
    expect(loadSigner({})).toBeNull();
    expect(loadSigner({ HIVEMARK_SIGNING_KEY: "" })).toBeNull();
    expect(loadSigner({ HIVEMARK_SIGNING_KEY: "   " })).toBeNull();
  });

  it("loads a valid key and exposes its address", () => {
    const signer = loadSigner({ HIVEMARK_SIGNING_KEY: KEY });
    expect(signer).not.toBeNull();
    expect(signer!.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("tolerates the trailing newline that echo leaves in a secret", () => {
    const withNewline = loadSigner({ HIVEMARK_SIGNING_KEY: `${KEY}\n` });
    expect(withNewline!.address).toBe(loadSigner({ HIVEMARK_SIGNING_KEY: KEY })!.address);
  });

  it("refuses the all-zero key rather than signing with it", () => {
    expect(() => loadSigner({ HIVEMARK_SIGNING_KEY: `0x${"00".repeat(32)}` })).toThrow(
      /unusable signing key/i,
    );
  });

  it("refuses a malformed key loudly", () => {
    expect(() => loadSigner({ HIVEMARK_SIGNING_KEY: "0xnot-a-key" })).toThrow(
      /unusable signing key/i,
    );
  });
});
