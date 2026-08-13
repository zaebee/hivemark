/**
 * Measured morphology of the worker Apis mellifera, in millimetres.
 *
 * Every number here is a claim about an animal and carries a citation, which is
 * the entire point of the module: `abdomenLength: 6.63` can be checked against a
 * paper, where the `abdomenRy: 2.25` it replaces could only be checked against
 * someone's taste.
 *
 * Nothing here knows it will be drawn. Conventions of the drawing — overlaps,
 * margins, the curve of an antenna — live in `body.ts` and are marked there as
 * conventions, because nobody measured them and nobody will.
 *
 * `docs/morphology-sources.md` is the input to this file, including the two
 * citations that did not survive being checked and the one measurement that
 * exists but could not be read.
 */

export const SOURCES = {
  "pathania-2022":
    "Pathania A, Kumar A, Dhiman S (2022). Morphometrics of Apis mellifera in " +
    "North-Western Himalayan region of Himachal Pradesh, India. Journal of " +
    "Entomology and Zoology Studies 10(3):105-109. doi:10.22271/j.ento.2022.v10.i3b.8997",
  "alkahtani-2021":
    "AL-Kahtani SN, Taha E-KA (2021). Morphometric study of Yemeni (Apis mellifera " +
    "jemenitica) and Carniolan (A. m. carnica) honeybee workers in Saudi Arabia. " +
    "PLoS ONE 16(2):e0247262. CARRIES AN EXPRESSION OF CONCERN (PLOS, April 2023) " +
    "about authorship, competing interests and the study's contribution; PLOS found " +
    "the evidence inconclusive and did not retract it, and raised no concern about " +
    "the measurements. Recorded here so the flag travels with the number.",
  "ibrahim-2017":
    "Ibrahim MM, Chandel YS, Anil A (2017). Morphometrics of Apis mellifera after " +
    "Five Decades of its Introduction in North-Western Himalayan Region of India. " +
    "Pakistan Journal of Zoology 49(4):1397-1403. doi:10.17582/journal.pjz/2017.49.4.1397.1403 " +
    "Table II, per-apiary means from four sites in Himachal Pradesh at 644-1268 m. " +
    "NOT INDEPENDENT of pathania-2022: the two report identical error terms across " +
    "every shared character against different means. Two publications, one method.",
} as const;

export type SourceKey = keyof typeof SOURCES;

export type CharacterName =
  | "headHeight"
  | "headWidth"
  | "thoraxLength"
  | "abdomenLength"
  | "forewingLength"
  | "forewingWidth"
  | "hindwingLength"
  | "hindwingWidth";

export interface Character {
  /** The primary source's mean for a worker. */
  readonly mm: number;
  /**
   * Smallest and largest published mean, or null when only one exists.
   *
   * The bound is the spread of the literature rather than a standard deviation:
   * the primary source reports a pooled standard error, identical across all
   * three castes, not a dispersion of individuals — converting one into the
   * other would invent precision it does not have. Every value inside this
   * interval was reported by somebody about a real bee.
   */
  readonly range: readonly [low: number, high: number] | null;
  readonly sources: readonly SourceKey[];
}

export const MORPHOLOGY: Record<CharacterName, Character> = {
  // Each endpoint below is a mean published for one named sampled population —
  // an apiary in Ibrahim et al.'s Table II, or the whole worker sample in
  // Pathania et al. — never an error bar, and never the widest number on the
  // page. The same rule governs the wings, where the endpoints are subspecies.
  headHeight: { mm: 2.45, range: [2.45, 3.22], sources: ["pathania-2022", "ibrahim-2017"] },
  headWidth: { mm: 3.62, range: [3.62, 3.72], sources: ["pathania-2022", "ibrahim-2017"] },
  thoraxLength: { mm: 3.72, range: [3.72, 4.38], sources: ["pathania-2022", "ibrahim-2017"] },
  abdomenLength: { mm: 6.63, range: [5.54, 6.63], sources: ["pathania-2022", "ibrahim-2017"] },

  // The wing ranges span two named subspecies — jemenitica at the low end,
  // carnica at the high — so both ends are a described bee rather than an error
  // bar, and everything between them is a bee somebody measured.
  forewingLength: { mm: 9.27, range: [7.94, 9.27], sources: ["pathania-2022", "alkahtani-2021"] },
  forewingWidth: { mm: 2.98, range: [2.44, 3.53], sources: ["pathania-2022", "alkahtani-2021"] },
  hindwingLength: { mm: 6.2, range: [5.85, 6.74], sources: ["pathania-2022", "alkahtani-2021"] },
  hindwingWidth: { mm: 1.82, range: [1.67, 2.21], sources: ["pathania-2022", "alkahtani-2021"] },
};

/**
 * Worker body length, as a standing sanity bound rather than a drawn dimension.
 *
 * Weaker than everything above it: taken from reference material rather than a
 * measurement paper, and marked so rather than left looking equally solid.
 */
export const BODY_LENGTH_MM: readonly [number, number] = [10, 15];
