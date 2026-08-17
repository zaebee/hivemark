/**
 * Broadcast one weekly anchor, and record it.
 *
 *   bun scripts/send-anchor.ts <attestations.json> anchors.json 2026-W33
 *   bun scripts/send-anchor.ts <attestations.json> anchors.json 2026-W33 --send
 *
 * The third sibling of `send-schemas.ts` and `send-births.ts`. Its dangerous
 * half is not written here: the key, the affordability gate and the RPC error
 * voice all come from `wallet.ts`, for the reason stated at the top of that
 * file — two copies of a boundary is two chances for one of them to drift.
 *
 * The key is read **only** when `--send` is passed, and `stopUnlessSending`
 * sits immediately above `signer()` so that stays true.
 *
 * Recording is part of sending, not a follow-up chore. The runbook is explicit
 * that an anchor which is not written to the ledger may as well not have
 * happened, and 00:30 on a Monday is exactly when a human forgets step three.
 * The ledger write happens after the receipt, so a failure there costs the
 * record and not the money — and the transaction hash is on screen either way.
 */

import { createPublicClient, encodeFunctionData, http, parseAbiItem, parseEventLogs } from "viem";
import { base } from "viem/chains";
import { readFileSync, writeFileSync } from "node:fs";
import {
  GET_SCHEMA_ABI,
  SCHEMA_REGISTRY,
  reading,
  refuseUnlessAffordable,
  signer,
  stopUnlessSending,
} from "./wallet.js";
import { loadLedger, recordFor, type AnchorRecord } from "../src/anchor/ledger.js";
import { periodId } from "../src/anchor/period.js";
import { planAnchor } from "../src/anchor/plan.js";
import { buildAnchorRequest } from "../src/anchor/submit.js";
import { ANCHOR_SCHEMA_UID } from "../src/anchor/schema.js";
import type { AttestationEnvelope } from "../src/attest/attest.js";

const ATTESTED_EVENT = parseAbiItem(
  "event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)",
);

