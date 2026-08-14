/**
 * Broadcast the three schema registrations. Dry by default.
 *
 *   bun scripts/send-schemas.ts           # checks everything, sends nothing
 *   bun scripts/send-schemas.ts --send    # spends money, permanently
 *
 * Separate from `register-schemas.ts`, which prints calldata for a human to
 * paste into a wallet. That path is still valid; this one exists because 1124
 * bytes copied by hand is a transcription risk, and because a wallet cannot run
 * the pre-flight checks below.
 *
 * The key is read **only** when `--send` is passed. A dry run never opens the
 * file, so it can be run by anyone, anywhere, without key material entering the
 * process — including by an agent that should not be handling it.
 */

import { createPublicClient, createWalletClient, http, encodeFunctionData, encodePacked, formatEther, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ANCHOR_SCHEMA } from "../src/anchor/schema.js";
import { CLAIM_SCHEMA } from "../src/attest/schema.js";
import { BIRTH_SCHEMA } from "../src/birth/schema.js";

const SCHEMA_REGISTRY = "0x4200000000000000000000000000000000000020" as const;
const RESOLVER = "0x0000000000000000000000000000000000000000" as const;
const REVOCABLE = true;
const ZERO_UID = `0x${"00".repeat(32)}` as const;

/** Where the anchoring key lives. Never inside the repository — see docs/anchoring.md. */
const KEY_PATH = join(homedir(), ".hivemark", "anchoring.key");

/**
 * The UIDs the signed attestations name, as literals.
 *
 * Deliberately not imported, for the reason spelled out in `register-schemas.ts`:
 * comparing a derived UID against a constant computed from the same schema
 * string reduces to `keccak(x) === keccak(x)` and passes for any schema at all.
 */
const EXPECTED = {
  claim: "0x9c6648261df139b4453dd540ed2e8d821a9e775beede14ba9aae9e7202daacfb",
  anchor: "0x8ff2e1ad6186bbe4c1ac54ea7d969dcf04a8caa7d31e8ac45127bfa3cfba06bd",
  birth: "0x6ca5f932f49e5ac467c1ca24c5af39800a12df874d3856b4afdd54800c07ed02",
} as const;

