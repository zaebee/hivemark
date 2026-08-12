import { SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { encodePacked, keccak256 } from "viem";
import { LEAF_DOMAIN } from "./tree.js";

export interface AnchorPayload {
  readonly root: `0x${string}`;
  readonly periodStart: number;
  readonly periodEnd: number;
  readonly count: number;
}

/**
 * `leafDomain` is in the schema on purpose.
 *
 * A root is only checkable by someone who can rebuild the leaves, and the leaf
 * preimage is our invention rather than anything EAS specifies. Publishing it
 * with the root means an outsider needs no documentation from us to verify an
 * inclusion proof — which is the whole point of anchoring in public.
 */
export const ANCHOR_SCHEMA =
  "bytes32 root,uint64 periodStart,uint64 periodEnd,uint32 count,string leafDomain";

const RESOLVER = "0x0000000000000000000000000000000000000000" as const;
const REVOCABLE = true;

/** Derived exactly as SchemaRegistry._getUID does; never fetched. */
export const ANCHOR_SCHEMA_UID: `0x${string}` = keccak256(
  encodePacked(["string", "address", "bool"], [ANCHOR_SCHEMA, RESOLVER, REVOCABLE]),
);

export function encodeAnchor(payload: AnchorPayload): string {
  return new SchemaEncoder(ANCHOR_SCHEMA).encodeData([
    { name: "root", type: "bytes32", value: payload.root },
    { name: "periodStart", type: "uint64", value: payload.periodStart },
    { name: "periodEnd", type: "uint64", value: payload.periodEnd },
    { name: "count", type: "uint32", value: payload.count },
    { name: "leafDomain", type: "string", value: LEAF_DOMAIN },
  ]);
}
