import { describe, expect, it } from "vitest";
import { SIGNING_DOMAIN } from "../src/attest/domain.js";

describe("SIGNING_DOMAIN", () => {
  it("is Base mainnet", () => {
    expect(SIGNING_DOMAIN.chainId).toBe(8453n);
  });

  it("names the EAS contract deployed there", () => {
    expect(SIGNING_DOMAIN.address).toBe("0x4200000000000000000000000000000000000021");
  });

  it("carries the contract's own version string", () => {
    expect(SIGNING_DOMAIN.version).toBe("1.0.1");
  });

  it("is frozen — every signature ever made covers these values", () => {
    expect(Object.isFrozen(SIGNING_DOMAIN)).toBe(true);
  });
});
