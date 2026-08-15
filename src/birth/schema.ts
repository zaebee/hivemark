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
 */
export const BIRTH_SCHEMA =
  "bytes32 identityId,address entity,string provider,string finderModel," +
  "string skepticModel,string contextMode,string guardianVersion," +
  "string knownFields,uint16 genomeSchemaVersion,uint64 firstSeen";

const RESOLVER = "0x0000000000000000000000000000000000000000" as const;
const REVOCABLE = true;

/** Derived exactly as SchemaRegistry._getUID does; never fetched. */
export const BIRTH_SCHEMA_UID: `0x${string}` = keccak256(
  encodePacked(["string", "address", "bool"], [BIRTH_SCHEMA, RESOLVER, REVOCABLE]),
);

export function encodeBirth(genome: Genome, firstSeen: number): string {
  // Genome 2 cannot be represented by this schema, and encoding it anyway would
  // publish a record that fails the one promise the schema exists to make: that
  // a reader can rebuild the genome from it and recompute the identity. The
  // genome now carries two provider fields where this has one, so
  // `skeptic_provider` would be lost and the rebuilt identity would differ.
  //
  // Refused rather than encoded with a note, because a note does not stop a
  // broadcast. Phase 2 registers a version 2 of this schema — cheap, since no
  // birth has been announced against version 1 — and this guard comes off then.
  if (genome.schema_version >= 2) {
    throw new Error(
      `birth schema 1 cannot represent genome schema ${genome.schema_version}: ` +
        `it has one provider field where the genome has finder_provider and skeptic_provider, ` +
        `so a reader could not rebuild the genome from the record. Register birth schema 2 first.`,
    );
  }

  const id = identityId(genome);
  return new SchemaEncoder(BIRTH_SCHEMA).encodeData([
    { name: "identityId", type: "bytes32", value: id },
    { name: "entity", type: "address", value: ownerAddress(id) },
    // Phase 1 writes the finder's provider into a field named `provider` and
    // the fingerprint into one named `guardianVersion`. Both names are now
    // inaccurate, and neither can be renamed: the schema is registered on Base
    // and its UID is derived from the text. Phase 2 registers a version 2 with
    // the right names — cheap, because no birth has been announced against
    // this one. Until then nothing may be broadcast from here.
    { name: "provider", type: "string", value: genome.finder_provider },
    { name: "finderModel", type: "string", value: genome.finder_model },
    // Empty string means "ran without a skeptic", which is a real configuration.
    // The field is always present, so its absence can never be mistaken for it.
    { name: "skepticModel", type: "string", value: genome.skeptic_model ?? "" },
    { name: "contextMode", type: "string", value: genome.context_mode },
    { name: "guardianVersion", type: "string", value: genome.review_fingerprint },
    // Part of the hash, so it has to be part of the record. Omitting it made the
    // schema's central promise false: a reader rebuilding the genome from the
    // published fields arrived at a different identity than the one named, and
    // the only way to supply it was a convention documented nowhere.
    { name: "knownFields", type: "string", value: genome.known_fields.join(",") },
    { name: "genomeSchemaVersion", type: "uint16", value: genome.schema_version },
    { name: "firstSeen", type: "uint64", value: firstSeen },
  ]);
}
