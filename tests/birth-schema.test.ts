import { describe, expect, it } from "vitest";
import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { BIRTH_SCHEMA, BIRTH_SCHEMA_UID, encodeBirth } from "../src/birth/schema.js";
import { ANCHOR_SCHEMA_UID } from "../src/anchor/schema.js";
import { CLAIM_SCHEMA_UID } from "../src/attest/schema.js";
import { identityId, ownerAddress } from "../src/identity.js";
import type { Genome } from "../src/types.js";

const genome: Genome = {
  schema_version: 2,
  known_fields: [
    "context_mode",
    "finder_model",
    "review_fingerprint",
    "provider",
    "skeptic_model",
  ],
  finder_provider: "gemini",

  skeptic_provider: "gemini",
  finder_model: "gemini-2.5-flash",
  skeptic_model: "gemini-3.5-flash",
  context_mode: "graph",
  review_fingerprint: "d0d807ef01c556b882dc85b9fc0d2851d92aa1e5",
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

/**
 * Genome 1, which is what birth schema 1 can represent. The tests below describe
 * that schema's behaviour, and it stays registered until phase 2 replaces it.
 */
const legacyGenome = { ...genome, schema_version: 1 } as unknown as Genome;

describe("encodeBirth", () => {
  it("round-trips through the EAS schema encoder", () => {
    const byName = decode(encodeBirth(legacyGenome, FIRST_SEEN));
    expect(String(byName.identityId)).toBe(identityId(legacyGenome));
    expect(String(byName.finderModel)).toBe(genome.finder_model);
    expect(Number(byName.firstSeen)).toBe(FIRST_SEEN);
  });

  it("names the entity by its derived, keyless address", () => {
    const byName = decode(encodeBirth(legacyGenome, FIRST_SEEN));
    expect(String(byName.entity).toLowerCase()).toBe(
      ownerAddress(identityId(legacyGenome)).toLowerCase(),
    );
  });

  it("writes an absent skeptic as an empty string, not as a missing field", () => {
    // A reader must be able to tell "no skeptic" from "field not published".
    const byName = decode(encodeBirth({ ...legacyGenome, skeptic_model: null }, FIRST_SEEN));
    expect(String(byName.skepticModel)).toBe("");
  });

  it("refuses a genome this schema cannot represent", () => {
    // The promise these two tests used to assert — a reader can rebuild the
    // genome from the record and recompute the identity — is false for genome 2
    // against birth schema 1, which has one provider field where the genome has
    // finder_provider and skeptic_provider. `skeptic_provider` would be lost and
    // the rebuilt identity would differ.
    //
    // Refused rather than encoded with a warning, because a warning does not
    // stop a broadcast and the record would be permanent. Phase 2 registers a
    // version 2 of the schema and restores the round trip.
    expect(() => encodeBirth(genome, FIRST_SEEN)).toThrow(/cannot represent genome schema 2/);
  });

  it("names both provider fields in the refusal, so the fix is obvious", () => {
    expect(() => encodeBirth(genome, FIRST_SEEN)).toThrow(/finder_provider and skeptic_provider/);
  });

  it("still encodes a genome 1 record, which is what is registered", () => {
    // Nothing has been announced against schema 1, but it is the registered
    // schema and must keep working until schema 2 replaces it.
    expect(() => encodeBirth(legacyGenome, FIRST_SEEN)).not.toThrow();
  });
});
