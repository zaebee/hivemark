# The hive: seeing every reviewer at once

Eight identities exist today and the corpus is one provider away from twenty.
`dist/index.html` renders them as a vertical stack of cards, which works for
three and stops working somewhere below ten. This describes what replaces it.

Closes the design question in #21.

## 1. What the hive is for

Three framings were considered: a comparison table, a lineage tree, and a
similarity map.

The lineage tree was rejected on the data. `src/breed/` exists and the project's
vocabulary is birth and genome, but the eight identities have no ancestry — they
were configured, not bred. A tree would draw a structure the data does not have.

What is being built is the **showcase**, with the comparison's honesty attached:
relationships shown visually, and no arrangement permitted to assert a comparison
the numbers cannot support. The diagnostic view comes free, because fragmentation
*is* kinship taken to absurdity — three bees differing in one body part.

## 2. One page, not two

The hive goes above the cards on `dist/index.html`. It does not get its own page.

A second page would be the shareable one, and the caveats — survivorship bias,
the corpus-overlap note, the self-graded mark — live on the first. Within a month
the pretty page and the honest page disagree, and they disagree silently. That is
the failure mode this repository has spent a week building guards against; it
should not be introduced deliberately in the one artefact people will actually
look at.

Hive above for the overview, cards below for the detail. At twenty identities the
second half grows linearly and the first half still fits on a screen.

**The hive wraps rather than scrolls sideways.** Families are grid or flex
containers that reflow, each bee holding a fixed aspect ratio so a narrow
viewport gives shorter rows and not clipped bees. Twenty identities on a phone
should be legible as several rows, which is the only layout requirement strong
enough to state in advance — the rest is ordinary CSS and belongs in the plan.

`scripts/plate.ts` is untouched. It studies the **trait system** — what the
genome can express, including hypothetical genomes nobody has run — while the
hive shows the **population**. Its "reviewers that actually exist" section
becomes a partial duplicate, and that is acceptable: the plate exists so that
nobody can misdescribe how the traits look, and duplication is how it does that.

## 3. The bee wears its judge

Today one palette paints the whole bee, chosen by `providerOf(finder_model)`. The
skeptic's provider is invisible. That is a latent inconsistency: `DRIVEN_BY`
already gives the head to `finder_model` and the abdomen to `skeptic_model`, so
the body distinguishes the two roles and only the colour does not.

It is invisible today because every pair in the corpus is same-provider. It stops
being invisible on the first cross-provider run — which is the configuration the
project most wants, since a skeptic from a different vendor is the most
independent judge available.

**Head and thorax take the finder's palette. The abdomen takes the skeptic's.**

| genome | appearance | what it says |
|---|---|---|
| skeptic is a different model | two-toned | judged independently |
| skeptic is the finder | one colour throughout | it graded its own work |
| `skeptic_model` is null | abdomen uncoloured | nobody judged it |

