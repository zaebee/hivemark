import { getAddress, keccak256, toHex } from "viem";
import { canonicalJson } from "./canonical.js";
import type { Genome } from "./types.js";

/**
 * Identity is the hash of the genome — content-addressed, not issued.
 *
 * Borrowed from the kitties pallet, where `kitty_id = hash_of(kitty)`. Two
 * consequences are wanted: changing a prompt births a new entity automatically,
 * and two identically configured reviewers on different machines are the same
 * subject, because identity here is configuration rather than hardware.
 */
export function identityId(genome: Genome): `0x${string}` {
  return keccak256(toHex(canonicalJson(genome)));
}

/**
 * The address the badge is soulbound to.
 *
 * The same shape the EVM uses to turn a public key into an address, except the
 * preimage is a genome. No private key exists for it — including for us — so
 * the badge cannot be moved, the entity cannot be impersonated, and anyone can
 * recompute the address from a published genome to confirm it.
 */
export function ownerAddress(id: `0x${string}`): `0x${string}` {
  return getAddress(`0x${keccak256(id).slice(-40)}`);
}
