/**
 * The parts of a sending script that must not exist twice.
 *
 * `send-schemas.ts` and `send-births.ts` broadcast different things, but their
 * dangerous half is identical: find the key, refuse anything that is not one,
 * and refuse to start a batch the balance cannot finish. Kept as two copies,
 * a correction to one silently misses the other — and the corrections that land
 * here are the ones that follow a permanent mistake.
 *
 * These functions call `process.exit` rather than throwing. They are for
 * scripts a human runs and reads, where "stop, and say why" is the whole
 * contract; a caller that wanted to recover would be a caller that intended to
 * send anyway.
 */

import { createWalletClient, formatEther, http } from "viem";
import type { Account, HttpTransport, PublicClient, WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Where the anchoring key lives. Never inside the repository — see docs/anchoring.md. */
export const KEY_PATH = join(homedir(), ".hivemark", "anchoring.key");

/**
 * The exact client shapes the scripts build, not viem's bare generics.
 *
 * `PublicClient` and `WalletClient` with their parameters defaulted are wider
 * than what `createPublicClient({ chain: base, … })` returns, and the mismatch
 * is not cosmetic: a `WalletClient` without its account parameter has no account
 * at the type level, so `sendTransaction` demands one be passed per call — which
 * would mean the account travels separately from the wallet holding it.
 */
export type BaseClient = PublicClient<HttpTransport, typeof base>;
export type BaseWallet = WalletClient<HttpTransport, typeof base, Account>;

export const SCHEMA_REGISTRY = "0x4200000000000000000000000000000000000020" as const;
export const ZERO_UID = `0x${"00".repeat(32)}` as const;

export const GET_SCHEMA_ABI = [
  {
    name: "getSchema",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "uid", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "uid", type: "bytes32" },
          { name: "resolver", type: "address" },
          { name: "revocable", type: "bool" },
          { name: "schema", type: "string" },
        ],
      },
    ],
  },
] as const;

export interface PendingTx {
  /** Named in the estimate-failure message, so a refusal says which one. */
  readonly label: string;
  readonly to: `0x${string}`;
  readonly data: `0x${string}`;
}

/**
 * The gate between a run that reads and a run that spends.
 *
 * It lives here, and is called immediately before `signer()`, because these two
 * are one decision: everything above the gate is safe to run anywhere, and the
 * key file is opened on the far side of it. Two copies of a boundary is two
 * chances for one of them to drift into opening the key a line too early.
 *
 * `notes` print between the count and the instruction — a caller's specific
 * warnings, which belong with the summary rather than scrolled off above it.
 */
export function stopUnlessSending(
  send: boolean,
  summary: string,
  notes: readonly string[] = [],
): void {
  if (send) return;
  console.log(summary);
  for (const note of notes) console.log(note);
  console.log("re-run with --send to broadcast. that spends money and cannot be undone.");
  process.exit(0);
}

/**
 * Load the anchoring key and open a wallet on Base.
 *
 * Call this only on a path that is definitely sending. Both scripts are dry by
 * default precisely so that the ordinary run never opens the key file, and that
 * property is only as true as the position of this call.
 */
export function signer(): { account: Account; wallet: BaseWallet } {
  let key: string;
  try {
    key = readFileSync(KEY_PATH, "utf8").trim();
  } catch (error) {
    // A missing key file is the ordinary state on a fresh checkout, not a crash.
    console.error(`cannot read ${KEY_PATH}: ${(error as Error).message}`);
    console.error("see docs/anchoring.md — the anchoring key is created once, by hand.");
    process.exit(1);
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    console.error(`${KEY_PATH} does not contain a single 0x-prefixed 32-byte key`);
    process.exit(1);
  }
  const account = privateKeyToAccount(key as `0x${string}`);
  return { account, wallet: createWalletClient({ account, chain: base, transport: http() }) };
}

/**
 * Refuse unless the balance covers *every* pending transaction.
 *
 * Not "unless it is zero". Sends happen one at a time, so a wallet holding
 * enough for two of three fails partway and leaves a half-finished set behind —
 * half a schema set, or a half-populated hive — which is worse than sending
 * nothing because it looks deliberate. One wei and zero fail identically, so
 * zero is not the interesting threshold.
 *
 * Estimating also front-runs reverts: an estimate that throws means that
 * transaction would revert, so stopping here costs nothing and saves the gas.
 */
export async function refuseUnlessAffordable(
  publicClient: BaseClient,
  account: Account,
  pending: readonly PendingTx[],
): Promise<void> {
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`sending from ${account.address}, balance ${formatEther(balance)} ETH`);

  const gasPrice = await publicClient.getGasPrice();
  let needed = 0n;
  for (const { label, to, data } of pending) {
    try {
      needed += await publicClient.estimateGas({ account: account.address, to, data });
    } catch (error) {
      console.error(`\ncannot estimate ${label}, so it would fail if sent:`);
      console.error(`  ${(error as Error).message.split("\n")[0]}`);
      console.error("nothing was sent.");
      process.exit(1);
    }
  }

  const cost = needed * gasPrice;
  console.log(
    `${pending.length} transaction(s) need about ${formatEther(cost)} ETH at ${gasPrice} wei/gas\n`,
  );
  if (balance < cost) {
    console.error(
      `insufficient balance: ${formatEther(balance)} ETH held, ${formatEther(cost)} ETH needed.`,
    );
    console.error("fund the address on Base — chain 8453 — and re-run. nothing was sent.");
    process.exit(1);
  }
}
