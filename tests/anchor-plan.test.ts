import { describe, expect, it } from "vitest";
import { periodId } from "../src/anchor/period.js";
import { planAnchor } from "../src/anchor/plan.js";
import type { AnchorRecord } from "../src/anchor/ledger.js";
import type { AttestationEnvelope } from "../src/attest/attest.js";

/**
 * Only the two fields `planAnchor` reads are populated. A full envelope would
 * need a real signature, which this function neither checks nor should.
 */
const envelope = (uid: string, time: string): AttestationEnvelope =>
  ({
    envelope_version: 1,
    domain: { address: "0x42", chainId: "8453", version: "1.0.1" },
    signer: "0xsigner",
    identity_id: `0x${"11".repeat(32)}`,
    claim_hash: `0x${"22".repeat(32)}`,
    attestation: {
      uid,
      message: { time: String(Math.floor(new Date(time).getTime() / 1000)) },
    },
  }) as unknown as AttestationEnvelope;

const W33 = "2026-08-12T11:00:00Z";
const W34 = "2026-08-19T11:00:00Z";

describe("planAnchor", () => {
  it("covers exactly the attestations whose time falls in the period", () => {
    const envelopes = [
      envelope(`0x${"aa".repeat(32)}`, W33),
      envelope(`0x${"bb".repeat(32)}`, W33),
      envelope(`0x${"cc".repeat(32)}`, W34),
    ];
    const plan = planAnchor(envelopes, [], periodId("2026-W33"))!;
    expect(plan.count).toBe(2);
    expect(plan.uids).toEqual([`0x${"aa".repeat(32)}`, `0x${"bb".repeat(32)}`]);
  });

  it("returns null for a period with no attestations, rather than an empty root", () => {
    expect(planAnchor([envelope(`0x${"cc".repeat(32)}`, W34)], [], periodId("2026-W33"))).toBeNull();
  });

  it("refuses a period that is already anchored", () => {
    const records = [{ period: "2026-W33" } as AnchorRecord];
    expect(() => planAnchor([envelope(`0x${"aa".repeat(32)}`, W33)], records, periodId("2026-W33"))).toThrow(
      /already anchored/i,
    );
  });

  it("orders uids deterministically, so the root does not depend on input order", () => {
    const a = envelope(`0x${"aa".repeat(32)}`, W33);
    const b = envelope(`0x${"bb".repeat(32)}`, W33);
    expect(planAnchor([a, b], [], periodId("2026-W33"))!.root).toBe(planAnchor([b, a], [], periodId("2026-W33"))!.root);
  });

  it("counts a repeated uid once, so the anchor cannot overstate its coverage", () => {
    // Two byte-identical findings in one review would sign to the same uid,
    // since the salt and the time both derive from the claim.
    const same = `0x${"aa".repeat(32)}`;
    const plan = planAnchor(
      [envelope(same, W33), envelope(same, W33), envelope(`0x${"bb".repeat(32)}`, W33)],
      [],
      periodId("2026-W33"),
    )!;
    expect(plan.count).toBe(2);
    expect(plan.uids).toEqual([same, `0x${"bb".repeat(32)}`]);
  });

  it("reports the period's own bounds, not the range of its attestations", () => {
    const plan = planAnchor([envelope(`0x${"aa".repeat(32)}`, W33)], [], periodId("2026-W33"))!;
    expect(plan.periodEnd - plan.periodStart).toBe(7 * 24 * 60 * 60);
  });
});
