import { byCodeUnit } from "../canonical.js";
import { providerOf } from "../genome.js";
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
  readonly identity_id: `0x${string}`;
  readonly genome: Genome;
  readonly distance: number;
  readonly differsIn: readonly string[];
  readonly nearest: `0x${string}`;
  readonly parents: readonly (readonly [`0x${string}`, `0x${string}`])[];
}

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
  for (let i = 0; i < existing.length; i += 1) {
    for (let j = i + 1; j < existing.length; j += 1) {
      const a = existing[i]!;
      const b = existing[j]!;
      const covers = HERITABLE_SLOTS.every(
        (slot) => candidate[slot] === a[slot] || candidate[slot] === b[slot],
      );
      if (covers) pairs.push([identityId(a), identityId(b)] as const);
    }
  }
  return pairs;
}

/**
 * Every reachable configuration that has not been run.
 *
 * Enumeration rather than a sampled mask: this space is small enough to cover
 * completely, so sampling it would explore a subset and add randomness for
 * nothing.
 */
export function proposalsFrom(vocabulary: Vocabulary): Proposal[] {
  const { existing, newestGuardian } = vocabulary;
  const taken = new Set(existing.map((g) => identityId(g)));
  const knownFields = existing[0]?.known_fields ?? [];
  const schemaVersion = existing[0]?.schema_version ?? 1;

  const out: Proposal[] = [];

  for (const finder of vocabulary.finderModels) {
    for (const skeptic of vocabulary.skepticModels) {
      for (const context of vocabulary.contextModes) {
        const candidate: Genome = {
          schema_version: schemaVersion,
          known_fields: knownFields,
          provider: providerOf(finder),
          finder_model: finder,
          skeptic_model: skeptic,
          context_mode: context,
          guardian_version: newestGuardian,
        };

        const id = identityId(candidate);
        if (taken.has(id)) continue;

        const parents = coveringPairs(candidate, existing);
        if (parents.length === 0) continue;

        // Nearest, not first: a distance measured against whichever identity
        // happened to come first would call a controlled experiment confounded.
        let nearest = existing[0]!;
        let differsIn = differences(candidate, nearest);
        for (const other of existing.slice(1)) {
          const diff = differences(candidate, other);
          if (diff.length < differsIn.length) {
            nearest = other;
            differsIn = diff;
          }
        }

        out.push({
          identity_id: id,
          genome: candidate,
          distance: differsIn.length,
          differsIn,
          nearest: identityId(nearest),
          parents,
        });
      }
    }
  }

  return out.sort((a, b) => a.distance - b.distance || byCodeUnit(a.identity_id, b.identity_id));
}
