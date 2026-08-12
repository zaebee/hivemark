import { describe, expect, it } from "vitest";
import { keccak256 } from "viem";
import { LEAF_DOMAIN, leafOf, rootOf, proofFor, verifyInclusion } from "../src/anchor/tree.js";

const uid = (n: number): `0x${string}` => `0x${String(n).padStart(2, "0").repeat(32)}`;
const UIDS = [uid(11), uid(22), uid(33), uid(44), uid(55)] as const;

describe("leafOf", () => {
  it("is deterministic", () => {
    expect(leafOf(UIDS[0])).toBe(leafOf(UIDS[0]));
  });

  it("differs from the raw uid, so a uid is not itself a leaf", () => {
    expect(leafOf(UIDS[0])).not.toBe(UIDS[0]);
  });

  it("mixes in the domain, not just the uid", () => {
    const undomained = keccak256(UIDS[0]);
    expect(leafOf(UIDS[0])).not.toBe(undomained);
    expect(LEAF_DOMAIN.length).toBeGreaterThan(0);
  });
});

describe("rootOf", () => {
  it("is deterministic for the same set in the same order", () => {
    expect(rootOf(UIDS)).toBe(rootOf([...UIDS]));
  });

  it("changes when any member changes", () => {
    expect(rootOf([...UIDS.slice(0, 4), uid(99)])).not.toBe(rootOf(UIDS));
  });

  it("changes when a member is dropped", () => {
    expect(rootOf(UIDS.slice(0, 4))).not.toBe(rootOf(UIDS));
  });

  it("refuses an empty set rather than producing a root of nothing", () => {
    expect(() => rootOf([])).toThrow(/no attestations/i);
  });

  it("handles an odd number of leaves", () => {
    expect(rootOf(UIDS.slice(0, 3))).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("inclusion proofs", () => {
  it("proves a member", () => {
    const root = rootOf(UIDS);
    expect(verifyInclusion(root, UIDS[2], proofFor(UIDS, UIDS[2]))).toBe(true);
  });

  it("rejects a non-member", () => {
    const root = rootOf(UIDS);
    expect(verifyInclusion(root, uid(99), proofFor(UIDS, UIDS[2]))).toBe(false);
  });

  it("rejects a member with someone else's proof", () => {
    const root = rootOf(UIDS);
    expect(verifyInclusion(root, UIDS[1], proofFor(UIDS, UIDS[2]))).toBe(false);
  });

  it("refuses to build a proof for a uid that is not in the set", () => {
    expect(() => proofFor(UIDS, uid(99))).toThrow(/not in this period/i);
  });

  it("keeps tree values out of uid space, which is what stops a node posing as a leaf", () => {
    // Nothing in a Merkle proof marks which values were leaves, so any 32-byte
    // value that happens to sit in the tree could be offered as a member. The
    // defence is that a uid is never used as a tree value directly: it is
    // hashed into leaf space first, so exploiting this would need a uid whose
    // keccak(domain ‖ uid) equals a node — a preimage problem.
    //
    // The observable consequence, and the thing worth pinning: a value that IS
    // a tree leaf must not verify when passed as a uid. Asserted against the
    // library's own leaf rather than a hand-derived internal node, so the test
    // does not depend on how the library lays its tree out.
    const root = rootOf(UIDS);
    const realProof = proofFor(UIDS, UIDS[2]);
    const treeLeaf = leafOf(UIDS[2]);

    // The uid verifies, as it must.
    expect(verifyInclusion(root, UIDS[2], realProof)).toBe(true);

    // Its leaf value — a genuine node of this tree, with a genuine path to the
    // root — does not, because it is not a uid. Were leaves undomained, uid and
    // leaf would be the same value and this would wrongly pass.
    expect(verifyInclusion(root, treeLeaf, realProof)).toBe(false);
  });
});
