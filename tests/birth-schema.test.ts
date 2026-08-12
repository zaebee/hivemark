import { describe, expect, it } from "vitest";
import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { BIRTH_SCHEMA, BIRTH_SCHEMA_UID, encodeBirth } from "../src/birth/schema.js";
import { ANCHOR_SCHEMA_UID } from "../src/anchor/schema.js";
import { CLAIM_SCHEMA_UID } from "../src/attest/schema.js";
import { identityId, ownerAddress } from "../src/identity.js";
import type { Genome } from "../src/types.js";

const genome: Genome = {
  schema_version: 1,
  known_fields: [
    "context_mode",
    "finder_model",
    "guardian_version",
    "provider",
    "skeptic_model",
  ],
  provider: "gemini",
  finder_model: "gemini-2.5-flash",
  skeptic_model: "gemini-3.5-flash",
  context_mode: "graph",
  guardian_version: "d0d807ef01c556b882dc85b9fc0d2851d92aa1e5",
};

const FIRST_SEEN = 1_786_527_600;

const decode = (data: string): Record<string, unknown> =>
  Object.fromEntries(
    new SchemaEncoder(BIRTH_SCHEMA).decodeData(data).map((d) => [d.name, d.value.value]),
  );

describe("BIRTH_SCHEMA", () => {
  it("has a UID distinct from the other two schemas", () => {
    expect(BIRTH_SCHEMA_UID).toMatch(/^0x[0-9a-f]{64}$/);
    expect(BIRTH_SCHEMA_UID).not.toBe(CLAIM_SCHEMA_UID);
    expect(BIRTH_SCHEMA_UID).not.toBe(ANCHOR_SCHEMA_UID);
  });

  it("publishes the genome, not only its hash", () => {
    for (const field of ["finderModel", "skepticModel", "contextMode", "guardianVersion"]) {
      expect(BIRTH_SCHEMA).toContain(field);
    }
  });
});

describe("encodeBirth", () => {
  it("round-trips through the EAS schema encoder", () => {
    const byName = decode(encodeBirth(genome, FIRST_SEEN));
    expect(String(byName.identityId)).toBe(identityId(genome));
    expect(String(byName.finderModel)).toBe(genome.finder_model);
    expect(Number(byName.firstSeen)).toBe(FIRST_SEEN);
  });

  it("names the entity by its derived, keyless address", () => {
    const byName = decode(encodeBirth(genome, FIRST_SEEN));
    expect(String(byName.entity).toLowerCase()).toBe(
      ownerAddress(identityId(genome)).toLowerCase(),
    );
  });

  it("writes an absent skeptic as an empty string, not as a missing field", () => {
    // A reader must be able to tell "no skeptic" from "field not published".
    const byName = decode(encodeBirth({ ...genome, skeptic_model: null }, FIRST_SEEN));
    expect(String(byName.skepticModel)).toBe("");
  });

  it("publishes enough to recompute the identity it names", () => {
    // The property the whole schema exists for: a reader rebuilds the genome
    // from the record and arrives at the same identity.
    const byName = decode(encodeBirth(genome, FIRST_SEEN));
    const rebuilt: Genome = {
      schema_version: Number(byName.genomeSchemaVersion),
      known_fields: genome.known_fields,
      provider: String(byName.provider) as Genome["provider"],
      finder_model: String(byName.finderModel),
      skeptic_model: String(byName.skepticModel) === "" ? null : String(byName.skepticModel),
      context_mode: String(byName.contextMode) as Genome["context_mode"],
      guardian_version: String(byName.guardianVersion),
    };
    expect(identityId(rebuilt)).toBe(String(byName.identityId));
  });
});
