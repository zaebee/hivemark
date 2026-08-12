import { bodyPlan, DRAWING, type BodyPlan } from "./body.js";
import { providerOf } from "./genome.js";
import { identityId } from "./identity.js";
import type { Genome, Provider } from "./types.js";

/**
 * A reviewer's badge: a bee assembled from its genome.
 *
 * Every visible trait is read from a genome field, and so is its build: the
 * proportions come from hashing individual genome slots, so a body is inherited
 * slot by slot rather than redrawn from scratch. Nothing comes from the track
 * record — identity is fixed while the record grows, so a body that responded to
 * confirmations would make identity look mutable. When a track record is shown,
 * it belongs to a layer drawn outside this SVG.
 *
 * Geometry lives in `body.ts` and this file only draws it. The split is what
 * keeps positions out of the renderer: nothing here may invent a coordinate,
 * because every one it needs is already on the plan.
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

const n = (value: number): string => value.toFixed(2);

function ellipse(cx: number, cy: number, rx: number, ry: number, fill: string, plan: BodyPlan, cls = ""): string {
  const classAttr = cls === "" ? "" : ` class="${cls}"`;
  return (
    `<ellipse${classAttr} cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" ` +
    `fill="${fill}" stroke="${INK}" stroke-width="${n(plan.strokeWidth)}"/>`
  );
}

function wings(plan: BodyPlan, palette: Palette): string {
  const pairs = plan.rearWing === null ? [plan.wing] : [plan.rearWing, plan.wing];
  return pairs
    .flatMap((pair, index) => {
      // The rear pair sits behind and is drawn first, so it reads as underneath.
      const opacity =
        index === 0 && plan.rearWing !== null ? DRAWING.rearWingOpacity : DRAWING.wingOpacity;
      return (["l", "r"] as const).map((side) => {
        const cx = plan.axis + (side === "l" ? -1 : 1) * pair.offset;
        return (
          `<ellipse class="hm-wing hm-wing-${side}" cx="${n(cx)}" cy="${n(pair.cy)}" ` +
          `rx="${n(pair.rx)}" ry="${n(pair.ry)}" fill="${palette.wing}" ` +
          `fill-opacity="${opacity}" stroke="${INK}" stroke-width="${n(plan.strokeWidth)}"/>`
        );
      });
    })
    .join("");
}

function bands(plan: BodyPlan, palette: Palette): string {
  const { abdomen, bands: count } = plan;
  // Bands share the abdomen's vertical span, inset so the first and last do not
  // sit on its rim. Their thickness follows from how many there are.
  const span = abdomen.ry * 2 * DRAWING.bandSpan;
  const top = abdomen.cy - span / 2;
  const thickness = span / (count * 2 - 1);

  return Array.from({ length: count }, (_, i) => {
    const y = top + i * thickness * 2;
    return (
      `<rect class="hm-band" x="${n(plan.axis - abdomen.rx)}" y="${n(y)}" ` +
      `width="${n(abdomen.rx * 2)}" height="${n(thickness)}" fill="${palette.dark}" opacity="0.92"/>`
    );
  }).join("");
}

function eyes(plan: BodyPlan): string {
  const { eye, axis } = plan;
  return (["l", "r"] as const)
    .map((side) => {
      const cx = axis + (side === "l" ? -eye.dx : eye.dx);
      return `<ellipse cx="${n(cx)}" cy="${n(eye.cy)}" rx="${n(eye.rx)}" ry="${n(eye.ry)}" fill="${INK}"/>`;
    })
    .join("");
}

function antennae(plan: BodyPlan): string {
  const { antenna, axis } = plan;
  return (["l", "r"] as const)
    .map((side) => {
      const dir = side === "l" ? -1 : 1;
      const fromX = axis + dir * antenna.rootDx;
      const toX = axis + dir * antenna.spread;
      const midX = axis + dir * antenna.controlDx;
      return (
        `<path d="M${n(fromX)} ${n(antenna.fromY)} Q${n(midX)} ${n(antenna.controlY)} ${n(toX)} ${n(antenna.toY)}" ` +
        `fill="none" stroke="${INK}" stroke-width="${n(plan.strokeWidth)}" stroke-linecap="round"/>` +
        `<circle cx="${n(toX)}" cy="${n(antenna.toY)}" r="${n(antenna.tip)}" fill="${INK}"/>`
      );
    })
    .join("");
}

function stinger(plan: BodyPlan): string {
  if (plan.stinger === null) return "";
  const { from, to, halfWidth } = plan.stinger;
  return (
    `<polygon class="hm-stinger" points="${n(plan.axis)},${n(from)} ` +
    `${n(plan.axis - halfWidth)},${n(to)} ${n(plan.axis + halfWidth)},${n(to)}" fill="${INK}"/>`
  );
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
  const plan = bodyPlan(genome);

  // Scoped to the identity, not to a trait: several bees are inlined into one
  // document (the page, the specimen plate), and ids collide there.
  // Deterministic, so identical genomes still render identical SVG.
  const clipId = `hm-abdomen-${identityId(genome).slice(2, 14)}`;

  const label =
    `${providerOf(genome.finder_model)} reviewer, ` +
    `${genome.context_mode} context, ` +
    `${plan.stinger === null ? "without" : "with"} a skeptic`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${n(plan.width)} ${n(plan.height)}" role="img" aria-label="${label}">` +
    `<defs><clipPath id="${clipId}">` +
    `<ellipse cx="${n(plan.axis)}" cy="${n(plan.abdomen.cy)}" rx="${n(plan.abdomen.rx)}" ry="${n(plan.abdomen.ry)}"/>` +
    `</clipPath></defs>` +
    wings(plan, palette) +
    stinger(plan) +
    ellipse(plan.axis, plan.abdomen.cy, plan.abdomen.rx, plan.abdomen.ry, palette.body, plan) +
    `<g clip-path="url(#${clipId})">${bands(plan, palette)}</g>` +
    ellipse(plan.axis, plan.abdomen.cy, plan.abdomen.rx, plan.abdomen.ry, "none", plan) +
    ellipse(plan.axis, plan.thorax.cy, plan.thorax.rx, plan.thorax.ry, palette.dark, plan) +
    antennae(plan) +
    ellipse(plan.axis, plan.head.cy, plan.head.rx, plan.head.ry, palette.body, plan) +
    eyes(plan) +
    `</svg>`
  );
}
