
/**
 * `unresolved` is hivemark's own state, not Guardian's.
 *
 * Guardian leaves `verdict` null when the skeptic did not run. That absence
 * must never be read as confirmation, so it gets a name of its own.
 */
export type Verdict = "confirmed" | "refuted" | "uncertain" | "unresolved";

export interface Genome {
  readonly schema_version: number;
  readonly known_fields: readonly string[];
  /**
   * Stated by the producer, not derived from a model-name prefix. Two fields
   * rather than one: a single `provider` taken from the finder was wrong for
   * every bee judged by another vendor, which is the same asymmetry the body
   * already avoided by giving the head to the finder and the abdomen to the
   * skeptic.
   *
   * Plain `string`. There was a `Provider` union whose purpose was to let a
   * prefix table refuse a model name it could not classify — which stopped the
   * pipeline on codellama, mixtral, gemma3 and four others. A provider the
   * producer states needs no such guess, so both the union and the table are
   * gone.
   */
  readonly finder_provider: string;
  readonly skeptic_provider: string | null;
  readonly finder_model: string;
  readonly skeptic_model: string | null;
  readonly context_mode: "graph" | "diff-only";
  /**
   * A digest over the code that decides a review, replacing `guardian_version`.
   *
   * `guardian_sha` moved on any commit — a README edit minted a new entity with
   * an empty track record. Eight identities existed where three configurations
   * were run, and one of the eight had a track record of a single review. This
   * is what collapses them.
   */
  readonly review_fingerprint: string;
}

export interface Claim {
  readonly identity_id: `0x${string}`;
  /**
   * Commitment to the whole finding, including the prose the Claim does not
   * carry. Metadata alone would collide: two different findings on one file and
   * line in one category share every field this record keeps.
   */
  readonly claim_hash: `0x${string}`;
  readonly url: string;
  readonly project: string;
  readonly head_sha: string;
  readonly reviewed_at: string;
  readonly file: string;
  readonly line: number | null;
  readonly severity: "critical" | "major" | "minor";
  readonly category: string;
  readonly title: string;
  readonly confidence: number;
  readonly verdict: Verdict;
  readonly impact_score: number | null;
}

/**
 * Who resolved this identity's claims.
 *
 * `self` means the skeptic and the finder are the same model, so the
 * confirmation rate is self-assessment. That rate is published beside rates
 * produced by an independent skeptic, and nothing else on the page distinguishes
 * them — the same defect `TrackRecord.corpus` was added to prevent, arriving
 * through a different door. A reader who correctly checks that the project sets
 * match will conclude the rates are comparable, and for a self-graded pair they
 * are not.
 *
 * `nobody` is a third state and not a variant of `self`: no skeptic ran at all.
 * Collapsing the two would report an unjudged corpus as a self-judged one.
 *
 * Derived from the genome, never stored as input — an expression of
 * `skeptic_model` and `finder_model`, the way `provider` expresses
 * `finder_model`. A field that could disagree with the genome would be a field
 * that could lie about it.
 */
export type Judge = "self" | "independent" | "nobody";

export interface SkepticAxis {
  readonly judge: Judge;
  readonly confirmed: number;
  readonly refuted: number;
  readonly uncertain: number;
  readonly unresolved: number;
  readonly mean_impact: number | null;
}

export interface TrackRecord {
  readonly identity_id: `0x${string}`;
  readonly owner_address: `0x${string}`;
  readonly genome: Genome;
  readonly reviews: number;
  /**
   * Runs whose output could not be parsed, kept out of `reviews`.
   *
   * Separate rather than folded in, because the two states differ in what they
   * say about the reviewer: `reviews` is work it did, this is work it attempted.
   * Counting these as reviews inflates the denominator a reader uses to weigh
   * everything else, and inflates it in the flattering direction.
   */
  readonly unparseable: number;
  /**
   * Runs that failed before producing output at all — a provider 429 or 503,
   * recorded by Guardian in `error`.
   *
   * Separate from `unparseable` because the two failures are not the same
   * event: one produced text nobody could read, the other produced none. Both
   * are excluded from `reviews` for the same reason — neither is a review.
   */
  readonly errored: number;
  readonly claims: number;
  /**
   * Projects this identity actually reviewed, with counts.
   *
   * Present because two identities in the real corpus reviewed almost disjoint
   * project sets, so their rates are not a controlled comparison. Without this
   * on the card, the page invites exactly the wrong conclusion.
   */
  readonly corpus: ReadonlyArray<readonly [project: string, reviews: number]>;
  readonly skeptic: SkepticAxis;
  /** No data in benchmark artifacts. Never inferred from the skeptic. */
  readonly human: { readonly available: false };
}
