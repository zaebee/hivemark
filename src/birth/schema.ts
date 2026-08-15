import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { encodePacked, keccak256 } from "viem";
import { identityId, ownerAddress } from "../identity.js";
import type { Genome } from "../types.js";

/**
 * The genome in full, not its hash.
 *
 * A hash would let a reader confirm a genome they already have; publishing the
 * fields lets them obtain one. With this record alone an outsider recomputes the
 * identity, the address and the bee — the same reasoning that put `leafDomain`
 * in the anchor schema.
 *
 * Version 2. Version 1 named a single `provider` and a `guardianVersion`, and
 * neither survives genome 2: the genome carries a provider for the finder and
 * one for the skeptic, and `guardian_sha` left it entirely because one identity
 * now spans several commits, so there is no single value to publish.
 *
 * A schema's UID derives from its text, so this is a new registration rather
 * than an edit — affordable only because no birth was ever announced against
 * version 1. Version 1 stays registered and unrevoked; nothing points at it.
 */
export const BIRTH_SCHEMA =
  "bytes32 identityId,address entity,string finderProvider,string skepticProvider," +
  "string finderModel,string skepticModel,string contextMode,string reviewFingerprint," +
  "string knownFields,uint16 genomeSchemaVersion,uint64 firstSeen";

const RESOLVER = "0x0000000000000000000000000000000000000000" as const;
const REVOCABLE = true;

/** Derived exactly as SchemaRegistry._getUID does; never fetched. */
export const BIRTH_SCHEMA_UID: `0x${string}` = keccak256(
  encodePacked(["string", "address", "bool"], [BIRTH_SCHEMA, RESOLVER, REVOCABLE]),
);

export function encodeBirth(genome: Genome, firstSeen: number): string {
  const id = identityId(genome);
  return new SchemaEncoder(BIRTH_SCHEMA).encodeData([
    { name: "identityId", type: "bytes32", value: id },
    { name: "entity", type: "address", value: ownerAddress(id) },
    { name: "finderProvider", type: "string", value: genome.finder_provider },
    // Empty string means "ran without a skeptic", matching skepticModel below.
    // The field is always present, so its absence can never be mistaken for it.
    { name: "skepticProvider", type: "string", value: genome.skeptic_provider ?? "" },
    { name: "finderModel", type: "string", value: genome.finder_model },
    // Empty string means "ran without a skeptic", which is a real configuration.
    // The field is always present, so its absence can never be mistaken for it.
    { name: "skepticModel", type: "string", value: genome.skeptic_model ?? "" },
    { name: "contextMode", type: "string", value: genome.context_mode },
    { name: "reviewFingerprint", type: "string", value: genome.review_fingerprint },
    // Part of the hash, so it has to be part of the record. Omitting it made the
    // schema's central promise false: a reader rebuilding the genome from the
    // published fields arrived at a different identity than the one named, and
    // the only way to supply it was a convention documented nowhere.
    { name: "knownFields", type: "string", value: genome.known_fields.join(",") },
    { name: "genomeSchemaVersion", type: "uint16", value: genome.schema_version },
    { name: "firstSeen", type: "uint64", value: firstSeen },
  ]);
}
