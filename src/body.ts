/**
 * The bee's geometry, computed from measurements rather than from taste.
 *
 * Two kinds of number meet here and are kept apart on purpose. `MORPHOLOGY`
 * holds measured characters of Apis mellifera, in millimetres, each with a
 * citation; `DRAWING` holds the conventions of a picture — overlaps, margins,
 * the curve of an antenna — which nobody measured and nobody will. Mixing them
 * under one table, as `RATIO` did, made a claim about an animal and a choice
 * about a drawing look like the same kind of statement.
 *
 * `unit` is user units per millimetre, so one number still governs the whole
 * figure and nothing can drift out of proportion with the rest.
 *
 * Proportions may be read from the genome and never from the track record. A
 * body that responded to confirmations would make a fixed identity look mutable
 * — the constraint from the design's §Badge, which survives this change too.
 */

import { MORPHOLOGY, type CharacterName } from "./morphology.js";
import type { Genome } from "./types.js";
import { characterMm } from "./variation.js";

/**
 * Conventions of the drawing. Not measurements, and none of them vary.
 *
 * Lengths are in millimetres so they compose with the measured characters
 * without a reference length to convert through; the `Mm` suffix says which is
 * which. A convention in millimetres is still a convention.
 */
const DRAWING = {
  /** Room above the head for the antennae to reach into. */
  antennaSpaceMm: 1.81,
  antennaReachMm: 1.41,
  antennaSpreadMm: 2.08,
  antennaTipMm: 0.244,
  antennaRootOffsetMm: 0.832,
  antennaControlOffsetMm: 1.41,
  antennaControlDropMm: 0.543,

  /** How far the thorax rides up into the head, so they read as joined. */
  headThoraxOverlapMm: 0.181,
  thoraxAbdomenOverlapMm: 0.905,

  stingerLengthMm: 1.54,
  stingerHalfWidthMm: 0.489,

  eyeOffsetMm: 0.832,
  /** Eyes sit slightly above the head's centre, where a face reads as a face. */
  eyeRiseMm: 0.145,
  eyeRoundMm: 0.489,
  eyeWideRxMm: 0.697,
  eyeWideRyMm: 0.489,
  eyeNarrowRxMm: 0.344,
  eyeNarrowRyMm: 0.634,

  strokeWidthMm: 0.174,
  /** Breathing room either side of the widest part. */
  marginMm: 0.507,

  /**
   * Thorax and abdomen widths, as fractions of their measured lengths.
   *
   * NOT MEASURED. The sources record the lengths of both and the width of
   * neither, so these are the drawing's own guess, expressed as a fraction so
   * they at least scale with the part they belong to. They gain a range and
   * begin to vary the day a published width appears.
   */
  thoraxWidthOfLength: 1.087,
  abdomenWidthOfLength: 0.711,

  /** Where on the thorax the wings attach, from its top. */
  wingAttach: 0.35,
  /** How far a wing's near edge clears the body it attaches to. */
  wingClear: 0.5,
  rearWingDropMm: 1.123,
  /** Fraction of the abdomen's height the bands occupy. */
  bandSpan: 0.62,
  /** Wing opacity: the rear pair reads as underneath. */
  wingOpacity: 0.75,
  rearWingOpacity: 0.55,
} as const;

/** User units per millimetre. A rendering choice; the viewBox scales anyway. */
const UNIT = 20;

export interface BodyPlan {
  readonly unit: number;
  readonly width: number;
  readonly height: number;
  readonly axis: number;
  readonly strokeWidth: number;

  readonly head: { cy: number; rx: number; ry: number };
  readonly thorax: { cy: number; rx: number; ry: number };
  readonly abdomen: { cy: number; rx: number; ry: number };
  readonly wing: { cy: number; rx: number; ry: number; offset: number };
  readonly rearWing: { cy: number; rx: number; ry: number; offset: number } | null;
  readonly stinger: { from: number; to: number; halfWidth: number } | null;
  readonly antenna: {
    fromY: number;
    toY: number;
    spread: number;
    tip: number;
    rootDx: number;
    controlDx: number;
    controlY: number;
  };
  readonly eye: { dx: number; cy: number; rx: number; ry: number };
  readonly bands: number;
}

/**
 * Generation marker: a Guardian revision maps to a band count.
 *
 * The two characters are required to be hex before parsing, rather than trusted
 * to be. `Number.parseInt` accepts a leading sign and JS keeps that sign through
 * `%`, so "-2abc" reached `2 + (-2 % 3)` and drew zero bands — a marker silently
 * absent, straight past a NaN guard written to prevent exactly that.
 */
function bandCount(guardianVersion: string): number {
  if (!/^[0-9a-f]{2}/i.test(guardianVersion)) return 1;
  return 2 + (Number.parseInt(guardianVersion.slice(0, 2), 16) % 3);
}

type EyeShape = "round" | "wide" | "narrow";

/** Which model does the finding — a shape, so it reads within any palette. */
function eyeShape(finderModel: string): EyeShape {
  const m = finderModel.toLowerCase();
  if (m.includes("flash")) return "round";
  if (m.includes("pro") || m.includes("medium") || m.includes("70b")) return "wide";
  return "narrow";
}

/**
 * Eye radii per shape, in millimetres.
 *
 * A table rather than a chain of conditionals: which shape a model gets is a
 * fact about eyes, not a decision the renderer makes, and adding a fourth means
 * adding a row instead of another branch.
 */
