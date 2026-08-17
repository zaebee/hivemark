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
import { reading, refuseUnlessAffordable, signer, stopUnlessSending } from "./wallet.js";
import { GET_SCHEMA_ABI, SCHEMA_REGISTRY } from "./wallet.js";
import { loadLedger, type AnchorRecord } from "../src/anchor/ledger.js";
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
const [attestationsPath, ledgerPath = "anchors.json", period] = process.argv
  .slice(2)
  .filter((a) => a !== "--send");

if (!attestationsPath || !period) {
  console.error("usage: bun scripts/send-anchor.ts <attestations.json> <anchors.json> <period> [--send]");
  process.exit(1);
}

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
    const envelopes = JSON.parse(readFileSync(attestationsPath!, "utf8")) as AttestationEnvelope[];
    const records = loadLedger(readFileSync(ledgerPath, "utf8"));
    return { records, plan: planAnchor(envelopes, records, periodId(period!)) };
  } catch (error) {
    console.error(`hivemark: ${error instanceof Error ? error.message : "unknown error"}`);
    console.error("nothing was sent.");
    process.exit(1);
  }
}

const { records, plan } = planOrRefuse();
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
writeFileSync(ledgerPath, `${JSON.stringify([...records, record], null, 2)}\n`, "utf8");
console.log(`\nrecorded in ${ledgerPath}. commit it — the ledger is what makes a proof checkable.`);
