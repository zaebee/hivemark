/**
 * Broadcast the birth announcements that are owed. Dry by default.
 *
 *   bun scripts/send-births.ts                    # checks everything, sends nothing
 *   bun scripts/send-births.ts --send             # spends money, permanently
 *   bun scripts/send-births.ts corpus.json births.json --send
 *
 * The same shape as `send-schemas.ts`, and for the same reason: `cli-birth.ts`
 * prints calldata for a human to paste into a wallet, which is transcription
 * risk per identity, and a wallet cannot run the pre-flight checks below.
 *
 * A birth is the most irreversible thing this project publishes. One per
 * identity, `firstSeen` is a minimum over whatever corpus was handed in, and
 * neither can be revised. So this refuses more readily than it sends.
 *
 * The key is read **only** when `--send` is passed. A dry run never opens the
 * file, so it is safe for anyone to execute — including an agent that should not
 * be handling key material.
 */

import { createPublicClient, encodeFunctionData, http, parseAbiItem, parseEventLogs } from "viem";
import { base } from "viem/chains";
import { readFileSync } from "node:fs";
import {
  GET_SCHEMA_ABI,
  SCHEMA_REGISTRY,
  ZERO_UID,
  refuseUnlessAffordable,
  signer,
  stopUnlessSending,
} from "./wallet.js";
import { EAS_CONTRACT } from "../src/attest/domain.js";
import { readCorpus } from "../src/corpus.js";
import { harvest } from "../src/harvest.js";
import { loadBirths } from "../src/birth/ledger.js";
import { corpusSpan, planBirths, type BirthPlan } from "../src/birth/plan.js";
import { buildBirthRequest } from "../src/birth/submit.js";
import { BIRTH_SCHEMA_UID } from "../src/birth/schema.js";
import { indexBirths } from "../src/birth/scan.js";

/**
 * The transaction that registered `BIRTH_SCHEMA_UID`, recorded in
 * docs/anchoring.md. Its block bounds the log scan below: no attestation
 * against a schema can precede the schema's own registration, so scanning from
 * genesis would read tens of millions of blocks to prove the same thing.
 *
 * A transaction hash rather than a block number because a reader can check it —
 * paste it into a block explorer and the registration is right there. A pinned
 * number is a value nobody can verify without already knowing the answer.
 */
const SCHEMA_REGISTRATION_TX =
  "0xf9094e8850a9a50b9b68374ef421f779543506a9c4ba404a58945a71950d3952" as const;

/**
 * Confirmed against real Base logs before being relied on: a scan of the EAS
 * contract decodes with these argument names and four topics, so `recipient`
 * and `schemaUID` really are indexed and really are filterable.
 */
const ATTESTED_EVENT = parseAbiItem(
  "event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schemaUID)",
);

/** Public RPCs cap `eth_getLogs` spans. Base produces a block every 2s, so this is ~5.5h. */
const LOG_SCAN_CHUNK = 9_999n;

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

const args = process.argv.slice(2).filter((a) => a !== "--send");
const [corpusPath = "corpus.json", ledgerPath = "births.json"] = args;
const send = process.argv.includes("--send");

const publicClient = createPublicClient({ chain: base, transport: http() });

// The schema must exist before anything is attested against it: EAS reverts
// `attest` on an unregistered schema, so sending first would buy one reverted
// transaction per identity.
const registered = await publicClient.readContract({
  address: SCHEMA_REGISTRY,
  abi: GET_SCHEMA_ABI,
  functionName: "getSchema",
  args: [BIRTH_SCHEMA_UID],
});
if (registered.uid === ZERO_UID) {
  console.error(`birth schema ${BIRTH_SCHEMA_UID} is not registered on Base.`);
  console.error("run `bun scripts/send-schemas.ts` first; nothing here can be attested until it exists.");
  process.exit(1);
}
console.log(`schema    ${BIRTH_SCHEMA_UID} registered`);

const registration = await publicClient.getTransactionReceipt({ hash: SCHEMA_REGISTRATION_TX });
const head = await publicClient.getBlockNumber();
console.log(`          block ${registration.blockNumber}, head ${head}`);

/**
 * Every birth on the chain, by entity — read from the chain rather than from
 * `births.json`.
 *
 * The ledger is the wrong sole authority here: it is a file in a repository,
 * and the failure it cannot detect is its own — a lost commit, a stale
 * checkout, a second machine — each of which makes an already-born identity
 * look unborn. The chain is what the ledger is a record *of*, so it is the copy
 * to ask before doing something permanent.
 *
 * Scanned once for the whole schema instead of once per entity. Filtering on
 * `recipient` at the RPC would push the work to the node, but it multiplies the
 * request count by the number of identities, and the public Base RPC answers
 * `-32016 over rate limit` well before that becomes theoretical — measured
 * during this script's own development. Every birth ever announced fits in
 * memory by construction: there is at most one per identity, forever.
 */