This makes `SkepticAxis.judge` (#13) a property of the body. The hard constraint
holds without strain: `skeptic_model` is genome, not track record. Nothing a
review produced reaches the body, and nothing here changes that.

The uncoloured abdomen uses the same neutral the badge uses for an unjudged
identity, so the page says one thing in two places.

## 4. Families, and order within them

**A family is the finder's provider.** The finder is the one that did the
reviewing; the bee belongs to it and *wears* where it went for judgement. A
cross-provider bee is not in two families.

Within a family, bees are ordered by what distinguishes them — `context_mode`
first, then `guardian_version`. `context_mode` drives all four wing characters.
`guardian_version` drives **two** things: thorax length through `DRIVEN_BY`, and
the abdomen band count through `bandCount`.

**Shape shows kinship. It does not identify.** Measured on the three mistral
identities, which differ in nothing but `guardian_version`:

| guardian | bands | thorax |
|---|---|---|
| `4d1fe6a8` | 4 | 41.8 |
| `112e4373` | 4 | 40.2 |
| `aeebde9c` | 2 | 41.3 |

Two of the three are the same on both counts to within 4%. Nobody will reliably
tell them apart by looking, and that is the honest outcome rather than a defect —
they are near-identical because they nearly are the same reviewer, which is the
whole of #20.

The consequence is a requirement: **every bee in the hive carries its label.**
The arrangement conveys family and kinship; the text conveys which one this is.
A view that relied on shape alone would be unreadable exactly where it matters
most.

## 5. Colour at scale

`PALETTES` is a `Record<Provider, Palette>` with three hand-picked entries, and
`Provider` is a closed union of three. The user expects glm, deepseek, qwen,
kimi, gpt, grok and claude. Two palettes are now needed per bee rather than one.

**Palettes are derived from the provider's name**, by the same kind of rule the
body proportions already use. A new provider gets a colour without a code change.

The exhaustiveness check is lost — today, widening `Provider` forces someone to
choose a palette. That trade is acceptable **here and nowhere else in this
codebase**, and for a specific reason: colour is not identity-bearing. A wrong
colour misleads a reader for a moment. A wrong `PROVIDER_PREFIXES` entry merges
two reviewers into one identity, permanently. Loud failure is worth its friction
where the failure is unrecoverable, and this one is not.

**Hue depends only on the provider's own name, never on the set.** Spreading hues
by position in a sorted list of known providers would guarantee separation, and
would repaint `gemini` the day `kimi` appears — two renderings of the same bee
disagreeing because of an unrelated third party. Stability wins.

Separation is recovered on a second channel drawn from a different part of the
same digest: lightness, quantised to a small number of steps. Two providers whose
hues land within a few degrees will differ in how dark they are, so neither
depends on the other and both stay distinguishable. Saturation stays fixed — a
bee that varies on every channel at once stops reading as a bee, and §9's
constraint is about the figure remaining recognisable.

A palette is three colours (`body`, `dark`, `wing`), so the derived hue produces
all three by a fixed relationship rather than three independent draws. That keeps
a provider's bees internally coherent, which is what makes a family read as one.

**No override table for well-known providers.** Proposed in review, and rejected:
it reintroduces exactly the hand-maintained map this section removes, for a
benefit that is cosmetic. Two providers landing close in hue are still separated
by lightness, and if that ever fails the cost is a reader briefly mistaking one
family for another — recoverable, unlike anything else in this codebase that is
keyed by provider. A table maintained to improve aesthetics will be the table
nobody updates.

**Colours stay baked into the SVG, not lifted into CSS variables.** Also proposed
in review. `avatarSvg` output is written to `dist/avatar-*.svg` as standalone
files, so an SVG that inherits its palette from the page's stylesheet renders
colourless everywhere except the page. The published artefact has to be
self-contained.

## 6. The seam: a page that anyone can regenerate

`renderPage(tracks: TrackRecord[])` is already a pure function of track records,
so the seam largely exists. What is missing is a **second builder**: one that
constructs `TrackRecord[]` from published attestations rather than from the
corpus.

Everything required is already attested. A claim carries `identityId`, `repo`
(which holds the project label — the field name is inaccurate and the schema is
registered, so it is documented rather than fixed), `pr`, `commitSha`,
`category`, `severity`, `confidence`, `verdict` and `impactScore`. A birth
carries the whole genome. Claims plus births reconstruct every field of
`TrackRecord`, bodies included.

That changes what the hive *is*. Built from a private corpus it is a report;
built from attestations it is a **view over public data that a stranger can
regenerate and check** — which is the project's whole thesis, currently true of
the signatures and not of the page.

**Staged, because births are held.** The attestation-backed builder cannot work
until births are announced, which is waiting on the review-fingerprint work
upstream. This spec builds the seam now and the second source later; the page
does not learn which one it was given.

## 7. Deployment

GitHub Pages, which makes #34 a dependency rather than a preference — there is no
CI in this repository at all.

The build must run **without `HIVEMARK_SIGNING_KEY`**. `run()` already supports
this and reports "no signing key configured — claims produced, nothing signed".
The page needs no signatures. `docs/anchoring.md` is explicit that no key belongs
in CI, and this project has already lost one key to a transcript.

~~The corpus is in a private sibling repository, so the CI job either receives a
token to check it out~~ — **corrected 2026-08-15: `codegraph-brain` is public.**
An unauthenticated fetch of a corpus file returns 200, so CI checks it out into
a sibling path with no token and the manifest resolves unchanged.

What does gate deployment is the repository's own visibility: GitHub Pages on a
private repository requires a paid plan, and `hivemark` is private on a free
one. Either it becomes public — which suits a project whose whole claim is that
a stranger can check the work — or the page is published somewhere else.

## 8. What the first implementation covers

In, because they are testable against the eight identities that exist:

- the two-toned bee and its three states (§3)
- name-derived palettes replacing the hand-picked table (§5)
- the hive section above the cards, families and within-family order (§4)
- the near-twin note, phrased as a suspicion (§10.1)

Deferred, each on something outside this repository:

- the attestation-backed builder (§6) — needs births, which are held pending
  codegraph-brain#375
- GitHub Pages (§7) — needs #34, and ideally the builder above, so that the
  published page reads public data rather than a private corpus

The page must not learn which builder produced its input, so the deferred work
changes no signature added here.

## 9. Out of scope

- **Lineage.** Nothing is bred. Revisit if `src/breed/` ever produces a run.
- **Interactivity.** The page is static HTML with inline SVG, as it is today.
- **Anything reading a track record into the body.** Stated because a hive view
  is where the temptation is strongest: sizing a bee by its confirmed count, or
  brightening it by impact. Track record may be shown beside a bee, never in it.
  The whole construction rests on identity being unchangeable.

## 10. Known gaps

1. The near-twin note in §4 asserts that bees differing only in
   `guardian_version` are probably one configuration. That is an inference, and
   it is upstream's to confirm — it is exactly what codegraph-brain#375 measures.
   The page should state it as a suspicion, not a finding.
2. Colour separation is probabilistic. Two providers can land close in hue and be
   told apart only by weight. Accepted in exchange for stability under §5.
3. The hive is unproven above eight identities, because eight is all that exists.
   Twenty is the number being designed for and cannot be tested until ollama runs
   land.
