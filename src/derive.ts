import { byCodeUnit, canonicalJson } from "./canonical.js";
import { claimsOf } from "./claims.js";
import { genomeOf } from "./genome.js";
import { identityId, ownerAddress } from "./identity.js";
import type { ReviewRecord } from "./schema.js";
import type { Claim, Genome, Judge, SkepticAxis, TrackRecord } from "./types.js";

/**
 * Aggregate claims into one track record per identity.
 *
 * Derived on read and never stored, so a track record cannot drift from the
 * claims underneath it and cannot be tuned.
 */
export function deriveTrackRecords(records: ReviewRecord[]): TrackRecord[] {
  interface Bucket {
    readonly genome: Genome;
    readonly records: ReviewRecord[];
    readonly claims: Claim[];
    unparseable: number;
  }
  const byIdentity = new Map<`0x${string}`, Bucket>();

  const bucketFor = (record: ReviewRecord): Bucket => {
    const genome = genomeOf(record);
    const id = identityId(genome);
    const existing = byIdentity.get(id);
    if (existing) return existing;
    const fresh: Bucket = { genome, records: [], claims: [], unparseable: 0 };
    byIdentity.set(id, fresh);
    return fresh;
  };

  // Split before deduplicating, not after. `dedupe` keeps the latest run of a
  // (url, head_sha, identity) on the rule that a rerun is a correction — but a
  // run whose output could not be parsed corrects nothing, and letting it win
  // would discard real findings because a parser failed. Deduplicated within
  // each class, so two failed runs of one PR are one failure.
  for (const record of dedupe(records.filter((r) => !r.parse_failed))) {
    const bucket = bucketFor(record);
    bucket.records.push(record);
    bucket.claims.push(...claimsOf(record));
  }
  for (const record of dedupe(records.filter((r) => r.parse_failed))) {
    bucketFor(record).unparseable++;
  }

  return [...byIdentity.entries()].map(([id, bucket]) => ({
    identity_id: id,
    owner_address: ownerAddress(id),
    genome: bucket.genome,
    reviews: bucket.records.length,
    // Counted rather than dropped. A reviewer that ran and produced nothing
    // readable is not the same as one that never ran, and only one of those two
    // states can be told from a missing row.
    unparseable: bucket.unparseable,
    claims: bucket.claims.length,
    corpus: corpusOf(bucket.records),
    skeptic: skepticAxis(bucket.claims, bucket.genome),
    human: { available: false as const },
  }));
}

/**
 * Which projects this identity reviewed, most-reviewed first.
 *
 * Two identities can only be compared on the same corpus. In the real data they
 * are not: the graph-enabled reviewer saw cal.com and sentry, the diff-only one
 * saw discourse and keycloak. Carrying the corpus makes that visible instead of
 * leaving a confounded comparison looking clean.
 */