const EYE: Record<EyeShape, { readonly rxMm: number; readonly ryMm: number }> = {
  round: { rxMm: DRAWING.eyeRoundMm, ryMm: DRAWING.eyeRoundMm },
  wide: { rxMm: DRAWING.eyeWideRxMm, ryMm: DRAWING.eyeWideRyMm },
  narrow: { rxMm: DRAWING.eyeNarrowRxMm, ryMm: DRAWING.eyeNarrowRyMm },
};

/**
 * Lay out a body for a genome.
 *
 * The vertical chain runs head → thorax → abdomen → stinger, each segment
 * placed against the previous one rather than at a remembered coordinate. The
 * canvas is then sized to whatever that chain produced, so a longer abdomen
 * cannot silently overflow a fixed viewBox.
 */
export function bodyPlan(genome: Genome, unit: number = UNIT): BodyPlan {
  const measured = (name: CharacterName) => characterMm(name, genome) * unit;
  const drawn = (mm: number) => mm * unit;

  const headRy = measured("headHeight") / 2;
  const headRx = measured("headWidth") / 2;
  const headCy = drawn(DRAWING.antennaSpaceMm) + headRy;

  const thoraxLength = measured("thoraxLength");
  const thoraxRy = thoraxLength / 2;
  const thoraxRx = (thoraxLength * DRAWING.thoraxWidthOfLength) / 2;
  const thoraxCy = headCy + headRy + thoraxRy - drawn(DRAWING.headThoraxOverlapMm);

  const abdomenLength = measured("abdomenLength");
  const abdomenRy = abdomenLength / 2;
  const abdomenRx = (abdomenLength * DRAWING.abdomenWidthOfLength) / 2;
  const abdomenCy = thoraxCy + thoraxRy + abdomenRy - drawn(DRAWING.thoraxAbdomenOverlapMm);

  const hasStinger = genome.skeptic_model !== null;
  const abdomenBottom = abdomenCy + abdomenRy;
  const stinger = hasStinger
    ? {
        // Starts inside the abdomen so the two read as one body, not a spike
        // resting against a wall.
        from: abdomenBottom - drawn(DRAWING.stingerHalfWidthMm),
        to: abdomenBottom + drawn(DRAWING.stingerLengthMm),
        halfWidth: drawn(DRAWING.stingerHalfWidthMm),
      }
    : null;

  const wingCy = thoraxCy - thoraxRy + DRAWING.wingAttach * 2 * thoraxRy;
  const wingRx = measured("forewingLength") / 2;
  const wing = {
    cy: wingCy,
    rx: wingRx,
    ry: measured("forewingWidth") / 2,
    offset: thoraxRx + wingRx * DRAWING.wingClear,
  };

  const seesStructure = genome.context_mode === "graph";
  const rearRx = measured("hindwingLength") / 2;
  const rearWing = seesStructure
    ? {
        cy: wingCy + drawn(DRAWING.rearWingDropMm),
        rx: rearRx,
        ry: measured("hindwingWidth") / 2,
        offset: thoraxRx + rearRx * DRAWING.wingClear,
      }
    : null;

  const eyeRatio = EYE[eyeShape(genome.finder_model)];
  const eye = {
    dx: drawn(DRAWING.eyeOffsetMm),
    cy: headCy - drawn(DRAWING.eyeRiseMm),
    rx: drawn(eyeRatio.rxMm),
    ry: drawn(eyeRatio.ryMm),
  };

  const antennaToY = headCy - headRy - drawn(DRAWING.antennaReachMm);

  // The canvas follows the body, never the other way round.
  const widest = Math.max(
    abdomenRx,
    wing.offset + wing.rx,
    rearWing === null ? 0 : rearWing.offset + rearWing.rx,
    drawn(DRAWING.antennaSpreadMm + DRAWING.antennaTipMm),
  );
  const width = 2 * (widest + drawn(DRAWING.marginMm));
  // Wings join the vertical extent for the same reason they join the horizontal
  // one: the canvas follows the body. They sit well above the abdomen today, so
  // this changes no output — but a wider wing or a deeper rear-pair drop would
  // otherwise leave the canvas silently, and did in a probe.
  const lowest = Math.max(
    stinger ? stinger.to : abdomenBottom,
    wing.cy + wing.ry,
    rearWing === null ? 0 : rearWing.cy + rearWing.ry,
  );
  const height = lowest + drawn(DRAWING.marginMm);

  return {
    unit,
    width,
    height,
    axis: width / 2,
    strokeWidth: drawn(DRAWING.strokeWidthMm),

    head: { cy: headCy, rx: headRx, ry: headRy },
    thorax: { cy: thoraxCy, rx: thoraxRx, ry: thoraxRy },
    abdomen: { cy: abdomenCy, rx: abdomenRx, ry: abdomenRy },
    wing,
    rearWing,
    stinger,
    antenna: {
      fromY: headCy - headRy,
      toY: antennaToY,
      spread: drawn(DRAWING.antennaSpreadMm),
      tip: drawn(DRAWING.antennaTipMm),
      rootDx: drawn(DRAWING.antennaRootOffsetMm),
      controlDx: drawn(DRAWING.antennaControlOffsetMm),
      controlY: antennaToY + drawn(DRAWING.antennaControlDropMm),
    },
    eye,
    bands: bandCount(genome.guardian_version),
  };
}

export { DRAWING };
