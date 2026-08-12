import { describe, expect, it } from "vitest";
import { loadBirths, announced } from "../src/birth/ledger.js";

const record = (id: string) => ({
  identity_id: id,
  entity: "0x0000000000000000000000000000000000000001",
  first_seen: 1_786_527_600,
  tx_hash: `0x${"cd".repeat(32)}`,
  attestation_uid: `0x${"ef".repeat(32)}`,
  announced_at: "2026-08-17T09:00:00+00:00",
});

const ID_A = `0x${"11".repeat(32)}`;
const ID_B = `0x${"22".repeat(32)}`;

describe("loadBirths", () => {
  it("reads an empty ledger", () => {
    expect(loadBirths("[]")).toEqual([]);
  });

  it("refuses an empty file rather than reading it as nobody announced yet", () => {
    // Same hazard as the anchor ledger: read as empty, a truncated file would
    // announce identities that already have a birth record.
    expect(() => loadBirths("")).toThrow(/ledger is empty/i);
    expect(() => loadBirths("  \n ")).toThrow(/ledger is empty/i);
  });

  it("says plainly when the ledger is not JSON", () => {
    expect(() => loadBirths("{nope")).toThrow(/not valid JSON/i);
  });

  it("refuses two births for one identity", () => {
    const twice = JSON.stringify([record(ID_A), record(ID_A)]);
    expect(() => loadBirths(twice)).toThrow(/already announced/i);
  });

  it("treats a case difference as the same identity, not a second one", () => {
    const mixed = JSON.stringify([record(ID_A), record(ID_A.toUpperCase().replace("0X", "0x"))]);
    expect(() => loadBirths(mixed)).toThrow(/already announced/i);
  });
});

describe("announced", () => {
  it("finds an identity that has a birth record", () => {
    const records = loadBirths(JSON.stringify([record(ID_A)]));
    expect(announced(records, ID_A)?.identity_id).toBe(ID_A);
  });

  it("returns null for one that does not", () => {
    const records = loadBirths(JSON.stringify([record(ID_A)]));
    expect(announced(records, ID_B)).toBeNull();
  });
});
