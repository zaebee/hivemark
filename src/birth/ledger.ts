import { z } from "zod";

const Hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

export const BirthRecordSchema = z.object({
  identity_id: Hex32,
  entity: Address,
  first_seen: z.number().int().min(0),
  tx_hash: Hex32,
  attestation_uid: Hex32,
  announced_at: z.string(),
});

export type BirthRecord = z.infer<typeof BirthRecordSchema>;

export function loadBirths(text: string): BirthRecord[] {
  // Refused rather than read as "nobody announced yet" — the dangerous reading,
  // since a truncated file would re-announce identities that already have a
  // birth record, and two births for one entity leave no way to say which is
  // authoritative.
  if (text.trim() === "") {
    throw new Error("birth ledger is empty; an unannounced ledger is the text []");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new Error(`birth ledger is not valid JSON: ${(cause as Error).message}`);
  }

  const records = z.array(BirthRecordSchema).parse(parsed);

  // Compared case-insensitively: hex casing carries no meaning, so two spellings
  // of one id are one identity and must not pass as two births.
  const seen = new Set<string>();
  for (const record of records) {
    const key = record.identity_id.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`identity is already announced: ${record.identity_id}`);
    }
    seen.add(key);
  }
  return records;
}

export function announced(
  records: readonly BirthRecord[],
  identityId: string,
): BirthRecord | null {
  const key = identityId.toLowerCase();
  return records.find((r) => r.identity_id.toLowerCase() === key) ?? null;
}
