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
    ["birth", BIRTH_SCHEMA_UID, "0x6ca5f932f49e5ac467c1ca24c5af39800a12df874d3856b4afdd54800c07ed02"],
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
      "bytes32 identityId,address entity,string provider,string finderModel,string skepticModel," +
        "string contextMode,string guardianVersion,string knownFields,uint16 genomeSchemaVersion," +
        "uint64 firstSeen",
    );
  });

  it("agrees with the runbook a human reads before spending gas", () => {
    // docs/anchoring.md carries the same three UIDs in a table. A person about to
    // broadcast reads that table, not this file.
    const doc = readFileSync("docs/anchoring.md", "utf8");
    for (const [name, , expected] of PINNED) {
      expect(doc, `${name} uid missing from the runbook`).toContain(expected);
    }
  });
});
