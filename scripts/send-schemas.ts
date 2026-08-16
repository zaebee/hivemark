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

import { createPublicClient, http, encodeFunctionData, encodePacked, keccak256 } from "viem";
import { base } from "viem/chains";
import { GET_SCHEMA_ABI, SCHEMA_REGISTRY, ZERO_UID, reading, refuseUnlessAffordable, signer, stopUnlessSending } from "./wallet.js";
import { ANCHOR_SCHEMA } from "../src/anchor/schema.js";
import { CLAIM_SCHEMA } from "../src/attest/schema.js";
import { BIRTH_SCHEMA } from "../src/birth/schema.js";

const RESOLVER = "0x0000000000000000000000000000000000000000" as const;
const REVOCABLE = true;

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
  birth: "0xde2b5303867b8d593b14ccccf4e168d1e8afbce0a66881facf1f9047799e01e5",
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
  const existing = await reading(`checking whether the ${name} schema already exists`, () =>
    publicClient.readContract({
      address: SCHEMA_REGISTRY,
      abi: GET_SCHEMA_ABI,
      functionName: "getSchema",
      args: [expected],
    }),
  );
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

stopUnlessSending(send, `${pending.length} transaction(s) ready. nothing was sent.`);

// Past this point the key is read and money is spent.
const { account, wallet } = signer();
await refuseUnlessAffordable(
  publicClient,
  account,
  // `0x23369fa6` is `AlreadyExists()`, which the pre-flight check above should
  // have caught — seeing it from an estimate means the registry changed under us
  // between the two reads.
  pending.map(({ name, data }) => ({ label: `the ${name} registration`, to: SCHEMA_REGISTRY, data })),
);

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