function corpusOf(records: ReviewRecord[]): ReadonlyArray<readonly [string, number]> {
  const counts = new Map<string, number>();
  for (const record of records) {
    counts.set(record.project, (counts.get(record.project) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}

/**
 * One review per (url, head_sha, identity); the later `reviewed_at` wins.
 *
 * A rerun is a correction, not extra evidence — counting both would let a
 * reviewer improve its record simply by being run twice.
 *
 * Ordering is by parsed instant, not by string. Today's writer emits UTC with a
 * uniform offset, where the two agree — but a lexicographic comparison is only
 * accidentally correct, and it inverts the moment two offsets differ
 * (`14:00+03:00` sorts after `12:00+00:00` while happening an hour earlier).
 * The schema guarantees these parse, so no NaN reaches this comparison.
 *
 * Two records on the same instant are settled by `supersedes` below, and the key
 * is encoded rather than concatenated. Both exist because the obvious versions
 * made the result depend on the order the file happened to be written in.
 */
/**
 * Deliberate repeat runs are collapsed here, and that is a known limitation
 * rather than a decision.
 *
 * `dedupe` exists so an accidental re-run cannot inflate a track record: the
 * same reviewer, the same commit, keep the newest. Under `guardian_sha` that
 * never touched the Phase 3 repeat runs, because three runs of one
 * configuration carried three shas and therefore three identities.
 *
 * Keying identity on the review fingerprint makes them one reviewer — correctly,
 * that is the whole point — and they become indistinguishable from a corrected
 * re-run. Measured on the current corpus: 115 records deduplicate to 83 where
 * they previously gave 108, and mistral drops from 45 reviews to 19. Two of
 * every three noise-floor samples are discarded, which is exactly what those
 * runs were made to provide.
 *
 * Accepted for now, with the numbers stated so nobody rediscovers them as a
 * bug. The real question is whether a track record should count *runs* or
 * *distinct commits reviewed*, and nothing in a record distinguishes a
 * deliberate resample from a correction — so it is a change to what the
 * project's central number means, and deserves its own design rather than a
 * widened key here.
 *
 * Signing is unaffected: `run()` attests every harvested record, not the
 * deduplicated set, so an anchor covers all 932 claims either way.
 */
export function dedupe(records: readonly ReviewRecord[]): ReviewRecord[] {
  const winners = new Map<string, ReviewRecord>();
  for (const record of records) {
    // Encoded, not concatenated. Joining with a delimiter assumes the fields
    // cannot contain it, and the schema constrains neither alphabet: a url
    // ending "…/1|abc" with sha "def" collided with url "…/1" and sha "abc|def",
    // and the loser vanished without a warning.
    const key = JSON.stringify([record.url, record.head_sha, identityId(genomeOf(record))]);
    const held = winners.get(key);
    if (held === undefined || supersedes(record, held)) {
      winners.set(key, record);
    }
  }
  return [...winners.values()];
}

/**
 * Does this record replace the one already held?
 *
 * Later wins. On the same instant nothing about time can decide it, so the tie
 * breaks on content — the greater canonical form — which is arbitrary but
 * settled, and is the only part that matters: a strict comparison let the tie
 * fall to whichever record the file happened to list first, so a track record
 * depended on line order. The design calls it derived from the facts, and the
 * order of lines in an append-only file is not a fact about a reviewer.
 *
 * This is emphatically not a claim about which of two same-second records was
 * the correction. That is unknowable from the data, and picking deterministically
 * is the honest response to not knowing.
 */
function supersedes(record: ReviewRecord, held: ReviewRecord): boolean {
  const at = Date.parse(record.reviewed_at);
  const heldAt = Date.parse(held.reviewed_at);
  if (at !== heldAt) return at > heldAt;
  return byCodeUnit(canonicalJson(record), canonicalJson(held)) > 0;
}

/**
 * Who judged these claims, from the genome alone.
 *
 * Compared case-insensitively, because the two mistakes are not symmetric.
 * Treating `Mistral-Medium-Latest` and `mistral-medium-latest` as different
 * models publishes a self-graded rate as an independently confirmed one, with a
 * green badge — the exact failure this function exists to prevent. The opposite
 * error would require two genuinely different models whose names differ only in
 * case, which is not a thing.
 *
 * The upstream schema is a bare `z.string()`, so nothing enforces casing on the
 * way in.
 */
export function judgeOf(genome: Genome): Judge {
  if (genome.skeptic_model === null) return "nobody";
  return genome.skeptic_model.toLowerCase() === genome.finder_model.toLowerCase()
    ? "self"
    : "independent";
}

function skepticAxis(claims: Claim[], genome: Genome): SkepticAxis {
  const count = (v: Claim["verdict"]) => claims.filter((c) => c.verdict === v).length;
  const scored = claims.map((c) => c.impact_score).filter((s): s is number => s !== null);

  return {
    judge: judgeOf(genome),
    confirmed: count("confirmed"),
    refuted: count("refuted"),
    uncertain: count("uncertain"),
    unresolved: count("unresolved"),
    mean_impact: scored.length
      ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 100) / 100
      : null,
  };
}
