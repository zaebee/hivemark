import { describe, expect, it } from "vitest";
import { periodId } from "../src/anchor/period.js";
import { loadLedger, gapsIn, recordFor } from "../src/anchor/ledger.js";

const record = (period: string) => ({
  period,
  root: `0x${"ab".repeat(32)}`,
  count: 2,
  uids: [`0x${"11".repeat(32)}`, `0x${"22".repeat(32)}`],
  tx_hash: `0x${"cd".repeat(32)}`,
  attestation_uid: `0x${"ef".repeat(32)}`,
  anchored_at: "2026-08-17T09:00:00+00:00",
});

describe("loadLedger", () => {
  it("reads an empty ledger", () => {
    expect(loadLedger("[]")).toEqual([]);
  });

  it("refuses an empty file rather than reading it as no anchors yet", () => {
    // The dangerous reading: a truncated ledger taken as empty would offer to
    // re-anchor weeks already anchored.
    expect(() => loadLedger("")).toThrow(/ledger is empty/i);
    expect(() => loadLedger("   \n")).toThrow(/ledger is empty/i);
  });

  it("says plainly when the ledger is not JSON", () => {
    expect(() => loadLedger("{not json")).toThrow(/not valid JSON/i);
  });

  it("refuses a record missing the uids it claims to cover", () => {
    const { uids: _uids, ...withoutUids } = record("2026-W33");
    expect(() => loadLedger(JSON.stringify([withoutUids]))).toThrow(/uids/i);
  });

  it("refuses a record whose count disagrees with its uid list", () => {
    expect(() => loadLedger(JSON.stringify([{ ...record("2026-W33"), count: 99 }]))).toThrow(
      /count/i,
    );
  });

  it("refuses two anchors for one period", () => {
    const twice = JSON.stringify([record("2026-W33"), record("2026-W33")]);
    expect(() => loadLedger(twice)).toThrow(/already anchored/i);
  });
});

describe("gapsIn", () => {
  it("names every week with no anchor", () => {
    const records = loadLedger(JSON.stringify([record("2026-W33"), record("2026-W36")]));
    expect(gapsIn(records, periodId("2026-W33"), periodId("2026-W36"))).toEqual(["2026-W34", "2026-W35"]);
  });

  it("returns nothing when every week is covered", () => {
    const records = loadLedger(JSON.stringify([record("2026-W33"), record("2026-W34")]));
    expect(gapsIn(records, periodId("2026-W33"), periodId("2026-W34"))).toEqual([]);
  });
});

describe("recordFor", () => {
  it("finds an anchored period", () => {
    const records = loadLedger(JSON.stringify([record("2026-W33")]));
    expect(recordFor(records, periodId("2026-W33"))?.period).toBe("2026-W33");
  });

  it("returns null for a gap rather than the nearest neighbour", () => {
    const records = loadLedger(JSON.stringify([record("2026-W33")]));
    expect(recordFor(records, periodId("2026-W34"))).toBeNull();
  });
});
