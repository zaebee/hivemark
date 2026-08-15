import { describe, expect, it } from "vitest";
import { indexBirths, type AttestedLog } from "../src/birth/scan.js";

const ENTITY = "0x180299a08C6A36A226dE330a453414755D84E8EB" as const;
const UID = `0x${"ab".repeat(32)}` as const;

const log = (over: Partial<AttestedLog["args"]> = {}): AttestedLog => ({
  args: { recipient: ENTITY, uid: UID, ...over },
  blockNumber: 50013682n,
  transactionHash: `0x${"cd".repeat(32)}`,
});

describe("indexBirths", () => {
  it("finds an entity under a key that does not depend on hex casing", () => {
    const born = indexBirths([log()]);
    // The caller looks up a checksummed address it derived itself, so the two
    // spellings must land on one key or a born entity reads as unborn.
    expect(born.get(ENTITY.toLowerCase())).toEqual([UID]);
  });

  it("keeps every uid when one entity somehow has two births", () => {
    const second = `0x${"ef".repeat(32)}` as const;
    const born = indexBirths([log(), log({ uid: second })]);
    // Two births for one entity is the thing this map exists to prevent, so
    // when it has already happened the caller must be shown both, not the last.
    expect(born.get(ENTITY.toLowerCase())).toEqual([UID, second]);
  });

  it("refuses the whole scan when a log arrives without a recipient", () => {
    // Not skipped. getLogs is not strict by default, so a partially decoded log
    // is a thing the chain can hand us; dropping it would report an entity that
    // is born as unborn, immediately before announcing a birth for it.
    expect(() => indexBirths([log({ recipient: undefined })])).toThrow(
      /refusing to judge births from a partial scan/,
    );
  });

  it("refuses the whole scan when a log arrives without a uid", () => {
    expect(() => indexBirths([log({ uid: undefined })])).toThrow(
      /refusing to judge births from a partial scan/,
    );
  });

  it("names the block and transaction of the log it refused", () => {
    // A refusal that does not say which log it choked on leaves the operator
    // with a scan to redo and nowhere to look.
    expect(() => indexBirths([log({ uid: undefined })])).toThrow(/50013682/);
  });

  it("is empty for an empty scan", () => {
    // The state before any birth exists, and the state this returns if the
    // block range is ever wrong — which is why the caller prints its size.
    expect(indexBirths([]).size).toBe(0);
  });
});