async function birthsOnChain(): Promise<Map<string, `0x${string}`[]>> {
  const byEntity = new Map<string, `0x${string}`[]>();
  for (let from = registration.blockNumber; from <= head; from += LOG_SCAN_CHUNK + 1n) {
    // Written as an assignment rather than `Math.min` or a ternary: block
    // numbers are bigint, and Math.min throws `Conversion from 'BigInt' to
    // 'number' is not allowed` on one — measured, and the reason the obvious
    // simplification is not available here.
    let to = from + LOG_SCAN_CHUNK;
    if (to > head) to = head;
    const logs = await publicClient.getLogs({
      address: EAS_CONTRACT,
      event: ATTESTED_EVENT,
      args: { schemaUID: BIRTH_SCHEMA_UID },
      fromBlock: from,
      toBlock: to,
    });
    for (const [entity, uids] of indexBirths(logs)) {
      byEntity.set(entity, [...(byEntity.get(entity) ?? []), ...uids]);
    }
  }
  return byEntity;
}

const { records, warnings } = harvest(readCorpus(corpusPath).text);
for (const warning of warnings) console.warn(`warning: ${warning}`);
const births = loadBirths(readFileSync(ledgerPath, "utf8"));
const plans = planBirths(records, births);

const span = corpusSpan(records);
console.log(`corpus    ${corpusPath} — ${records.length} records`);
if (span) {
  console.log(
    `          ${new Date(span.earliest * 1000).toISOString()} … ` +
      `${new Date(span.latest * 1000).toISOString()}`,
  );
}
console.log(`ledger    ${ledgerPath} — ${births.length} already announced`);
console.log();

if (plans.length === 0) {
  console.log("every identity in this corpus already has a birth record. nothing to do.");
  process.exit(0);
}

const born = await birthsOnChain();
console.log(`chain     ${born.size} entit${born.size === 1 ? "y" : "ies"} already born under this schema`);
console.log();

const pending: { plan: BirthPlan; data: `0x${string}`; to: `0x${string}` }[] = [];
let atEdge = 0;

for (const plan of plans) {
  // buildBirthRequest refuses a plan whose genome does not hash to the identity
  // it names, or whose entity is not that identity's address. Both are
  // contradictions nothing can correct once published.
  const request = buildBirthRequest(plan);

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

  const g = plan.genome;
  console.log(
    `── ${g.finder_provider} · ${g.context_mode} · ${g.review_fingerprint.slice(0, 7)}`,
  );
  console.log(`   identity   ${plan.identity_id}`);
  console.log(`   entity     ${plan.entity}`);
  console.log(`   first seen ${new Date(plan.firstSeen * 1000).toISOString()}`);
  console.log(`   calldata   ${(data.length - 2) / 2} bytes`);

  const existing = born.get(plan.entity.toLowerCase()) ?? [];
  if (existing.length > 0) {
    console.error(`   ✗ this entity is ALREADY born on chain: ${existing.join(", ")}`);
    console.error("     the ledger disagrees with the chain. record the attestation above in");
    console.error(`     ${ledgerPath} and re-run — do not announce a second birth.`);
    process.exit(1);
  }
  console.log("   not yet attested on chain");

  if (plan.atCorpusEdge) {
    atEdge++;
    console.log("   ⚠ this identity's first review is the corpus's first, so an earlier one");
    console.log("     would sit outside the file. A birth date cannot be revised.");
  }
  console.log();

  pending.push({ plan, data, to: request.to });
}

stopUnlessSending(
  send,
  `${pending.length} birth(s) ready. nothing was sent.`,
  atEdge === 0
    ? []
    : [
        `${atEdge} sit${atEdge === 1 ? "s" : ""} on the corpus edge — confirm no earlier review ` +
          "exists anywhere before broadcasting, because the date is permanent.",
      ],
);

// Past this point the key is read and money is spent.
const { account, wallet } = signer();
await refuseUnlessAffordable(
  publicClient,
  account,
  pending.map(({ plan, data, to }) => ({
    label: `the birth of ${plan.identity_id}`,
    to,
    data,
  })),
);

for (const { plan, data, to } of pending) {
  const hash = await wallet.sendTransaction({ to, data, value: 0n });
  console.log(`${plan.identity_id}`);
  console.log(`  tx     ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  status ${receipt.status}, gas ${receipt.gasUsed}`);

  // Confirmed by decoding the receipt's own logs, not by re-reading state. An
  // earlier version of the schema sender did the follow-up read, landed on an
  // RPC node that had not applied the block yet, and reported a correct
  // registration as a failure. The receipt carries its own proof.
  const attested = parseEventLogs({
    abi: [ATTESTED_EVENT],
    logs: receipt.logs,
  }).filter(
    (log) =>
      log.args.schemaUID.toLowerCase() === BIRTH_SCHEMA_UID.toLowerCase() &&
      log.args.recipient.toLowerCase() === plan.entity.toLowerCase(),
  );

  if (attested.length !== 1) {
    console.error(
      `  ✗ expected exactly one Attested event for this entity, found ${attested.length}.`,
    );
    console.error("    stopping before the next birth — investigate this transaction first.");
    process.exit(1);
  }
  console.log(`  uid    ${attested[0]!.args.uid}`);
  console.log();
}

console.log("record each identity_id, entity, first_seen, tx_hash, attestation_uid and");
console.log(`announced_at in ${ledgerPath}, then commit. A birth that is not recorded cannot`);
console.log("be found again, and it cannot be announced a second time.");
