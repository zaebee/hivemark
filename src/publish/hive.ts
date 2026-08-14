import { avatarSvg } from "../avatar.js";
import { byCodeUnit } from "../canonical.js";
import { esc } from "../escape.js";
import { providerOf } from "../genome.js";
import type { TrackRecord } from "../types.js";

/**
 * The population, arranged so kinship is visible.
 *
 * A family is the **finder's** provider: the finder did the reviewing, so the bee
 * belongs to it and wears where it went for judgement. A cross-provider bee is
 * not in two families.
 *
 * Within a family, order is by what distinguishes members — `context_mode` first,
 * then `guardian_version` — because those are the slots `DRIVEN_BY` maps to the
 * wings, the thorax and the abdomen bands. The arrangement makes difference
 * legible as shape.
 *
 * Shape shows kinship and never identity. Measured on the three mistral
 * identities, which differ in nothing but `guardian_version`: bands 4, 4, 2 and
 * thorax 41.8, 40.2, 41.3. Two of the three are the same on both counts to within
 * 4%, so nobody will tell them apart by looking — which is why every bee carries
 * its label.
 */
export interface Family {
  readonly provider: string;
  readonly members: readonly TrackRecord[];
}

export function familiesOf(tracks: readonly TrackRecord[]): Family[] {
  const byProvider = new Map<string, TrackRecord[]>();
  for (const track of tracks) {
    const provider = providerOf(track.genome.finder_model);
    const held = byProvider.get(provider);
    if (held) held.push(track);
    else byProvider.set(provider, [track]);
  }

  // Sorted explicitly by code unit, never `localeCompare`: the same input must
  // produce the same page on any machine, and locale-aware collation varies with
  // whatever ICU data the runtime happens to carry.
  return [...byProvider.entries()]
    .sort(([a], [b]) => byCodeUnit(a, b))
    .map(([provider, members]) => ({
      provider,
      members: [...members].sort((a, b) => {
        const mode = byCodeUnit(a.genome.context_mode, b.genome.context_mode);
        if (mode !== 0) return mode;
        const version = byCodeUnit(a.genome.guardian_version, b.genome.guardian_version);
        // Falls back to identity so the comparator is total. Two members of one
        // family can agree on both sorted fields and still differ — the family
        // is keyed by provider, and one provider covers many finder models. A
        // comparator returning 0 there leaves their order decided by the input,
        // which is the property the determinism test claims to rule out.
        return version !== 0 ? version : byCodeUnit(a.identity_id, b.identity_id);
      }),
    }));
}

function bee(track: TrackRecord): string {
  const g = track.genome;
  let judged: string;
  if (g.skeptic_model === null) judged = "unjudged";
  else if (g.skeptic_model === g.finder_model) judged = "self-graded";
  else judged = `judged by ${providerOf(g.skeptic_model)}`;

  return (
    `<figure class="hm-bee">${avatarSvg(g, 96)}` +
    `<figcaption><code>${esc(g.guardian_version.slice(0, 7))}</code>` +
    `<span>${esc(g.context_mode)}</span>` +
    `<span>${esc(judged)}</span>` +
    `<span>${track.reviews} reviews</span></figcaption></figure>`
  );
}

/**
 * Members of a family that differ in nothing but `guardian_version`.
 *
 * Reported as a suspicion and never as a finding. Whether two such identities are
 * really one reviewer is upstream's to confirm — it is exactly what
 * codegraph-brain#375 measures by fingerprinting the review path — so this page
 * may say they probably are and may not say they are.
 */
export function nearTwinsIn(family: Family): TrackRecord[][] {
  const groups = new Map<string, TrackRecord[]>();
  for (const member of family.members) {
    const g = member.genome;
    const key = JSON.stringify([g.finder_model, g.skeptic_model, g.context_mode]);
    const held = groups.get(key);
    if (held) held.push(member);
    else groups.set(key, [member]);
  }
  return [...groups.values()].filter((members) => members.length > 1);
}

export function renderHive(tracks: readonly TrackRecord[]): string {
  const families = familiesOf(tracks)
    .map((family) => {
      const twins = nearTwinsIn(family);
      const note =
        twins.length === 0
          ? ""
          : `<p class="hm-twins">${twins.map((g) => g.length).join(" and ")} of these differ only in ` +
            `Guardian revision, so they are probably one reviewer counted more than once. ` +
            `Confirming that is upstream work.</p>`;

      return (
        `<section class="hm-family"><h3>${esc(family.provider)}</h3>` +
        `<div class="hm-row">${family.members.map(bee).join("")}</div>${note}</section>`
      );
    })
    .join("");

  return `<div class="hm-hive">${families}</div>`;
}
