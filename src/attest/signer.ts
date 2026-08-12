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
 * sibling project that shipped them. A key of all zeroes is degenerate and
 * must not be trusted to sign, which is exactly what an unset CI secret
 * produces. And a secret written with `echo` arrives with a trailing
 * newline, so the value is trimmed before use.
 *
 * ethers does not consistently redact a rejected key: a malformed non-hex
 * string is embedded verbatim in its thrown message. So the constructor's
 * error is never forwarded — not in the message, not as `cause` (a logger
 * that walks the cause chain would print it just the same). The thrown
 * error may name the environment variable; it may not contain any part of
 * the value.
 */
export function loadSigner(env: Record<string, string | undefined>): Signer | null {
  const raw = (env[KEY_VAR] ?? "").trim();
  if (raw === "") return null;

  let wallet: Wallet;
  try {
    wallet = new Wallet(raw);
  } catch {
    throw new Error(`unusable signing key in ${KEY_VAR}: value is not a usable private key`);
  }

  // Insurance against a dependency regression, not against the all-zero key —
  // ethers 6.17 already refuses that one in the constructor above, so this
  // branch is unreachable on the currently installed version. A wallet that
  // can be constructed but whose signatures don't recover to its own address
  // would be a defect in ethers' key handling, not something this module
  // controls; this proves the guarantee holds before anything depends on it.
  const signature = wallet.signMessageSync(PROBE);
  if (verifyMessage(PROBE, signature).toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(
      `unusable signing key in ${KEY_VAR}: signatures do not recover to ${wallet.address}`,
    );
  }

  return { wallet, address: wallet.address as `0x${string}` };
}