const ATTEST_ABI = [
  {
    name: "attest",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: [
          { name: "schema", type: "bytes32" },
          {
            name: "data",
            type: "tuple",
            components: [
              { name: "recipient", type: "address" },
              { name: "expirationTime", type: "uint64" },
              { name: "revocable", type: "bool" },
              { name: "refUID", type: "bytes32" },
              { name: "data", type: "bytes" },
              { name: "value", type: "uint256" },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

const send = process.argv.includes("--send");
const args = process.argv.slice(2).filter((a) => a !== "--send");

/**
 * All three, named. No defaults, unlike the siblings — and the difference is
 * deliberate rather than an oversight.
 *
 * `send-births.ts` can default its two positionals because neither is followed
 * by a required one. Here `period` is required and last, so a default on
 * `ledgerPath` is not merely useless: given two arguments it binds the period to
 * the ledger path and leaves the period undefined. The default can never be the
 * value that is used, and its presence suggests an optional argument that is
 * not.
 *
 * Inferring the shape from the count would work and is the wrong trade for this
 * script. The ledger is what the already-anchored guard reads, so guessing which
 * argument it is means guessing at the one input that decides whether a period
 * can be anchored twice. Three arguments, stated.
 */
if (args.length !== 3) {
  console.error("usage: bun scripts/send-anchor.ts <attestations.json> <anchors.json> <period> [--send]");
  console.error("all three are required; nothing is defaulted, because the ledger path decides");
  console.error("whether the already-anchored guard is reading the right file.");
  process.exit(1);
}
const [attestationsPath, ledgerPath, period] = args as [string, string, string];

/**
 * Read the inputs and plan, reporting a refusal as a sentence.
 *
 * Explicit catch for message quality, matching `cli-anchor.ts`: the guards here
 * — a period already anchored, a week still running, a malformed ledger — are
 * all conditions a human is meant to read and act on, and a stack trace is the
 * wrong output for a tool whose next step a human performs by hand.
 */
function planOrRefuse() {
  try {
    const envelopes = JSON.parse(readFileSync(attestationsPath, "utf8")) as AttestationEnvelope[];
    // Deliberately not returned. The ledger is read again immediately before the
    // write, and keeping this copy in scope would invite appending to the stale
    // one — which is the bug the re-read exists to prevent.
    const records = loadLedger(readFileSync(ledgerPath, "utf8"));
    return planAnchor(envelopes, records, periodId(period));
  } catch (error) {
    console.error(`hivemark: ${error instanceof Error ? error.message : "unknown error"}`);
    console.error("nothing was sent.");
    process.exit(1);
  }
}

const plan = planOrRefuse();
if (!plan) {
  console.log(`${period}: nothing to anchor — no attestations fall in this period`);
  process.exit(0);
}

const request = buildAnchorRequest(plan);
const publicClient = createPublicClient({ chain: base, transport: http() });

// EAS reverts `attest` on an unregistered schema, so sending first would buy a
// reverted transaction. Same order as `send-births.ts`, same reason.
const registered = await reading("checking the anchor schema is registered", () =>
  publicClient.readContract({
    address: SCHEMA_REGISTRY,
    abi: GET_SCHEMA_ABI,
    functionName: "getSchema",
    args: [ANCHOR_SCHEMA_UID],
  }),
);
if (registered.uid !== ANCHOR_SCHEMA_UID) {
  console.error(`the anchor schema ${ANCHOR_SCHEMA_UID} is not registered on Base.`);
  console.error("register it first — see docs/anchoring.md. nothing was sent.");
  process.exit(1);
}

const data = encodeFunctionData({
  abi: ATTEST_ABI,
  functionName: "attest",
  args: [
    {
      schema: request.schema,
      data: {
        recipient: request.recipient,
        expirationTime: request.expirationTime,
        revocable: request.revocable,
        refUID: request.refUID,
        data: request.data as `0x${string}`,
        value: request.value,
      },
    },
  ],
});

console.log(`period      ${plan.period}  [${plan.periodStart}, ${plan.periodEnd})`);
console.log(`covers      ${plan.count} attestations`);
console.log(`root        ${plan.root}`);
console.log(`to          ${request.to}`);
console.log(`schema      ${request.schema}`);
console.log(
  `newest      ${new Date(plan.newestCovered * 1000).toISOString()} ` +
    `(${Math.round((plan.periodEnd - plan.newestCovered) / 3600)}h before the period ends)`,
);

stopUnlessSending(send, `\nthis would anchor ${plan.count} attestations for ${plan.period}.`, [
  "the root is permanent and one anchor per period is enforced — check it against",
  "docs/anchoring.md before sending.",
]);

// Past this point the key is read and money is spent.
const { account, wallet } = signer();
await refuseUnlessAffordable(publicClient, account, [
  { label: `the anchor for ${plan.period}`, to: request.to, data },
]);

const hash = await wallet.sendTransaction({ to: request.to, data, value: 0n });
console.log(`tx     ${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log(`status ${receipt.status}, gas ${receipt.gasUsed}`);

if (receipt.status !== "success") {
  console.error("the transaction reverted; nothing was recorded.");
  process.exit(1);
}

// Read from the receipt's own logs rather than by re-reading chain state: an
// RPC node that has not applied the block yet reports a good send as a failure.
// That mistake is already documented in `send-births.ts`.
const attested = parseEventLogs({ abi: [ATTESTED_EVENT], logs: receipt.logs }).filter(
  (log) => log.args.schemaUID.toLowerCase() === ANCHOR_SCHEMA_UID.toLowerCase(),
);
if (attested.length !== 1) {
  console.error(`expected exactly one Attested log for the anchor schema, saw ${attested.length}.`);
  console.error(`the transaction ${hash} succeeded — record it by hand, see docs/anchoring.md.`);
  process.exit(1);
}
const attestationUid = attested[0]!.args.uid;
console.log(`uid    ${attestationUid}`);

const record: AnchorRecord = {
  period: plan.period,
  root: plan.root,
  count: plan.count,
  uids: plan.uids,
  tx_hash: hash,
  attestation_uid: attestationUid,
  anchored_at: new Date().toISOString(),
};

// Re-read rather than append to the copy loaded before the network calls. Minutes
// can pass waiting for a receipt, and a ledger written from a stale snapshot
// drops whatever landed in between.
//
// Re-checking the period is the part that matters, and it is why this is not
// simply a re-read. Appending blindly to the fresher file would put a second
// record for one period into the ledger, and `loadLedger` refuses duplicates —
// so the next read of the file fails entirely. That turns a lost update into an
// unreadable ledger, which is the worse of the two.
//
// If the period did arrive meanwhile, the transaction has already succeeded and
// nothing here can undo it. The only useful act left is to refuse the write and
// put the values on screen where an operator can reconcile them by hand.
const current = loadLedger(readFileSync(ledgerPath, "utf8"));
if (recordFor(current, plan.period)) {
  console.error(`\n${ledgerPath} gained a record for ${plan.period} while this was sending.`);
  console.error("refusing to write a second one — two roots for a week makes a proof ambiguous.");
  console.error("this anchor was broadcast and is on chain. reconcile by hand:");
  console.error(`  period          ${plan.period}`);
  console.error(`  root            ${plan.root}`);
  console.error(`  tx_hash         ${hash}`);
  console.error(`  attestation_uid ${attestationUid}`);
  process.exit(1);
}
writeFileSync(ledgerPath, `${JSON.stringify([...current, record], null, 2)}\n`, "utf8");
console.log(`\nrecorded in ${ledgerPath}. commit it — the ledger is what makes a proof checkable.`);
