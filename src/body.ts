/**
 * The bee's geometry, computed rather than transcribed.
 *
 * Every position derives from one unit — the head's radius — and a small set of
 * named ratios. Nothing is placed by absolute coordinate, so a change to any
 * proportion moves everything downstream of it without re-deriving the numbers
 * around it by hand.
 *
 * The constants below are ratios, not positions. That distinction is the point:
 * `thoraxRx: 1.25` says the thorax is a quarter wider than the head, which is a
 * statement about a bee. `rx="32"` said nothing at all.
 *
 * Proportions may be read from the genome and never from the track record. A
 * body that responded to confirmations would make a fixed identity look mutable
 * — the constraint from the design's §Badge, which survives this refactor
 * unchanged.
 */

import type { Genome } from "./types.js";

/** Ratios to the head's radius. A bee, described. */
const RATIO = {
  /** Room above the head for the antennae to reach into. */
  antennaSpace: 1.0,
  antennaReach: 0.78,
  antennaSpread: 1.15,
  antennaTip: 0.135,

  thoraxRx: 1.25,
  thoraxRy: 1.15,
  /** How far the thorax rides up into the head, so they read as joined. */
  headThoraxOverlap: 0.1,

  abdomenRx: 1.6,
  abdomenRy: 2.25,
  thoraxAbdomenOverlap: 0.5,

  wingRx: 1.5,
  wingRy: 0.6,
  /** Where on the thorax the wings attach, from its top. */
  wingAttach: 0.35,
  /** The rear pair, present only when the reviewer reads structure. */
  rearWingScale: 0.8,
  rearWingDrop: 0.62,

  stingerLength: 0.85,
  stingerHalfWidth: 0.27,

  /** How far a wing's near edge clears the body it attaches to. */
  wingClear: 0.5,
  /** Fraction of the abdomen's height the bands occupy. */
  bandSpan: 0.62,
  /** Wing opacity: the rear pair reads as underneath. */
  wingOpacity: 0.75,
  rearWingOpacity: 0.55,

  eyeOffset: 0.46,
  /** Eyes sit slightly above the head's centre, where a face reads as a face. */
  eyeRise: 0.08,
  antennaRootOffset: 0.46,
  antennaControlOffset: 0.78,
  antennaControlDrop: 0.3,
  eyeRound: 0.27,
  eyeWideRx: 0.385,
  eyeWideRy: 0.27,
  eyeNarrowRx: 0.19,
  eyeNarrowRy: 0.35,

  strokeWidth: 0.096,
  /** Breathing room either side of the widest part. */
  margin: 0.28,
} as const;

/** The head's radius in user units — the one number everything else scales from. */
const UNIT = 26;

export interface BodyPlan {
  readonly unit: number;
  readonly width: number;
  readonly height: number;
  readonly axis: number;
  readonly strokeWidth: number;

  readonly head: { cy: number; r: number };
  readonly thorax: { cy: number; rx: number; ry: number };
  readonly abdomen: { cy: number; rx: number; ry: number };
  readonly wing: { cy: number; rx: number; ry: number; reach: number };
  readonly rearWing: { cy: number; rx: number; ry: number; reach: number } | null;
  readonly stinger: { from: number; to: number; halfWidth: number } | null;
  readonly antenna: { fromY: number; toY: number; spread: number; tip: number };
  readonly bands: number;
  readonly eyes: "round" | "wide" | "narrow";
}

/** Generation marker: a Guardian revision maps to a band count. */
function bandCount(guardianVersion: string): number {
  const head = Number.parseInt(guardianVersion.slice(0, 2), 16);
  return Number.isNaN(head) ? 1 : 2 + (head % 3);
}

/** Which model does the finding — a shape, so it reads within any palette. */
function eyeShape(finderModel: string): BodyPlan["eyes"] {
  const m = finderModel.toLowerCase();
  if (m.includes("flash")) return "round";
  if (m.includes("pro") || m.includes("medium") || m.includes("70b")) return "wide";
  return "narrow";
}

/**
 * Lay out a body for a genome.
 *
 * The vertical chain runs head → thorax → abdomen → stinger, each segment
 * placed against the previous one rather than at a remembered coordinate. The
 * canvas is then sized to whatever that chain produced, so a longer abdomen
 * cannot silently overflow a fixed viewBox.
 */
export function bodyPlan(genome: Genome, unit: number = UNIT): BodyPlan {
  const headR = unit;
  const headCy = RATIO.antennaSpace * unit + headR;

  const thoraxRy = RATIO.thoraxRy * unit;
  const thoraxCy = headCy + headR + thoraxRy - RATIO.headThoraxOverlap * unit;

  const abdomenRy = RATIO.abdomenRy * unit;
  const abdomenCy = thoraxCy + thoraxRy + abdomenRy - RATIO.thoraxAbdomenOverlap * unit;

  const hasStinger = genome.skeptic_model !== null;
  const abdomenBottom = abdomenCy + abdomenRy;
  const stinger = hasStinger
    ? {
        // Starts inside the abdomen so the two read as one body, not a spike
        // resting against a wall.
        from: abdomenBottom - RATIO.stingerHalfWidth * unit,
        to: abdomenBottom + RATIO.stingerLength * unit,
        halfWidth: RATIO.stingerHalfWidth * unit,
      }
    : null;

  const wingCy = thoraxCy - thoraxRy + RATIO.wingAttach * 2 * thoraxRy;
  const wing = {
    cy: wingCy,
    rx: RATIO.wingRx * unit,
    ry: RATIO.wingRy * unit,
    reach: RATIO.thoraxRx * unit,
  };

  const seesStructure = genome.context_mode === "graph";
  const rearWing = seesStructure
    ? {
        cy: wingCy + RATIO.rearWingDrop * unit,
        rx: wing.rx * RATIO.rearWingScale,
        ry: wing.ry * RATIO.rearWingScale,
        reach: wing.reach * RATIO.rearWingScale,
      }
    : null;

  // The canvas follows the body, never the other way round.
  const widest = Math.max(
    RATIO.abdomenRx * unit,
    wing.reach + wing.rx,
    RATIO.antennaSpread * unit,
  );
  const width = 2 * (widest + RATIO.margin * unit);
  const height = (stinger ? stinger.to : abdomenBottom) + RATIO.margin * unit;

  return {
    unit,
    width,
    height,
    axis: width / 2,
    strokeWidth: RATIO.strokeWidth * unit,

    head: { cy: headCy, r: headR },
    thorax: { cy: thoraxCy, rx: RATIO.thoraxRx * unit, ry: thoraxRy },
    abdomen: { cy: abdomenCy, rx: RATIO.abdomenRx * unit, ry: abdomenRy },
    wing,
    rearWing,
    stinger,
    antenna: {
      fromY: headCy - headR,
      toY: headCy - headR - RATIO.antennaReach * unit,
      spread: RATIO.antennaSpread * unit,
      tip: RATIO.antennaTip * unit,
    },
    bands: bandCount(genome.guardian_version),
    eyes: eyeShape(genome.finder_model),
  };
}

export { RATIO };
