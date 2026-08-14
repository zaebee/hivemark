import { keccak256, toHex } from "viem";

/**
 * A provider's colours, derived from its name.
 *
 * Replaces a hand-picked `Record<Provider, Palette>` of three entries. The
 * exhaustiveness check that table gave up is acceptable here and nowhere else in
 * this codebase: colour is not identity-bearing, so a wrong one misleads a reader
 * for a moment, where a wrong `PROVIDER_PREFIXES` entry merges two reviewers
 * forever. Loud failure earns its friction only where the failure is
 * unrecoverable.
 *
 * Hue comes from the provider's own name and never from its position among known
 * providers. Spreading hues across a sorted list would separate them better and
 * would repaint gemini the day kimi appears — two renderings of one bee
 * disagreeing because of an unrelated third party.
 */
export interface Palette {
  readonly body: string;
  readonly dark: string;
  readonly wing: string;
}

/** Fixed across providers: a bee that varies on every channel stops reading as a bee. */
const SATURATION = 62;

/**
 * Lightness steps, drawn from a different part of the digest than the hue.
 *
 * This is what recovers separation when two names land close in hue. Steps
 * rather than a continuum, so the difference is decisive at a glance instead of
 * being a shade nobody notices.
 *
 * Five was measured, not chosen. Against the provider names actually expected —
 * gemini, mistral, ollama, glm, deepseek, qwen, kimi, gpt, grok, claude — three
 * steps left `mistral` and `claude` three degrees apart at identical lightness,
 * which is indistinguishable. Five removes it; six improves nothing further.
 *
 * Quantising the hue into buckets was tried instead and is worse: it trades one
 * near-miss for four to six exact matches, because it shrinks the space the
 * lightness steps are dividing.
 */
const LIGHTNESS = [38, 47, 56, 65, 74] as const;

export function paletteFor(provider: string): Palette {
  const digest = keccak256(toHex(provider)).slice(2);
  const hue = Number.parseInt(digest.slice(0, 4), 16) % 360;
  const light = LIGHTNESS[Number.parseInt(digest.slice(4, 6), 16) % LIGHTNESS.length]!;

  return {
    body: `hsl(${hue} ${SATURATION}% ${light}%)`,
    // Derived from the same hue rather than drawn independently, so a family
    // reads as one family.
    dark: `hsl(${hue} ${SATURATION + 4}% ${Math.round(light * 0.42)}%)`,
    wing: `hsl(${hue} 26% 86%)`,
  };
}

/**
 * The abdomen of a bee no skeptic judged.
 *
 * Colourless rather than a colour, and the same neutral the badge uses for an
 * unjudged identity, so the page says one thing in two places.
 */
export const UNJUDGED: Palette = {
  body: "hsl(0 0% 78%)",
  dark: "hsl(0 0% 52%)",
  wing: "hsl(0 0% 88%)",
};