const REGISTER_ABI = [
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "schema", type: "string" },
      { name: "resolver", type: "address" },
      { name: "revocable", type: "bool" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

const GET_SCHEMA_ABI = [
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

const SCHEMAS = [
  { name: "claim", schema: CLAIM_SCHEMA },
  { name: "anchor", schema: ANCHOR_SCHEMA },
  { name: "birth", schema: BIRTH_SCHEMA },
] as const;

const send = process.argv.includes("--send");
const publicClient = createPublicClient({ chain: base, transport: http() });

const pending: { name: string; data: `0x${string}`; uid: string }[] = [];
let refusals = 0;

for (const { name, schema } of SCHEMAS) {
  const expected = EXPECTED[name];
  const data = encodeFunctionData({
    abi: REGISTER_ABI,
    functionName: "register",
    args: [schema, RESOLVER, REVOCABLE],
  });

  // Re-derive from the bytes that would actually be sent, and compare against
  // the literal above.
  const derived = keccak256(encodePacked(["string", "address", "bool"], [schema, RESOLVER, REVOCABLE]));

  // The check `register-schemas.ts` cannot make, because it is offline: a UID is
  // global. If this schema text already exists anywhere with the same resolver
  // and revocable flag, attestations already resolve against it and there is
  // nothing to send. Registering again does not fail into a no-op — EAS rejects
  // it and the gas is spent on a revert.
  const existing = await publicClient.readContract({
    address: SCHEMA_REGISTRY,
    abi: GET_SCHEMA_ABI,
    functionName: "getSchema",
    args: [expected],
  });
  const alreadyRegistered = existing.uid !== ZERO_UID;

  console.log(`── ${name}`);
  console.log(`   uid       ${expected}`);
  if (derived !== expected) {
    console.log(`   derived   ${derived}  ✗ WRONG UID — the schema string has changed`);
    refusals++;
  } else if (alreadyRegistered) {
    console.log(`   status    already registered — nothing to send`);
  } else {
    console.log(`   status    not registered → will send ${(data.length - 2) / 2} bytes`);
    pending.push({ name, data, uid: expected });
  }
  console.log();
}

if (refusals > 0) {
  console.error(`${refusals} schema(s) would register under the wrong uid — refusing to send anything.`);
  process.exit(1);
}

if (pending.length === 0) {
  console.log("all three schemas exist on Base. nothing to do.");
  process.exit(0);
}

if (!send) {
  console.log(`${pending.length} transaction(s) ready. nothing was sent.`);
  console.log("re-run with --send to broadcast. that spends money and cannot be undone.");
  process.exit(0);
}

// Past this point the key is read and money is spent.
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
const wallet = createWalletClient({ account, chain: base, transport: http() });

const balance = await publicClient.getBalance({ address: account.address });
console.log(`sending from ${account.address}, balance ${formatEther(balance)} ETH`);

// Refuse when the balance cannot cover everything pending, rather than when it
// is zero. Sends happen one at a time, so a wallet holding enough for two of
// three fails partway and leaves a half-registered set behind — the outcome the
// all-or-nothing UID check above exists to avoid, reached through funding
// instead of through drift. One wei and zero fail identically, so zero is not
// the interesting threshold.
const gasPrice = await publicClient.getGasPrice();
let needed = 0n;
for (const { name, data } of pending) {
  try {
    needed += await publicClient.estimateGas({ account: account.address, to: SCHEMA_REGISTRY, data });
  } catch (error) {
    // An estimate that reverts means this transaction would revert, so stopping
    // here costs nothing and saves the gas. `0x23369fa6` is `AlreadyExists()`,
    // which the pre-flight check above should have caught — seeing it here means
    // the registry changed under us between the two reads.
    console.error(`\ncannot estimate the ${name} registration, so it would fail if sent:`);
    console.error(`  ${(error as Error).message.split("\n")[0]}`);
    console.error("nothing was sent.");
    process.exit(1);
  }
}
const cost = needed * gasPrice;
console.log(`${pending.length} transaction(s) need about ${formatEther(cost)} ETH at ${gasPrice} wei/gas\n`);
if (balance < cost) {
  console.error(`insufficient balance: ${formatEther(balance)} ETH held, ${formatEther(cost)} ETH needed.`);
  console.error("fund the address on Base — chain 8453 — and re-run. nothing was sent.");
  process.exit(1);
}

for (const { name, data, uid } of pending) {
  const hash = await wallet.sendTransaction({ to: SCHEMA_REGISTRY, data, value: 0n });
  console.log(`${name}  tx ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`      status ${receipt.status}, gas used ${receipt.gasUsed}`);

  // Confirm from the receipt's own logs, not from a follow-up read.
  //
  // The registry emits `Registered` with the uid as its first indexed topic, so
  // the proof is already in hand and cannot race. An earlier version re-read
  // `getSchema` immediately after the receipt and compared that: the public RPC
  // balances across nodes, the read landed on one that had not applied the block
  // yet, and a correct registration was reported as "THE UID DID NOT APPEAR" —
  // a false negative that aborted the remaining two sends.
  //
  // A mined-but-reverted transaction emits no logs, so it still fails here.
  const registered = receipt.logs.some(
    (log) =>
      log.address.toLowerCase() === SCHEMA_REGISTRY.toLowerCase() &&
      log.topics[1]?.toLowerCase() === uid.toLowerCase(),
  );
  const verdict = registered
    ? `✓ ${uid} is registered`
    : "✗ NO Registered EVENT FOR THIS UID — investigate before sending more";
  console.log(`      ${verdict}`);
  if (!registered) process.exit(1);
  console.log();
}

console.log("done. record the transaction hashes in docs/anchoring.md.");
