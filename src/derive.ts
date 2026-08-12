import { claimsOf } from "./claims.js";
import { genomeOf } from "./genome.js";
import { identityId, ownerAddress } from "./identity.js";
import type { ReviewRecord } from "./schema.js";
import type { Claim, SkepticAxis, TrackRecord } from "./types.js";

/**
 * Aggregate claims into one track record per identity.
 *
 * Derived on read and never stored, so a track record cannot drift from the
 * claims underneath it and cannot be tuned.
 */
export function deriveTrackRecords(records: ReviewRecord[]): TrackRecord[] {
  const byIdentity = new Map<`0x${string}`, { records: ReviewRecord[]; claims: Claim[] }>();

  for (const record of dedupe(records)) {
    const id = identityId(genomeOf(record));
    const bucket = byIdentity.get(id) ?? { records: [], claims: [] };
    bucket.records.push(record);
    bucket.claims.push(...claimsOf(record));
    byIdentity.set(id, bucket);
  }

  return [...byIdentity.entries()].map(([id, bucket]) => ({
    identity_id: id,
    owner_address: ownerAddress(id),
    genome: genomeOf(bucket.records[0]!),
    reviews: bucket.records.length,
    claims: bucket.claims.length,
    corpus: corpusOf(bucket.records),
    skeptic: skepticAxis(bucket.claims),
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
 */
function dedupe(records: ReviewRecord[]): ReviewRecord[] {
  const winners = new Map<string, ReviewRecord>();
  for (const record of records) {
    const key = `${record.url}|${record.head_sha}|${identityId(genomeOf(record))}`;
    const held = winners.get(key);
    if (!held || Date.parse(record.reviewed_at) > Date.parse(held.reviewed_at)) {
      winners.set(key, record);
    }
  }
  return [...winners.values()];
}

function skepticAxis(claims: Claim[]): SkepticAxis {
  const count = (v: Claim["verdict"]) => claims.filter((c) => c.verdict === v).length;
  const scored = claims.map((c) => c.impact_score).filter((s): s is number => s !== null);

  return {
    confirmed: count("confirmed"),
    refuted: count("refuted"),
    uncertain: count("uncertain"),
    unresolved: count("unresolved"),
    mean_impact: scored.length
      ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 100) / 100
      : null,
  };
}
