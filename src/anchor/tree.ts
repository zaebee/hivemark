import { SimpleMerkleTree } from "@openzeppelin/merkle-tree";
import { leafOf } from "./leaf.js";

// Re-exported so a consumer needs one import for the tree and the leaf rule that
// makes its roots meaningful. `leafOf` is also used below, so it is imported
// rather than passed straight through.
export { LEAF_DOMAIN } from "./leaf.js";
export { leafOf };

/**
 * Tree construction is the library's job.
 *
 * Merkle implementations fail in well-known ways, and the reasoning that led us
 * to keep the EAS SDK rather than hand-roll a UID applies here unchanged. What
 * we do own is the leaf preimage, which is where the interesting decision lives.
 */
function treeOf(uids: readonly `0x${string}`[]): SimpleMerkleTree {
  if (uids.length === 0) {
    throw new Error("cannot anchor a period with no attestations");
  }
  return SimpleMerkleTree.of(uids.map(leafOf));
}

export function rootOf(uids: readonly `0x${string}`[]): `0x${string}` {
  return treeOf(uids).root as `0x${string}`;
}

export function proofFor(uids: readonly `0x${string}`[], uid: `0x${string}`): `0x${string}`[] {
  const index = uids.indexOf(uid);
  if (index === -1) throw new Error(`uid is not in this period: ${uid}`);
  return treeOf(uids).getProof(index) as `0x${string}`[];
}

export function verifyInclusion(
  root: `0x${string}`,
  uid: `0x${string}`,
  proof: readonly `0x${string}`[],
): boolean {
  return SimpleMerkleTree.verify(root, leafOf(uid), [...proof]);
}
