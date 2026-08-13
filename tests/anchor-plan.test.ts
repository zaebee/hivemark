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

/**
 * The instant 2026-W33 closes.
 *
 * Every call below passes it. Before the guard existed these tests read the
 * machine clock through the default parameter, so they passed today and would
 * have behaved differently after 17 August — a suite that quietly changes
 * meaning with the date is not a suite.
 */
const CLOSED = Date.UTC(2026, 7, 17) / 1000;

describe("planAnchor", () => {
  it("covers exactly the attestations whose time falls in the period", () => {
    const envelopes = [
      envelope(`0x${"aa".repeat(32)}`, W33),
      envelope(`0x${"bb".repeat(32)}`, W33),
      envelope(`0x${"cc".repeat(32)}`, W34),
    ];
    const plan = planAnchor(envelopes, [], periodId("2026-W33"), CLOSED)!;
    expect(plan.count).toBe(2);
    expect(plan.uids).toEqual([`0x${"aa".repeat(32)}`, `0x${"bb".repeat(32)}`]);
  });

  it("returns null for a period with no attestations, rather than an empty root", () => {
    expect(planAnchor([envelope(`0x${"cc".repeat(32)}`, W34)], [], periodId("2026-W33"), CLOSED)).toBeNull();
  });

  it("refuses a period that is already anchored", () => {
    const records = [{ period: "2026-W33" } as AnchorRecord];
    expect(() => planAnchor([envelope(`0x${"aa".repeat(32)}`, W33)], records, periodId("2026-W33"), CLOSED)).toThrow(
      /already anchored/i,
    );
  });

  it("orders uids deterministically, so the root does not depend on input order", () => {
    const a = envelope(`0x${"aa".repeat(32)}`, W33);
    const b = envelope(`0x${"bb".repeat(32)}`, W33);
    expect(planAnchor([a, b], [], periodId("2026-W33"), CLOSED)!.root).toBe(planAnchor([b, a], [], periodId("2026-W33"), CLOSED)!.root);
  });

  it("counts a repeated uid once, so the anchor cannot overstate its coverage", () => {
    // Two byte-identical findings in one review would sign to the same uid,
    // since the salt and the time both derive from the claim.
    const same = `0x${"aa".repeat(32)}`;
    const plan = planAnchor(
      [envelope(same, W33), envelope(same, W33), envelope(`0x${"bb".repeat(32)}`, W33)],
      [],
      periodId("2026-W33"),
      CLOSED,
    )!;
    expect(plan.count).toBe(2);
    expect(plan.uids).toEqual([same, `0x${"bb".repeat(32)}`]);
  });

  it("reports the period's own bounds, not the range of its attestations", () => {
    const plan = planAnchor([envelope(`0x${"aa".repeat(32)}`, W33)], [], periodId("2026-W33"), CLOSED)!;
    expect(plan.periodEnd - plan.periodStart).toBe(7 * 24 * 60 * 60);
  });

  describe("a week still running cannot be anchored", () => {
    // One anchor per period is enforced, so anchoring an open week is a one-way
    // door: every review made in the days remaining falls into a week that can
    // never be anchored again. Worse than a missed week, which at least shows up
    // in `gapsIn` — a half-covered week looks finished.
    //
    // `now` is a parameter and not a clock read. Reading the clock inside is how
    // this project shipped a bug before, and a guard about time that cannot be
    // tested at a chosen instant is not a guard.
    const mid = Date.UTC(2026, 7, 13) / 1000; // Thursday of 2026-W33
    const after = Date.UTC(2026, 7, 17) / 1000; // the first instant of W34

    it("refuses while the period is still open", () => {
      expect(() =>
        planAnchor([envelope(`0x${"aa".repeat(32)}`, W33)], [], periodId("2026-W33"), mid),
      ).toThrow(/still running|not ended|open/i);
    });

    it("allows it the instant the period closes", () => {
      const plan = planAnchor(
        [envelope(`0x${"aa".repeat(32)}`, W33)],
        [],
        periodId("2026-W33"),
        after,
      );
      expect(plan!.count).toBe(1);
    });

    it("still refuses a period that is already anchored, closed or not", () => {
      expect(() =>
        planAnchor(
          [envelope(`0x${"aa".repeat(32)}`, W33)],
          [{ period: periodId("2026-W33") } as never],
          periodId("2026-W33"),
          after,
        ),
      ).toThrow(/already anchored/);
    });
  });
});
