import { Wallet, verifyMessage } from "ethers";

export interface Signer {
  readonly wallet: Wallet;
  readonly address: `0x${string}`;
}

const KEY_VAR = "HIVEMARK_SIGNING_KEY";
const PROBE = "hivemark signer probe";

/**
 * Load the publisher's signing key, or nothing.
 *
 * There is no `enabled` flag on purpose: attestation is on exactly when a usable
 * key is present, so "configured on but broken" cannot be represented. Absence
 * is a legitimate state — hivemark still produces claims and a page, just
 * without signatures.
 *
 * Two failures are refused rather than carried forward, both learned from a
 * sibling project that shipped them. A key of all zeroes is accepted by the
 * constructor and yields signatures that never recover to the address, which is
 * exactly what an unset CI secret produces. And a secret written with `echo`
 * arrives with a trailing newline, so the value is trimmed before use.
 */
export function loadSigner(env: Record<string, string | undefined>): Signer | null {
  const raw = (env[KEY_VAR] ?? "").trim();
  if (raw === "") return null;

  let wallet: Wallet;
  try {
    wallet = new Wallet(raw);
  } catch (cause) {
    throw new Error(`unusable signing key in ${KEY_VAR}: ${(cause as Error).message}`, { cause });
  }

  // Prove the key signs and recovers before anything depends on it.
  const signature = wallet.signMessageSync(PROBE);
  if (verifyMessage(PROBE, signature).toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(
      `unusable signing key in ${KEY_VAR}: signatures do not recover to ${wallet.address}`,
    );
  }

  return { wallet, address: wallet.address as `0x${string}` };
}
