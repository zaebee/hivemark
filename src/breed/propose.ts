import { byCodeUnit } from "../canonical.js";
import { identityId } from "../identity.js";
import type { Genome } from "../types.js";
import type { Vocabulary } from "./vocabulary.js";

/**
 * The three slots a proposal recombines.
 *
 * `provider` is absent because it is an expression of `finder_model`, and
 * `guardian_version` because it is not a choice about how to review — it is the
 * version of the tool that happened to be running. Identity-forming and
 * heritable are not the same thing.
 */
export const HERITABLE_SLOTS = ["finder_model", "skeptic_model", "context_mode"] as const;

type Slot = (typeof HERITABLE_SLOTS)[number];

export interface Proposal {
  /**
   * Says what this is, in the artifact as well as on screen.
   *
   * A `Proposal` is otherwise structurally a published record — an identity and
   * a genome — and `proposals.json` is written beside real artifacts. Without a
   * field carrying it, the guarantee that a proposal is not an entity would hold
   * only in the terminal.
   */
  readonly standing: "proposal — no birth, no claims, nothing has run yet";
  readonly identity_id: `0x${string}`;
  readonly genome: Genome;
  readonly distance: number;
  readonly differsIn: readonly string[];
  readonly nearest: `0x${string}`;
  readonly parents: readonly (readonly [`0x${string}`, `0x${string}`])[];
}

const STANDING = "proposal — no birth, no claims, nothing has run yet" as const;

function differences(a: Genome, b: Genome): Slot[] {
  return HERITABLE_SLOTS.filter((slot) => a[slot] !== b[slot]);
}

/**
 * Pairs of existing identities whose slots between them cover this genome.
 *
 * Lineage is the one thing a mask gave that enumeration does not, so it is
 * recovered by inverting the question: not "which two did we cross" but "who
 * could have been its parents". A genome no pair covers is unreachable from
 * this corpus and is not proposed.
 */
function coveringPairs(
  candidate: Genome,
  existing: readonly Genome[],
): (readonly [`0x${string}`, `0x${string}`])[] {
  const pairs: (readonly [`0x${string}`, `0x${string}`])[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < existing.length; i += 1) {
    for (let j = i + 1; j < existing.length; j += 1) {
      const a = existing[i]!;
      const b = existing[j]!;
      const covers = HERITABLE_SLOTS.every(
        (slot) => candidate[slot] === a[slot] || candidate[slot] === b[slot],
      );
      if (!covers) continue;
      // Deduplicated by configuration, not by identity. The same two
      // configurations appear once per Guardian revision each ran under, which
      // on the real corpus turned three distinct parentages into ten lines
      // saying the same thing.
      const key = `${configurationKey(a)}|${configurationKey(b)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Each pair is ordered internally and the list is sorted below, so
      // parentage does not change because the corpus files were listed in a
      // different order.
      const [first, second] = [identityId(a), identityId(b)].sort(byCodeUnit) as [
        `0x${string}`,
        `0x${string}`,
      ];
      pairs.push([first, second] as const);
    }
  }
  return pairs.sort((x, y) => byCodeUnit(x[0], y[0]) || byCodeUnit(x[1], y[1]));
}

/**
 * A configuration, ignoring which Guardian revision ran it.
 *
 * Subtraction has to work on this rather than on `identityId`. A candidate
 * carries the newest revision while the identity that already ran it carries
 * whichever was current then, so their hashes differ and an existing
 * configuration would be proposed as new — with a distance of 0, since the
 * heritable slots match exactly. "Has this been run?" is a question about the
 * configuration, not about the version of the tool that ran it.
 */
function configurationKey(genome: Genome): string {
  // Serialised rather than joined by a separator: any single character can
  // appear inside a model name, and a collision would silently merge two
  // different configurations into one, hiding a real proposal.
  return JSON.stringify(HERITABLE_SLOTS.map((slot) => String(genome[slot])));
}

/** Every combination the vocabulary can express, run or not. */
function candidates(vocabulary: Vocabulary): Genome[] {
  const { existing, newestFingerprint } = vocabulary;
  // Every genome in a corpus shares these by construction, since `genomeOf`
  // fixes them; taking them from the first is safe for that reason alone.
  const knownFields = existing[0]?.known_fields ?? [];
  const schemaVersion = existing[0]?.schema_version ?? 1;

  // A proposed configuration has never run, so no record states its providers
  // and they have to be worked out. Taken from the observed genome that
  // contributed each model rather than guessed from the name — a model reaches
  // the vocabulary only from a real record, so this map is total by
  // construction and cannot invent a vendor.
  const providerOfModel = new Map<string, string>();
  for (const g of existing) {
    providerOfModel.set(g.finder_model, g.finder_provider);
    if (g.skeptic_model !== null && g.skeptic_provider !== null) {
      providerOfModel.set(g.skeptic_model, g.skeptic_provider);
    }
  }

  return vocabulary.finderModels.flatMap((finder) =>
    vocabulary.skepticModels.flatMap((skeptic) =>
      vocabulary.contextModes.map((context) => ({
        schema_version: schemaVersion,
        known_fields: knownFields,
        finder_provider: providerOfModel.get(finder)!,
        skeptic_provider: skeptic === null ? null : (providerOfModel.get(skeptic) ?? null),
        finder_model: finder,
        skeptic_model: skeptic,
        context_mode: context,
        review_fingerprint: newestFingerprint,
      })),
    ),
  );
}

/**
 * The closest existing identity, and the slots that separate it.
 *
 * Nearest, not first: a distance measured against whichever identity happened
 * to come first would report a controlled experiment as confounded.
 *
 * Ties are broken by identity, not by arrival. A configuration existing under
 * several Guardian revisions guarantees ties on the real corpus, so keeping the
 * first minimum made `nearest` and `differsIn` depend on the order the corpus
 * files were listed — and `differsIn` is a claim about what the experiment
 * controls for, which must not change because arguments were reordered.
 */
function nearestTo(
  candidate: Genome,
  existing: readonly Genome[],
): { nearest: Genome; differsIn: Slot[] } {
  const ranked = existing
    .map((other) => ({ nearest: other, differsIn: differences(candidate, other) }))
    .sort(
      (a, b) =>
        a.differsIn.length - b.differsIn.length ||
        byCodeUnit(identityId(a.nearest), identityId(b.nearest)),
    );
  return ranked[0]!;
}

/**
 * Every reachable configuration that has not been run.
 *
 * Enumeration rather than a sampled mask: this space is small enough to cover
 * completely, so sampling it would explore a subset and add randomness for
 * nothing.
 */
export function proposalsFrom(vocabulary: Vocabulary): Proposal[] {
  const { existing } = vocabulary;
  const taken = new Set(existing.map(configurationKey));

  return candidates(vocabulary)
    .filter((candidate) => !taken.has(configurationKey(candidate)))
    .map((candidate) => ({ candidate, parents: coveringPairs(candidate, existing) }))
    // A candidate no pair covers is unreachable from this corpus.
    .filter(({ parents }) => parents.length > 0)
    .map(({ candidate, parents }) => {
      const { nearest, differsIn } = nearestTo(candidate, existing);
      return {
        standing: STANDING,
        identity_id: identityId(candidate),
        genome: candidate,
        distance: differsIn.length,
        differsIn,
        nearest: identityId(nearest),
        parents,
      };
    })
    .sort((a, b) => a.distance - b.distance || byCodeUnit(a.identity_id, b.identity_id));
}
