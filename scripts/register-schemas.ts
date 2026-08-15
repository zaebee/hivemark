/**
 * Print the three schema-registration transactions. Sends nothing.
 *
 * The same shape as `cli-anchor`: whatever this prints is exactly what a human
 * then broadcasts, and the printing is separated from the spending so the two
 * can be checked apart.
 *
 * Registration is one-off. Because a UID is derived rather than assigned, every
 * attestation already signed becomes decodable the moment its schema exists, and
 * nothing is re-signed.
 *
 * That "registering late costs only visibility" is true of the offchain
 * attestations on disk and false of anything onchain: EAS reverts `attest` on an
 * unregistered schema — `0xbf37b20e`, `InvalidSchema()`, observed against Base
 * mainnet. Run this before the first birth or anchor, not after.
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

/**
 * The UIDs the signed attestations actually name, as literals.
 *
 * These are the point of the script and they must not be imported. The first
 * version compared the UID derived from the calldata against the module's
 * exported constant — but that constant is itself computed from the same schema
 * string at import time, so the comparison reduced to `keccak(x) === keccak(x)`
 * and held for any schema whatsoever. Probed: renaming one field printed
 * "✓ matches" for a transaction registering something no attestation names, and
 * exited zero.
 *
 * A literal is external to the code being checked, which is the whole
 * difference. Editing a schema now fails here, in the script a human runs
 * immediately before spending, rather than only in a test suite that the same
 * edit would invite them to update.
 */
const EXPECTED = {
  claim: "0x9c6648261df139b4453dd540ed2e8d821a9e775beede14ba9aae9e7202daacfb",
  anchor: "0x8ff2e1ad6186bbe4c1ac54ea7d969dcf04a8caa7d31e8ac45127bfa3cfba06bd",
  birth: "0xde2b5303867b8d593b14ccccf4e168d1e8afbce0a66881facf1f9047799e01e5",
} as const;

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

  // Decode what was just encoded and re-derive the UID from *that*, so the
  // number checked below comes from the bytes that would actually be sent.
  const [decodedSchema, decodedResolver, decodedRevocable] = decodeFunctionData({
    abi: REGISTER_ABI,
    data,
  }).args;
  const derived = keccak256(
    encodePacked(["string", "address", "bool"], [decodedSchema, decodedResolver, decodedRevocable]),
  );

  // Two independent comparisons against the literal, which say different things.
  // The first: these bytes register the schema the attestations name. The
  // second: the module's own constant still agrees with that, so a drifted
  // constant is reported rather than hidden by the calldata being right.
  const expected = EXPECTED[name];
  const sendsRight = derived === expected;
  const codeAgrees = uid === expected;
  if (!sendsRight || !codeAgrees) failures++;

  console.log(`── ${name} schema`);
  console.log(`to        ${SCHEMA_REGISTRY}`);
  console.log(`value     0 wei`);
  console.log(`expected  ${expected}`);
  console.log(`derived   ${derived}  ${sendsRight ? "✓ the calldata registers this uid" : "✗ WRONG UID"}`);
  console.log(`in code   ${uid}  ${codeAgrees ? "✓ agrees" : "✗ the constant has drifted"}`);
  console.log(`schema    ${schema}`);
  if (sendsRight && codeAgrees) {
    console.log(`data      ${data}`);
  } else {
    // Withheld rather than printed with a warning three lines above it. A human
    // scrolling, or piping this to a file where the exit code evaporates, must
    // not be able to copy calldata that was refused.
    console.log(`data      withheld — this transaction would not register ${expected}`);
  }
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
