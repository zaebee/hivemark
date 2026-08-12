import { z } from "zod";
import { periodId, periodsBetween, type PeriodId } from "./period.js";

const Hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

export const AnchorRecordSchema = z
  .object({
    /**
     * Validated into a `PeriodId` at the boundary, not merely shape-checked.
     * A ledger naming a week that never happened would otherwise load fine and
     * produce nonsense gaps.
     */
    period: z.string().transform((value, ctx) => {
      try {
        return periodId(value);
      } catch (error) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: error instanceof Error ? error.message : "invalid period",
        });
        return z.NEVER;
      }
    }),
    root: Hex32,
    count: z.number().int().min(1),
    /**
     * The uids this root covered, stored rather than recomputed.
     *
     * A proof has to stay checkable years later. Recomputing the set from the
     * pipeline's current output would make old proofs depend on code that has
     * moved on; pinning it here makes the record self-contained.
     */
    uids: z.array(Hex32).min(1),
    tx_hash: Hex32,
    attestation_uid: Hex32,
    anchored_at: z.string(),
  })
  .refine((r) => r.uids.length === r.count, {
    message: "count disagrees with the number of uids anchored",
  });

export type AnchorRecord = z.infer<typeof AnchorRecordSchema>;

export function loadLedger(text: string): AnchorRecord[] {
  // An empty file is refused rather than read as "no anchors yet". Treating it
  // as an empty ledger is the dangerous reading: the tool would offer to anchor
  // weeks that are already anchored, and the second root for a week makes it
  // ambiguous which one a proof should be checked against. A truncated ledger is
  // a corruption to notice, not a state to tolerate.
  if (text.trim() === "") {
    throw new Error("anchor ledger is empty; an unanchored ledger is the text []");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new Error(`anchor ledger is not valid JSON: ${(cause as Error).message}`);
  }

  const records = z.array(AnchorRecordSchema).parse(parsed);

  // One anchor per period. Two roots for one week would mean the record cannot
  // say which one a proof should be checked against.
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.period)) {
      throw new Error(`period is already anchored: ${record.period}`);
    }
    seen.add(record.period);
  }
  return records;
}

/**
 * Periods in the range with no anchor.
 *
 * These are gaps, not a backlog: a week that went unanchored stays unanchored,
 * because an anchor claims its contents existed by a date that has now passed.
 */
export function gapsIn(
  records: readonly AnchorRecord[],
  from: PeriodId,
  to: PeriodId,
): PeriodId[] {
  const anchored = new Set(records.map((r) => r.period));
  return periodsBetween(from, to).filter((period) => !anchored.has(period));
}

export function recordFor(
  records: readonly AnchorRecord[],
  period: PeriodId,
): AnchorRecord | null {
  return records.find((r) => r.period === period) ?? null;
}
