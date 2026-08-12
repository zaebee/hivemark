import { providerOf } from "./genome.js";
import { identityId } from "./identity.js";
import type { Genome, Provider } from "./types.js";

/**
 * A reviewer's badge: a bee assembled from its genome.
 *
 * Every visible trait is read from a genome field. Nothing comes from the hash,
 * and nothing comes from the track record — identity is fixed while the record
 * grows, so a body that responded to confirmations would make identity look
 * mutable. When a track record is shown, it belongs to a layer drawn outside
 * this SVG.
 *
 * The parts also make lineage legible, which a hash-derived identicon cannot do:
 * a child's hash is unrelated to its parents', but a crossbred genome visibly
 * wears the wings of one parent and the palette of the other.
 */

interface Palette {
  readonly body: string;
  readonly dark: string;
  readonly wing: string;
}

const PALETTES: Record<Provider, Palette> = {
  gemini: { body: "#E3AE3C", dark: "#7E5410", wing: "#BFD8E4" },
  mistral: { body: "#DC6B3E", dark: "#6F2A11", wing: "#E8CDBF" },
  ollama: { body: "#8098AC", dark: "#33454F", wing: "#CBDCE4" },
};

/**
 * Outline colour.
 *
 * A token with a literal fallback, not a fixed near-black: the badge is drawn on
 * whatever surface embeds it, and a dark outline vanishes against a dark card.
 * Consumers that define `--hivemark-ink` get theme-correct bees; those that do
 * not still get a visible one.
 */
const INK = "var(--hivemark-ink, #191B16)";

/** Generation marker: a Guardian revision maps to a band count. */
function bandCount(guardianVersion: string | null): number {
  if (!guardianVersion) return 1;
  const head = Number.parseInt(guardianVersion.slice(0, 2), 16);
  return Number.isNaN(head) ? 1 : 2 + (head % 3);
}

/** Which model does the finding — a shape, not a colour, so it reads within a palette. */
function eyeShape(finderModel: string): string {
  const m = finderModel.toLowerCase();
  if (m.includes("flash")) {
    return `<circle cx="88" cy="50" r="7" fill="${INK}"/><circle cx="112" cy="50" r="7" fill="${INK}"/>`;
  }
  if (m.includes("pro") || m.includes("medium") || m.includes("70b")) {
    return `<ellipse cx="86" cy="50" rx="10" ry="7" fill="${INK}"/><ellipse cx="114" cy="50" rx="10" ry="7" fill="${INK}"/>`;
  }
  return `<ellipse cx="88" cy="50" rx="5" ry="9" fill="${INK}"/><ellipse cx="112" cy="50" rx="5" ry="9" fill="${INK}"/>`;
}

function bands(count: number, palette: Palette): string {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const y = 132 + i * (108 / (count + 0.6));
    const height = 46 / (count + 1);
    out.push(
      `<rect class="hm-band" x="58" y="${y.toFixed(1)}" width="84" height="${height.toFixed(1)}" fill="${palette.dark}" opacity="0.92"/>`,
    );
  }
  return out.join("");
}

/**
 * Render the badge.
 *
 * `provider` is read from `finder_model` rather than trusted from the field:
 * it is an expression of the model, not a gene of its own. Crossing the two
 * independently produces impossible reviewers — a genome claiming gemini while
 * carrying a qwen finder — and the palette must follow the model that is
 * actually doing the finding.
 */
export function avatarSvg(genome: Genome, size = 120): string {
  const palette = PALETTES[providerOf(genome.finder_model)];
  const hasStinger = genome.skeptic_model !== null;
  const seesStructure = genome.context_mode === "graph";
  // Scoped to the identity, not to a trait: several bees are inlined into one
  // document (the page, the specimen plate), and ids collide there. Sharing an
  // id is harmless only while every clip has identical geometry — a guarantee
  // that would break silently the first time the clip varies by trait.
  // Deterministic, so identical genomes still render identical SVG.
  const clipId = `hm-abdomen-${identityId(genome).slice(2, 14)}`;

  const rearWings = seesStructure
    ? `<ellipse class="hm-wing hm-wing-l" cx="62" cy="112" rx="30" ry="12" fill="${palette.wing}" fill-opacity="0.55" stroke="${INK}" stroke-width="2"/>` +
      `<ellipse class="hm-wing hm-wing-r" cx="138" cy="112" rx="30" ry="12" fill="${palette.wing}" fill-opacity="0.55" stroke="${INK}" stroke-width="2"/>`
    : "";

  const stinger = hasStinger
    ? `<polygon class="hm-stinger" points="100,232 93,254 107,254" fill="${INK}"/>`
    : "";

  const label =
    `${providerOf(genome.finder_model)} reviewer, ` +
    `${genome.context_mode} context, ` +
    `${hasStinger ? "with" : "without"} a skeptic`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 200 266" role="img" aria-label="${label}">` +
    `<defs><clipPath id="${clipId}"><ellipse cx="100" cy="176" rx="42" ry="58"/></clipPath></defs>` +
    rearWings +
    `<ellipse class="hm-wing hm-wing-l" cx="56" cy="96" rx="38" ry="15" fill="${palette.wing}" fill-opacity="0.75" stroke="${INK}" stroke-width="2"/>` +
    `<ellipse class="hm-wing hm-wing-r" cx="144" cy="96" rx="38" ry="15" fill="${palette.wing}" fill-opacity="0.75" stroke="${INK}" stroke-width="2"/>` +
    stinger +
    `<ellipse cx="100" cy="176" rx="42" ry="58" fill="${palette.body}" stroke="${INK}" stroke-width="2.5"/>` +
    `<g clip-path="url(#${clipId})">${bands(bandCount(genome.guardian_version), palette)}</g>` +
    `<ellipse cx="100" cy="176" rx="42" ry="58" fill="none" stroke="${INK}" stroke-width="2.5"/>` +
    `<ellipse cx="100" cy="106" rx="32" ry="30" fill="${palette.dark}" stroke="${INK}" stroke-width="2.5"/>` +
    `<path d="M88 26 Q80 8 70 6" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>` +
    `<path d="M112 26 Q120 8 130 6" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>` +
    `<circle cx="70" cy="6" r="3.5" fill="${INK}"/><circle cx="130" cy="6" r="3.5" fill="${INK}"/>` +
    `<circle cx="100" cy="52" r="26" fill="${palette.body}" stroke="${INK}" stroke-width="2.5"/>` +
    eyeShape(genome.finder_model) +
    `</svg>`
  );
}
