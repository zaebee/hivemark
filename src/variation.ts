import { keccak256, toHex } from "viem";
import { MORPHOLOGY, type CharacterName } from "./morphology.js";
import type { Genome } from "./types.js";

/**
 * Individual variation, derived from the genome's slots one at a time.
 *
 * Each character reads a fixed byte of the keccak digest of a single genome
 * field. Hashing the fields separately rather than the whole genome is what
 * makes a body heritable: change one slot and only the part that slot builds
 * moves, so an offspring that inherited a parent's finder has that parent's
 * head exactly.
 *
 * What this cannot do, and no implementation could: interpolate. A hash has no
 * order, so a child of two parents gets a third value for any character, never
 * a value between theirs. Producing a genuinely intermediate build would need a
 * numeric axis along which one model lies between two others, and no such axis
 * exists. The design spec strikes the earlier claim that it would.
 *
 * The genome is the only input. Nothing from the track record reaches here,
 * because a body that answered to confirmations would show a fixed identity as
 * mutable.
 */

export type Slot = "finder_model" | "skeptic_model" | "context_mode" | "review_fingerprint";

/**
 * Which slot builds which part.
 *
 * No new associations are invented: the body already reads these four slots as
 * discrete traits — eyes from the finder, the rear wing pair from the context
 * mode, the stinger from the skeptic, band count from the Guardian revision —
 * and the continuous characters follow the same map.
 */
export const DRIVEN_BY: Record<CharacterName, Slot> = {
  headHeight: "finder_model",
  headWidth: "finder_model",
  thoraxLength: "review_fingerprint",
  abdomenLength: "skeptic_model",
  forewingLength: "context_mode",
  forewingWidth: "context_mode",
  hindwingLength: "context_mode",
  hindwingWidth: "context_mode",
};

/**
 * The byte of its slot's digest each character reads.
 *
 * Distinct per character so two parts of one region do not move in lockstep — a
 * head that grew taller and wider together would be a scale change wearing the
 * costume of two characters.
 */
const BYTE: Record<CharacterName, number> = {
  headHeight: 0,
  headWidth: 1,
  thoraxLength: 2,
  abdomenLength: 3,
  forewingLength: 4,
  forewingWidth: 5,
  hindwingLength: 6,
  hindwingWidth: 7,
};

/** One character's value for one genome, in millimetres. */
export function characterMm(name: CharacterName, genome: Genome): number {
  const character = MORPHOLOGY[name];
  if (character.range === null) return character.mm;

  const slot = genome[DRIVEN_BY[name]];
  // An absent slot builds nothing, so its region keeps the base measurement.
  if (slot === null) return character.mm;

  const digest = keccak256(toHex(slot));
  const at = 2 + BYTE[name] * 2; // skip "0x"; two hex characters per byte
  const byte = Number.parseInt(digest.slice(at, at + 2), 16);

  const [low, high] = character.range;
  return low + (byte / 255) * (high - low);
}
