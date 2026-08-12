import { describe, expect, it } from "vitest";
import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { buildBirthRequest } from "../src/birth/submit.js";
import { BIRTH_SCHEMA, BIRTH_SCHEMA_UID } from "../src/birth/schema.js";
import { EAS_CONTRACT } from "../src/attest/domain.js";
import { identityId, ownerAddress } from "../src/identity.js";
import type { Genome } from "../src/types.js";
import type { BirthPlan } from "../src/birth/plan.js";

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

const plan: BirthPlan = {
  identity_id: identityId(genome),
  entity: ownerAddress(identityId(genome)),
  genome,
  firstSeen: 1_786_527_600,
};

describe("buildBirthRequest", () => {
  it("targets the EAS contract on Base", () => {
    expect(buildBirthRequest(plan).to).toBe(EAS_CONTRACT);
  });

  it("addresses the entity itself as recipient", () => {
    // Unlike an anchor, which is about a period and names nobody, a birth is
    // about this entity — so the derived address is the right recipient.
    expect(buildBirthRequest(plan).recipient).toBe(plan.entity);
  });

  it("carries a payload that recomputes to the identity it names", () => {
    const request = buildBirthRequest(plan);
    expect(request.schema).toBe(BIRTH_SCHEMA_UID);
    const decoded = new SchemaEncoder(BIRTH_SCHEMA).decodeData(request.data);
    const byName = Object.fromEntries(decoded.map((d) => [d.name, d.value.value]));
    expect(String(byName.identityId)).toBe(plan.identity_id);
  });

  it("sends no value and never expires", () => {
    const request = buildBirthRequest(plan);
    expect(request.value).toBe(0n);
    expect(request.expirationTime).toBe(0n);
  });

  it("refuses a plan whose genome does not hash to its identity", () => {
    // A contradiction that must never reach the chain: the published fields
    // would recompute to a different entity than the one named, and nothing can
    // correct it afterwards.
    const lying = { ...plan, identity_id: `0x${"99".repeat(32)}` } as BirthPlan;
    expect(() => buildBirthRequest(lying)).toThrow(/does not match its genome/i);
  });

  it("refuses a plan whose entity is not the address of its identity", () => {
    const wrongEntity = {
      ...plan,
      entity: "0x000000000000000000000000000000000000dEaD",
    } as BirthPlan;
    expect(() => buildBirthRequest(wrongEntity)).toThrow(/entity/i);
  });
});
