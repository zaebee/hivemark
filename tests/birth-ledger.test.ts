import { describe, expect, it } from "vitest";
import { loadBirths, announced } from "../src/birth/ledger.js";
import { ownerAddress } from "../src/identity.js";

const ID_A = `0x${"11".repeat(32)}` as const;
const ID_B = `0x${"22".repeat(32)}` as const;

const record = (id: `0x${string}`) => ({
  identity_id: id,
  // Derived, because the ledger now refuses a pair that disagrees.
  entity: ownerAddress(id),
  first_seen: 1_786_527_600,
  tx_hash: `0x${"cd".repeat(32)}`,
  attestation_uid: `0x${"ef".repeat(32)}`,
  announced_at: "2026-08-17T09:00:00+00:00",
});

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
    const upper = ID_A.toUpperCase().replace("0X", "0x") as `0x${string}`;
    const mixed = JSON.stringify([record(ID_A), { ...record(ID_A), identity_id: upper }]);
    expect(() => loadBirths(mixed)).toThrow(/already announced/i);
  });

  it("refuses an entity that is not the address of its identity", () => {
    // Unchecked, such a row would suppress that identity's real birth through
    // `announced()` — it would look announced while nothing correct existed.
    const wrong = JSON.stringify([
      { ...record(ID_A), entity: "0x000000000000000000000000000000000000dEaD" },
    ]);
    expect(() => loadBirths(wrong)).toThrow(/not the address derived/i);
  });

  it("refuses an announced_at that is not a timestamp", () => {
    const wrong = JSON.stringify([{ ...record(ID_A), announced_at: "not-a-date" }]);
    expect(() => loadBirths(wrong)).toThrow(/parseable timestamp/i);
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
