import { concat, keccak256, toHex } from "viem";

/**
 * Prefix that puts leaves in a different space from internal nodes.
 *
 * A Merkle proof only shows that some 32-byte value hashes its way to the root;
 * nothing marks which values were leaves. Undomained, an internal node — keccak
 * over two concatenated children — could be presented as a member and its proof
 * would verify. Hashing every leaf with this string makes that impossible: a
 * leaf is keccak(domain ‖ uid), which an internal node cannot be.
 *
 * Versioned, because changing it changes every root ever computed.
 */
export const LEAF_DOMAIN = "hivemark-anchor-leaf-v1";

export function leafOf(uid: `0x${string}`): `0x${string}` {
  return keccak256(concat([toHex(LEAF_DOMAIN), uid]));
}
