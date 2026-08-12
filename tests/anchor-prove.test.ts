import { describe, expect, it } from "vitest";
import { proveInclusion, checkInclusion } from "../src/anchor/prove.js";
import { rootOf } from "../src/anchor/tree.js";
import type { AnchorRecord } from "../src/anchor/ledger.js";

const UIDS = [`0x${"11".repeat(32)}`, `0x${"22".repeat(32)}`, `0x${"33".repeat(32)}`] as const;

const records: AnchorRecord[] = [
  {
    period: "2026-W33",
    root: rootOf(UIDS),
    count: 3,
    uids: [...UIDS],
    tx_hash: `0x${"cd".repeat(32)}`,
    attestation_uid: `0x${"ef".repeat(32)}`,
    anchored_at: "2026-08-17T09:00:00+00:00",
  },
];

describe("proveInclusion", () => {
  it("produces a proof that checks out", () => {
    const proof = proveInclusion(records, UIDS[1])!;
    expect(checkInclusion(proof)).toBe(true);
  });

  it("names the anchor the proof should be checked against", () => {
    const proof = proveInclusion(records, UIDS[1])!;
    expect(proof.period).toBe("2026-W33");
    expect(proof.attestation_uid).toBe(records[0]!.attestation_uid);
  });

  it("returns null for an attestation no anchor covers", () => {
    expect(proveInclusion(records, `0x${"99".repeat(32)}`)).toBeNull();
  });

  it("rejects a proof whose root was swapped", () => {
    const proof = proveInclusion(records, UIDS[1])!;
    expect(checkInclusion({ ...proof, root: `0x${"00".repeat(32)}` })).toBe(false);
  });

  it("rejects a proof re-pointed at a different uid", () => {
    const proof = proveInclusion(records, UIDS[1])!;
    expect(checkInclusion({ ...proof, uid: UIDS[2] })).toBe(false);
  });
});
