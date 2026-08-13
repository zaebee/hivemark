# hivemark — measured morphology and individual variation

**Status:** design, approved 2026-08-12
**Depends on:** `src/body.ts` (parametric body, merged), `src/breed/` (breeding, merged)
**Lane:** this repository only; no upstream changes, no chain, no key

## What this is

`src/body.ts` computes the whole bee from a table of ratios named `RATIO`. The
ratios are shared by every reviewer and were chosen by eye. This document
replaces them with two things that are not the same kind of thing:

1. **Measured morphology of *Apis mellifera*, cited** — the base proportions
   become a fact about the world rather than one person's taste, which is the
   standard every other number in this project is held to.
2. **Individual variation derived from the genome** — two distinct identities
   differ in build, not only in colour and wing count.

Nothing here touches the track record. The constraint from the design's §Badge
binds unchanged and is the reason the third tempting source is refused below.

## Where the numbers come from

**Primary source.** Pathania A, Kumar A, Dhiman S (2022). *Morphometrics of
Apis mellifera in North-Western Himalayan region of Himachal Pradesh, India.*
Journal of Entomology and Zoology Studies 10(3):105–109.
DOI [10.22271/j.ento.2022.v10.i3b.8997](https://doi.org/10.22271/j.ento.2022.v10.i3b.8997).
Bees from Bee Research Station Nagrota Bagwan, Kangra; 45 workers collected,
tables report n=10.

It was chosen over the standard Ruttner character set for one reason: Ruttner's
characters discriminate subspecies (wing venation, cubital index, hair length,
wax mirrors, tergite pigmentation) and mostly do not measure the parts a
silhouette is made of. This paper measures head, thorax, abdomen and both wing
pairs — the dorsal outline, which is what we draw.

Worker measurements used, in millimetres:

| character | mm | where it lands in the drawing |
|---|---|---|
| head height | 2.45 | `head.ry` |
| head width | 3.62 | `head.rx` |
| thorax length | 3.72 | `thorax.ry` |
| abdomen length | 6.63 | `abdomen.ry` |
| forewing length | 9.27 | `wing.rx` (half of it) |
| forewing width | 2.98 | `wing.ry` (half of it) |
| hindwing length | 6.20 | `rearWing.rx` (half of it) |
| hindwing width | 1.82 | `rearWing.ry` (half of it) |

Two consequences visible immediately: the head is an ellipse rather than a
circle, being half again wider than tall, and the rear wing pair stops being
"0.8 of the front pair" — it has a measurement of its own.

A cheap check the model must keep passing: head + thorax + abdomen lengths sum
to 12.80 mm, against a worker body length usually given as 10–15 mm. A model
whose segments no longer sum into that range has drifted from the animal.

That 10–15 mm is **not yet cited to this document's own standard** — it comes
from reference material rather than from a measurement paper, and the plan owes
it a proper source before the test that uses it is kept. Flagged here rather
than left to look as solid as the table above it.

### The ± column is a standard error, not a dispersion

**Checked before relying on it, and it changed the design.** An earlier draft of
this plan set the variation envelope at ±2 SD, on the assumption that the paper's
± column was a per-character standard deviation. It is not. Table captions read
"±Standard Error (n=10)", and the value is identical across all three castes for
each character — thorax ±0.20 for worker, drone and queen alike; abdomen ±0.93
for all three. That is a pooled standard error from the ANOVA, not the spread of
individuals.

It can be converted arithmetically — SD = SE·√n — and must not be. The
conversion puts the abdomen's coefficient of variation at 44%, which is not a
fact about bees but a fact about a small sample and a pooled model. The ±2 SD
plan is therefore withdrawn rather than quietly rescaled.

### What replaces it: the spread of published means

A character's bounds are the smallest and largest **published mean** for
*A. mellifera*, with a citation at each end. Every bee the system draws then
coincides with a bee somebody actually reported, which is a stronger guarantee
than "within two standard deviations of one sample" and needs no assumption
about the distribution of anything.

| character | low | high | second source |
|---|---|---|---|
| head height | 2.45 | 3.22 | Ibrahim et al. 2017, Palampur |
| head width | 3.62 | 3.72 | Ibrahim et al. 2017, Dhaulakuan |
| thorax length | 3.72 | 4.38 | Ibrahim et al. 2017, Bajaura |
| abdomen length | 5.54 | 6.63 | Ibrahim et al. 2017, Bajaura |
| forewing length | 7.94 | 9.27 | AL-Kahtani & Taha 2021, *jemenitica* |
| forewing width | 2.44 | 3.53 | AL-Kahtani & Taha 2021, both subspecies |
| hindwing length | 5.85 | 6.74 | AL-Kahtani & Taha 2021, both subspecies |
| hindwing width | 1.67 | 2.21 | AL-Kahtani & Taha 2021, both subspecies |

**Updated 2026-08-13, and the table above is not the one this section was
drafted with.** Every entry has changed since. See `docs/morphology-sources.md`
for the provenance of each endpoint; the two paragraphs below record what the
first draft got wrong, because a spec that quietly acquires better numbers
teaches nothing about how they were got.

Second sources, in full:

- Ibrahim MM, Chandel YS, Anil A (2017). *Morphometrics of Apis mellifera after
  Five Decades of its Introduction in North-Western Himalayan Region of India.*
  Pakistan J. Zool. 49(4):1397–1403. Table II, four apiaries at 644–1268 m.
- AL-Kahtani SN, Taha E-KA (2021). *Morphometric study of Yemeni and Carniolan
  honeybee workers in Saudi Arabia.* PLoS ONE 16(2):e0247262. Carries an
  Expression of Concern; see `docs/morphology-sources.md`.

**Three candidates from the first draft were dropped on verification, and the
paragraph that justified them is struck with them.** It read: "all three
comparison values are taken from Pathania et al.'s discussion section, not from
the originals... each range is therefore provisional." That was the right
caution, and acting on it removed all three. Sharma 1990 (head 3.19 × 3.78) is an
unpublished thesis whose head width no first-hand table supports; Ruttner 2013
(forewing 9.33) was second-hand and widened nothing; Dyer & Seeley 1987
(forewing 7.64–9.70) is an interspecific endothermy study, not a survey of
*A. mellifera* across altitudes, so the claim attributed to it does not match its
subject. Every endpoint in the table above was read from a table with our own
eyes.

### The corpus was thin, and then it was not

Left standing as written, because the prediction was right at the time and the
way it resolved is the point.

**Stated in advance:** with the sources then readable, the head and the wings
would vary and the thorax and abdomen would not. The abdomen is the largest mass
in the silhouette, so most of what a reader saw would be identical between
reviewers. Pathania et al. write that "present findings add information on thorax
length and abdomen length" — theirs was the first published measurement of those
characters for that population, and there was no second mean to bound a range
with.

Two honest outcomes were named, and the design accommodated either: a wider
source corpus supplies the second means and those characters begin to vary with
no change to any rule, or none is found and the abdomen stays fixed, recorded as
a finding about the literature.

**What happened, 2026-08-13:** the first. A second measurement existed — Ibrahim,
Chandel & Anil 2017 — behind a publisher that refuses automated requests, so
numbers seen only in search summaries were rejected as too weak to sit underneath
the largest mass of the bee. The article was then opened by hand and its Table II
read. Every character now has a range, so any two genomes differing in a slot
differ in the region that slot builds.

**What that does and does not mean for the real corpus.** The three collected
identities share `finder_model` and `skeptic_model`, so their heads and abdomens
are identical — correctly, since those reviewers really are identical in those
respects. They differ in thorax (3.82 against 3.87 mm) and forewing (8.63 against
8.85 mm), both small. The mechanism is general; the corpus is still narrow, which
is §Known gaps in the main spec and not something morphology can fix.

No rule moved to get there. What is worth keeping from the episode is that the
dull outcome was written down *before* it was known which one would happen, so
the good one could not be presented as the plan working.

**One caveat the new numbers carry.** Pathania et al. 2022 and Ibrahim et al.
2017 report identical error terms across every shared character — ±0.10, ±0.09,
±0.06, ±0.20, ±0.93 — against different means, and Pathania's single station is
one of Ibrahim's four sites. Two published means, which is what the rule
requires; not two independent studies, which nobody should claim.

## Two constants, two different kinds of claim

`RATIO` currently mixes statements about an animal with conventions of a
drawing. `thoraxRx: 1.25` is the first kind; `antennaControlDrop: 0.3` is the
second, and no one will ever measure it. Keeping them in one table is the same
error as keeping the genome and the track record in one record.

They split:

- **`MORPHOLOGY`** — millimetres, one citation per value, one range per varying
  character. Nothing about rendering.
- **`DRAWING`** — dimensionless conventions: segment overlaps, antenna curve
  control points, margin, stroke width, wing opacity, band span, eye placement.
  Fixed for every bee, never varying, and each marked as a convention rather
  than left to look like a measurement.

Thorax width and abdomen width live in `DRAWING` for now: the primary source
does not measure them. They are marked as *not measured* rather than given a
number that reads like one — the same discipline `known_fields` applies to the
genome.

`unit` changes meaning, from "the head's radius" to "user units per millimetre".
The property that one number governs the whole figure survives, and so does the
test that asserts it.

## Where the variation comes from

**Per-slot hashes, not the identity digest.** Each genome field is hashed on its
own — `keccak256` of the field's value — and a fixed byte window of that digest
supplies the character's position within its published range.

The main spec proposed bits of `identity_id`. That is the digest of the whole
genome, so a bee's build would have no relation to its parents': change one slot
and every byte moves. Per-slot hashing keeps determinism, satisfies the
"genome only" constraint more literally than before — the proportions read the
*fields*, not their fingerprint — and makes a child that inherited a slot
inherit what that slot builds.

A `null` slot contributes nothing and its region takes the base measurement. A
bee whose findings no skeptic judged has no stinger and no abdomen of its own,
which is the same fact told twice rather than two facts.

### Slot → region

No new associations are invented. The body already reads three slots
discretely — eyes from `finder_model`, the rear wing pair from `context_mode`,
the stinger from `skeptic_model`, band count from `guardian_version` — and the
continuous characters follow the same map:

| slot | region | reading |
|---|---|---|
| `finder_model` | head, eyes | what does the finding |
| `context_mode` | wings | how far it sees |
| `skeptic_model` | abdomen, stinger | what judges the findings |
| `guardian_version` | thorax, bands | which generation it belongs to |

### Correction: inheritance, not interpolation

**The main spec's §Out of scope is wrong on this point and is corrected here
rather than edited into agreement.** It argues that a parametric body lets
crossbreeding "interpolate rather than pick a slot per trait, so an offspring
could be genuinely intermediate instead of a patchwork".

That cannot be delivered, and not because of an implementation choice. **A hash
has no order.** Variation derived from hashing a model name can be inherited but
never blended: a child whose `finder_model` came from one parent and whose
`skeptic_model` came from the other gets, for any character fed by both, a third
unrelated value — not a value between its parents'. Producing a genuinely
intermediate build would require a numeric axis on model identity along which
`gemini-2.5-flash` lies between two other models. No such axis exists, and
inventing one would be taste wearing a number's clothes.

What the parametric body plus per-slot variation actually buys is
**heritability**: an offspring's head is its finder-parent's head exactly, its
wings its context-parent's wings. Lineage becomes visible. That is worth having
and is what the breeding milestone should expect — but it is a different claim
from the one the spec made, and the earlier one is struck.

The breeding spec's own §Out of scope already retracted the *ordering* argument
for the parametric refactor. This retraction is of a different claim in a
different document, and both stand.

## The third source, refused again

Numbers from a review — confirmed, refuted, impact — are track record. A body
that filled out as findings were confirmed would look alive at the cost of
showing a fixed identity as mutable, and the whole construction rests on that
distinction. `avatar.ts` currently documents this as "nothing comes from the
hash, and nothing comes from the track record". The first half stops being true
in this change and the docstring is corrected with it; the second half is why
the change is safe.

## Testing

Each of these must be seen failing before it is kept. The failure to guard
against, named in advance: a fixture so central that the guarded case is
unreachable, so every property is exercised across many synthetic genomes rather
than the one real fixture.

- **Bounded:** for every generated genome, each character lands inside its
  published interval. Remove the bound and the test fails.
- **Still a bee:** across the full range of every varying character
  simultaneously, head–thorax and thorax–abdomen still overlap rather than gap,
  the segments stay in order, and the canvas contains the figure including
  antennae and wings. This is the property the extremes exist to threaten.
- **Anatomically plausible:** modelled body length stays inside the published
  10–15 mm.
- **Locality:** changing one slot changes only its region. Changing a slot
  changes the body at all.
- **Determinism:** identical genomes render identical SVG, as before.
- **Sources:** every varying character carries two citations; every character
  with one citation has no range and does not vary. A test reads the table, not
  the prose.

## Files

| file | change |
|---|---|
| `src/morphology.ts` | new — measurements, ranges, citations. No rendering. |
| `src/variation.ts` | new — slot value → position in range. Pure, string in. |
| `src/body.ts` | composes the three; `RATIO` splits into `DRAWING` |
| `src/avatar.ts` | eye and antenna coordinates move onto the plan, which its own docstring already claims; hash docstring corrected |
| `tests/` | `morphology.test.ts`, `variation.test.ts`, extended `body.test.ts` |
| `scripts/plate.ts` | regenerated and published to the existing artifact URL |

Moving the last invented coordinates out of `avatar.ts` is not unrelated
tidying: `unit` changes meaning in this change, and every convention still
computed in the renderer would silently change meaning with it.

## Out of scope

**Correlated variation.** Real workers vary allometrically — a large bee is
large everywhere — and this design varies each character independently. Adding
correlation would need a measured covariance matrix, which none of these sources
publishes. Independent variation across intervals this narrow cannot produce a
monster, and the "still a bee" test is what proves it rather than an assumption.

**Castes.** Drones and queens are measured in the primary source — queen head
3.92 × 3.69, thorax 4.83, abdomen 8.08; drone head 2.88 × 4.37, thorax 4.81,
abdomen 7.01 — and are not drawn. Two independent reasons refuse them, which is
unusual enough to record.

Ours: no genome field marks a caste, so one would have to be assigned from the
track record — "the queen is the identity with the best confirmations" — and
that is exactly the third source §Badge refuses. A body that grew as findings
were confirmed would show a fixed identity as mutable.

The bees': **caste in *Apis mellifera* is not genetic.** A fertilised egg becomes
a queen or a worker according to whether the larva is fed royal jelly — one
genome, different diet. A queen therefore cannot be derived from a genome at all,
by biology and not merely by our rule.

A drone *is* a genome fact, being haploid from an unfertilised egg. Nothing in a
reviewer genome corresponds to that either. Worth noting only because a drone has
no sting, and a bee whose findings no skeptic judged is already drawn without
one.

**Colour from measurement.** Tergite pigmentation is a real morphometric
character and the palette is already spoken for: it reads the provider, which is
more useful to the human reading the page than a subspecies would be.
