/**
 * The signing domain, fixed before the first signature and never changed.
 *
 * "Offchain" does not mean chain-free: EAS puts chainId and the EAS contract
 * address inside the EIP-712 domain, so both are covered by every signature.
 * Changing either invalidates everything signed under the old values, which is
 * why Base mainnet was chosen from the start — signing is free on any chain, so
 * mainnet costs nothing and removes a migration that would discard the history.
 *
 * Provenance of each value, verified rather than remembered:
 *   chainId  8453  — eas-contracts deployments/base/.chainId; Base RPC's
 *                    eth_chainId returns the same
 *   address        — deployments/base/EAS.json; eth_getCode returns bytecode
 *   version        — read from the deployed contract's version() on Base
 */

export const EAS_CONTRACT = "0x4200000000000000000000000000000000000021" as const;
export const EAS_CHAIN_ID = 8453n;
export const EAS_VERSION = "1.0.1" as const;

/** EAS offchain attestation format version (OffchainAttestationVersion.Version2). */
export const OFFCHAIN_VERSION = 2 as const;

export interface SigningDomain {
  readonly address: `0x${string}`;
  readonly chainId: bigint;
  readonly version: string;
}

export const SIGNING_DOMAIN: SigningDomain = Object.freeze({
  address: EAS_CONTRACT,
  chainId: EAS_CHAIN_ID,
  version: EAS_VERSION,
});
