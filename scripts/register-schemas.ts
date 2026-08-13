/**
 * Print the three schema-registration transactions. Sends nothing.
 *
 * The same shape as `cli-anchor`: whatever this prints is exactly what a human
 * then broadcasts, and the printing is separated from the spending so the two
 * can be checked apart.
 *
 * Registration is one-off and is what makes attestations resolve on easscan.
 * Because a UID is derived rather than assigned, **every attestation already
 * signed becomes resolvable the moment its schema exists** — nothing is
 * re-signed, and registering late costs only visibility, never validity.
 *
 *   bun scripts/register-schemas.ts
 */

import { decodeFunctionData, encodeFunctionData, encodePacked, keccak256 } from "viem";
import { ANCHOR_SCHEMA, ANCHOR_SCHEMA_UID } from "../src/anchor/schema.js";
import { CLAIM_SCHEMA, CLAIM_SCHEMA_UID } from "../src/attest/schema.js";
import { BIRTH_SCHEMA, BIRTH_SCHEMA_UID } from "../src/birth/schema.js";

/** Base mainnet, from eas-contracts `deployments/base/`. Same source as the EAS address. */
const SCHEMA_REGISTRY = "0x4200000000000000000000000000000000000020" as const;

/**
 * Both values are inputs to the UID, not preferences.
 *
 * A different resolver or a different `revocable` produces a different UID, and
 * the 112 attestations already signed would then point at a schema that does not
 * exist. They are named here so the transaction cannot be built with one value
 * and the UID checked against another.
 */
const RESOLVER = "0x0000000000000000000000000000000000000000" as const;
const REVOCABLE = true;

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
  { name: "claim", schema: CLAIM_SCHEMA, uid: CLAIM_SCHEMA_UID },
  { name: "anchor", schema: ANCHOR_SCHEMA, uid: ANCHOR_SCHEMA_UID },
  { name: "birth", schema: BIRTH_SCHEMA, uid: BIRTH_SCHEMA_UID },
] as const;

let failures = 0;

for (const { name, schema, uid } of SCHEMAS) {
  const data = encodeFunctionData({
    abi: REGISTER_ABI,
    functionName: "register",
    args: [schema, RESOLVER, REVOCABLE],
  });

  // Decode what was just encoded and re-derive the UID from *that*, rather than
  // trusting that the arguments went in unchanged. This is the whole point of
  // the script: it proves the printed bytes register the schema under the UID
  // the signed attestations already name, instead of asserting it in prose.
  const [decodedSchema, decodedResolver, decodedRevocable] = decodeFunctionData({
    abi: REGISTER_ABI,
    data,
  }).args;
  const derived = keccak256(
    encodePacked(["string", "address", "bool"], [decodedSchema, decodedResolver, decodedRevocable]),
  );

  const agrees = derived === uid;
  if (!agrees) failures++;

  console.log(`── ${name} schema`);
  console.log(`to        ${SCHEMA_REGISTRY}`);
  console.log(`value     0 wei`);
  console.log(`uid       ${uid}`);
  console.log(`derived   ${derived}  ${agrees ? "✓ matches" : "✗ DOES NOT MATCH — do not send"}`);
  console.log(`schema    ${schema}`);
  console.log(`data      ${data}`);
  console.log();
}

console.log(`resolver ${RESOLVER}, revocable ${REVOCABLE} — both are inputs to every UID above.`);
console.log("nothing was sent. see docs/anchoring.md to broadcast these.");

if (failures > 0) {
  // A mismatch means the printed transaction would register a schema under some
  // other identifier, leaving every signed attestation pointing at nothing.
  console.error(`\n${failures} schema(s) would register under the wrong uid — refusing.`);
  process.exit(1);
}
