import { byCodeUnit } from "../canonical.js";
import { genomeOf } from "../genome.js";
import { identityId } from "../identity.js";
import type { ReviewRecord } from "../schema.js";
import type { Genome } from "../types.js";

export interface Vocabulary {
  readonly finderModels: readonly string[];
  readonly skepticModels: readonly (string | null)[];
  readonly contextModes: readonly ("graph" | "diff-only")[];
  readonly newestGuardian: string;
  readonly existing: readonly Genome[];
}

/**
 * What the corpus has actually shown us.
 *
 * Only observed values are collected: breeding recombines what exists and never
 * invents a model nobody has run, so a corpus of one identity yields no
 * proposals — correctly, since there is nothing to recombine.
 */
export function vocabularyOf(records: readonly ReviewRecord[]): Vocabulary {
  if (records.length === 0) {
    throw new Error("cannot build a vocabulary from no reviews");
  }

  const genomes = new Map<string, Genome>();
  for (const record of records) {
    const genome = genomeOf(record);
    genomes.set(identityId(genome), genome);
  }
  const existing = [...genomes.values()];

  // The newest revision is the one most recently seen reviewing — never the
  // largest sha. A commit hash carries no order, so sorting them would answer a
  // different question and look right doing it.
  const newest = records.reduce((latest, record) =>
    Date.parse(record.reviewed_at) > Date.parse(latest.reviewed_at) ? record : latest,
  );

  const distinct = <T>(values: readonly T[]): T[] =>
    [...new Set(values)].sort((a, b) => byCodeUnit(String(a), String(b)));

  return {
    finderModels: distinct(existing.map((g) => g.finder_model)),
    skepticModels: distinct(existing.map((g) => g.skeptic_model)),
    contextModes: distinct(existing.map((g) => g.context_mode)),
    newestGuardian: newest.guardian_sha,
    existing,
  };
}
