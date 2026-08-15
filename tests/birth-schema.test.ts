import { describe, expect, it } from "vitest";
import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { BIRTH_SCHEMA, BIRTH_SCHEMA_UID, encodeBirth } from "../src/birth/schema.js";
import { ANCHOR_SCHEMA_UID } from "../src/anchor/schema.js";
import { CLAIM_SCHEMA_UID } from "../src/attest/schema.js";
import { identityId, ownerAddress } from "../src/identity.js";
import type { Genome } from "../src/types.js";

const genome: Genome = {
  schema_version: 2,
  known_fields: ["context_mode", "finder_model", "finder_provider", "review_fingerprint", "skeptic_model", "skeptic_provider"],
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
    // One field per genome field, which is what lets a reader rebuild the
    // genome rather than merely confirm one they already hold.
    for (const field of [
      "finderProvider",
      "skepticProvider",
      "finderModel",
      "skepticModel",
      "contextMode",
      "reviewFingerprint",
    ]) {
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
    // The promise this schema exists to make: a reader holding only the record
    // rebuilds the genome, hashes it, and gets the identity the record claims.
    // Version 1 could not keep it for genome 2 — one provider field where the
    // genome has two — which is why this schema was replaced rather than edited.
    const byName = decode(encodeBirth(genome, FIRST_SEEN));
    const rebuilt: Genome = {
      schema_version: Number(byName.genomeSchemaVersion),
      known_fields: String(byName.knownFields).split(","),
      finder_provider: String(byName.finderProvider),
      skeptic_provider:
        String(byName.skepticProvider) === "" ? null : String(byName.skepticProvider),
      finder_model: String(byName.finderModel),
      skeptic_model: String(byName.skepticModel) === "" ? null : String(byName.skepticModel),
      context_mode: String(byName.contextMode) as Genome["context_mode"],
      review_fingerprint: String(byName.reviewFingerprint),
    };
    expect(identityId(rebuilt)).toBe(String(byName.identityId));
  });

  it("recomputes the identity for a skeptic-less genome too", () => {
    // Both empty fields decode back to null, so "no skeptic ran" survives the
    // round trip rather than becoming an empty-string provider.
    const none = { ...genome, skeptic_model: null, skeptic_provider: null };
    const byName = decode(encodeBirth(none, FIRST_SEEN));
    const rebuilt: Genome = {
      schema_version: Number(byName.genomeSchemaVersion),
      known_fields: String(byName.knownFields).split(","),
      finder_provider: String(byName.finderProvider),
      skeptic_provider:
        String(byName.skepticProvider) === "" ? null : String(byName.skepticProvider),
      finder_model: String(byName.finderModel),
      skeptic_model: String(byName.skepticModel) === "" ? null : String(byName.skepticModel),
      context_mode: String(byName.contextMode) as Genome["context_mode"],
      review_fingerprint: String(byName.reviewFingerprint),
    };
    expect(identityId(rebuilt)).toBe(String(byName.identityId));
  });

  it("carries no field the genome does not have", () => {
    // guardianVersion is gone because guardian_sha left the genome: one identity
    // now spans several commits, so there is no single value to publish.
    expect(BIRTH_SCHEMA).not.toMatch(/guardianVersion/);
    expect(BIRTH_SCHEMA).not.toMatch(/string provider\b/);
  });
});
