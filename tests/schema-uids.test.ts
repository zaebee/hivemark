import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ANCHOR_SCHEMA, ANCHOR_SCHEMA_UID } from "../src/anchor/schema.js";
import { CLAIM_SCHEMA, CLAIM_SCHEMA_UID } from "../src/attest/schema.js";
import { BIRTH_SCHEMA, BIRTH_SCHEMA_UID } from "../src/birth/schema.js";

/**
 * The three schema UIDs, pinned to literals.
 *
 * A UID is derived from the schema string, the resolver and the revocable flag,
 * so editing a schema silently changes it. That was harmless while nothing had
 * been signed. It is not harmless now: attestations exist that name these UIDs,
 * and a changed schema would leave them pointing at something that was never
 * registered — valid signatures over a schema nobody can resolve.
 *
 * If one of these fails, the schema was edited. That is a breaking change, not a
 * test to update: it needs a new registration transaction, and every attestation
 * signed under the old UID has to be re-signed or accepted as orphaned. Decide
 * that deliberately, then change the literal.
 */
describe("schema uids are a published contract", () => {
  const PINNED = [
    ["claim", CLAIM_SCHEMA_UID, "0x9c6648261df139b4453dd540ed2e8d821a9e775beede14ba9aae9e7202daacfb"],
    ["anchor", ANCHOR_SCHEMA_UID, "0x8ff2e1ad6186bbe4c1ac54ea7d969dcf04a8caa7d31e8ac45127bfa3cfba06bd"],
    ["birth", BIRTH_SCHEMA_UID, "0xde2b5303867b8d593b14ccccf4e168d1e8afbce0a66881facf1f9047799e01e5"],
  ] as const;

  for (const [name, actual, expected] of PINNED) {
    it(`${name} keeps the uid its attestations were signed under`, () => {
      expect(actual).toBe(expected);
    });
  }

  it("pins the schema texts too, so a field cannot be renamed unnoticed", () => {
    // The UID check above would already catch this. It is repeated in the plain
    // text because a failing hash says only "something moved", while a failing
    // string says which field, which is what the person reading the failure
    // needs in order to decide whether to accept the break.
    expect(CLAIM_SCHEMA).toBe(
      "bytes32 identityId,string repo,uint32 pr,string commitSha,string file,uint32 line," +
        "string category,string severity,uint8 confidence,uint8 verdict,uint8 impactScore,bytes32 claimHash",
    );
    expect(ANCHOR_SCHEMA).toBe(
      "bytes32 root,uint64 periodStart,uint64 periodEnd,uint32 count,string leafDomain",
    );
    expect(BIRTH_SCHEMA).toBe(
      "bytes32 identityId,address entity,string finderProvider,string skepticProvider," +
        "string finderModel,string skepticModel,string contextMode,string reviewFingerprint," +
        "string knownFields,uint16 genomeSchemaVersion,uint64 firstSeen",
    );
  });

  it("agrees with the runbook a human reads before spending gas", () => {
    // docs/anchoring.md carries the same three UIDs in a table. A person about to
    // broadcast reads that table, not this file.
    const doc = readFileSync("docs/anchoring.md", "utf8");
    for (const [name, , expected] of PINNED) {
      // Its own row, not merely present somewhere on the page: a table with two
      // UIDs swapped between rows would satisfy a containment check while
      // telling a reader the wrong thing about which schema is which.
      const row = new RegExp(`^\\|\\s*${name}\\s*\\|.*\`${expected}\``, "m");
      expect(doc, `${name} uid is not in the ${name} row of the runbook table`).toMatch(row);
    }
  });
});
