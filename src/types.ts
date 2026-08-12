export type Provider = "gemini" | "mistral" | "ollama";

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
  readonly provider: Provider;
  readonly finder_model: string;
  readonly skeptic_model: string | null;
  readonly context_mode: "graph" | "diff-only";
  /** Never null: the published contract requires it on every record. */
  readonly guardian_version: string;
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

export interface SkepticAxis {
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
